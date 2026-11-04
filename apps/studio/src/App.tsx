import { useEffect, useState } from "react";

/** Step 1 shell: header and the "not yet modelled" state. The views to the mockups land in step 7. */
export function App() {
  const [health, setHealth] = useState<string>("checking");
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((j) => setHealth(typeof j.database === "string" ? j.database : j.database?.postgis ? "PostGIS " + j.database.postgis : "database error"))
      .catch(() => setHealth("api unreachable"));
  }, []);
  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
      <header style={{ height: 56, boxSizing: "border-box", display: "flex", alignItems: "center", gap: 24, padding: "0 20px", borderBottom: "1px solid var(--hairline)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
            <circle cx="11" cy="11" r="9" fill="none" stroke="#0F6E76" strokeWidth="2" />
            <path d="M4 13c2-2 4-2 7 0s5 2 7 0" fill="none" stroke="#0F6E76" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span style={{ fontWeight: 600, fontSize: 15 }}>Resilience Studio</span>
        </div>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)" }}>API: {health}</span>
      </header>
      <main style={{ flex: 1, display: "grid", placeItems: "center", background: "var(--map-bg)" }}>
        <div style={{ padding: "14px 18px", background: "#fff", border: "1px solid var(--hairline)", borderRadius: 12, maxWidth: 420 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)" }}>Panjim, Goa / pilot</div>
          <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>Not yet modelled</div>
          <div style={{ color: "var(--muted)", marginTop: 6 }}>Results appear only where a place is modelled to the studio standard and its chain is signed off.</div>
        </div>
      </main>
    </div>
  );
}
