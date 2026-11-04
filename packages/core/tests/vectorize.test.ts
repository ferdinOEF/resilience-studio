import { describe, expect, it } from "vitest";
import { signedArea, vectorizeClasses, type Polygon } from "../src/engine/vectorize";

const polyArea = (p: Polygon) => p.reduce((a, r) => a + signedArea(r), 0);
function inRing(x: number, y: number, r: [number, number][]) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inPoly = (x: number, y: number, p: Polygon) => inRing(x, y, p[0]) && !p.slice(1).some((h) => inRing(x, y, h));

// deterministic pseudo-random classes with some spatial structure
function field(cols: number, rows: number, nClasses: number) {
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const cells = new Int32Array(cols * rows);
  for (let i = 0; i < cells.length; i++) cells[i] = Math.floor(rnd() * nClasses) - (rnd() < 0.15 ? 99 : 0);
  return (c: number, r: number) => Math.max(-1, cells[r * cols + c]);
}

describe("vectorizeClasses", () => {
  // The four outer corners of the whole window are chamfered (1/8 cell each): −0.5 in total.
  it("a uniform grid becomes one rectangle", () => {
    const out = vectorizeClasses(3, 2, () => 4, { smooth: 0 });
    expect([...out.keys()]).toEqual([4]);
    expect(out.get(4)!.length).toBe(1);
    expect(polyArea(out.get(4)![0])).toBeCloseTo(5.5, 9);
  });

  it("unsmoothed pieces tile the drawn area exactly (fully painted grid)", () => {
    const f = field(30, 20, 5);
    const out = vectorizeClasses(30, 20, (c, r) => Math.max(0, f(c, r)), { smooth: 0 });
    let total = 0;
    for (const polys of out.values()) for (const p of polys) total += polyArea(p);
    expect(total).toBeCloseTo(599.5, 6);
  });

  it("smoothed classes never overlap and leave no gaps inside the painted area", () => {
    const f = field(24, 16, 4);
    const out = vectorizeClasses(24, 16, (c, r) => Math.max(0, f(c, r)), { smooth: 2 });
    let overlaps = 0, gaps = 0;
    for (let y = -0.45; y < 15.5; y += 0.1) {
      for (let x = -0.45; x < 23.5; x += 0.1) {
        let n = 0;
        for (const polys of out.values()) for (const p of polys) if (inPoly(x, y, p)) n++;
        if (n > 1) overlaps++;
        // gaps are only allowed at the rounded outer corners of the whole window
        const nearCorner = (x < 0.5 || x > 22.5) && (y < 0.5 || y > 14.5);
        if (n === 0 && !nearCorner) gaps++;
      }
    }
    expect(overlaps).toBe(0);
    expect(gaps).toBe(0);
  });

  it("undrawn cells (−1) are left out, and holes are attached to their outer ring", () => {
    // a 5×5 block of class 1 with a class-2 cell in the middle and undrawn border
    const out = vectorizeClasses(7, 7, (c, r) => (c === 3 && r === 3 ? 2 : c >= 1 && c <= 5 && r >= 1 && r <= 5 ? 1 : -1));
    expect(out.has(-1)).toBe(false);
    const one = out.get(1)!;
    expect(one.length).toBe(1);
    expect(one[0].length).toBe(2); // outer + hole
    expect(out.get(2)!.length).toBe(1);
  });
});
