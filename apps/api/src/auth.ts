/**
 * Minimal role gate for the admin side (spec section 5): magic link, four roles, one signed session cookie.
 *
 *   admin      everything, including inviting users
 *   scientist  propose registry entries and versions, request runs
 *   reviewer   approve / reject registry entries, sign off findings and calibration claims
 *   viewer     read the admin side
 *
 * Users live in Postgres (users table). Without a database, AUTH_USERS="email:role,email:role" seeds an in-memory list.
 * The magic link is e-mailed when MAIL_WEBHOOK_URL is set (a POST with {to, subject, text}); otherwise it is written to
 * the server log, and, when AUTH_DEV_ECHO=1 (local dev and previews only), returned in the response so the flow can be
 * exercised without a mail provider. AUTH_SECRET signs tokens and sessions.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { hasDatabase, sql } from "./db";

export const ROLES = ["admin", "scientist", "reviewer", "viewer"] as const;
export type Role = (typeof ROLES)[number];
export interface User { email: string; role: Role; display_name?: string | null }

const SESSION_COOKIE = "rs_session";
const SESSION_TTL_S = 60 * 60 * 24 * 14;
const LINK_TTL_S = 60 * 15;

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.VERCEL_ENV === "production") throw new Error("AUTH_SECRET is not set");
  return "dev-only-secret-not-for-production";
}
const b64u = (b: Buffer) => b.toString("base64url");
function sign(payload: string): string {
  return b64u(createHmac("sha256", secret()).update(payload).digest());
}
function pack(obj: Record<string, unknown>): string {
  const p = b64u(Buffer.from(JSON.stringify(obj)));
  return `${p}.${sign(p)}`;
}
function unpack<T>(token: string | undefined): T | null {
  if (!token || !token.includes(".")) return null;
  const [p, s] = token.split(".");
  const expected = sign(p);
  if (s.length !== expected.length || !timingSafeEqual(Buffer.from(s), Buffer.from(expected))) return null;
  try {
    const obj = JSON.parse(Buffer.from(p, "base64url").toString()) as T & { exp?: number };
    if (obj.exp && obj.exp < Date.now() / 1000) return null;
    return obj;
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------- users */

const memoryUsers = new Map<string, User>();
(function seedMemoryUsers() {
  const env = process.env.AUTH_USERS ?? "";
  for (const part of env.split(",").map((s) => s.trim()).filter(Boolean)) {
    const [email, role] = part.split(":");
    if (email && (ROLES as readonly string[]).includes(role)) memoryUsers.set(email.toLowerCase(), { email: email.toLowerCase(), role: role as Role });
  }
})();

export async function findUser(email: string): Promise<User | null> {
  const e = email.trim().toLowerCase();
  if (hasDatabase()) {
    const rows = await sql()`select email, role, display_name from users where email = ${e}`;
    return rows.length ? (rows[0] as User) : null;
  }
  return memoryUsers.get(e) ?? null;
}

export async function listUsers(): Promise<User[]> {
  if (hasDatabase()) return (await sql()`select email, role, display_name from users order by email`) as User[];
  return [...memoryUsers.values()];
}

export async function upsertUser(u: User): Promise<User> {
  const e = u.email.trim().toLowerCase();
  if (!(ROLES as readonly string[]).includes(u.role)) throw new Error("unknown role");
  if (hasDatabase()) {
    await sql()`insert into users (email, role, display_name) values (${e}, ${u.role}, ${u.display_name ?? null}) on conflict (email) do update set role = excluded.role, display_name = coalesce(excluded.display_name, users.display_name)`;
  } else memoryUsers.set(e, { ...u, email: e });
  return { ...u, email: e };
}

/** Make sure the bootstrap admin (ADMIN_EMAIL) exists, so a fresh database can be signed into. */
export async function ensureBootstrapAdmin(): Promise<void> {
  const email = process.env.ADMIN_EMAIL;
  if (!email) return;
  const existing = await findUser(email);
  if (!existing) await upsertUser({ email, role: "admin" });
}

/* ---------------------------------------------------------------- magic links and sessions */

export async function issueMagicLink(email: string, origin: string): Promise<{ sent: "mail" | "log" | "echo"; link?: string }> {
  const user = await findUser(email);
  // same answer whether or not the address is known, so the form does not reveal who has access
  if (!user) return { sent: "log" };
  const nonce = b64u(randomBytes(18));
  const exp = Math.floor(Date.now() / 1000) + LINK_TTL_S;
  const token = pack({ e: user.email, n: nonce, exp });
  if (hasDatabase()) await sql()`insert into auth_tokens (token_hash, email, expires_at) values (${sign(token)}, ${user.email}, ${new Date(exp * 1000).toISOString()})`;
  const link = `${origin}/api/auth/callback?token=${encodeURIComponent(token)}`;
  const webhook = process.env.MAIL_WEBHOOK_URL;
  if (webhook) {
    await fetch(webhook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ to: user.email, subject: "Resilience Studio sign-in link", text: `Sign in (valid 15 minutes): ${link}` }) });
    return { sent: "mail" };
  }
  console.log(`[auth] magic link for ${user.email}: ${link}`);
  if (process.env.AUTH_DEV_ECHO === "1" && process.env.VERCEL_ENV !== "production") return { sent: "echo", link };
  return { sent: "log" };
}

export async function redeemMagicLink(token: string): Promise<User | null> {
  const t = unpack<{ e: string; n: string; exp: number }>(token);
  if (!t) return null;
  if (hasDatabase()) {
    const rows = await sql()`update auth_tokens set used_at = now() where token_hash = ${sign(token)} and used_at is null and expires_at > now() returning email`;
    if (!rows.length) return null;
    await sql()`update users set last_login_at = now() where email = ${t.e}`;
  }
  return findUser(t.e);
}

export function setSession(c: Context, user: User): void {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_S;
  setCookie(c, SESSION_COOKIE, pack({ e: user.email, r: user.role, exp }), { httpOnly: true, sameSite: "Lax", secure: !!process.env.VERCEL, path: "/", maxAge: SESSION_TTL_S });
}
export function clearSession(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}
export function sessionUser(c: Context): User | null {
  const s = unpack<{ e: string; r: Role; exp: number }>(getCookie(c, SESSION_COOKIE));
  return s ? { email: s.e, role: s.r } : null;
}

/* ---------------------------------------------------------------- guards */

const RANK: Record<Role, number> = { viewer: 0, scientist: 1, reviewer: 1, admin: 2 };

export function can(user: User | null, action: "read_admin" | "propose" | "review" | "run" | "sign_off" | "manage_users"): boolean {
  if (!user) return false;
  switch (action) {
    case "read_admin": return true;
    case "propose": return user.role === "scientist" || user.role === "admin";
    case "run": return user.role === "scientist" || user.role === "admin";
    case "review": return user.role === "reviewer" || user.role === "admin";
    case "sign_off": return user.role === "reviewer" || user.role === "admin";
    case "manage_users": return RANK[user.role] >= 2;
  }
}

export function requireUser(action: Parameters<typeof can>[1]): MiddlewareHandler {
  return async (c, next) => {
    const user = sessionUser(c);
    if (!user) return c.json({ error: "Sign in required", code: "unauthenticated" }, 401);
    if (!can(user, action)) return c.json({ error: `Your role (${user.role}) cannot ${action.replace("_", " ")}`, code: "forbidden" }, 403);
    c.set("user", user);
    await next();
  };
}

declare module "hono" {
  interface ContextVariableMap {
    user: User;
  }
}
