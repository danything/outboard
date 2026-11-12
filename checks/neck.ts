// Width of a current path through the copper as it is made, pours included:
// the copper of one net is drawn on a grid, each copper cell gets its
// distance to the nearest gap (twice that is the width there), and the widest
// route from one set of pads to the other is searched cell by cell. A pour is
// as narrow as its narrowest neck between other nets' cutouts.
import {
  type Copper,
  type Pad,
  type Point,
  type Shape,
  boundsOf,
  circle,
  gap,
  insidePour,
  segmentShape,
} from "./copper";

/** Grid step, mm. A width comes out within about one step. */
export const NECK_STEP = 0.05;

interface Raster {
  x0: number;
  y0: number;
  nx: number;
  ny: number;
  /** Width in mm at each cell, per layer (0 = no copper). */
  width: [Float32Array, Float32Array];
  /** Cells where a via or a plated hole joins the two layers. */
  through: Uint8Array;
}

const LAYER = { top: 0, bottom: 1 } as const;
const layersOf = (layers: string[]): number[] =>
  layers.includes("*")
    ? [0, 1]
    : layers.flatMap((l) => (l === "top" ? [0] : l === "bottom" ? [1] : []));

const rasters = new WeakMap<Copper, Map<string, Raster>>();

const rasterOf = (b: Copper, net: string): Raster => {
  const perBoard = rasters.get(b) ?? new Map<string, Raster>();
  rasters.set(b, perBoard);
  const cached = perBoard.get(net);
  if (cached) return cached;

  const shapes: { shape: Shape; layers: number[]; through: boolean }[] = [
    ...b.segments
      .filter((s) => s.net === net)
      .map((s) => ({
        shape: segmentShape(s),
        layers: layersOf([s.layer]),
        through: false,
      })),
    ...b.vias
      .filter((v) => v.net === net)
      .map((v) => ({
        shape: circle(v.x, v.y, v.outer),
        layers: [0, 1],
        through: true,
      })),
    ...b.pads
      .filter((p) => p.net === net)
      .map((p) => ({
        shape: p.shape,
        layers: layersOf(p.layers),
        through: p.layers.includes("*"),
      })),
  ];
  const pours = b.pours.filter((p) => p.net === net);
  const boxes = [
    ...shapes.map((s) => boundsOf(s.shape)),
    ...pours.map((p) => boundsOf({ kind: "poly", points: p.outer })),
  ];
  const margin = 2 * NECK_STEP;
  const x0 = Math.min(...boxes.map((q) => q.x0)) - margin;
  const y0 = Math.min(...boxes.map((q) => q.y0)) - margin;
  const nx = Math.ceil(
    (Math.max(...boxes.map((q) => q.x1)) + margin - x0) / NECK_STEP,
  );
  const ny = Math.ceil(
    (Math.max(...boxes.map((q) => q.y1)) + margin - y0) / NECK_STEP,
  );
  const on: [Uint8Array, Uint8Array] = [
    new Uint8Array(nx * ny),
    new Uint8Array(nx * ny),
  ];
  const through = new Uint8Array(nx * ny);
  const cell = (i: number, j: number): Point => ({
    x: x0 + (i + 0.5) * NECK_STEP,
    y: y0 + (j + 0.5) * NECK_STEP,
  });
  const range = (lo: number, hi: number, origin: number, n: number) => [
    Math.max(0, Math.floor((lo - origin) / NECK_STEP)),
    Math.min(n - 1, Math.ceil((hi - origin) / NECK_STEP)),
  ];
  for (const s of shapes) {
    const q = boundsOf(s.shape);
    const [i0, i1] = range(q.x0, q.x1, x0, nx) as [number, number];
    const [j0, j1] = range(q.y0, q.y1, y0, ny) as [number, number];
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const p = cell(i, j);
        if (gap(circle(p.x, p.y, 0), s.shape) > 0) continue;
        const k = j * nx + i;
        for (const l of s.layers) (on[l] as Uint8Array)[k] = 1;
        if (s.through) through[k] = 1;
      }
  }
  for (const pour of pours) {
    const l = LAYER[pour.layer as keyof typeof LAYER];
    if (l === undefined) continue;
    const q = boundsOf({ kind: "poly", points: pour.outer });
    const [i0, i1] = range(q.x0, q.x1, x0, nx) as [number, number];
    const [j0, j1] = range(q.y0, q.y1, y0, ny) as [number, number];
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++)
        if (insidePour(cell(i, j), pour)) on[l][j * nx + i] = 1;
  }

  // Distance to the nearest cell without copper (two-pass chamfer, 1 and
  // sqrt 2), in cells; the width is twice that.
  const width = on.map((grid) => {
    const d = new Float32Array(nx * ny);
    const big = 1e9;
    for (let k = 0; k < d.length; k++) d[k] = grid[k] ? big : 0;
    const at = (i: number, j: number) =>
      i < 0 || j < 0 || i >= nx || j >= ny ? 0 : (d[j * nx + i] as number);
    const r2 = Math.SQRT2;
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (!d[k]) continue;
        d[k] = Math.min(
          d[k] as number,
          at(i - 1, j) + 1,
          at(i, j - 1) + 1,
          at(i - 1, j - 1) + r2,
          at(i + 1, j - 1) + r2,
        );
      }
    for (let j = ny - 1; j >= 0; j--)
      for (let i = nx - 1; i >= 0; i--) {
        const k = j * nx + i;
        if (!d[k]) continue;
        d[k] = Math.min(
          d[k] as number,
          at(i + 1, j) + 1,
          at(i, j + 1) + 1,
          at(i + 1, j + 1) + r2,
          at(i - 1, j + 1) + r2,
        );
      }
    // A cell at distance n from the gap sits n - 1/2 cells inside the edge.
    for (let k = 0; k < d.length; k++)
      d[k] = d[k] ? 2 * ((d[k] as number) - 0.5) * NECK_STEP : 0;
    return d;
  }) as [Float32Array, Float32Array];
  const raster = { x0, y0, nx, ny, width, through };
  perBoard.set(net, raster);
  return raster;
};

/**
 * Width of the narrowest spot on the widest route through the copper of
 * `net` from the `from` pads to the `to` pads; undefined when no copper joins
 * them. Within `neck` mm of an end pad, copper at least as wide as that pad
 * (or as `min`) counts as wide enough.
 */
export const gridNarrowest = (
  b: Copper,
  net: string,
  from: Pad[],
  to: Pad[],
  min: number,
  neck: number,
): number | undefined => {
  const r = rasterOf(b, net);
  const { nx, ny } = r;
  const n = nx * ny;
  const cell = (k: number): Point => ({
    x: r.x0 + ((k % nx) + 0.5) * NECK_STEP,
    y: r.y0 + (Math.floor(k / nx) + 0.5) * NECK_STEP,
  });
  const inPads = (k: number, pads: Pad[]) => {
    const p = cell(k);
    return pads.some((pad) => gap(circle(p.x, p.y, 0), pad.shape) <= 0);
  };
  const ends = [...from, ...to];
  const value = (l: number, k: number): number => {
    const w = (r.width[l] as Float32Array)[k] as number;
    if (!w) return 0;
    const p = cell(k);
    for (const pad of ends)
      if (
        gap(circle(p.x, p.y, 0), pad.shape) <= neck &&
        w >= Math.min(pad.minSide, min) - 2 * NECK_STEP
      )
        return Infinity;
    return w;
  };

  // Widest-path search: best[l * n + k] is the widest bottleneck found so far.
  const best = new Float32Array(2 * n);
  const heap: number[] = [];
  const key = (node: number) => best[node] as number;
  const push = (node: number) => {
    heap.push(node);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (key(heap[parent] as number) >= key(node)) break;
      heap[i] = heap[parent] as number;
      i = parent;
    }
    heap[i] = node;
  };
  const pop = (): number => {
    const top = heap[0] as number;
    const last = heap.pop() as number;
    if (heap.length > 0) {
      let i = 0;
      for (;;) {
        const a = 2 * i + 1;
        const c = a + 1;
        let m = i;
        let mk = key(last);
        if (a < heap.length && key(heap[a] as number) > mk) {
          m = a;
          mk = key(heap[a] as number);
        }
        if (c < heap.length && key(heap[c] as number) > mk) m = c;
        if (m === i) break;
        heap[i] = heap[m] as number;
        i = m;
      }
      heap[i] = last;
    }
    return top;
  };
  const fromPads = from;
  const target = new Uint8Array(n);
  const done = new Uint8Array(2 * n);
  for (const pad of to) {
    const q = boundsOf(pad.shape);
    for (let k = 0; k < n; k++) {
      const p = cell(k);
      if (p.x < q.x0 || p.x > q.x1 || p.y < q.y0 || p.y > q.y1) continue;
      if (inPads(k, [pad])) target[k] = 1;
    }
  }
  for (const pad of fromPads) {
    const q = boundsOf(pad.shape);
    for (let k = 0; k < n; k++) {
      const p = cell(k);
      if (p.x < q.x0 || p.x > q.x1 || p.y < q.y0 || p.y > q.y1) continue;
      if (!inPads(k, [pad])) continue;
      for (const l of layersOf(pad.layers)) {
        if (!(r.width[l] as Float32Array)[k]) continue;
        best[l * n + k] = Infinity;
        push(l * n + k);
      }
    }
  }
  while (heap.length > 0) {
    const node = pop();
    if (done[node]) continue;
    done[node] = 1;
    const l = node >= n ? 1 : 0;
    const k = node - l * n;
    const w = best[node] as number;
    if (target[k]) return w;
    const i = k % nx;
    const j = (k - i) / nx;
    const next: number[] = [];
    if (i > 0) next.push(node - 1);
    if (i < nx - 1) next.push(node + 1);
    if (j > 0) next.push(node - nx);
    if (j < ny - 1) next.push(node + nx);
    if (r.through[k]) next.push(l ? k : n + k);
    for (const m of next) {
      if (done[m]) continue;
      const ml = m >= n ? 1 : 0;
      const v = Math.min(w, value(ml, m - ml * n));
      if (v > (best[m] as number)) {
        best[m] = v;
        push(m);
      }
    }
  }
  return undefined;
};
