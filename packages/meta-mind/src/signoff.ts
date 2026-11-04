/**
 * The sign-off queue (spec sections 1.2 and 3.2): policy findings, registry edits, calibration claims and chain
 * sign-offs wait here for a human. The Meta Mind can propose, never apply; the decider must differ from the proposer.
 */
import { newId } from "./runlog";
import type { SignOffItem, SignOffItemInput } from "./types";

export interface SignOffStore {
  insert(item: SignOffItem): Promise<void>;
  update(item: SignOffItem): Promise<void>;
  get(id: string): Promise<SignOffItem | null>;
  list(status?: SignOffItem["status"]): Promise<SignOffItem[]>;
}

export class MemorySignOffStore implements SignOffStore {
  private items = new Map<string, SignOffItem>();
  async insert(item: SignOffItem) {
    this.items.set(item.id, item);
  }
  async update(item: SignOffItem) {
    if (!this.items.has(item.id)) throw new Error(`sign-off item ${item.id} not found`);
    this.items.set(item.id, item);
  }
  async get(id: string) {
    return this.items.get(id) ?? null;
  }
  async list(status?: SignOffItem["status"]) {
    return [...this.items.values()].filter((i) => !status || i.status === status).sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
}

export class SignOffError extends Error {
  constructor(
    message: string,
    public readonly code: "two_person" | "bad_state" | "not_found" | "invalid"
  ) {
    super(message);
    this.name = "SignOffError";
  }
}

export class SignOffQueue {
  constructor(private store: SignOffStore) {}

  async propose(input: SignOffItemInput): Promise<SignOffItem> {
    if (!input.title || !input.reasoning) throw new SignOffError("a proposal needs a title and its reasoning", "invalid");
    const item: SignOffItem = { ...input, id: newId("so"), status: "pending", created_at: new Date().toISOString(), decided_by: null, decided_at: null, decision_note: null };
    await this.store.insert(item);
    return item;
  }

  async decide(id: string, decision: "approved" | "rejected", by: string, note: string | null = null): Promise<SignOffItem> {
    const item = await this.store.get(id);
    if (!item) throw new SignOffError(`${id} not found`, "not_found");
    if (item.status !== "pending") throw new SignOffError(`${id} is already ${item.status}`, "bad_state");
    if (!by || by === item.proposed_by) throw new SignOffError("Two-person rule: the decider must differ from the proposer", "two_person");
    if (decision === "rejected" && !note) throw new SignOffError("a rejection needs a note", "invalid");
    const next: SignOffItem = { ...item, status: decision, decided_by: by, decided_at: new Date().toISOString(), decision_note: note };
    await this.store.update(next);
    return next;
  }

  list(status?: SignOffItem["status"]) {
    return this.store.list(status);
  }
}
