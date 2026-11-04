/** Magic-link sign-in. In dev echo mode the API returns the link itself, shown as "Open sign-in link". */
import { useState, type FormEvent } from "react";
import { api, errorMessage } from "../api";

/**
 * The callback is an API path on this deployment (the API is mounted at /api on the same origin and redirects to
 * /admin). Behind a dev proxy the API may build the link on its own origin, so open the path on the studio's origin.
 */
function sameOrigin(link: string): string {
  try {
    const u = new URL(link, window.location.origin);
    return u.pathname.startsWith("/api/") ? `${u.pathname}${u.search}` : link;
  } catch {
    return link;
  }
}

export function SignIn() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ message: string; link?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await api<{ ok: boolean; message: string; link?: string }>("/api/auth/request-link", { method: "POST", json: { email: email.trim() } });
      setResult({ message: r.message, link: r.link ? sameOrigin(r.link) : undefined });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="signin card">
      <div className="adm-section-label">Admin</div>
      <h1 className="adm-title" style={{ marginTop: 4 }}>
        Sign in
      </h1>
      <p className="muted" style={{ margin: "6px 0 16px" }}>
        The admin side is role-gated. Enter your e-mail address and we will send a sign-in link; it is valid for 15 minutes.
      </p>
      <form onSubmit={submit} className="field">
        <label htmlFor="signin-email">E-mail</label>
        <input id="signin-email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.org" />
        <button type="submit" className="btn btn-primary btn-lg" disabled={busy || !email.trim()} style={{ marginTop: 8 }}>
          {busy ? "Sending…" : "Send sign-in link"}
        </button>
      </form>
      {error ? (
        <div className="notice notice-error" style={{ marginTop: 14 }}>
          {error}
        </div>
      ) : null}
      {result ? (
        <div className="notice" style={{ marginTop: 14 }}>
          <div>{result.message}</div>
          {result.link ? (
            <div style={{ marginTop: 8 }}>
              <a href={result.link} className="btn btn-primary" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none", color: "#fff" }}>
                Open sign-in link
              </a>
              <div className="small muted" style={{ marginTop: 6 }}>
                Development echo mode: the link is shown here instead of being e-mailed.
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
