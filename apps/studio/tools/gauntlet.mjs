/**
 * Gauntlet screenshots (spec section 8, step 9): every studio view at 1440 x 900 into docs/gauntlet/round-N/.
 *   node tools/gauntlet.mjs <round> [baseUrl]            plain studio state
 *   ADMIN_EMAIL=... API=http://localhost:3100/api node tools/gauntlet.mjs <round> [baseUrl]
 *     also signs in through the echoed magic link, switches admin preview on and captures the preview state (-preview suffix)
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const round = process.argv[2] ?? "1";
const base = process.argv[3] ?? "http://localhost:5173";
const OUT = `../../docs/gauntlet/round-${round}`;
mkdirSync(OUT, { recursive: true });
const views = [["risk-state", "/risk/state"], ["risk-city", "/risk/city"], ["risk-ward", "/risk/ward"], ["scenarios", "/scenarios"], ["solutions", "/solutions"], ["policy", "/policy"]];

const browser = await chromium.launch();
async function shoot(ctx, suffix) {
  const page = await ctx.newPage();
  for (const [name, path] of views) {
    await page.goto(base + path, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(1800);
    if (suffix) {
      // the admin-preview switch lives in sessionStorage, which is per tab: switch it on in this page
      const sw = page.getByRole("switch").first();
      if ((await sw.count()) && (await sw.getAttribute("aria-checked")) !== "true") { await sw.click().catch(() => {}); await page.waitForTimeout(1500); }
    }
    if (name === "risk-ward" && suffix) {
      // select a zone so the risk-rating card is filled
      const zone = page.locator(".place-label, .zone-label").first();
      if (await zone.count()) await zone.click().catch(() => {});
      await page.waitForTimeout(600);
    }
    await page.screenshot({ path: `${OUT}/${name}${suffix}.png` });
    console.log("shot", name + suffix);
  }
  await page.close();
}

const plain = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await shoot(plain, "");
await plain.close();

if (process.env.ADMIN_EMAIL && process.env.API) {
  const res = await fetch(`${process.env.API}/auth/request-link`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: process.env.ADMIN_EMAIL }) });
  const { link } = await res.json();
  if (!link) throw new Error("no echoed magic link (AUTH_DEV_ECHO=1 needed)");
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(link.replace(process.env.API.replace(/\/api$/, ""), base), { waitUntil: "networkidle" }).catch(() => {});
  await page.goto(base + "/risk/city", { waitUntil: "networkidle" });
  const toggle = page.getByText(/Admin preview/i).first();
  if (await toggle.count()) { await toggle.click().catch(() => {}); await page.waitForTimeout(800); }
  if (!(await page.getByText(/ADMIN PREVIEW/).count())) console.warn("admin preview did not switch on");
  await page.close();
  await shoot(ctx, "-preview");
  await ctx.close();
}
await browser.close();
