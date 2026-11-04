/**
 * Postgres (Neon) access. One connection string, DATABASE_URL, injected by the Vercel-Neon integration.
 * The HTTP driver suits serverless functions: one round trip per query, no connection to keep warm.
 * Nothing numeric lives here; the database holds the registry, runs, sign-off queue and place manifests (spec section 5).
 */
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let client: NeonQueryFunction<false, false> | null = null;

export function hasDatabase(): boolean {
  return !!process.env.DATABASE_URL;
}

export function sql(): NeonQueryFunction<false, false> {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set: connect the Neon Postgres store to this project (spec section 5)");
    client = neon(url);
  }
  return client;
}
