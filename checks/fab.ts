// What JLCPCB can make: widths, clearances, holes, rings, the board edge.
// tscircuit's own checks let most of these through, so they are held here.
// The numbers are in rules.ts.
import type { Circuit } from "../tools/circuit";
import { type Check, type Finding, skip } from "./finding";
import {
  type Box,
  type Copper,
  type Shape,
  boundsOf,
  boxesOverlap,
  circle,
  copperOf,
  gap,
  gapToPour,
  insidePolygon,
  segmentShape,
  shapeToRing,
} from "./copper";
import {
  EDGE_EXCEPTIONS,
  EPSILON,
  MIN_AREA_RATIO,
  MOUNTING_HOLE_KEEPOUT,
  OFF_BOARD_PARTS,
  STENCIL_THICKNESS,
  fabRulesFor,
} from "./rules";
import { MOUNTING_HOLE_DIAMETER } from "../lib/geometry";

const at = (x: number, y: number) => `(${x.toFixed(2)}, ${y.toFixed(2)})`;

interface Item {
  what: string;
  net: string;
  ref: string;
  /** "*" is every layer. */
  layers: string[];
  shape: Shape;
  box: Box;
}

const sameLayer = (a: Item, b: Item): boolean =>
  a.layers.includes("*") ||
  b.layers.includes("*") ||
  a.layers.some((l) => b.layers.includes(l));

/** Tracks, vias and pads as one list. */
export const itemsOf = (b: Copper): Item[] => {
  const item = (
    what: string,
    net: string,
    ref: string,
    layers: string[],
    shape: Shape,
  ): Item => ({ what, net, ref, layers, shape, box: boundsOf(shape) });
  return [
    ...b.segments.map((s) =>
      item(
        `${s.net} track ${at(s.a.x, s.a.y)}-${at(s.b.x, s.b.y)}`,
        s.net,
        "",
        [s.layer],
        segmentShape(s),
      ),
    ),
    ...b.vias.map((v) =>
      item(
        `${v.net} via ${at(v.x, v.y)}`,
        v.net,
        "",
        ["*"],
        circle(v.x, v.y, v.outer),
      ),
    ),
    ...b.pads.map((p) =>
      item(
        `pad ${p.ref}.${p.pins[0] ?? "?"} ${at(p.center.x, p.center.y)}`,
        p.net,
        p.ref,
        p.layers,
        p.shape,
      ),
    ),
  ];
};

interface Drill {
  what: string;
  /** "" for a hole without plating. */
  net: string;
  ref: string;
  shape: Shape;
  box: Box;
}

const drillsOf = (b: Copper): Drill[] => {
  const drill = (
    what: string,
    net: string,
    ref: string,
    shape: Shape,
  ): Drill => ({
    what,
    net,
    ref,
    shape,
    box: boundsOf(shape),
  });
  return [
    ...b.vias.map((v) =>
      drill(
        `${v.net} via ${at(v.x, v.y)}`,
        v.net,
        "",
        circle(v.x, v.y, v.hole),
      ),
    ),
    ...b.pads.flatMap((p) =>
      p.hole
        ? [
            drill(
              `hole of ${p.ref}.${p.pins[0] ?? "?"} ${at(p.center.x, p.center.y)}`,
              p.net,
              p.ref,
              p.hole,
            ),
          ]
        : [],
    ),
    ...b.holes.map((h) =>
      drill(
        `bare hole ${h.ref} ${at(h.x, h.y)}`.replace("  ", " "),
        "",
        h.ref,
        circle(h.x, h.y, h.diameter),
      ),
    ),
  ];
};

const grow = (box: Box, by: number): Box => ({
  x0: box.x0 - by,
  y0: box.y0 - by,
  x1: box.x1 + by,
  y1: box.y1 + by,
});

const check =
  (name: string, run: (b: Copper) => string[]): Check =>
  (circuit: Circuit): Finding[] =>
    run(copperOf(circuit)).map((message) => ({ check: name, message }));

export const trackWidth = check("trackWidth", (b) => {
  const min = fabRulesFor(b.layers).traceWidth.design;
  return b.segments
    .filter((s) => s.width < min - EPSILON)
    .map(
      (s) =>
        `${s.net} track at ${at(s.a.x, s.a.y)} on ${s.layer} is ${s.width} mm wide, minimum ${min}`,
    );
});

export const viaSize = check("viaSize", (b) => {
  const r = fabRulesFor(b.layers);
  return b.vias.flatMap((v) => {
    const where = `${v.net} via at ${at(v.x, v.y)}`;
    const ring = (v.outer - v.hole) / 2;
    return [
      v.hole < r.viaHole.design - EPSILON &&
        `${where}: hole ${v.hole} mm, minimum ${r.viaHole.design}`,
      v.outer < r.viaDiameter.design - EPSILON &&
        `${where}: diameter ${v.outer} mm, minimum ${r.viaDiameter.design}`,
      ring < r.viaRing.design - EPSILON &&
        `${where}: ring ${ring.toFixed(3)} mm, minimum ${r.viaRing.design}`,
    ].filter((m): m is string => typeof m === "string");
  });
});

export const padRing = check("padRing", (b) => {
  const min = fabRulesFor(b.layers).padRing.design;
  return b.pads
    .filter((p) => p.ring !== undefined && p.ring < min - EPSILON)
    .map(
      (p) =>
        `plated hole ${p.ref}.${p.pins[0] ?? "?"}: ring ${p.ring?.toFixed(3)} mm, minimum ${min}`,
    );
});

export const clearance = check("clearance", (b) => {
  const min = fabRulesFor(b.layers).clearance.design;
  const items = itemsOf(b);
  const out: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const a = items[i] as Item;
    const reach = grow(a.box, min);
    for (let j = i + 1; j < items.length; j++) {
      const c = items[j] as Item;
      if (a.net === c.net || !sameLayer(a, c) || !boxesOverlap(reach, c.box))
        continue;
      // Pads of one part sit where the land pattern puts them; footprints.test.ts owns those.
      if (a.ref !== "" && a.ref === c.ref) continue;
      const d = gap(a.shape, c.shape);
      if (d < min - EPSILON)
        out.push(
          `${a.what} and ${c.what} are ${d.toFixed(3)} mm apart, minimum ${min}`,
        );
    }
    for (const pour of b.pours) {
      if (pour.net === a.net) continue;
      if (!a.layers.includes("*") && !a.layers.includes(pour.layer)) continue;
      const d = gapToPour(a.shape, pour);
      if (d < min - EPSILON)
        out.push(
          `${a.what} and the ${pour.net} pour on ${pour.layer} are ${d.toFixed(3)} mm apart, minimum ${min}`,
        );
    }
  }
  return out;
});

export const holeSpacing = check("holeSpacing", (b) => {
  const min = fabRulesFor(b.layers).holeToHole.design;
  const drills = drillsOf(b);
  const out: string[] = [];
  for (let i = 0; i < drills.length; i++) {
    const a = drills[i] as Drill;
    const reach = grow(a.box, min);
    for (let j = i + 1; j < drills.length; j++) {
      const c = drills[j] as Drill;
      if (!boxesOverlap(reach, c.box)) continue;
      if (a.ref !== "" && a.ref === c.ref) continue;
      const d = gap(a.shape, c.shape);
      if (d < min - EPSILON)
        out.push(
          `${a.what} and ${c.what}: holes ${d.toFixed(3)} mm apart, minimum ${min}`,
        );
    }
  }
  return out;
});

export const holeToCopper = check("holeToCopper", (b) => {
  const r = fabRulesFor(b.layers);
  const items = itemsOf(b);
  const out: string[] = [];
  for (const h of drillsOf(b)) {
    const min =
      h.net === "" ? r.bareHoleToCopper.design : r.holeToCopper.design;
    const reach = grow(h.box, min);
    for (const c of items) {
      // Copper of the hole's own net may touch it; nothing may touch a bare hole.
      if (h.net !== "" && h.net === c.net) continue;
      if (h.ref !== "" && h.ref === c.ref) continue;
      if (!boxesOverlap(reach, c.box)) continue;
      const d = gap(h.shape, c.shape);
      if (d < min - EPSILON)
        out.push(
          `${h.what} and ${c.what} are ${d.toFixed(3)} mm apart, minimum ${min}`,
        );
    }
    for (const pour of b.pours) {
      if (h.net !== "" && h.net === pour.net) continue;
      const d = gapToPour(h.shape, pour);
      if (d < min - EPSILON)
        out.push(
          `${h.what} and the ${pour.net} pour on ${pour.layer} are ${d.toFixed(3)} mm apart, minimum ${min}`,
        );
    }
  }
  return out;
});

/** Screw heads: no track, via or pad under them. A pour may run there. */
export const mountingHoleKeepout = check("mountingHoleKeepout", (b) => {
  const items = itemsOf(b);
  const out: string[] = [];
  for (const h of b.holes) {
    if (h.ref !== "" || Math.abs(h.diameter - MOUNTING_HOLE_DIAMETER) > EPSILON)
      continue;
    const hole = circle(h.x, h.y, h.diameter);
    const reach = grow(boundsOf(hole), MOUNTING_HOLE_KEEPOUT);
    for (const c of items) {
      if (!boxesOverlap(reach, c.box)) continue;
      const d = gap(hole, c.shape);
      if (d < MOUNTING_HOLE_KEEPOUT - EPSILON)
        out.push(
          `${c.what} is ${d.toFixed(2)} mm from the mounting hole at ${at(h.x, h.y)}, under the screw head (keep ${MOUNTING_HOLE_KEEPOUT})`,
        );
    }
  }
  return out;
});

export const edgeClearance = check("edgeClearance", (b) => {
  const rule = fabRulesFor(b.layers).edge.design;
  const out: string[] = [];
  for (const c of itemsOf(b)) {
    if (OFF_BOARD_PARTS.includes(c.ref)) continue;
    const min = EDGE_EXCEPTIONS[c.ref] ?? rule;
    const anchor = c.shape.kind === "capsule" ? c.shape.a : c.shape.points[0];
    if (anchor && !insidePolygon(anchor, b.outline)) {
      out.push(`${c.what} is outside the board`);
      continue;
    }
    const d = shapeToRing(c.shape, b.outline);
    if (d < min - 1e-3)
      out.push(
        `${c.what} is ${d.toFixed(3)} mm from the board edge, minimum ${min}`,
      );
  }
  for (const pour of b.pours) {
    const d = shapeToRing({ kind: "poly", points: pour.outer }, b.outline);
    if (d < rule - 1e-3)
      out.push(
        `the ${pour.net} pour on ${pour.layer} is ${d.toFixed(3)} mm from the board edge, minimum ${rule}`,
      );
  }
  return out;
});

export const FAB_CHECKS: Check[] = [
  trackWidth,
  viaSize,
  padRing,
  clearance,
  holeSpacing,
  holeToCopper,
  mountingHoleKeepout,
  edgeClearance,
  solderPaste,
];

/** Parts soldered by hand on both sides: no stencil opening on them (docs/manufacturing.md). */
export const HAND_SOLDERED = ["J3"];

/** Connectors that are surface mount and go through reflow: paste on every pad. */
export const REFLOWED_CONNECTORS = ["J4", "J6"];

/** Paste openings keep this far from the drill of a hole in a pad (tools/paste.ts). */
export const PASTE_TO_HOLE = 0.1;

/** Size along x and y of a pad or a paste opening, turned by its rotation. */
const pasteSize = (e: Record<string, unknown>): [number, number] => {
  if (e.shape === "circle") {
    const d = 2 * Number(e.radius ?? 0);
    return [d, d];
  }
  const [w, h] = [Number(e.width ?? 0), Number(e.height ?? 0)];
  return Math.round(Number(e.ccw_rotation ?? 0) / 90) % 2 ? [h, w] : [w, h];
};

/** Opening area / area of the stencil walls around it. */
export const pasteAreaRatio = (e: Record<string, unknown>): number => {
  const [w, h] = pasteSize(e);
  if (e.shape === "circle") return w / (4 * STENCIL_THICKNESS);
  const pill = String(e.shape).includes("pill");
  const r = pill ? Math.min(w, h) / 2 : 0;
  const area = w * h - (4 - Math.PI) * r * r;
  const perimeter = 2 * (w + h) - (8 - 2 * Math.PI) * r;
  return area / (perimeter * STENCIL_THICKNESS);
};

/**
 * Paste only on top (one-sided assembly, no bottom stencil), none on the
 * parts soldered by hand, on every pad of the reflowed connectors, which
 * have to be on the board, every opening with an area ratio of at least
 * MIN_AREA_RATIO, and none over a hole in a pad.
 */
export function solderPaste(
  circuit: Circuit,
  reflowed: readonly string[] = REFLOWED_CONNECTORS,
): Finding[] {
  const raw = circuit as unknown as Record<string, unknown>[];
  const names = new Map(
    raw
      .filter((e) => e.type === "source_component")
      .map((e) => [e.source_component_id, e.name]),
  );
  const refs = new Map(
    raw
      .filter((e) => e.type === "pcb_component")
      .map((e) => [e.pcb_component_id, names.get(e.source_component_id)]),
  );
  const out: Finding[] = [];
  const n = (e: Record<string, unknown>, k: string) => Number(e[k] ?? 0);
  const smtpads = raw.filter((e) => e.type === "pcb_smtpad");
  // Holes inside a pad (vias, plated holes in an exposed pad). The plated
  // holes of through-hole leads (USB-C shells) are not inside an SMD pad
  // and get paste on purpose.
  const holesInPads = raw.filter(
    (h) =>
      h.type === "pcb_via" ||
      (h.type === "pcb_plated_hole" &&
        smtpads.some(
          (p) =>
            Math.abs(n(h, "x") - n(p, "x")) < pasteSize(p)[0] / 2 &&
            Math.abs(n(h, "y") - n(p, "y")) < pasteSize(p)[1] / 2,
        )),
  );
  for (const e of raw.filter((x) => x.type === "pcb_solder_paste")) {
    const ref = String(refs.get(e.pcb_component_id) ?? "?");
    const where = `${ref} ${at(n(e, "x"), -n(e, "y"))}`;
    if (e.layer === "bottom") {
      out.push({
        check: "solderPaste",
        message: `paste on the bottom at ${ref}: the board has no bottom stencil`,
      });
      continue;
    }
    if (HAND_SOLDERED.includes(ref)) {
      out.push({
        check: "solderPaste",
        message: `paste on ${ref}, which is soldered by hand`,
      });
      continue;
    }
    const ratio = pasteAreaRatio(e);
    if (ratio < MIN_AREA_RATIO)
      out.push({
        check: "solderPaste",
        message: `paste opening of ${where} has an area ratio of ${ratio.toFixed(2)}, below ${MIN_AREA_RATIO}`,
      });
    const [w, h] = pasteSize(e);
    for (const hole of holesInPads) {
      const drill =
        n(hole, "hole_diameter") ||
        Math.min(n(hole, "hole_width"), n(hole, "hole_height"));
      const dx = Math.max(Math.abs(n(hole, "x") - n(e, "x")) - w / 2, 0);
      const dy = Math.max(Math.abs(n(hole, "y") - n(e, "y")) - h / 2, 0);
      if (Math.hypot(dx, dy) < drill / 2 + PASTE_TO_HOLE)
        out.push({
          check: "solderPaste",
          message: `paste opening of ${where} comes within ${PASTE_TO_HOLE} of a hole in a pad`,
        });
    }
  }
  // The sockets for the card are surface mount and reflowed with the rest:
  // every pad of theirs needs its stencil opening.
  if (refs.size === 0)
    return [...out, ...skip("solderPaste", "there are no parts on the board")];
  for (const ref of reflowed) {
    const ids = [...refs].filter(([, r]) => r === ref).map(([id]) => id);
    if (ids.length === 0) {
      // A renamed or dropped socket would otherwise pass unchecked.
      out.push({
        check: "solderPaste",
        message: `${ref} is not on the board; REFLOWED_CONNECTORS names it`,
      });
      continue;
    }
    const count = (type: string) =>
      raw.filter((e) => e.type === type && ids.includes(e.pcb_component_id))
        .length;
    const pads = count("pcb_smtpad");
    const paste = count("pcb_solder_paste");
    if (paste < pads)
      out.push({
        check: "solderPaste",
        message: `${ref} has paste on ${paste} of its ${pads} pads; it is reflowed`,
      });
  }
  return out;
}
