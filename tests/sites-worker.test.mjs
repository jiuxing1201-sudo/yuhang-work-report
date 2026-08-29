import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";
import worker from "../worker/index.js";

test("serves existing static assets without a fallback", async () => {
  const calls = [];
  const response = await worker.fetch(new Request("https://example.test/assets/app.js"), {
    ASSETS: {
      fetch: async (request) => {
        calls.push(new URL(request.url).pathname);
        return new Response("asset", { status: 200 });
      },
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["/assets/app.js"]);
});

test("falls back to index.html for an unknown app route", async () => {
  const calls = [];
  const response = await worker.fetch(
    new Request("https://example.test/flow/step-two?source=share", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async (request) => {
          const url = new URL(request.url);
          calls.push(url.pathname + url.search);
          return new Response(url.pathname === "/index.html" ? "app" : "missing", {
            status: url.pathname === "/index.html" ? 200 : 404,
          });
        },
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["/flow/step-two?source=share", "/index.html"]);
});

test("does not turn missing API or write requests into the app shell", async () => {
  for (const request of [
    new Request("https://example.test/api/missing", { headers: { accept: "application/json" } }),
    new Request("https://example.test/flow", { method: "POST", headers: { accept: "text/html" } }),
  ]) {
    let calls = 0;
    const response = await worker.fetch(request, {
      ASSETS: {
        fetch: async () => {
          calls += 1;
          return new Response("missing", { status: 404 });
        },
      },
    });

    assert.equal(response.status, 404);
    assert.equal(calls, 1);
  }
});

test("syncs Feishu report text and returns the published image snapshot", async (context) => {
  let queryCount = 0;
  const queryBodies = [];
  context.mock.method(globalThis, "fetch", async (url, options = {}) => {
    if (String(url).includes("tenant_access_token")) {
      return Response.json({ code: 0, tenant_access_token: "tenant-token" });
    }
    queryCount += 1;
    queryBodies.push(JSON.parse(options.body));
    return Response.json({
      code: 0,
      data: {
        has_more: false,
        items: queryCount === 1 ? [{
          task_id: "daily-1",
          commit_time: Math.floor(Date.parse("2026-08-28T10:00:00+08:00") / 1000),
          rule_name: "工作日报",
          form_contents: [{ field_name: "今日达成", field_value: "完成云端同步" }],
        }] : [],
      },
    });
  });

  const response = await worker.fetch(
    new Request("https://example.test/api/sync?year=2026&month=8"),
    {
      FEISHU_APP_ID: "cli_test",
      FEISHU_APP_SECRET: "secret",
      ASSETS: {
        fetch: async (request) => new URL(request.url).pathname === "/report-images/image-manifest.json"
          ? Response.json({ reports: { "daily-1": { items: [{ src: "/report-images/28.jpeg", hash: "abc" }] } } })
          : new Response("missing", { status: 404 }),
      },
    },
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.dailyReports[0].fields["今日达成"], "完成云端同步");
  assert.equal(payload.images["2026-08-28"].items[0].src, "/report-images/28.jpeg");
  assert.equal(queryCount, 2);
  assert.deepEqual(queryBodies.map((body) => body.page_size), [10, 10]);
});

test("emits the files required by Sites packaging", async () => {
  await access(new URL("../dist/client/index.html", import.meta.url));
  await access(new URL("../dist/server/index.js", import.meta.url));
  await access(new URL("../dist/.openai/hosting.json", import.meta.url));
});
