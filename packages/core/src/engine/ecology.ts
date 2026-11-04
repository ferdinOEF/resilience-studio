/**
 * Ecology card (model audit Phase 2, M14), reported apart from damage and never added to it.
 *
 * Mangrove squeeze. Flooding at high tide is a mangrove's habitat, not a loss. The risk is coastal squeeze:
 * as the sea rises the intertidal zone moves inland, and mangroves keep their area where they can move with
 * it (Schuerch et al. 2018; Pontee 2013). For a sea-level rise S, new tidal land is land that is dry at
 * today's high tide but below the future one, and free to colonise:
 *   - above today's MHHW and reached by the future high tide (MHHW + S) over connected land, with seawalls,
 *     dunes and khazan bunds holding the water back up to their crest (a barrier in front blocks it);
 *   - not already mangrove, not CRZ-II urban, and less than `builtBlockShare` of the cell under roofs and roads.
 * A mangrove cell is squeezed when no new tidal land lies within the migration distance. The indicator is only
 * defined for a rise (S > 0): with no rise nothing has to move.
 *
 * Khazan. Instead of "khazan flooded", the card reports the khazan land an event floods over intact bunds
 * (overtopping) and the khazan land it would flood if the bunds failed (bund-failure exposure).
 */
import type { DerivedArea } from "./grid";

export interface SqueezeResult {
  slrM: number;
  /** in-scope mangrove (CRZ-IA cells), ha */
  mangroveHa: number;
  /** new tidal land free to colonise within the migration distance of any mangrove, ha */
  newTidalLandHa: number;
  /** mangrove with no new tidal land within the migration distance, ha */
  squeezedHa: number;
}

export function mangroveSqueeze(
  area: DerivedArea,
  elevM: Float32Array,
  inScope: Uint8Array,
  builtShare: Float32Array,
  /** water level reaching each cell at the future high tide, with barriers and bunds (−Infinity where dry) */
  futureTide: Float64Array,
  mhhwTodayM: number,
  slrM: number,
  migrationM: number,
  builtBlockShare: number
): SqueezeResult {
  const g = area.grid;
  const haPerCell = g.data.cellAreaKm2 * 100;
  const rc = Math.max(1, Math.ceil(migrationM / 1000 / Math.min(g.dxKm, g.dyKm)));
  const free = (j: number) =>
    inScope[j] === 1 && !area.isFlowPath[j] && g.cls[j] !== "M" && g.cls[j] !== "U" && builtShare[j] < builtBlockShare &&
    elevM[j] > mhhwTodayM && futureTide[j] > elevM[j];
  const counted = new Uint8Array(g.cols * g.rows);
  let mangrove = 0, squeezed = 0, newLand = 0;
  for (let i = 0; i < g.cols * g.rows; i++) {
    if (!inScope[i] || g.cls[i] !== "M") continue;
    mangrove++;
    const r = Math.floor(i / g.cols), c = i % g.cols;
    let ok = false;
    for (let dr = -rc; dr <= rc; dr++) for (let dc = -rc; dc <= rc; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || rr >= g.rows || cc < 0 || cc >= g.cols) continue;
      if (Math.hypot(dr * g.dyKm, dc * g.dxKm) * 1000 > migrationM) continue;
      const j = rr * g.cols + cc;
      if (!free(j)) continue;
      ok = true;
      if (!counted[j]) { counted[j] = 1; newLand++; }
    }
    if (!ok) squeezed++;
  }
  return { slrM, mangroveHa: mangrove * haPerCell, newTidalLandHa: slrM > 0 ? newLand * haPerCell : 0, squeezedHa: slrM > 0 ? squeezed * haPerCell : 0 };
}
