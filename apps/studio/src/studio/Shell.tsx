/**
 * The studio shell: 56 px header (logo, breadcrumb chips Goa › Panjim › ward, views nav, the Meta Mind's input
 * placeholder, Admin), then one row: left rail, the map, right card. One map owns the screen.
 */
import type { ReactNode } from "react";
import { Link } from "../router";
import { LogoMark } from "../admin/AdminLayout";
import { useStudio } from "./data";

export type Scale = "state" | "city" | "ward";
export type View = "risk" | "scenarios" | "solutions" | "policy";

const VIEWS: { key: View; label: string; href: string }[] = [
  { key: "risk", label: "Risk", href: "/risk/city" },
  { key: "scenarios", label: "Scenarios", href: "/scenarios" },
  { key: "solutions", label: "Solutions", href: "/solutions" },
  { key: "policy", label: "Policy", href: "/policy" }
];

export function Header({ view, scale, wardName }: { view: View; scale: Scale | null; wardName?: string | null }) {
  const { user, previewOn, previewWanted, setPreview } = useStudio();
  const crumbs: { key: Scale; label: string; href: string; muted?: boolean }[] = [
    { key: "state", label: "Goa", href: "/risk/state" },
    { key: "city", label: "Panjim", href: "/risk/city" },
    { key: "ward", label: wardName ?? "Ward", href: "/risk/ward", muted: !wardName }
  ];
  return (
    <header className="st-header">
      <Link href="/risk/city" className="st-brand">
        <LogoMark />
        <span>Resilience Studio</span>
      </Link>
      <nav className="st-crumbs" aria-label="Scale">
        {crumbs.map((c, i) => (
          <span key={c.key} className="st-crumb-wrap">
            {i > 0 ? <span className="st-chevron">›</span> : null}
            <Link href={c.href} className={`crumb${scale === c.key ? " is-current" : ""}${c.muted ? " is-muted" : ""}`} aria-current={scale === c.key ? "page" : undefined}>
              {c.label}
            </Link>
          </span>
        ))}
      </nav>
      <nav className="st-nav" aria-label="Views">
        {VIEWS.map((v) => (
          <Link key={v.key} href={v.href} className={`st-nav-btn${view === v.key ? " is-active" : ""}`} aria-current={view === v.key ? "page" : undefined}>
            {v.label}
          </Link>
        ))}
      </nav>
      <div className="st-header-right">
        {user ? (
          <button type="button" className={`st-preview-btn${previewOn ? " chip chip-preview" : " chip chip-not-modelled"}`} role="switch" aria-checked={previewWanted} title="Admin preview: show unsigned results and admin-only layers in the studio (off by default)" onClick={() => setPreview(!previewWanted)}>
            {previewOn ? "ADMIN PREVIEW · unsigned results" : "Admin preview (unsigned results) · off"}
          </button>
        ) : null}
        <input className="input st-ask" disabled placeholder="Ask: which wards flood in a 1-in-50 cyclone?" title="Comes with the Meta Mind in a later phase" aria-label="Ask the studio" />
        <Link href="/admin" className="btn btn-sm st-admin-btn">
          Admin
        </Link>
      </div>
    </header>
  );
}

export function Layout({ view, scale, wardName, rail, railWidth = 280, card, cardWidth = 360, children }: { view: View; scale: Scale | null; wardName?: string | null; rail?: ReactNode; railWidth?: number; card?: ReactNode; cardWidth?: number; children: ReactNode }) {
  return (
    <div className="st">
      <Header view={view} scale={scale} wardName={wardName} />
      <div className="st-body">
        {rail ? (
          <aside className="st-rail" style={{ width: railWidth }}>
            {rail}
          </aside>
        ) : null}
        <main className="st-main">{children}</main>
        {card ? (
          <aside className="st-card" style={{ width: cardWidth }}>
            {card}
          </aside>
        ) : null}
      </div>
    </div>
  );
}

/** Scale switcher at the top of the Risk rail. */
export function ScaleControl({ scale }: { scale: Scale }) {
  return (
    <div className="seg" role="group" aria-label="Scale">
      {(["state", "city", "ward"] as Scale[]).map((s) => (
        <Link key={s} href={`/risk/${s}`} className={`seg-btn${scale === s ? " is-active" : ""}`} aria-current={scale === s ? "page" : undefined}>
          {s === "state" ? "State" : s === "city" ? "City" : "Ward"}
        </Link>
      ))}
    </div>
  );
}
