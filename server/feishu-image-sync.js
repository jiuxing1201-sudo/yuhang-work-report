import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const REPORT_URL_PREFIX = "https://oa.feishu.cn/report/record/view?reportId=";
const IMAGE_URL_MARKER = "https://oa.feishu.cn/report/v3/api/File?";
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const GIF_MAGIC = Buffer.from("GIF8");
const WEBP_MAGIC = Buffer.from("RIFF");
const JPEG_END = Buffer.from([0xff, 0xd9]);
const PNG_END = Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function exactImageBytes(buffer, image) {
  if (image.extension === "jpeg") {
    const end = buffer.indexOf(JPEG_END, image.offset + JPEG_MAGIC.length);
    if (end >= 0) return buffer.subarray(image.offset, end + JPEG_END.length);
  }
  if (image.extension === "png") {
    const end = buffer.indexOf(PNG_END, image.offset + PNG_MAGIC.length);
    if (end >= 0) return buffer.subarray(image.offset, end + PNG_END.length);
  }
  if (image.extension === "webp" && buffer.length >= image.offset + 8) {
    const length = buffer.readUInt32LE(image.offset + 4) + 8;
    if (length > 12 && image.offset + length <= buffer.length) return buffer.subarray(image.offset, image.offset + length);
  }
  if (image.extension === "gif") {
    const end = buffer.lastIndexOf(0x3b);
    if (end >= image.offset) return buffer.subarray(image.offset, end + 1);
  }
  return buffer.subarray(image.offset);
}

async function findNamedFiles(root, name, results = []) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) await findNamedFiles(fullPath, name, results);
    else if (entry.name === name) results.push(fullPath);
  }
  return results;
}

async function findCacheFiles(root, results = []) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) await findCacheFiles(fullPath, results);
    else if (entry.name.endsWith("_0")) results.push(fullPath);
  }
  return results;
}

function parseCacheImage(buffer) {
  const header = buffer.subarray(0, Math.min(buffer.length, 4096));
  const markerIndex = header.indexOf(IMAGE_URL_MARKER);
  if (markerIndex < 0) return null;
  const jpegIndex = buffer.indexOf(JPEG_MAGIC, markerIndex);
  const pngIndex = buffer.indexOf(PNG_MAGIC, markerIndex);
  const gifIndex = buffer.indexOf(GIF_MAGIC, markerIndex);
  const riffIndex = buffer.indexOf(WEBP_MAGIC, markerIndex);
  const webpIndex = riffIndex >= 0 && buffer.subarray(riffIndex + 8, riffIndex + 12).toString("ascii") === "WEBP" ? riffIndex : -1;
  const candidates = [
    jpegIndex >= 0 ? { offset: jpegIndex, extension: "jpeg", mimeType: "image/jpeg" } : null,
    pngIndex >= 0 ? { offset: pngIndex, extension: "png", mimeType: "image/png" } : null,
    gifIndex >= 0 ? { offset: gifIndex, extension: "gif", mimeType: "image/gif" } : null,
    webpIndex >= 0 ? { offset: webpIndex, extension: "webp", mimeType: "image/webp" } : null,
  ].filter(Boolean).sort((a, b) => a.offset - b.offset);
  if (!candidates.length) return null;
  const image = candidates[0];
  const urlEnd = image.offset;
  const url = buffer.subarray(markerIndex, urlEnd).toString("utf8").replace(/[\x00-\x20]+$/g, "");
  const key = new URL(url).searchParams.get("key");
  if (!key) return null;
  return { ...image, key, url, data: exactImageBytes(buffer, image) };
}

async function scanCachedImages(cacheRoot) {
  const files = await findCacheFiles(cacheRoot);
  const images = new Map();
  for (const file of files) {
    try {
      const fileStat = await stat(file);
      if (fileStat.size < 128 || fileStat.size > 60 * 1024 * 1024) continue;
      const parsed = parseCacheImage(await readFile(file));
      if (parsed) images.set(parsed.key, { ...parsed, cachePath: file, modifiedAt: fileStat.mtimeMs });
    } catch {
      // Chromium may rotate a cache entry while it is being read; the next sync retries it.
    }
  }
  return images;
}

function changedImages(before, after) {
  return [...after.values()].filter((image) => {
    const previous = before.get(image.key);
    return !previous || image.modifiedAt > previous.modifiedAt + 1;
  });
}

async function readDownloadMappings(supportRoot) {
  const historyFiles = await findNamedFiles(supportRoot, "History");
  const mappings = [];
  for (const historyFile of historyFiles) {
    const temporary = path.join(os.tmpdir(), `feishu-history-${process.pid}-${Math.random().toString(16).slice(2)}.sqlite`);
    try {
      await copyFile(historyFile, temporary);
      const { stdout } = await execFileAsync("/usr/bin/sqlite3", [
        "-json",
        temporary,
        `select current_path, tab_url, mime_type from downloads where state = 1 and mime_type like 'image/%' and tab_url like '${REPORT_URL_PREFIX}%';`,
      ]);
      const rows = stdout.trim() ? JSON.parse(stdout) : [];
      for (const row of rows) {
        const reportId = row.tab_url.match(/[?&]reportId=(\d+)/)?.[1];
        if (reportId && existsSync(row.current_path)) mappings.push({ reportId, sourcePath: row.current_path, mimeType: row.mime_type });
      }
    } catch {
      // A profile without a compatible History database is ignored.
    } finally {
      await unlink(temporary).catch(() => {});
    }
  }
  return mappings;
}

async function loadManifest(manifestPath) {
  try {
    return JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    return { reports: {} };
  }
}

async function saveImage({ data, sourcePath, extension, outputDir, date, index }) {
  const bytes = data || await readFile(sourcePath);
  const digest = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
  const filename = `${date}-${index}-${digest}.${extension}`;
  const destination = path.join(outputDir, filename);
  if (!existsSync(destination)) await writeFile(destination, bytes);
  return { src: `/report-images/${filename}`, name: `${date} 汇报原图 ${index}`, hash: digest };
}

async function canonicalizeManifest(manifest, outputDir) {
  for (const report of Object.values(manifest.reports || {})) {
    const unique = [];
    for (const item of report.items || []) {
      try {
        const sourcePath = path.join(outputDir, path.basename(item.src));
        const source = await readFile(sourcePath);
        const parsed = parseCacheImage(Buffer.concat([Buffer.from(`${IMAGE_URL_MARKER}key=manifest.${path.extname(sourcePath).slice(1)}`), source]));
        const bytes = parsed?.data || source;
        const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
        if (unique.some((existing) => existing.hash === hash)) continue;
        unique.push(await saveImage({ data: bytes, extension: parsed?.extension || path.extname(sourcePath).slice(1), outputDir, date: report.date, index: unique.length + 1 }));
      } catch {
        // Keep synchronization resilient when an old local image was moved manually.
      }
    }
    report.items = unique;
  }
}

function extensionFor(mimeType, sourcePath = "") {
  if (mimeType === "image/png" || path.extname(sourcePath).toLowerCase() === ".png") return "png";
  return "jpeg";
}

function reportImagesForClient(manifest, reports) {
  const byDate = {};
  for (const report of reports) {
    const items = manifest.reports[report.id]?.items || [];
    if (!items.length) continue;
    const existing = byDate[report.date]?.items || [];
    const merged = [...existing, ...items].filter((item, index, all) => all.findIndex((candidate) => candidate.hash === item.hash) === index);
    byDate[report.date] = { ...merged[0], items: merged };
  }
  return byDate;
}

export function createFeishuImageSynchronizer({ dashboardDir }) {
  const home = os.homedir();
  const cacheRoot = path.join(home, "Library/Caches/LarkShell/aha/users");
  const supportRoot = path.join(home, "Library/Application Support/LarkShell/aha/users");
  const outputDir = path.join(dashboardDir, "public/report-images");
  const manifestPath = path.join(outputDir, "image-manifest.json");

  async function importDownloadedImages(manifest, reportsById) {
    let imported = 0;
    const mappings = await readDownloadMappings(supportRoot);
    for (const mapping of mappings) {
      const report = reportsById.get(mapping.reportId);
      if (!report) continue;
      const existing = manifest.reports[mapping.reportId]?.items || [];
      const data = await readFile(mapping.sourcePath);
      const hash = createHash("sha256").update(data).digest("hex").slice(0, 12);
      if (existing.some((item) => item.hash === hash)) continue;
      const item = await saveImage({
        data,
        extension: extensionFor(mapping.mimeType, mapping.sourcePath),
        outputDir,
        date: report.date,
        index: existing.length + 1,
      });
      manifest.reports[mapping.reportId] = { date: report.date, items: [...existing, item], checkedAt: new Date().toISOString() };
      imported += 1;
    }
    return imported;
  }

  async function discoverReportImages(manifest, report) {
    const before = await scanCachedImages(cacheRoot);
    const reportUrl = `${REPORT_URL_PREFIX}${report.id}`;
    const appLink = `feishu://applink.feishu.cn/client/web_url/open?mode=window&url=${encodeURIComponent(reportUrl)}`;
    await execFileAsync("/usr/bin/open", [appLink]);
    await delay(4000);
    const after = await scanCachedImages(cacheRoot);
    const fresh = changedImages(before, after);
    const existing = manifest.reports[report.id]?.items || [];
    const items = [...existing];
    for (const image of fresh) {
      const hash = createHash("sha256").update(image.data).digest("hex").slice(0, 12);
      if (items.some((item) => item.hash === hash)) continue;
      items.push(await saveImage({
        data: image.data,
        extension: image.extension,
        outputDir,
        date: report.date,
        index: items.length + 1,
      }));
    }
    manifest.reports[report.id] = { date: report.date, items, checkedAt: new Date().toISOString() };
    return items.length - existing.length;
  }

  return {
    async current(reports) {
      await mkdir(outputDir, { recursive: true });
      const manifest = await loadManifest(manifestPath);
      await canonicalizeManifest(manifest, outputDir);
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      return reportImagesForClient(manifest, reports);
    },

    async sync(reports, { force = false } = {}) {
      await mkdir(outputDir, { recursive: true });
      const manifest = await loadManifest(manifestPath);
      await canonicalizeManifest(manifest, outputDir);
      const reportsById = new Map(reports.map((report) => [String(report.id), report]));
      let imported = await importDownloadedImages(manifest, reportsById);
      const unchecked = [...reports]
        .sort((a, b) => b.commitTime - a.commitTime)
        .filter((report) => force || !manifest.reports[report.id]?.checkedAt || !manifest.reports[report.id]?.items?.length);
      for (const report of unchecked) imported += await discoverReportImages(manifest, report);
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      return { images: reportImagesForClient(manifest, reports), imported, checked: unchecked.length };
    },
  };
}

export const internals = { changedImages, exactImageBytes, parseCacheImage };
