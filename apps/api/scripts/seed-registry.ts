/**
 * Seed the registry table from the ported data files (spec section 3.3), once: inserts every seed row whose version_id
 * is not yet present. Nothing is promoted: rows arrive as in_review with the port as author.
 *   DATABASE_URL=... pnpm --filter @resilience/api db:seed
 */
import { buildSeed } from "@resilience/registry";
import { PostgresStore } from "../src/registry/postgres-store";

const store = new PostgresStore();
const existing = new Set((await store.all()).map((e) => e.version_id));
const { entries, uncovered } = buildSeed();
let n = 0;
for (const e of entries) {
  if (existing.has(e.version_id)) continue;
  await store.insert(e);
  n++;
}
console.log(`seeded ${n} new entries (${entries.length} in the seed, ${existing.size} already present)`);
if (uncovered.length) console.warn("numbers outside the registry:", uncovered);
