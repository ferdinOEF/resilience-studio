/**
 * The studio (user side): one map-first layout at State, City and Ward scale, plus Scenarios, Solutions and Policy.
 * Routes: / → /risk/city; /risk/state, /risk/city, /risk/ward, /scenarios, /solutions, /policy. The admin side lives
 * under /admin (Root.tsx). Everything shown here passes the gate in studio/data.tsx.
 */
import { useEffect } from "react";
import { navigate } from "./router";
import { SessionProvider } from "./session";
import { StudioProvider } from "./studio/data";
import { Policy } from "./studio/Policy";
import { RiskCity } from "./studio/RiskCity";
import { RiskState } from "./studio/RiskState";
import { RiskWard } from "./studio/RiskWard";
import { Scenarios } from "./studio/Scenarios";
import { Solutions } from "./studio/Solutions";
import { Layout } from "./studio/Shell";

export const STUDIO_PATHS = ["/", "/index.html", "/risk", "/risk/state", "/risk/city", "/risk/ward", "/scenarios", "/solutions", "/policy"];

export function isStudioPath(path: string): boolean {
  const clean = path.replace(/\/+$/, "") || "/";
  return STUDIO_PATHS.includes(clean);
}

function Routes({ path }: { path: string }) {
  const clean = path.replace(/\/+$/, "") || "/";
  const redirect = clean === "/" || clean === "/index.html" || clean === "/risk" ? "/risk/city" : null;
  useEffect(() => {
    if (redirect) navigate(redirect, { replace: true });
  }, [redirect]);
  if (redirect) return null;
  switch (clean) {
    case "/risk/state":
      return <RiskState />;
    case "/risk/city":
      return <RiskCity />;
    case "/risk/ward":
      return <RiskWard />;
    case "/scenarios":
      return <Scenarios />;
    case "/solutions":
      return <Solutions />;
    case "/policy":
      return <Policy />;
    default:
      return (
        <Layout view="risk" scale={null}>
          <div style={{ padding: 28 }}>
            <h1 className="page-title">Not found</h1>
            <p className="muted">There is nothing at {clean}.</p>
          </div>
        </Layout>
      );
  }
}

export function App({ path }: { path: string }) {
  return (
    <SessionProvider>
      <StudioProvider>
        <Routes path={path} />
      </StudioProvider>
    </SessionProvider>
  );
}
