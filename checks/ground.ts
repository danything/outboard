// The ground on the bottom: one piece, so that every return current has a way
// back under its track. Worked out on a grid: the board less the copper of
// other nets on the bottom (with the pour clearance) and the edge clearance.
import {
  type Copper,
  type Point,
  type Shape,
  boundsOf,
  circle,
  gap,
  insidePolygon,
  insidePour,
  segmentShape,
} from "./copper";
import { layoutCheck } from "./power";

/** Grid step, mm. */
const STEP = 0.1;
/** A piece of ground smaller than this is a sliver, not a split. */
const MIN_PIECE = 2;
/** Pour clearance (lib/routing/kit.tsx POUR_CLEARANCE) and edge clearance. */
const CLEARANCE = 0.2;
const EDGE = 0.35;

export interface GroundPiece {
  /** Area in mm2. */
  area: number;
  /** A point inside it, in circuit.json coordinates. */
  at: Point;
}

const onBottom = (layers: string[]) =>
  layers.includes("*") || layers.includes("bottom");

/** Pieces of the bottom ground, largest first, and a test for the main one. */
export const groundPieces = (
  b: Copper,
  net = "GND",
): { pieces: GroundPiece[]; onMain: (p: Point) => boolean } => {
  const box = boundsOf({ kind: "poly", points: b.outline });
  const nx = Math.ceil((box.x1 - box.x0) / STEP);
  const ny = Math.ceil((box.y1 - box.y0) / STEP);
  const free = new Uint8Array(nx * ny);
  const cell = (i: number, j: number): Point => ({
    x: box.x0 + (i + 0.5) * STEP,
    y: box.y0 + (j + 0.5) * STEP,
  });
  const edgeShape: Shape = { kind: "poly", points: b.outline };
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const p = cell(i, j);
      if (!insidePolygon(p, b.outline)) continue;
      free[j * nx + i] = 1;
    }
  const clear = (s: Shape, margin: number) => {
    const r = boundsOf(s, margin);
    const i0 = Math.max(0, Math.floor((r.x0 - box.x0) / STEP));
    const i1 = Math.min(nx - 1, Math.ceil((r.x1 - box.x0) / STEP));
    const j0 = Math.max(0, Math.floor((r.y0 - box.y0) / STEP));
    const j1 = Math.min(ny - 1, Math.ceil((r.y1 - box.y0) / STEP));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const k = j * nx + i;
        if (!free[k]) continue;
        const p = cell(i, j);
        if (gap(circle(p.x, p.y, 0), s) < margin) free[k] = 0;
      }
  };
  // The outline: cells near any edge.
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (!free[k]) continue;
      const p = cell(i, j);
      if (gap(circle(p.x, p.y, 0), edgeShape) === 0) {
        // Inside: measure to the ring.
        const near = b.outline.some((a, n) => {
          const c = b.outline[(n + 1) % b.outline.length] as Point;
          return (
            gap(circle(p.x, p.y, 0), { kind: "capsule", a, b: c, r: 0 }) < EDGE
          );
        });
        if (near) free[k] = 0;
      }
    }
  for (const s of b.segments)
    if (s.layer === "bottom" && s.net !== net)
      clear(segmentShape(s), CLEARANCE);
  for (const v of b.vias)
    if (v.net !== net) clear(circle(v.x, v.y, v.outer), CLEARANCE);
  for (const p of b.pads)
    if (p.net !== net && onBottom(p.layers)) clear(p.shape, CLEARANCE);
  for (const h of b.holes) clear(circle(h.x, h.y, h.diameter), EDGE);
  for (const pour of b.pours)
    if (pour.layer === "bottom" && pour.net !== net) {
      const r = boundsOf({ kind: "poly", points: pour.outer }, CLEARANCE);
      for (let j = 0; j < ny; j++)
        for (let i = 0; i < nx; i++) {
          const k = j * nx + i;
          if (!free[k]) continue;
          const p = cell(i, j);
          if (p.x < r.x0 || p.x > r.x1 || p.y < r.y0 || p.y > r.y1) continue;
          if (
            insidePour(p, pour) ||
            gap(circle(p.x, p.y, 0), { kind: "poly", points: pour.outer }) <
              CLEARANCE
          )
            free[k] = 0;
        }
    }

  const label = new Int32Array(nx * ny).fill(-1);
  const sizes: number[] = [];
  const starts: number[] = [];
  for (let start = 0; start < free.length; start++) {
    if (!free[start] || (label[start] as number) >= 0) continue;
    const id = sizes.length;
    let count = 0;
    const stack = [start];
    label[start] = id;
    while (stack.length > 0) {
      const k = stack.pop() as number;
      count++;
      const i = k % nx;
      const j = (k - i) / nx;
      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const a = i + di;
        const c = j + dj;
        if (a < 0 || c < 0 || a >= nx || c >= ny) continue;
        const n = c * nx + a;
        if (free[n] && (label[n] as number) < 0) {
          label[n] = id;
          stack.push(n);
        }
      }
    }
    sizes.push(count);
    starts.push(start);
  }
  const pieces = sizes
    .map((count, id) => ({
      id,
      area: count * STEP * STEP,
      at: cell(
        (starts[id] as number) % nx,
        Math.floor((starts[id] as number) / nx),
      ),
    }))
    .sort((x, y) => y.area - x.area);
  const main = pieces[0]?.id ?? -1;
  /** Whether the bottom ground at this point (circuit.json coordinates) is the main piece. */
  const onMain = (p: Point): boolean => {
    const i = Math.floor((p.x - box.x0) / STEP);
    const j = Math.floor((p.y - box.y0) / STEP);
    // The cell under the centre, or one next to it (the grid is coarse).
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        const a = i + di;
        const c = j + dj;
        if (a < 0 || c < 0 || a >= nx || c >= ny) continue;
        if (label[c * nx + a] === main) return true;
      }
    return false;
  };
  return { pieces, onMain };
};

/**
 * One piece, and every ground via and every ground pad that reaches the
 * bottom sits on it: a via in a hole of another net's area is cut off however
 * small the hole is.
 */
export const groundPlane = layoutCheck("groundPlane", (b) => {
  const { pieces, onMain } = groundPieces(b);
  const out = pieces
    .slice(1)
    .filter((p) => p.area >= MIN_PIECE)
    .map(
      (p) =>
        `the bottom ground has a separate piece of ${p.area.toFixed(1)} mm2 at (${p.at.x.toFixed(1)}, ${(-p.at.y).toFixed(1)})`,
    );
  for (const v of b.vias)
    if (v.net === "GND" && !onMain(v))
      out.push(
        `GND via at (${v.x.toFixed(2)}, ${(-v.y).toFixed(2)}) is not on the main piece of the bottom ground`,
      );
  for (const p of b.pads)
    if (p.net === "GND" && onBottom(p.layers) && !onMain(p.center))
      out.push(
        `GND pad ${p.ref}.${p.pins[0] ?? ""} is not on the main piece of the bottom ground`,
      );
  return out;
});

export const GROUND_CHECKS = [groundPlane];
