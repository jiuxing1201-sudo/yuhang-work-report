import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { loadEnvFile } from "./server/load-env.js";
import { fetchMonthlyReports } from "./server/report-service.js";
import { createFeishuImageSynchronizer } from "./server/feishu-image-sync.js";

const dashboardDir = path.dirname(fileURLToPath(import.meta.url));
loadEnvFile(path.resolve(dashboardDir, "../.env"));

const reportUserId = process.env.FEISHU_REPORT_USER_ID || "ou_ccae433df88592343ab53c197a2ea7ea";
const reportUserName = process.env.FEISHU_REPORT_USER_NAME || "郑宇航";
const rules = {
  daily: "7550937561265324035",
  weekly: "7589177356959468484",
};

function monthRange(year, month) {
  const start = Math.floor(Date.UTC(year, month - 1, 1, -8) / 1000);
  const end = Math.floor(Date.UTC(year, month, 1, -8) / 1000) - 1;
  return { start, end };
}

function localDate(timestamp) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp * 1000));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function normalizeReport(item) {
  return {
    id: item.task_id,
    date: localDate(item.commit_time),
    commitTime: item.commit_time,
    type: item.rule_name,
    fields: Object.fromEntries(
      (item.form_contents || []).map((field) => [field.field_name, field.field_value || ""]),
    ),
  };
}

function feishuSyncPlugin() {
  const imageSynchronizer = createFeishuImageSynchronizer({ dashboardDir });
  return {
    name: "feishu-report-sync",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/sync")) return next();
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        try {
          const url = new URL(req.url, "http://127.0.0.1");
          const year = Number(url.searchParams.get("year"));
          const month = Number(url.searchParams.get("month"));
          if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, message: "月份参数无效。" }));
            return;
          }
          const payload = await fetchMonthlyReports({
            year,
            month,
            appId: process.env.FEISHU_APP_ID,
            appSecret: process.env.FEISHU_APP_SECRET,
            userId: reportUserId,
            userName: reportUserName,
            dailyRuleId: rules.daily,
            weeklyRuleId: rules.weekly,
          });
          const { dailyReports, weeklyReports } = payload;
          const reports = [...dailyReports, ...weeklyReports];
          const imageResult = url.searchParams.get("images") === "1"
            ? await imageSynchronizer.sync(reports, { force: url.searchParams.get("full") === "1" })
            : { images: await imageSynchronizer.current(reports), imported: 0, checked: 0 };
          res.end(JSON.stringify({
            ok: true,
            syncedAt: new Date().toISOString(),
            user: { id: reportUserId, name: reportUserName },
            month: { year, month },
            dailyReports,
            weeklyReports,
            images: imageResult.images,
            imageSync: { imported: imageResult.imported, checked: imageResult.checked },
          }));
        } catch (error) {
          res.statusCode = 502;
          res.end(JSON.stringify({ ok: false, message: error?.message || "同步飞书日报失败。" }));
        }
      });
    },
  };
}

export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",
  build: {
    outDir: "dist/client",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react(), feishuSyncPlugin()],
});
