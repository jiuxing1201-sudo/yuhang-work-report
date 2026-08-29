const TOKEN_URL = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal";
const REPORT_QUERY_URL = "https://open.feishu.cn/open-apis/report/v1/tasks/query?user_id_type=open_id";
const DEFAULT_DAILY_RULE_ID = "7550937561265324035";
const DEFAULT_WEEKLY_RULE_ID = "7589177356959468484";
const DEFAULT_REPORT_USER_ID = "ou_ccae433df88592343ab53c197a2ea7ea";

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

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

async function readJson(response, message) {
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.code !== 0) {
    throw new Error(payload?.msg || message);
  }
  return payload;
}

async function tenantToken(env) {
  if (!env.FEISHU_APP_ID || !env.FEISHU_APP_SECRET) {
    throw new Error("云端尚未配置飞书应用凭据。");
  }
  const response = await fetch(env.FEISHU_TOKEN_URL || TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ app_id: env.FEISHU_APP_ID, app_secret: env.FEISHU_APP_SECRET }),
  });
  const payload = await readJson(response, "获取飞书访问凭据失败。");
  if (!payload.tenant_access_token) throw new Error("飞书没有返回访问凭据。");
  return payload.tenant_access_token;
}

async function queryReports(env, token, ruleId, range) {
  const items = [];
  let pageToken = "";
  do {
    const response = await fetch(env.FEISHU_REPORT_QUERY_URL || REPORT_QUERY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        rule_id: ruleId,
        user_id: env.FEISHU_REPORT_USER_ID || DEFAULT_REPORT_USER_ID,
        commit_start_time: range.start,
        commit_end_time: range.end,
        page_size: 50,
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

async function publishedImages(request, env, reports) {
  const manifestUrl = new URL("/report-images/image-manifest.json", request.url);
  const response = await env.ASSETS.fetch(new Request(manifestUrl));
  if (!response.ok) return {};
  const manifest = await response.json().catch(() => ({ reports: {} }));
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

async function sync(request, env) {
  const url = new URL(request.url);
  const year = Number(url.searchParams.get("year"));
  const month = Number(url.searchParams.get("month"));
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return json({ ok: false, message: "月份参数无效。" }, 400);
  }
  try {
    const token = await tenantToken(env);
    const range = monthRange(year, month);
    const [dailyReports, weeklyReports] = await Promise.all([
      queryReports(env, token, env.FEISHU_DAILY_RULE_ID || DEFAULT_DAILY_RULE_ID, range),
      queryReports(env, token, env.FEISHU_WEEKLY_RULE_ID || DEFAULT_WEEKLY_RULE_ID, range),
    ]);
    const images = await publishedImages(request, env, [...dailyReports, ...weeklyReports]);
    return json({
      ok: true,
      syncedAt: new Date().toISOString(),
      user: {
        id: env.FEISHU_REPORT_USER_ID || DEFAULT_REPORT_USER_ID,
        name: env.FEISHU_REPORT_USER_NAME || "郑宇航",
      },
      month: { year, month },
      dailyReports,
      weeklyReports,
      images,
      imageSync: { imported: 0, checked: 0, mode: "published-snapshot" },
    });
  } catch (error) {
    return json({ ok: false, message: error?.message || "同步飞书日报失败。" }, 502);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/api/sync") {
      return sync(request, env);
    }

    const response = await env.ASSETS.fetch(request);
    const acceptsHtml = request.headers.get("accept")?.includes("text/html");

    if (response.status !== 404 || !acceptsHtml || !["GET", "HEAD"].includes(request.method)) {
      return response;
    }

    const indexUrl = new URL(request.url);
    indexUrl.pathname = "/index.html";
    indexUrl.search = "";
    return env.ASSETS.fetch(new Request(indexUrl, request));
  },
};

export const internals = { localDate, monthRange, normalizeReport };
