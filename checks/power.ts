// Power: how wide the copper is along each current path, and how the buck,
// the boost and the input diodes are laid out. tscircuit's autorouter joins
// everything, GND included, with thin tracks; these checks say where that is
// not enough. The numbers are in rules.ts.
import type { Circuit } from "../tools/circuit";
import { type Check, type Finding, skip } from "./finding";
import {
  type Copper,
  type Pad,
  type Point,
  type Pour,
  type Segment,
  type Shape,
  circle,
  copperOf,
  distance,
  gap,
  gapToPour,
  insidePour,
  padsOf,
  polygonArea,
  segmentLength,
  segmentShape,
} from "./copper";
import {
  BOOST_LOOP,
  COPPER_AREA,
  EPSILON,
  FUSE_DISTANCE,
  NECK_LENGTH,
  NET_MIN_WIDTH,
  POWER_PATHS,
  POWER_VIA_DIAMETER,
  VIA_RULES,
} from "./rules";

/** Copper closer than this is joined. */
const TOUCH = 0.01;

interface Node {
  kind: "seg" | "via" | "pad" | "pour";
  layers: string[];
  shape?: Shape;
  seg?: Segment;
  pad?: Pad;
  pour?: Pour;
  outer?: number;
}

export interface NetGraph {
  nodes: Node[];
  links: number[][];
}

const shareLayer = (a: Node, b: Node): boolean =>
  a.layers.includes("*") ||
  b.layers.includes("*") ||
  a.layers.some((l) => b.layers.includes(l));

const touching = (a: Node, b: Node): boolean => {
  if (!shareLayer(a, b)) return false;
  if (a.kind === "pad" && b.kind === "pad") return false;
  if (a.pour && b.pour) return false;
  if (a.pour) return b.shape ? gapToPour(b.shape, a.pour) <= TOUCH : false;
  if (b.pour) return a.shape ? gapToPour(a.shape, b.pour) <= TOUCH : false;
  return a.shape && b.shape ? gap(a.shape, b.shape) <= TOUCH : false;
};

const graphs = new WeakMap<Copper, Map<string, NetGraph>>();

/** The copper of one net as a graph: tracks, vias, pads and pours that touch. */
export const netGraph = (b: Copper, net: string): NetGraph => {
  const perBoard = graphs.get(b) ?? new Map<string, NetGraph>();
  graphs.set(b, perBoard);
  const cached = perBoard.get(net);
  if (cached) return cached;
  const nodes: Node[] = [
    ...b.segments
      .filter((s) => s.net === net)
      .map((s): Node => ({
        kind: "seg",
        layers: [s.layer],
        shape: segmentShape(s),
        seg: s,
      })),
    ...b.vias
      .filter((v) => v.net === net)
      .map((v): Node => ({
        kind: "via",
        layers: ["*"],
        shape: circle(v.x, v.y, v.outer),
        outer: v.outer,
      })),
    ...b.pads
      .filter((p) => p.net === net)
      .map((p): Node => ({
        kind: "pad",
        layers: p.layers,
        shape: p.shape,
        pad: p,
      })),
    ...b.pours
      .filter((p) => p.net === net)
      .map((p): Node => ({ kind: "pour", layers: [p.layer], pour: p })),
  ];
  const links: number[][] = nodes.map(() => []);
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++)
      if (touching(nodes[i] as Node, nodes[j] as Node)) {
        (links[i] as number[]).push(j);
        (links[j] as number[]).push(i);
      }
  const graph = { nodes, links };
  perBoard.set(net, graph);
  return graph;
};

/**
 * Walks the graph from the `from` pads keeping the best value per node.
 * `better(a, b)` is true when a beats b; `step` gives the value on entering a node.
 */
const walk = (
  g: NetGraph,
  from: Pad[],
  to: Pad[],
  start: number,
  step: (value: number, node: Node) => number,
  better: (a: number, b: number) => boolean,
): number | undefined => {
  const best = new Map<number, number>();
  const open = new Map<number, number>();
  g.nodes.forEach((n, i) => {
    if (n.pad && from.includes(n.pad)) open.set(i, start);
  });
  while (open.size > 0) {
    let pick = -1;
    let value = 0;
    for (const [i, v] of open)
      if (pick < 0 || better(v, value)) [pick, value] = [i, v];
    open.delete(pick);
    best.set(pick, value);
    const node = g.nodes[pick] as Node;
    if (node.pad && to.includes(node.pad)) return value;
    for (const j of g.links[pick] as number[]) {
      if (best.has(j)) continue;
      const next = step(value, g.nodes[j] as Node);
      const known = open.get(j);
      if (known === undefined || better(next, known)) open.set(j, next);
    }
  }
  return undefined;
};

const inPour = (b: Copper, s: Segment): boolean =>
  b.pours.some(
    (p) =>
      p.net === s.net &&
      p.layer === s.layer &&
      insidePour(s.a, p) &&
      insidePour(s.b, p),
  );

const nearPad = (p: Point, pad: Pad, within: number): boolean =>
  gap(circle(p.x, p.y, 0), pad.shape) <= within + EPSILON;

/**
 * Width of the narrowest spot on the widest route between two sets of pads;
 * Infinity when pads and pours alone join them, undefined when nothing does.
 * Within NECK_LENGTH of an end pad a track only has to be as wide as the pad.
 */
export const narrowest = (
  b: Copper,
  net: string,
  from: Pad[],
  to: Pad[],
  min: number,
): number | undefined => {
  const ends = [...from, ...to];
  const width = (n: Node): number => {
    if (n.kind === "via")
      return (n.outer ?? 0) >= POWER_VIA_DIAMETER - EPSILON
        ? Infinity
        : (n.outer ?? 0);
    const s = n.seg;
    if (!s) return Infinity;
    if (inPour(b, s)) return Infinity;
    const neck = ends.some(
      (pad) =>
        nearPad(s.a, pad, NECK_LENGTH) &&
        nearPad(s.b, pad, NECK_LENGTH) &&
        s.width >= Math.min(pad.minSide, min) - EPSILON,
    );
    return neck ? Infinity : s.width;
  };
  return walk(
    netGraph(b, net),
    from,
    to,
    Infinity,
    (v, n) => Math.min(v, width(n)),
    (x, y) => x > y,
  );
};

/** Length of track on the shortest route between two sets of pads. */
export const routeLength = (
  b: Copper,
  net: string,
  from: Pad[],
  to: Pad[],
): number | undefined =>
  walk(
    netGraph(b, net),
    from,
    to,
    0,
    (v, n) => v + (n.seg ? segmentLength(n.seg) : 0),
    (x, y) => x < y,
  );

const unrouted = (b: Copper): boolean =>
  b.segments.length === 0 && b.pours.length === 0;

export const layoutCheck =
  (name: string, run: (b: Copper) => string[] | { skip: string }): Check =>
  (circuit: Circuit): Finding[] => {
    const b = copperOf(circuit);
    if (unrouted(b)) return skip(name, "the board is not routed yet");
    const result = run(b);
    return Array.isArray(result)
      ? result.map((message) => ({ check: name, message }))
      : skip(name, result.skip);
  };

const missing = (b: Copper, names: string[]): string[] =>
  names.filter((n) =>
    n.includes(".") ? padsOf(b, n).length === 0 : !b.parts.has(n),
  );

const skipIfAllMissing = (
  absent: string[],
  total: number,
  findings: string[],
): string[] | { skip: string } =>
  absent.length > 0 && findings.length === 0 && absent.length >= total
    ? { skip: `not on the board: ${absent.join(", ")}` }
    : [...absent.map((n) => `${n} is not on the board`), ...findings];

/** A track of a power net or GND may not be thin unless a pour carries the current. */
export const netWidth = layoutCheck("netWidth", (b) => {
  const out: string[] = [];
  for (const s of b.segments) {
    const min = NET_MIN_WIDTH[s.net];
    if (min === undefined || s.width >= min - EPSILON || inPour(b, s)) continue;
    const shape = segmentShape(s);
    const narrowPad = b.pads.some(
      (p) =>
        p.net === s.net &&
        s.width >= p.minSide - EPSILON &&
        p.layers.some((l) => l === "*" || l === s.layer) &&
        gap(shape, p.shape) <= TOUCH,
    );
    if (!narrowPad)
      out.push(
        `${s.net} track at (${s.a.x.toFixed(2)}, ${s.a.y.toFixed(2)}) on ${s.layer} is ${s.width} mm wide, minimum ${min}`,
      );
  }
  return out;
});

export const powerPaths = layoutCheck("powerPaths", (b) => {
  const out: string[] = [];
  const absent: string[] = [];
  for (const p of POWER_PATHS) {
    const from = padsOf(b, p.from);
    const to = padsOf(b, p.to);
    if (from.length === 0 || to.length === 0) {
      absent.push(`${p.from}-${p.to}`);
      continue;
    }
    const w = narrowest(b, p.net, from, to, p.min);
    if (w === undefined)
      out.push(`${p.net}: no copper joins ${p.from} and ${p.to}`);
    else if (w < p.min - EPSILON)
      out.push(
        `${p.net}: ${p.from} to ${p.to} narrows to ${w} mm, minimum ${p.min} (${p.why})`,
      );
  }
  return skipIfAllMissing(absent, POWER_PATHS.length, out);
});

export const viaCount = layoutCheck("viaCount", (b) => {
  const out: string[] = [];
  const absent: string[] = [];
  for (const r of VIA_RULES) {
    const pads = padsOf(b, r.pad);
    if (pads.length === 0) {
      absent.push(r.pad);
      continue;
    }
    const n = b.vias.filter(
      (v) =>
        v.net === r.net &&
        v.outer >= (r.outer ?? 0) - EPSILON &&
        pads.some((p) => distance(p.center, v) <= r.within + EPSILON),
    ).length;
    if (n < r.count)
      out.push(
        `${r.pad}: ${n} ${r.net} vias${r.outer ? ` of ${r.outer} mm or more` : ""} within ${r.within} mm, need ${r.count} (${r.why})`,
      );
  }
  return skipIfAllMissing(absent, VIA_RULES.length, out);
});

/** Copper of a net on one layer, mm2: pours plus tracks. Overlaps are not subtracted. */
export const copperArea = (b: Copper, net: string, layer: string): number =>
  b.pours
    .filter((p) => p.net === net && p.layer === layer)
    .reduce(
      (sum, p) =>
        sum +
        polygonArea(p.outer) -
        p.holes.reduce((s, h) => s + polygonArea(h), 0),
      0,
    ) +
  b.segments
    .filter((s) => s.net === net && s.layer === layer && !inPour(b, s))
    .reduce((sum, s) => sum + segmentLength(s) * s.width, 0);

export const diodeCopper = layoutCheck("diodeCopper", (b) => {
  const out: string[] = [];
  const absent = missing(b, [...new Set(COPPER_AREA.map((r) => r.part))]);
  if (absent.length > 0)
    return skipIfAllMissing(
      absent,
      new Set(COPPER_AREA.map((r) => r.part)).size,
      [],
    );
  for (const r of COPPER_AREA) {
    const area = copperArea(b, r.net, "top");
    if (area < r.min)
      out.push(
        `${r.net}: ${area.toFixed(0)} mm2 of copper on top, need ${r.min} (heat of the input diodes)`,
      );
  }
  return out;
});

export const fuseDistance = layoutCheck("fuseDistance", (b) => {
  const names = [FUSE_DISTANCE.part, ...FUSE_DISTANCE.from];
  const absent = missing(b, names);
  if (absent.length > 0) return skipIfAllMissing(absent, names.length, []);
  const fuse = b.parts.get(FUSE_DISTANCE.part)?.center as Point;
  return FUSE_DISTANCE.from.flatMap((ref) => {
    const d = distance(fuse, b.parts.get(ref)?.center as Point);
    return d < FUSE_DISTANCE.min - EPSILON
      ? [
          `${FUSE_DISTANCE.part} is ${d.toFixed(1)} mm from ${ref}, minimum ${FUSE_DISTANCE.min}`,
        ]
      : [];
  });
});

export const boostLoop = layoutCheck("boostLoop", (b) => {
  const names = ["D4.K", "C18.1", "C18.2", "U4.GND"];
  const absent = missing(b, names);
  if (absent.length > 0) return skipIfAllMissing(absent, names.length, []);
  const [k, c1, c2, g] = names.map((n) => padsOf(b, n)) as [
    Pad[],
    Pad[],
    Pad[],
    Pad[],
  ];
  const out: string[] = [];
  const hot = routeLength(b, (k[0] as Pad).net, k, c1);
  if (hot === undefined) out.push("no copper joins D4.K and C18.1");
  else if (hot > BOOST_LOOP.diodeToCap + EPSILON)
    out.push(
      `D4.K to C18.1 is ${hot.toFixed(1)} mm of track, maximum ${BOOST_LOOP.diodeToCap}`,
    );
  const d = distance((c2[0] as Pad).center, (g[0] as Pad).center);
  if (d > BOOST_LOOP.capToGround + EPSILON)
    out.push(
      `C18.2 is ${d.toFixed(1)} mm from U4.GND, maximum ${BOOST_LOOP.capToGround}`,
    );
  return out;
});

/**
 * Every pad the rules name must exist and be on the net the rule says, so a
 * renamed pin or net cannot quietly turn a rule off. Needs no routing.
 */
export const ruleTargets: Check = (circuit) => {
  const b = copperOf(circuit);
  if (b.parts.size === 0)
    return skip("ruleTargets", "there are no parts on the board");
  const targets: [string, string][] = [
    ...POWER_PATHS.flatMap((p): [string, string][] => [
      [p.from, p.net],
      [p.to, p.net],
    ]),
    ...VIA_RULES.map((r): [string, string] => [r.pad, r.net]),
    ["D4.K", "V12_BOOST"],
    ["C18.1", "V12_BOOST"],
    ["C18.2", "GND"],
    ["U4.GND", "GND"],
  ];
  const out = new Set<string>();
  for (const [name, net] of targets) {
    const pads = padsOf(b, name);
    if (pads.length === 0) out.add(`${name} is not on the board`);
    else if (pads.some((p) => p.net !== net))
      out.add(`${name} is on ${pads[0]?.net}, the rules expect ${net}`);
  }
  for (const ref of [FUSE_DISTANCE.part, ...FUSE_DISTANCE.from])
    if (!b.parts.has(ref)) out.add(`${ref} is not on the board`);
  return [...out].map((message) => ({ check: "ruleTargets", message }));
};

export const POWER_CHECKS: Check[] = [
  ruleTargets,
  netWidth,
  powerPaths,
  viaCount,
  diodeCopper,
  fuseDistance,
  boostLoop,
];
