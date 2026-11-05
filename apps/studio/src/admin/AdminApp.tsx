/** Admin routes. Everything under /admin needs a session; without one the sign-in page shows inside the same layout. */
import { useEffect, useRef } from "react";
import { matchPath, navigate } from "../router";
import { useSession } from "../session";
import { AdminLayout } from "./AdminLayout";
import { refreshCounts } from "./counts";
import { EntryDetail } from "./EntryDetail";
import { Library } from "./Library";
import { ModelDetail } from "./ModelDetail";
import { ModelsTable } from "./ModelsTable";
import { RegistryTable } from "./RegistryTable";
import { RightRail } from "./RightRail";
import { RunPage } from "./RunPage";
import { RunsList } from "./RunsList";
import { SignIn } from "./SignIn";
import { SignOffQueue } from "./SignOffQueue";

export function AdminApp({ path }: { path: string }) {
  const { user, loading } = useSession();
  const clean = path.replace(/\/+$/, "") || "/";

  const redirectTo = clean === "/admin" ? "/admin/registry" : clean === "/admin/sign-in" && user ? "/admin/registry" : null;
  useEffect(() => {
    if (redirectTo) navigate(redirectTo, { replace: true });
  }, [redirectTo]);

  // the counts in the left nav, once signed in (once per signed-in user)
  const countedFor = useRef<string | null>(null);
  useEffect(() => {
    if (user && countedFor.current !== user.email) {
      countedFor.current = user.email;
      void refreshCounts();
    }
    if (!user) countedFor.current = null;
  }, [user]);

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
  if (clean === "/admin/runs") {
    return (
      <AdminLayout active="runs" rail={<RightRail />}>
        <RunsList />
      </AdminLayout>
    );
  }
  const run = matchPath("/admin/runs/:id", clean);
  if (run) {
    return (
      <AdminLayout active="runs" rail={<RightRail />}>
        <RunPage key={run.id} id={run.id} />
      </AdminLayout>
    );
  }
  if (clean === "/admin/models") {
    return (
      <AdminLayout active="models">
        <ModelsTable />
      </AdminLayout>
    );
  }
  const model = matchPath("/admin/models/:id", clean);
  if (model) {
    return (
      <AdminLayout active="models">
        <ModelDetail key={model.id} id={model.id} />
      </AdminLayout>
    );
  }
  if (clean === "/admin/library") {
    return (
      <AdminLayout active="library">
        <Library />
      </AdminLayout>
    );
  }
  if (clean === "/admin/sign-off") {
    return (
      <AdminLayout active="sign-off">
        <SignOffQueue />
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
