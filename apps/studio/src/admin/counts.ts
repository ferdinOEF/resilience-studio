/** Registry counts shared across admin pages (the Sign-off queue count in the nav). Set by whoever last fetched the list. */
import { useEffect, useReducer } from "react";
import { api, type RegistryCounts, type RegistryList } from "../api";

let cached: RegistryCounts | null = null;
const subscribers = new Set<() => void>();

export function setCounts(c: RegistryCounts): void {
  cached = c;
  for (const s of subscribers) s();
}

export async function refreshCounts(): Promise<void> {
  try {
    const r = await api<RegistryList>("/api/registry");
    setCounts(r.counts);
  } catch {
    /* unknown until the API answers */
  }
}

export function useCounts(): RegistryCounts | null {
  const [, tick] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    subscribers.add(tick);
    return () => {
      subscribers.delete(tick);
    };
  }, []);
  return cached;
}
