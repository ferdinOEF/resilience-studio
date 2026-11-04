/**
 * Tiny history-API router: no dependency, three exports.
 *   usePath()                  the current pathname, re-rendering on pushState/popstate
 *   navigate(path, {replace})  change the URL and notify subscribers
 *   matchPath(pattern, path)   "/admin/registry/:id" -> { id } (URL-decoded) or null
 *   <Link href>                an <a> that navigates client-side on a plain left click
 */
import { useEffect, useState, type AnchorHTMLAttributes, type MouseEvent } from "react";

const listeners = new Set<() => void>();

export function navigate(path: string, opts: { replace?: boolean } = {}): void {
  if (opts.replace) window.history.replaceState(null, "", path);
  else window.history.pushState(null, "", path);
  for (const l of listeners) l();
}

export function usePath(): string {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const l = () => setPath(window.location.pathname);
    listeners.add(l);
    window.addEventListener("popstate", l);
    l(); // a child effect may have navigated before this subscription existed
    return () => {
      listeners.delete(l);
      window.removeEventListener("popstate", l);
    };
  }, []);
  return path;
}

export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split("/").filter(Boolean);
  const s = path.split("/").filter(Boolean);
  if (p.length !== s.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(":")) {
      const key = p[i].slice(1);
      try {
        params[key] = decodeURIComponent(s[i]);
      } catch {
        params[key] = s[i];
      }
    } else if (p[i] !== s[i]) return null;
  }
  return params;
}

export function Link({ href, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || rest.target === "_blank") return;
    e.preventDefault();
    navigate(href);
  };
  return <a href={href} onClick={handle} {...rest} />;
}
