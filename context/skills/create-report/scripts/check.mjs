#!/usr/bin/env node
// Render check for a report site: serves it, opens it at phone (390) and desktop (1440)
// widths, with and without JavaScript, and reports what a reader would hit.
//
//   node check.mjs <site-dir> [--out <dir>] [--no-shots]
//
// It loads the page and looks; it doesn't click. Try the template's depth mechanism and
// controls yourself (Playwright is cached in ~/.cache/create-report/pw: require it from
// there, and launch with {channel: "chrome"} if the bundled Chromium is missing).
//
// Fails (exit 1) on: horizontal overflow, console errors and page errors, NaN /
// undefined / Infinity / [object Object] in the visible text, broken images, citations
// without a source, and a page that is nearly empty without JavaScript. Saves viewport and
// full-page screenshots (open them and look). Playwright is installed into a cache on
// first use.
import { createServer } from "node:http";
import { readFile, stat, mkdir, readdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname, resolve } from "node:path";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import os from "node:os";

const args = process.argv.slice(2);
const site = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--out");
if (!site) { console.error("usage: node check.mjs <site-dir> [--out <dir>] [--no-shots]"); process.exit(2); }
const root = resolve(site);
const outIdx = args.indexOf("--out");
// Screenshots go next to the site in a report workspace (~/reports/<slug>/check, never
// published), otherwise to a temp dir named after the site.
const out = resolve(outIdx >= 0 ? args[outIdx + 1]
  : existsSync(join(root, "..", "prompt.md")) ? join(root, "..", "check")
  : join(os.tmpdir(), "report-check-" + root.split(/[\\/]/).filter(Boolean).slice(-2).join("-")));
const shots = !args.includes("--no-shots");

// ---- playwright from a cache dir (installed once) ----
const cache = join(process.env.XDG_CACHE_HOME || join(os.homedir(), ".cache"), "create-report", "pw");
if (!existsSync(join(cache, "node_modules", "playwright"))) {
  console.error("check: installing playwright into " + cache + " (once)");
  await mkdir(cache, { recursive: true });
  execSync("npm install --silent --prefix " + JSON.stringify(cache) + " playwright@1", { stdio: "inherit" });
}
const require = createRequire(join(cache, "package.json"));
const { chromium } = require("playwright");
async function launch() {
  try { return await chromium.launch(); } catch (e1) {
    try { return await chromium.launch({ channel: "chrome" }); } catch (e2) {
      console.error("check: installing chromium (once)");
      execSync(`cd ${JSON.stringify(cache)} && npx playwright install chromium` + (process.getuid && process.getuid() === 0 ? " --with-deps" : ""), { stdio: "inherit" });
      return chromium.launch();
    }
  }
}

// ---- static server ----
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".gif": "image/gif", ".woff2": "font/woff2", ".woff": "font/woff", ".txt": "text/plain" };
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let f = join(root, p);
    if (!f.startsWith(root)) { res.writeHead(403).end(); return; }
    if ((await stat(f).catch(() => null))?.isDirectory()) f = join(f, "index.html");
    const body = await readFile(f);
    res.writeHead(200, { "content-type": TYPES[extname(f).toLowerCase()] || "application/octet-stream" }).end(body);
  } catch { res.writeHead(404).end("not found"); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/`;

const problems = [];
const report = [];
await mkdir(out, { recursive: true });
for (const f of await readdir(out)) if (/^\d+(-nojs)?(-full(-\d+)?)?\.png$/.test(f)) await unlink(join(out, f));
const browser = await launch();

async function run(width, height, js) {
  const tag = `${width}${js ? "" : "-nojs"}`;
  const ctx = await browser.newContext({ viewport: { width, height }, javaScriptEnabled: js, deviceScaleFactor: 1 });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());   // offline: no CDNs
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error" && !/favicon/.test(m.text())) errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("requestfailed", (r) => { if (!/favicon/.test(r.url()) && r.url().startsWith(base)) errors.push("failed: " + r.url()); });
  await page.goto(base, { waitUntil: "load" });
  if (js) await page.evaluate(() => Promise.race([
    window.Report && window.Report.ready ? window.Report.ready.then(() => true) : true,
    new Promise((r) => setTimeout(r, 4000))
  ])).catch(() => {});
  await page.waitForTimeout(js ? 800 : 300);
  const info = await page.evaluate(() => {
    const text = document.body.innerText || "";
    const bad = (text.match(/\bNaN\b|\bundefined\b|\bInfinity\b|\[object Object\]/g) || []);
    const imgs = [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.loading !== "lazy").map((i) => i.getAttribute("src"));
    const wide = [...document.querySelectorAll("body *")].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.right > innerWidth + 1 && getComputedStyle(e).position !== "fixed" && !e.closest("[data-overflow-ok], .rc-table-wrap, .table-wrap, pre");
    }).slice(0, 3).map((e) => e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + (e.className && typeof e.className === "string" ? "." + e.className.split(" ")[0] : ""));
    return {
      overflow: document.documentElement.scrollWidth - innerWidth,
      wide,
      bad: [...new Set(bad)],
      imgs,
      missingCites: document.querySelectorAll("a.cite.missing").length,
      textLength: text.replace(/\s+/g, " ").length
    };
  });
  if (shots) {
    // The first screen, then the whole page in readable pieces (a 6,000 px image shrinks to
    // illegible when opened): <tag>-full-1.png, -2.png, …
    await page.screenshot({ path: join(out, `${tag}.png`) });
    const total = await page.evaluate(() => document.documentElement.scrollHeight);
    const piece = width < 600 ? 1600 : 1800;
    for (let y = 0, i = 1; y < total && i <= 12; y += piece, i++) {
      await page.screenshot({ path: join(out, `${tag}-full-${i}.png`), fullPage: true,
        clip: { x: 0, y, width, height: Math.min(piece, total - y) } });
    }
  }
  if (info.overflow <= 1) info.wide = [];   // only worth listing when the page scrolls sideways
  const r = { view: tag, ...info, errors };
  report.push(r);
  if (info.overflow > 1) problems.push(`${tag}: page scrolls sideways by ${info.overflow}px (${info.wide.join(", ")})`);
  if (js && info.bad.length) problems.push(`${tag}: visible text contains ${info.bad.join(", ")}`);
  if (info.imgs.length) problems.push(`${tag}: images failed to load: ${info.imgs.join(", ")}`);
  if (js && info.missingCites) problems.push(`${tag}: ${info.missingCites} citation(s) point at a missing source`);
  if (errors.length) problems.push(`${tag}: ${errors.length} console/page error(s): ${errors.slice(0, 3).join(" | ")}`);
  await ctx.close();
  return r;
}

const phone = await run(390, 844, true);
const desk = await run(1440, 900, true);
const nojs = await run(1440, 900, false);
if (nojs.textLength < Math.min(desk.textLength * 0.4, 1500)) {
  problems.push(`without JavaScript the page shows only ${nojs.textLength} characters (vs ${desk.textLength} with it); keep the prose in the HTML`);
}
await browser.close();
server.close();

for (const r of report) console.log(JSON.stringify(r));
if (shots) console.log("screenshots: " + out + "  (open them: 390.png, 1440.png, 1440-nojs.png, then the *-full-N.png pieces)");
if (problems.length) {
  console.log("check: problems:");
  for (const p of problems) console.log("  - " + p);
  process.exit(1);
}
console.log("check: ok");
