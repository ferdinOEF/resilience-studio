/**
 * Classified grid → smooth, gap-free vector polygons (docs/STEP_PROMPT_map_polish_scrim_and_vectorization.md §2).
 *
 * Dual-grid marching squares over a *partition*: every 2×2 block of cell centres is cut
 * into pieces, one class per piece, so neighbouring classes share exactly the same
 * boundary (no slivers, no overlaps). Rules per block (corners TL, TR, BR, BL):
 *  - two classes as adjacent pairs → each corner keeps its full quadrant (a straight edge
 *    through the block centre);
 *  - otherwise the most common class (ties: higher priority) owns the block centre, and
 *    every other corner gets a corner triangle (the 45° chamfer that removes stair-steps).
 * Pieces are dissolved per class by cancelling shared edges, traced into rings, then
 * smoothed with Chaikin's algorithm. Vertices where three or more classes meet are pinned,
 * so the chain between two junctions is smoothed identically from both sides.
 *
 * Only the *drawing* changes: each cell's class is decided by the caller, unchanged.
 */

export type Ring = [number, number][];
export type Polygon = Ring[];

/**
 * @param classAt class of cell (c, r), or −1 for "not drawn"
 * @returns class → polygons (outer ring first, then holes), in cell units: cell (c, r) is
 *          the unit square centred on (c, r).
 */
export function vectorizeClasses(
  cols: number,
  rows: number,
  classAt: (c: number, r: number) => number,
  opts: { priority?: (k: number) => number; smooth?: number } = {}
): Map<number, Polygon[]> {
  const prio = opts.priority ?? ((k: number) => k);
  const iterations = opts.smooth ?? 2;
  const W = cols + 2, H = rows + 2; // one cell of "not drawn" padding all round
  const cls = new Int32Array(W * H).fill(-1);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cls[(r + 1) * W + c + 1] = classAt(c, r);

  // Lattice at half-cell spacing: cell centres, edge midpoints and block centres.
  const LW = 2 * W - 1, LH = 2 * H - 1, NV = LW * LH;
  const vA = new Int32Array(NV).fill(-2), vB = new Int32Array(NV).fill(-2);
  const fixed = new Uint8Array(NV);
  const touch = (v: number, k: number) => {
    if (vA[v] === -2 || vA[v] === k) vA[v] = k;
    else if (vB[v] === -2 || vB[v] === k) vB[v] = k;
    else fixed[v] = 1;
  };
  const edges = new Map<number, Map<number, number>>();
  const addPiece = (k: number, verts: number[]) => {
    for (const v of verts) touch(v, k);
    if (k < 0) return;
    let m = edges.get(k);
    if (!m) edges.set(k, (m = new Map()));
    for (let i = 0; i < verts.length; i++) {
      const a = verts[i], b = verts[(i + 1) % verts.length];
      const rev = b * NV + a;
      if (m.has(rev)) m.delete(rev);
      else m.set(a * NV + b, a);
    }
  };

  const k4 = [0, 0, 0, 0];
  for (let r = 0; r < H - 1; r++) {
    for (let c = 0; c < W - 1; c++) {
      k4[0] = cls[r * W + c];
      k4[1] = cls[r * W + c + 1];
      k4[2] = cls[(r + 1) * W + c + 1];
      k4[3] = cls[(r + 1) * W + c];
      const x = 2 * c, y = 2 * r;
      const corner = [y * LW + x, y * LW + x + 2, (y + 2) * LW + x + 2, (y + 2) * LW + x];
      // mid[i] sits between corner i and corner i+1
      const mid = [y * LW + x + 1, (y + 1) * LW + x + 2, (y + 2) * LW + x + 1, (y + 1) * LW + x];
      const ctr = (y + 1) * LW + x + 1;
      if (k4[0] === k4[1] && k4[1] === k4[2] && k4[2] === k4[3]) {
        addPiece(k4[0], [corner[0], mid[0], corner[1], mid[1], corner[2], mid[2], corner[3], mid[3]]);
        continue;
      }
      const quad = (i: number) => [corner[i], mid[i], ctr, mid[(i + 3) % 4]];
      // centre owner: most common class, ties to higher priority
      let owner = k4[0], best = -1;
      for (let i = 0; i < 4; i++) {
        let n = 0;
        for (let j = 0; j < 4; j++) if (k4[j] === k4[i]) n++;
        if (n > best || (n === best && prio(k4[i]) > prio(owner))) { best = n; owner = k4[i]; }
      }
      // No majority, or the pair is edge-adjacent (A A / B B, A A / B C): straight edges
      // through the centre, so a class boundary running along a row or column stays straight.
      const diagonalPair = best === 2 && k4[0] === k4[2] ? k4[0] : best === 2 && k4[1] === k4[3] ? k4[1] : null;
      if (best === 1 || (best === 2 && diagonalPair === null)) {
        for (let i = 0; i < 4; i++) addPiece(k4[i], quad(i));
        continue;
      }
      if (diagonalPair !== null && best === 2) {
        // saddle: the diagonal pair connects through the centre (the higher-priority pair if both are pairs)
        const other = k4[0] === diagonalPair ? k4[1] : k4[0];
        owner = k4[1] === k4[3] && k4[0] === k4[2] && prio(other) > prio(diagonalPair) ? other : diagonalPair;
      }
      for (let i = 0; i < 4; i++) {
        if (k4[i] === owner) addPiece(owner, quad(i));
        else {
          addPiece(k4[i], [corner[i], mid[i], mid[(i + 3) % 4]]);
          addPiece(owner, [mid[i], ctr, mid[(i + 3) % 4]]);
        }
      }
    }
  }

  const toXY = (v: number): [number, number] => [(v % LW) / 2 - 1, Math.floor(v / LW) / 2 - 1];
  // trace every class's rings first, so pinch points are pinned before any smoothing
  const traced = new Map<number, number[][]>();
  for (const [k, m] of edges) {
    const outgoing = new Map<number, number[]>();
    for (const [key, a] of m) {
      const b = (key - a * NV);
      const list = outgoing.get(a);
      if (list) { list.push(b); fixed[a] = 1; } // pinch point: pin it
      else outgoing.set(a, [b]);
    }
    const rings: number[][] = [];
    for (const [start, list] of outgoing) {
      while (list.length) {
        const ring = [start];
        let cur = list.pop()!;
        while (cur !== start) {
          ring.push(cur);
          const nx = outgoing.get(cur)!;
          cur = nx.pop()!;
        }
        rings.push(ring);
      }
    }
    traced.set(k, rings);
  }
  const out = new Map<number, Polygon[]>();
  for (const [k, rings] of traced) {
    // smooth, then group holes under their outer rings
    const outers: { ring: Ring; area: number; bbox: number[]; holes: Ring[] }[] = [];
    const holes: Ring[] = [];
    for (const ring of rings) {
      const pts = smoothRing(ring, fixed, toXY, iterations);
      if (pts.length < 3) continue;
      const a = signedArea(pts);
      if (a > 0) outers.push({ ring: pts, area: a, bbox: bboxOf(pts), holes: [] });
      else if (a < 0) holes.push(pts);
    }
    outers.sort((p, q) => p.area - q.area);
    for (const h of holes) {
      const [px, py] = [(h[0][0] + h[1][0]) / 2, (h[0][1] + h[1][1]) / 2];
      const host = outers.find((o) => px >= o.bbox[0] && px <= o.bbox[2] && py >= o.bbox[1] && py <= o.bbox[3] && pointInRing(px, py, o.ring));
      if (host) host.holes.push(h);
    }
    out.set(k, outers.map((o) => [o.ring, ...o.holes]));
  }
  return out;
}

function smoothRing(ring: number[], fixed: Uint8Array, toXY: (v: number) => [number, number], iterations: number): Ring {
  const n = ring.length;
  const s = ring.findIndex((v) => fixed[v] === 1);
  if (s < 0) {
    let pts = dropCollinear(ring.map(toXY), true);
    for (let it = 0; it < iterations; it++) pts = chaikin(pts, true);
    return pts;
  }
  // split at pinned vertices; each chain is smoothed with its ends held
  const rot = ring.slice(s).concat(ring.slice(0, s));
  const out: Ring = [];
  let chain: number[] = [rot[0]];
  const flush = () => {
    let pts = dropCollinear(chain.map(toXY), false);
    for (let it = 0; it < iterations; it++) pts = chaikin(pts, false);
    out.push(...pts.slice(0, -1));
  };
  for (let i = 1; i <= n; i++) {
    const v = rot[i % n];
    chain.push(v);
    if (fixed[v] === 1) { flush(); chain = [v]; }
  }
  return out;
}

function dropCollinear(pts: Ring, closed: boolean): Ring {
  const n = pts.length;
  if (n < 3) return pts;
  const keep: Ring = [];
  for (let i = 0; i < n; i++) {
    if (!closed && (i === 0 || i === n - 1)) { keep.push(pts[i]); continue; }
    const p = pts[(i + n - 1) % n], q = pts[i], r = pts[(i + 1) % n];
    const cross = (q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0]);
    if (Math.abs(cross) > 1e-9) keep.push(q);
  }
  return keep;
}

function chaikin(pts: Ring, closed: boolean): Ring {
  const n = pts.length;
  if (n < 3 && !closed) return pts;
  const out: Ring = [];
  if (closed) {
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      out.push([0.75 * p[0] + 0.25 * q[0], 0.75 * p[1] + 0.25 * q[1]], [0.25 * p[0] + 0.75 * q[0], 0.25 * p[1] + 0.75 * q[1]]);
    }
    return out;
  }
  out.push(pts[0]);
  for (let i = 0; i < n - 1; i++) {
    const p = pts[i], q = pts[i + 1];
    if (i > 0) out.push([0.75 * p[0] + 0.25 * q[0], 0.75 * p[1] + 0.25 * q[1]]);
    if (i < n - 2) out.push([0.25 * p[0] + 0.75 * q[0], 0.25 * p[1] + 0.75 * q[1]]);
  }
  out.push(pts[n - 1]);
  return out;
}

/** Shoelace area in cell units, y down: positive = clockwise on screen (outer rings here). */
export function signedArea(r: Ring): number {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const p = r[i], q = r[(i + 1) % r.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

function bboxOf(r: Ring): number[] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of r) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return [x0, y0, x1, y1];
}

function pointInRing(x: number, y: number, r: Ring): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
