import { Hono } from "hono";
import { cors } from "hono/cors";
import { health } from "./routes/health";

/** The API, mounted under /api on Vercel (api/[[...route]].ts) and on the local dev server (src/dev.ts). */
export function createApp() {
  const app = new Hono().basePath("/api");
  app.use("*", cors());
  app.route("/health", health);
  app.notFound((c) => c.json({ error: "not found", path: c.req.path }, 404));
  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: err.message }, 500);
  });
  return app;
}

export const app = createApp();
export type App = typeof app;
