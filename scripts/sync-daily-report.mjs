#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "../server/load-env.js";
import { DEFAULT_REPORT_CONFIG, fetchDailyReportsForDate, imagesForReports } from "../server/report-service.js";
import { createFeishuImageSynchronizer } from "../server/feishu-image-sync.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnvFile(path.join(root, ".env"));
loadEnvFile(path.resolve(root, "../.env"));

const date = process.argv[2];
if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) throw new Error("用法：sync-daily-report.mjs YYYY-MM-DD");
const [year, month] = date.split("-").map(Number);
const dataPath = path.join(root, "public/data", `${date.slice(0, 7)}.json`);
const reports = await fetchDailyReportsForDate({
  date,
  appId: process.env.FEISHU_APP_ID,
  appSecret: process.env.FEISHU_APP_SECRET,
  userId: process.env.FEISHU_REPORT_USER_ID || DEFAULT_REPORT_CONFIG.userId,
  userName: process.env.FEISHU_REPORT_USER_NAME || DEFAULT_REPORT_CONFIG.userName,
  dailyRuleId: process.env.FEISHU_DAILY_RULE_ID || DEFAULT_REPORT_CONFIG.dailyRuleId,
});

if (!reports.length) {
  console.log(JSON.stringify({ date, found: false, fields: 0, images: 0, monthlyReports: null }));
  process.exit(0);
}

let payload;
try {
  payload = JSON.parse(await readFile(dataPath, "utf8"));
} catch {
  payload = {
    ok: true,
    syncedAt: new Date().toISOString(),
    user: { id: process.env.FEISHU_REPORT_USER_ID || DEFAULT_REPORT_CONFIG.userId, name: process.env.FEISHU_REPORT_USER_NAME || DEFAULT_REPORT_CONFIG.userName },
    month: { year, month },
    dailyReports: [],
    weeklyReports: [],
  };
}

const known = new Set(payload.dailyReports.map((report) => `${report.date}:${report.id}`));
const additions = reports.filter((report) => !known.has(`${report.date}:${report.id}`));
const imageSynchronizer = createFeishuImageSynchronizer({ dashboardDir: root });
const imageResult = await imageSynchronizer.sync(reports);
payload.dailyReports = [...payload.dailyReports, ...additions].sort((a, b) => a.date.localeCompare(b.date) || a.commitTime - b.commitTime);
payload.images = imagesForReports([...payload.dailyReports, ...payload.weeklyReports], JSON.parse(await readFile(path.join(root, "public/report-images/image-manifest.json"), "utf8")));
payload.imageSync = { imported: imageResult.imported, checked: imageResult.checked };
payload.syncedAt = new Date().toISOString();
await writeFile(dataPath, `${JSON.stringify(payload, null, 2)}\n`);
const fieldCount = reports.reduce((total, report) => total + Object.keys(report.fields).length, 0);
const imageCount = Object.values(imageResult.images).reduce((total, image) => total + image.items.length, 0);
console.log(JSON.stringify({ date, found: true, additions: additions.length, fields: fieldCount, images: imageCount, monthlyReports: payload.dailyReports.length }));
