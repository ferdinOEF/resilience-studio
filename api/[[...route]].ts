/**
 * Vercel Node function that mounts the API. A plain Vercel function receives Node request/response objects, so the
 * app is adapted with Hono's node-server Vercel adapter (not the edge-style handler).
 */
import { handle } from "@hono/node-server/vercel";
import { app } from "@resilience/api";

export const config = { api: { bodyParser: false } };
export default handle(app);
