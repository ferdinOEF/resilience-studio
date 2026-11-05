/**
 * Headless smoke test: serve the production build, load it in Chromium, fail on any console or page error.
 *   pnpm --filter @resilience/studio build && pnpm --filter @resilience/studio smoke
 * Runs without an API: every studio view must still render its layout and the not-modelled notice on real-looking
 * chrome (the map canvas, rail and card); basemap tiles or API calls that fail to load are not errors.
 * Screenshots land in tests/smoke-output/ (git-ignored).
 */
import { preview } from "vite";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "tests/smoke-output";
mkdirSync(OUT, { recursive: true });
const server = await preview({ preview: { port: 4179, strictPort: true }, logLevel: "error" });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
const IGNORE = /api\/|Failed to load resource|AJAXError|tiles\.maps\.eox\.at|arcgis|fonts\.g|net::ERR|WebGL|GPU stall|Could not load/i;
page.on("console", (m) => { if (m.type() === "error" && !IGNORE.test(m.text())) errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));

const VIEWS = [
  { path: "/risk/state", shot: "10-risk-state", expect: ["Goa", "css:.nm-notice", "Open Panjim"] },
  { path: "/risk/city", shot: "11-risk-city", expect: ["Panjim", "Ward boundaries: awaiting the CCP shapefile", "css:.nm-notice"] },
  { path: "/risk/ward", shot: "12-risk-ward", expect: ["css:.nm-notice", "Show risk as"] },
  { path: "/scenarios", shot: "13-scenarios", expect: ["Build a scenario", "A vs B", "Run comparison"] },
  { path: "/solutions", shot: "14-solutions", expect: ["Solutions catalogue", "Selected set", "Policy fit"] },
  { path: "/policy", shot: "15-policy", expect: ["Policy status · Panjim", "Rules in force checked against scenario results"] }
];

try {
  // "/" redirects to the City risk view
  await page.goto("http://localhost:4179/");
  await page.getByText("Resilience Studio").first().waitFor();
  await page.waitForURL("**/risk/city");
  await page.locator(".st-map-canvas canvas").first().waitFor({ timeout: 15000 });
  await page.screenshot({ path: OUT + "/01-shell.png", fullPage: true });

  for (const v of VIEWS) {
    await page.goto("http://localhost:4179" + v.path);
    await page.getByText("Resilience Studio").first().waitFor();
    for (const t of v.expect) await (t.startsWith("css:") ? page.locator(t.slice(4)) : page.getByText(t, { exact: false })).first().waitFor({ timeout: 15000 });
    if (v.path !== "/policy") await page.locator(".st-map-canvas canvas").first().waitFor({ timeout: 15000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/${v.shot}.png`, fullPage: true });
  }

  // the scale switcher and breadcrumb navigate client-side
  await page.goto("http://localhost:4179/risk/state");
  await page.getByRole("group", { name: "Scale" }).getByText("City").click();
  await page.waitForURL("**/risk/city");
  await page.getByRole("navigation", { name: "Scale" }).getByText("Goa").click();
  await page.waitForURL("**/risk/state");

  // admin side without an API: the layout renders and the sign-in page shows
  await page.goto("http://localhost:4179/admin/registry");
  await page.getByText("ADMIN").first().waitFor();
  await page.getByRole("button", { name: "Send sign-in link" }).waitFor();
  await page.screenshot({ path: OUT + "/02-admin-sign-in.png", fullPage: true });

  if (errors.length) { console.error("console errors:\n" + errors.join("\n")); process.exitCode = 1; } else console.log("ok  smoke (" + (VIEWS.length + 2) + " pages)");
} catch (e) {
  console.error("smoke failed:", e);
  process.exitCode = 1;
} finally {
  await browser.close();
  await server.close();
}
