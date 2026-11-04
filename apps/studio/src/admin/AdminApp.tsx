/** Admin routes. Everything under /admin needs a session; without one the sign-in page shows inside the same layout. */
import { useEffect } from "react";
import { matchPath, navigate } from "../router";
import { useSession } from "../session";
import { AdminLayout, type NavKey } from "./AdminLayout";
import { refreshCounts, useCounts } from "./counts";
import { EntryDetail } from "./EntryDetail";
import { Placeholder } from "./Placeholder";
import { RegistryTable } from "./RegistryTable";
import { SignIn } from "./SignIn";

const PLACEHOLDERS: Record<string, { key: NavKey; title: string }> = {
  "/admin/runs": { key: "runs", title: "Runs" },
  "/admin/models": { key: "models", title: "Models" },
  "/admin/library": { key: "library", title: "Scenario library" },
  "/admin/sign-off": { key: "sign-off", title: "Sign-off queue" }
};

export function AdminApp({ path }: { path: string }) {
  const { user, loading } = useSession();
  const counts = useCounts();
  const clean = path.replace(/\/+$/, "") || "/";

  const redirectTo = clean === "/admin" ? "/admin/registry" : clean === "/admin/sign-in" && user ? "/admin/registry" : null;
  useEffect(() => {
    if (redirectTo) navigate(redirectTo, { replace: true });
  }, [redirectTo]);

  // the Sign-off queue count in the nav, once signed in
  useEffect(() => {
    if (user && !counts) void refreshCounts();
  }, [user, counts]);

  if (loading) {
    return (
      <AdminLayout active={null}>
        <div className="muted">Checking session…</div>
      </AdminLayout>
    );
  }
  if (!user) {
    return (
      <AdminLayout active={null}>
        <SignIn />
      </AdminLayout>
    );
  }
  if (redirectTo) return <AdminLayout active={null}>{null}</AdminLayout>;

  if (clean === "/admin/registry") {
    return (
      <AdminLayout active="registry">
        <RegistryTable />
      </AdminLayout>
    );
  }
  const entry = matchPath("/admin/registry/:id", clean);
  if (entry) {
    return (
      <AdminLayout active="registry">
        <EntryDetail key={entry.id} id={entry.id} />
      </AdminLayout>
    );
  }
  const ph = PLACEHOLDERS[clean];
  if (ph) {
    return (
      <AdminLayout active={ph.key}>
        <Placeholder title={ph.title} />
      </AdminLayout>
    );
  }
  return (
    <AdminLayout active={null}>
      <h1 className="adm-title">Not found</h1>
      <p className="muted">
        There is nothing at <span className="mono">{path}</span>.
      </p>
    </AdminLayout>
  );
}
