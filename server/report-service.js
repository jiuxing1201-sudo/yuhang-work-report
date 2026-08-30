const TOKEN_URL = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal";
const REPORT_QUERY_URL = "https://open.feishu.cn/open-apis/report/v1/tasks/query?user_id_type=open_id";

export const DEFAULT_REPORT_CONFIG = {
  dailyRuleId: "7550937561265324035",
  weeklyRuleId: "7589177356959468484",
  userId: "ou_ccae433df88592343ab53c197a2ea7ea",
  userName: "郑宇航",
};

export function monthRange(year, month) {
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

async function readJson(response, message) {
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.code !== 0) throw new Error(payload?.msg || message);
  return payload;
}

async function tenantToken({ appId, appSecret, fetchImpl }) {
  if (!appId || !appSecret) throw new Error("缺少 FEISHU_APP_ID 或 FEISHU_APP_SECRET。");
  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const payload = await readJson(response, "获取飞书访问凭据失败。");
  if (!payload.tenant_access_token) throw new Error("飞书没有返回访问凭据。");
  return payload.tenant_access_token;
}

async function queryReports({ token, ruleId, userId, range, fetchImpl }) {
  const items = [];
  let pageToken = "";
  do {
    const response = await fetchImpl(REPORT_QUERY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        rule_id: ruleId,
        user_id: userId,
        commit_start_time: range.start,
        commit_end_time: range.end,
        page_size: 10,
        page_token: pageToken,
      }),
    });
    const payload = await readJson(response, "读取飞书汇报失败。");
    const data = payload.data || {};
    items.push(...(data.items || []));
    pageToken = data.has_more ? data.page_token || "" : "";
  } while (pageToken);
  return items.map(normalizeReport);
}

export async function fetchMonthlyReports(options) {
  const fetchImpl = options.fetchImpl || fetch;
  const config = { ...DEFAULT_REPORT_CONFIG, ...options };
  const token = await tenantToken({ ...config, fetchImpl });
  const range = monthRange(config.year, config.month);
  const [dailyReports, weeklyReports] = await Promise.all([
    queryReports({ token, ruleId: config.dailyRuleId, userId: config.userId, range, fetchImpl }),
    queryReports({ token, ruleId: config.weeklyRuleId, userId: config.userId, range, fetchImpl }),
  ]);
  return {
    ok: true,
    syncedAt: new Date().toISOString(),
    user: { id: config.userId, name: config.userName },
    month: { year: config.year, month: config.month },
    dailyReports,
    weeklyReports,
  };
}

export function imagesForReports(reports, manifest) {
  const byDate = {};
  for (const report of reports) {
    const items = manifest.reports?.[report.id]?.items || [];
    if (!items.length) continue;
    const existing = byDate[report.date]?.items || [];
    const merged = [...existing, ...items].filter(
      (item, index, all) => all.findIndex((candidate) => candidate.hash === item.hash) === index,
    );
    byDate[report.date] = { ...merged[0], items: merged };
  }
  return byDate;
}
