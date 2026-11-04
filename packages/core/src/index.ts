/**
 * @resilience/core — the risk engine ported from coastal-resilience-studio (commit cb732bd, 23 Oct 2026)
 * with the model-audit fixes (M1–M18, phases P0–P3) already applied there. See docs/MODEL_AUDIT_LOG_ported.md.
 *
 * Nothing numeric lives in code: every parameter is read from the data files, each with a grounding tag
 * and citations. The science registry (@resilience/registry) is seeded from these files.
 */
export * from "./engine/types";
export * from "./engine/grid";
export * from "./engine/effects";
export * from "./engine/inundation";
export * from "./engine/impact";
export * from "./engine/ecology";
export * from "./engine/rain";
export * from "./engine/model";
export * from "./engine/vectorize";
export * from "./data/index";
