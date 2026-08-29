import assert from "node:assert/strict";
import test from "node:test";
import { internals } from "../server/feishu-image-sync.js";

test("extracts a JPEG body and file key from a Chromium cache entry", () => {
  const key = "abc123.jpg";
  const header = Buffer.from(`cache https://oa.feishu.cn/report/v3/api/File?tenantId=1&key=${key}`);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const parsed = internals.parseCacheImage(Buffer.concat([header, jpeg]));
  assert.equal(parsed.key, key);
  assert.equal(parsed.extension, "jpeg");
  assert.deepEqual(parsed.data, jpeg);
});

test("removes Chromium metadata after the JPEG end marker", () => {
  const header = Buffer.from("cache https://oa.feishu.cn/report/v3/api/File?tenantId=1&key=trim.jpg");
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 0xff, 0xd9]);
  const parsed = internals.parseCacheImage(Buffer.concat([header, jpeg, Buffer.from("cache-metadata") ]));
  assert.deepEqual(parsed.data, jpeg);
});

test("ignores unrelated cache entries", () => {
  assert.equal(internals.parseCacheImage(Buffer.from("ordinary cache content")), null);
});

test("rechecks an image key when Chromium refreshes its cache entry", () => {
  const before = new Map([["same.jpg", { key: "same.jpg", modifiedAt: 100 }]]);
  const after = new Map([
    ["same.jpg", { key: "same.jpg", modifiedAt: 200 }],
    ["untouched.jpg", { key: "untouched.jpg", modifiedAt: 100 }],
  ]);
  assert.deepEqual(internals.changedImages(before, after).map((image) => image.key), ["same.jpg", "untouched.jpg"]);
});
