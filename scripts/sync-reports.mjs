#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "../server/load-env.js";
import { DEFAULT_REPORT_CONFIG, fetchMonthlyReports, imagesForReports } from "../server/report-service.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnvFile(path.join(root, ".env"));
loadEnvFile(path.resolve(root, "../.env"));

const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
const requestedMonths = process.argv.slice(2);
const months = [...new Set(requestedMonths.length ? requestedMonths : ["2026-07", "2026-08", currentMonth])];
const manifest = JSON.parse(await readFile(path.join(root, "public/report-images/image-manifest.json"), "utf8"));
const outputDir = path.join(root, "public/data");
await mkdir(outputDir, { recursive: true });

for (const value of months) {
  if (!/^\d{4}-\d{2}$/.test(value)) throw new Error(`月份格式无效：${value}`);
  const [year, month] = value.split("-").map(Number);
  const payload = await fetchMonthlyReports({
    year,
    month,
    appId: process.env.FEISHU_APP_ID,
    appSecret: process.env.FEISHU_APP_SECRET,
    userId: process.env.FEISHU_REPORT_USER_ID || DEFAULT_REPORT_CONFIG.userId,
    userName: process.env.FEISHU_REPORT_USER_NAME || DEFAULT_REPORT_CONFIG.userName,
    dailyRuleId: process.env.FEISHU_DAILY_RULE_ID || DEFAULT_REPORT_CONFIG.dailyRuleId,
    weeklyRuleId: process.env.FEISHU_WEEKLY_RULE_ID || DEFAULT_REPORT_CONFIG.weeklyRuleId,
  });
  payload.images = imagesForReports([...payload.dailyReports, ...payload.weeklyReports], manifest);
  payload.imageSync = { imported: 0, checked: 0, mode: "published-snapshot" };
  await writeFile(path.join(outputDir, `${value}.json`), JSON.stringify(payload, null, 2) + "\n");
  console.log(`${value}: ${payload.dailyReports.length} 篇日报，${Object.keys(payload.images).length} 天包含图片`);
}
