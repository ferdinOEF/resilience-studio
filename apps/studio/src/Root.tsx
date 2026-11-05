/** Top-level route switch: the studio views (App: /, /risk/*, /scenarios, /solutions, /policy), "/admin/..." the role-gated admin side. */
import { App, isStudioPath } from "./App";
import { AdminApp } from "./admin/AdminApp";
import { Link, usePath } from "./router";
import { SessionProvider } from "./session";

export function Root() {
  const path = usePath();
  if (path === "/admin" || path.startsWith("/admin/")) {
    return (
      <SessionProvider>
        <AdminApp path={path} />
      </SessionProvider>
    );
  }
  if (isStudioPath(path)) return <App path={path} />;
  return (
    <div style={{ padding: 28 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Not found</h1>
      <p style={{ color: "var(--muted)" }}>
        There is nothing at <code>{path}</code>. <Link href="/">Back to the studio</Link>
      </p>
    </div>
  );
}
