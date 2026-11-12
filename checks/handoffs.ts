// Handoffs: where a net passes from one block to another (HANDOFFS of
// lib/placement.ts), the copper of both sides has to meet at the point, on the
// layer and at the width the table gives. Each block is routed by someone
// else, so this is where their work is joined.
import { at } from "../lib/geometry";
import {
  BLOCKS,
  type BlockName,
  HANDOFFS,
  type Handoff,
} from "../lib/placement";
import type { Rect } from "../lib/geometry";
import { type Copper, type Point, circle, gap, gapToPour } from "./copper";
import { layoutCheck, netGraph } from "./power";

/** Copper closer than this to a point covers it. */
const TOUCH = 0.01;
/** A side has copper when it reaches this far past the widest piece at the point. */
const REACH = 0.1;
/** Width may fall short of the table by this much (rounding of tscircuit). */
const WIDTH_SLACK = 0.02;

type Node = ReturnType<typeof netGraph>["nodes"][number];

const covers = (n: Node, p: Point): boolean => {
  const dot = circle(p.x, p.y, 0);
  if (n.pour) return gapToPour(dot, n.pour) <= TOUCH;
  return n.shape ? gap(dot, n.shape) <= TOUCH : false;
};

/** Outward normal of `from`'s region at the point (design coordinates), if the point is on its edge. */
const normalAt = (p: Point, regions: Rect[]): Point | undefined => {
  const e = 1e-6;
  const inside = (q: Point) =>
    regions.some((r) => q.x > r.x0 && q.x < r.x1 && q.y > r.y0 && q.y < r.y1);
  for (const r of regions) {
    const within = (v: number, lo: number, hi: number) =>
      v >= lo - e && v <= hi + e;
    const candidates: Point[] = [];
    if (within(p.y, r.y0, r.y1)) {
      if (Math.abs(p.x - r.x0) < e) candidates.push({ x: -1, y: 0 });
      if (Math.abs(p.x - r.x1) < e) candidates.push({ x: 1, y: 0 });
    }
    if (within(p.x, r.x0, r.x1)) {
      if (Math.abs(p.y - r.y0) < e) candidates.push({ x: 0, y: -1 });
      if (Math.abs(p.y - r.y1) < e) candidates.push({ x: 0, y: 1 });
    }
    for (const n of candidates)
      if (
        inside({ x: p.x - 0.05 * n.x, y: p.y - 0.05 * n.y }) &&
        !inside({ x: p.x + 0.05 * n.x, y: p.y + 0.05 * n.y })
      )
        return n;
  }
  return undefined;
};

const at2 = (h: Handoff) => `(${h.x}, ${h.y})`;

/** What is wrong at one handoff; empty when both sides meet there. */
export const handoffProblems = (
  b: Copper,
  h: Handoff,
  regions: Rect[],
): string[] => {
  const name = `${h.net} ${h.from} -> ${h.to} at ${at2(h)} on ${h.layer}`;
  const normal = normalAt(h, regions);
  if (!normal) return [`${name}: the point is not on the edge of ${h.from}`];
  const p = at(h.x, h.y);
  const n = { x: normal.x, y: -normal.y };
  const t = { x: -n.y, y: n.x };

  const g = netGraph(b, h.net);
  const onLayer = (i: number) => {
    const layers = (g.nodes[i] as Node).layers;
    return layers.includes("*") || layers.includes(h.layer);
  };
  const start = g.nodes.flatMap((node, i) =>
    onLayer(i) && covers(node, p) ? [i] : [],
  );
  if (start.length === 0) return [`${name}: no copper at the point`];

  // The copper that is joined to the point on this layer.
  const joined = new Set(start);
  const queue = [...start];
  while (queue.length > 0) {
    const i = queue.pop() as number;
    for (const j of g.links[i] as number[])
      if (!joined.has(j) && onLayer(j)) {
        joined.add(j);
        queue.push(j);
      }
  }
  const covered = (q: Point) =>
    [...joined].some((i) => covers(g.nodes[i] as Node, q));

  const out: string[] = [];
  // Each side: copper beyond the round end of whatever ends at the point.
  const radius = Math.max(
    h.width / 2,
    ...start.map((i) => {
      const s = (g.nodes[i] as Node).shape;
      return s?.kind === "capsule" ? s.r : 0;
    }),
  );
  const ring = radius + REACH;
  const steps = 72;
  const side = (sign: number) =>
    Array.from({ length: steps }, (_, k) => (2 * Math.PI * k) / steps).some(
      (a) => {
        const d = { x: Math.cos(a), y: Math.sin(a) };
        if (sign * (d.x * n.x + d.y * n.y) < 0.5) return false;
        return covered({ x: p.x + ring * d.x, y: p.y + ring * d.y });
      },
    );
  if (!side(-1)) out.push(`${name}: nothing joins it on the ${h.from} side`);
  if (!side(1)) out.push(`${name}: nothing joins it on the ${h.to} side`);

  // Width across the edge: the widest track at the point, or, where an area
  // or a pad covers it, the run of copper along the edge.
  const tracks = start.flatMap((i) => {
    const node = g.nodes[i] as Node;
    return node.seg ? [node.seg.width] : [];
  });
  const area = start.some((i) => !(g.nodes[i] as Node).seg);
  const along = (dir: number) => {
    let s = 0;
    while (
      s < h.width + 1 &&
      covered({
        x: p.x + dir * (s + 0.01) * t.x,
        y: p.y + dir * (s + 0.01) * t.y,
      })
    )
      s += 0.01;
    return s;
  };
  const width = Math.max(
    ...tracks,
    area ? along(1) + along(-1) - 2 * TOUCH : 0,
  );
  if (width < h.width - WIDTH_SLACK)
    out.push(
      `${name}: ${width.toFixed(2)} mm wide at the point, the handoff says ${h.width}`,
    );
  return out;
};

export const handoffs = layoutCheck("handoffs", (b) =>
  HANDOFFS.flatMap((h) =>
    handoffProblems(b, h, BLOCKS[h.from as BlockName].region),
  ),
);

export const HANDOFF_CHECKS = [handoffs];
