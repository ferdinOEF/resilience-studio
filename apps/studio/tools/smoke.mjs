/**
 * Headless smoke test: serve the production build, load it in Chromium, fail on any console or page error.
 *   pnpm --filter @resilience/studio build && pnpm --filter @resilience/studio smoke
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
page.on("console", (m) => { if (m.type() === "error" && !/api\/health|Failed to load resource/.test(m.text())) errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));
try {
  await page.goto("http://localhost:4179/");
  await page.getByText("Resilience Studio").first().waitFor();
  await page.screenshot({ path: OUT + "/01-shell.png", fullPage: true });
  // admin side without an API: the layout renders and the sign-in page shows
  await page.goto("http://localhost:4179/admin/registry");
  await page.getByText("ADMIN").first().waitFor();
  await page.getByRole("button", { name: "Send sign-in link" }).waitFor();
  await page.screenshot({ path: OUT + "/02-admin-sign-in.png", fullPage: true });
  if (errors.length) { console.error("console errors:\n" + errors.join("\n")); process.exitCode = 1; } else console.log("ok  smoke");
} finally {
  await browser.close();
  await server.close();
}
