/**
 * Registry store selection: Postgres when DATABASE_URL is set (the real thing), otherwise an in-memory store seeded
 * from the ported data files. Without a database, writes are accepted only outside Vercel (local dev); on a preview
 * without a database the API is read-only and says so.
 */
import { buildSeed, MemoryStore, RegistryService, type RegistryStore } from "@resilience/registry";
import { hasDatabase } from "../db";
import { PostgresStore } from "./postgres-store";

let memory: MemoryStore | null = null;

export function registryStore(): RegistryStore {
  if (hasDatabase()) return new PostgresStore();
  if (!memory) memory = new MemoryStore(buildSeed().entries);
  return memory;
}

export function registryService(): RegistryService {
  return new RegistryService(registryStore());
}

export function writesAllowed(): { ok: boolean; reason?: string } {
  if (hasDatabase()) return { ok: true };
  if (process.env.VERCEL) return { ok: false, reason: "No database is connected to this deployment: the registry is read-only until the Neon Postgres store is attached (spec section 5)." };
  return { ok: true };
}
