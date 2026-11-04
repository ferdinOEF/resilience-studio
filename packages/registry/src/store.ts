/**
 * Registry store interface and the in-memory implementation (tests, local dev and read-only previews without a
 * database). The Postgres implementation lives in apps/api and persists the same rows.
 */
import { approve, draftVersion, reject, RegistryError, submitForReview } from "./workflow";
import type { RegistryEntry } from "./schema";

export interface RegistryStore {
  /** every version of every entry */
  all(): Promise<RegistryEntry[]>;
  versions(id: string): Promise<RegistryEntry[]>;
  get(versionId: string): Promise<RegistryEntry | null>;
  insert(row: RegistryEntry): Promise<void>;
  /** replace rows by version_id (status changes); every row must exist */
  update(rows: RegistryEntry[]): Promise<void>;
}

export class MemoryStore implements RegistryStore {
  private rows = new Map<string, RegistryEntry>();
  constructor(seed: RegistryEntry[] = []) {
    for (const r of seed) this.rows.set(r.version_id, r);
  }
  async all() {
    return [...this.rows.values()];
  }
  async versions(id: string) {
    return [...this.rows.values()].filter((r) => r.id === id).sort((a, b) => a.version - b.version);
  }
  async get(versionId: string) {
    return this.rows.get(versionId) ?? null;
  }
  async insert(row: RegistryEntry) {
    if (this.rows.has(row.version_id)) throw new RegistryError(`${row.version_id} already exists`, "bad_state");
    this.rows.set(row.version_id, row);
  }
  async update(rows: RegistryEntry[]) {
    for (const r of rows) if (!this.rows.has(r.version_id)) throw new RegistryError(`${r.version_id} not found`, "not_found");
    for (const r of rows) this.rows.set(r.version_id, r);
  }
}

/** The review workflow over any store: the API calls these, the admin UI calls the API. */
export class RegistryService {
  constructor(private store: RegistryStore) {}

  async propose(input: unknown, author: string): Promise<RegistryEntry> {
    const id = (input as { id?: string })?.id;
    const existing = id ? await this.store.versions(id) : [];
    const row = draftVersion(input, author, existing);
    await this.store.insert(row);
    return row;
  }

  async submit(versionId: string): Promise<RegistryEntry> {
    const row = await this.mustGet(versionId);
    const next = submitForReview(row);
    await this.store.update([next]);
    return next;
  }

  async approve(versionId: string, reviewer: string, note: string | null = null): Promise<RegistryEntry> {
    const row = await this.mustGet(versionId);
    const siblings = await this.store.versions(row.id);
    const { approved, superseded } = approve(row, reviewer, siblings, note);
    await this.store.update([approved, ...superseded]);
    return approved;
  }

  async reject(versionId: string, reviewer: string, note: string): Promise<RegistryEntry> {
    const row = await this.mustGet(versionId);
    const next = reject(row, reviewer, note);
    await this.store.update([next]);
    return next;
  }

  private async mustGet(versionId: string): Promise<RegistryEntry> {
    const row = await this.store.get(versionId);
    if (!row) throw new RegistryError(`${versionId} not found`, "not_found");
    return row;
  }
}
