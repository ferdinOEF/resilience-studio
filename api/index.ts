/**
 * Vercel Node function that mounts the API; vercel.json rewrites every /api/* path here (the function sees the original URL).
 * A plain Vercel function receives Node request/response objects, so the app is adapted with Hono's node-server Vercel adapter
 * (not the edge-style handler).
 *
 * Request bodies: the Vercel Node runtime reads the whole body before the handler runs and exposes it as `req.body`
 * (parsed JSON, text or Buffer by content type). The drained stream never ends for a later reader, so Hono's adapter
 * would wait on it until the function timed out. The adapter accepts a pre-read `rawBody` Buffer instead, so the body
 * is re-serialised into one here; a body that was not pre-read falls through to normal streaming.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { handle } from "@hono/node-server/vercel";
import { app } from "@resilience/api";

type VercelReq = IncomingMessage & { body?: unknown; rawBody?: Buffer };

const hono = handle(app);

export default function handler(req: VercelReq, res: ServerResponse) {
  if (req.method !== "GET" && req.method !== "HEAD" && !("rawBody" in req)) {
    const b = req.body;
    if (Buffer.isBuffer(b)) req.rawBody = b;
    else if (typeof b === "string") req.rawBody = Buffer.from(b, "utf8");
    else if (b !== undefined && b !== null) req.rawBody = Buffer.from(JSON.stringify(b), "utf8");
    else if (req.readableEnded || req.complete) req.rawBody = Buffer.alloc(0);
  }
  return hono(req, res);
}
