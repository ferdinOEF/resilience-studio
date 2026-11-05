/** Admin shell to the Admin mockup: 56 px header, 220 px left nav with counts, main content, optional 280 px right rail. Desktop only. */
import type { ReactNode } from "react";
import { Link } from "../router";
import { useSession } from "../session";
import { useCounts, type NavCounts } from "./counts";

export type NavKey = "runs" | "models" | "library" | "registry" | "sign-off" | null;

const NAV: { key: Exclude<NavKey, null>; label: string; href: string; count: (c: NavCounts) => string | null }[] = [
  { key: "runs", label: "Runs", href: "/admin/runs", count: (c) => (c.runs === null ? null : String(c.runs)) },
  { key: "models", label: "Models", href: "/admin/models", count: (c) => (c.models === null ? null : String(c.models)) },
  { key: "library", label: "Scenario library", href: "/admin/library", count: (c) => (c.library ? `${c.library.pre_run}/${c.library.total}` : null) },
  { key: "registry", label: "Registry", href: "/admin/registry", count: (c) => (c.registry ? String(c.registry.in_review) : null) },
  { key: "sign-off", label: "Sign-off queue", href: "/admin/sign-off", count: (c) => (c.signoff_pending === null ? null : String(c.signoff_pending)) }
];

const NAV_TITLE: Record<Exclude<NavKey, null>, string> = {
  runs: "runs on record",
  models: "model contracts",
  library: "scenario cells pre-run / total",
  registry: "registry versions in review",
  "sign-off": "items awaiting a human"
};

export function LogoMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <circle cx="11" cy="11" r="9" fill="none" stroke="#0F6E76" strokeWidth="2" />
      <path d="M4 13c2-2 4-2 7 0s5 2 7 0" fill="none" stroke="#0F6E76" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function AdminLayout({ active, rail, children }: { active: NavKey; rail?: ReactNode; children: ReactNode }) {
  const { user, signOut } = useSession();
  const counts = useCounts();
  return (
    <div className="adm">
      <header className="adm-header">
        <div className="adm-brand">
          <LogoMark />
          <span>Resilience Studio</span>
        </div>
        <span className="adm-chip-admin">ADMIN</span>
        <span className="adm-pill">Panjim, Goa · Pilot</span>
        <div className="adm-header-right">
          {user ? (
            <>
              <span className="adm-user" title={user.email}>
                {user.email} <span className="adm-role">{user.role}</span>
              </span>
              <button type="button" className="btn btn-sm" onClick={() => void signOut()}>
                Sign out
              </button>
            </>
          ) : null}
          <Link href="/" className="adm-back">
            ← Back to studio
          </Link>
        </div>
      </header>
      <div className="adm-body">
        <nav className="adm-nav" aria-label="Admin">
          {NAV.map((n) => {
            const count = user ? n.count(counts) : null;
            return (
              <Link key={n.key} href={n.href} className={`adm-nav-row${active === n.key ? " is-active" : ""}`} aria-current={active === n.key ? "page" : undefined}>
                <span>{n.label}</span>
                {count !== null ? (
                  <span className="adm-nav-count" title={NAV_TITLE[n.key]}>
                    {count}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <main className="adm-main">{children}</main>
        {rail ? <aside className="adm-rail">{rail}</aside> : null}
      </div>
    </div>
  );
}
