import { Hono } from "hono";
import { clearSession, ensureBootstrapAdmin, issueMagicLink, listUsers, redeemMagicLink, requireUser, ROLES, sessionUser, setSession, upsertUser, type Role } from "../auth";

export const auth = new Hono();

auth.get("/me", (c) => {
  const user = sessionUser(c);
  return c.json({ user, roles: ROLES });
});

auth.post("/request-link", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { email?: string };
  if (!body.email || !/.+@.+\..+/.test(body.email)) return c.json({ error: "a valid e-mail address is required" }, 400);
  await ensureBootstrapAdmin();
  const url = new URL(c.req.url);
  const origin = c.req.header("x-forwarded-host") ? `${c.req.header("x-forwarded-proto") ?? "https"}://${c.req.header("x-forwarded-host")}` : url.origin;
  const r = await issueMagicLink(body.email, origin);
  return c.json({ ok: true, message: r.sent === "mail" ? "If that address has access, a sign-in link is on its way." : "If that address has access, a sign-in link was issued (see the server log).", ...(r.link ? { link: r.link } : {}) });
});

auth.get("/callback", async (c) => {
  const token = c.req.query("token");
  const user = token ? await redeemMagicLink(token) : null;
  if (!user) return c.text("This sign-in link is invalid or has expired. Request a new one.", 400);
  setSession(c, user);
  return c.redirect("/admin");
});

auth.post("/logout", (c) => {
  clearSession(c);
  return c.json({ ok: true });
});

auth.get("/users", requireUser("manage_users"), async (c) => c.json({ users: await listUsers() }));

auth.post("/users", requireUser("manage_users"), async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { email?: string; role?: Role; display_name?: string };
  if (!body.email || !body.role) return c.json({ error: "email and role are required" }, 400);
  if (!(ROLES as readonly string[]).includes(body.role)) return c.json({ error: `role must be one of ${ROLES.join(", ")}` }, 400);
  return c.json({ user: await upsertUser({ email: body.email, role: body.role, display_name: body.display_name ?? null }) });
});
