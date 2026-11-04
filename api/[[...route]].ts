import { handle } from "hono/vercel";
import { app } from "@resilience/api";

export const config = { runtime: "nodejs" };
export default handle(app);
