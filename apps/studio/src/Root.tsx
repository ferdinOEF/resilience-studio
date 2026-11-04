/** Top-level route switch: "/" is the studio shell (App), "/admin/..." the role-gated admin side. */
import { App } from "./App";
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
  if (path === "/" || path === "/index.html") return <App />;
  return (
    <div style={{ padding: 28 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Not found</h1>
      <p style={{ color: "var(--muted)" }}>
        There is nothing at <code>{path}</code>. <Link href="/">Back to the studio</Link>
      </p>
    </div>
  );
}
