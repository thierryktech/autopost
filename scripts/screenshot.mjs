// Dev helper: node scripts/screenshot.mjs <path> [outPrefix] — captures MacBook + iPad viewports.
import { chromium } from "@playwright/test";
const path = process.argv[2] ?? "/";
const out = process.argv[3] ?? "shot";
const dir = process.env.SHOT_DIR ?? "/tmp";
const sizes = (process.env.SIZES ?? "mac,ipad").split(",");
const vp = { mac: { width: 1440, height: 900 }, ipad: { width: 820, height: 1180 }, ipadl: { width: 1180, height: 820 }, phone: { width: 390, height: 844 } };
const browser = await chromium.launch();
for (const s of sizes) {
  const page = await browser.newPage({ viewport: vp[s], deviceScaleFactor: 1, hasTouch: s !== "mac" });
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  page.on("console", (m) => m.type() === "error" && console.log("CONSOLE", m.text()));
  await page.goto(`http://localhost:3000${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${dir}/${out}-${s}.png`, fullPage: process.env.FULL === "1" });
  await page.close();
}
await browser.close();
