// The only way copper gets onto the board: Track, Via and Pour, all written
// in design coordinates (lib/geometry.ts: x from the rear edge, y away from
// the card). docs/routing.md is the guide.
//
// These wrap tscircuit's <trace>, <via> and <copperpour> so that their traps
// cannot be hit:
// - pcbPath points are local to the part of the first port, rotation included;
//   here every track is anchored to J3, which never moves or turns.
// - a `via: true` point drills a 0.2 mm hole; a Track has no vias, they are
//   placed with <Via>, hole and diameter always given.
// - a track that ends on a net keeps the default width unless it is drawn
//   from its own points; a Track is.
// - a pour with an outline is pulled in from that outline; here the outline
//   is the copper.
import * as fp from "../footprints";
import { type Point, at } from "../geometry";
import type { Net } from "../nets";
import {
  BLOCKS,
  type BlockName,
  type BlockSpec,
  HANDOFFS,
  type Handoff,
  PLACEMENT,
  positionOf,
} from "../placement";

export type { Point } from "../geometry";

/**
 * The copper layers of the board, the only place that lists them. Top:
 * parts, signals, power. Bottom: ground, and the few tracks that have to
 * cross something on top.
 */
export const LAYERS = ["top", "bottom"] as const;
export type CopperLayer = (typeof LAYERS)[number];
/** Layers a track can run on: those with a pad of J3 to hang it on. */
export type TrackLayer = "top" | "bottom";

/** The limits of checks/rules.ts (FAB.design), repeated so a mistake fails at build time. */
export const MIN_TRACK_WIDTH = 0.15;
export const MIN_VIA_HOLE = 0.3;
export const MIN_VIA_DIAMETER = 0.6;
export const MIN_VIA_RING = 0.15;
/** Pour to copper of another net. */
export const POUR_CLEARANCE = 0.2;
/**
 * Pour to the board outline and to holes without plating. The rule is 0.3;
 * tscircuit cuts round holes as polygons, which come out up to 0.01 short.
 */
export const POUR_EDGE_CLEARANCE = 0.35;

/** Via sizes to spread into <Via>: `<Via net="GND" at={p} {...VIA.signal} />`. */
export const VIA = {
  /** Signals and ground stitching. */
  signal: { hole: 0.3, diameter: 0.6 },
  /** Power and heat: counted by the via rules of checks/rules.ts. */
  power: { hole: 0.4, diameter: 0.8 },
} as const;

// --- Coordinates ---------------------------------------------------------------

const round = (v: number): number => Math.round(v * 10000) / 10000;

const quarterTurns = (deg: number): number => {
  const q = (((Math.round(deg) % 360) + 360) % 360) / 90;
  if (!Number.isInteger(q))
    throw new Error(`rotation ${deg} is not a multiple of 90`);
  return q;
};

/** (x, up) turned counter-clockwise as drawn. */
const turn = (x: number, up: number, deg: number): [number, number] => {
  let v: [number, number] = [x, up];
  for (let i = 0; i < quarterTurns(deg); i++) v = [-v[1], v[0]];
  return v;
};

/**
 * Converter from the local coordinates of a block (those of its parts in
 * lib/placement.ts) to design coordinates:
 * `const b = blockFrame("buck"); b(2.25, -0.5)`.
 */
export const blockFrame = (block: BlockName) => {
  const spec: BlockSpec = BLOCKS[block];
  return (x: number, y: number): Point => {
    const [dx, up] = turn(x, -y, spec.rotation);
    return { x: round(spec.origin.x + dx), y: round(spec.origin.y - up) };
  };
};

const PLACED = new Map(PLACEMENT.map((part) => [part.ref, part]));

/**
 * Centre of a pad in design coordinates: `pad("U3", 3)`, `pad("J3", "B8")`.
 * `pin` is the pad's name in lib/footprints.ts (its number, for most parts).
 * Where two pads share a name (lead and tab of U6), `nth` picks one.
 */
export const pad = (ref: string, pin: number | string, nth = 0): Point => {
  const part = PLACED.get(ref);
  if (!part) throw new Error(`${ref} has no place in lib/placement.ts`);
  const def: fp.FootprintDef = fp[part.footprint];
  const name = String(pin);
  const found = [...def.pads, ...(def.platedHoles ?? [])].filter(
    (p) => p.pin === name,
  )[nth];
  if (!found) throw new Error(`${ref} (${part.footprint}) has no pad ${name}`);
  const [dx, up] = turn(found.x, found.y, part.rotation);
  return { x: round(part.x + dx), y: round(part.y - up) };
};

/** Centre of a part in design coordinates. */
export const center = (ref: string): Point => {
  const part = PLACED.get(ref);
  if (!part) throw new Error(`${ref} has no place in lib/placement.ts`);
  return { x: part.x, y: part.y };
};

/**
 * The point where a net passes from one block to another, from the HANDOFFS
 * of lib/placement.ts: `handoff("EN_3V3", "switch12", "buck")`. Use its x
 * and y as a track point; never copy the numbers.
 */
export const handoff = (net: Net, from: BlockName, to: BlockName): Handoff => {
  const found = HANDOFFS.filter(
    (h) => h.net === net && h.from === from && h.to === to,
  );
  if (found.length !== 1 || !found[0])
    throw new Error(
      `${found.length} handoffs of ${net} from ${from} to ${to} in lib/placement.ts`,
    );
  return found[0];
};

// --- Track ----------------------------------------------------------------------

// tscircuit reads the points of a path relative to the part of one port and
// starts on that port's layer. J3 has pads on both sides and sits at a fixed
// place without rotation, so its pads anchor every track.
const ANCHOR_PART = "J3";
const ANCHOR: Record<TrackLayer, string> = {
  top: `.${ANCHOR_PART} > .B1`,
  bottom: `.${ANCHOR_PART} > .A1`,
};

const anchorLocal = (p: Point): Point => {
  const origin = positionOf(ANCHOR_PART);
  if (origin.pcbRotation)
    throw new Error(`${ANCHOR_PART} must not be rotated: tracks hang on it`);
  const q = at(p.x, p.y);
  return { x: round(q.x - origin.pcbX), y: round(q.y - origin.pcbY) };
};

export interface TrackProps {
  net: Net;
  /** Width in mm. */
  width: number;
  layer: TrackLayer;
  /** The centre line, in design coordinates. Stays on `layer`; change layers with a <Via> at a shared point. */
  points: Point[];
}

/** A track on one layer, through the given points. */
export const Track = ({ net, width, layer, points }: TrackProps) => {
  if (!(width >= MIN_TRACK_WIDTH))
    throw new Error(`${net}: track width ${width} is below ${MIN_TRACK_WIDTH}`);
  if (points.length < 2) throw new Error(`${net}: a track needs two points`);
  return (
    <trace
      from={`net.${net}`}
      to={`net.${net}`}
      thickness={width}
      pcbPathRelativeTo={ANCHOR[layer]}
      pcbPaths={[points.map(anchorLocal)]}
    />
  );
};

// --- Via ------------------------------------------------------------------------

export interface ViaProps {
  net: Net;
  at: Point;
  /** Drill diameter in mm. */
  hole: number;
  /** Copper diameter in mm. */
  diameter: number;
}

/** A through via (all layers). */
export const Via = ({ net, at: p, hole, diameter }: ViaProps) => {
  if (!(hole >= MIN_VIA_HOLE))
    throw new Error(`${net}: via hole ${hole} is below ${MIN_VIA_HOLE}`);
  if (!(diameter >= MIN_VIA_DIAMETER))
    throw new Error(
      `${net}: via diameter ${diameter} is below ${MIN_VIA_DIAMETER}`,
    );
  if ((diameter - hole) / 2 < MIN_VIA_RING - 1e-9)
    throw new Error(
      `${net}: via ring of ${diameter}/${hole} is below ${MIN_VIA_RING}`,
    );
  const q = at(p.x, p.y);
  return (
    <via
      pcbX={q.x}
      pcbY={q.y}
      holeDiameter={hole}
      outerDiameter={diameter}
      fromLayer="top"
      toLayer="bottom"
      connectsTo={`net.${net}`}
    />
  );
};

/** Several vias of one size: `<Vias net="GND" at={[p, q]} {...VIA.signal} />`. */
export const Vias = ({
  at: points,
  ...rest
}: Omit<ViaProps, "at"> & { at: Point[] }) => (
  <>
    {points.map((p) => (
      <Via key={`${p.x},${p.y}`} at={p} {...rest} />
    ))}
  </>
);

// --- Pour -----------------------------------------------------------------------

export interface PourProps {
  net: Net;
  layer: CopperLayer;
  /**
   * The copper wanted, as a polygon in design coordinates. Copper of other
   * nets inside it is cut out with POUR_CLEARANCE. Keep it 0.3 mm
   * from the board outline yourself. Without an outline the pour covers the
   * whole board, POUR_EDGE_CLEARANCE inside the outline.
   */
  outline?: Point[];
}

// tscircuit 0.0.3161 crashes in its floating-copper pass on some outlines
// given counter-clockwise, so every outline goes in clockwise.
const clockwise = (points: Point[]): Point[] => {
  let area = 0;
  points.forEach((p, i) => {
    const q = points[(i + 1) % points.length] as Point;
    area += p.x * q.y - q.x * p.y;
  });
  return area > 0 ? [...points].reverse() : points;
};

/** A filled copper area. */
export const Pour = ({ net, layer, outline }: PourProps) => {
  if (outline && outline.length < 3)
    throw new Error(`${net}: a pour outline needs three points`);
  return (
    <copperpour
      layer={layer}
      connectsTo={`net.${net}`}
      clearance={POUR_CLEARANCE}
      cutoutMargin={POUR_EDGE_CLEARANCE}
      // tscircuit pulls a pour in from its outline by this much. An outline
      // given here is the copper itself, so nothing is taken off.
      boardEdgeMargin={outline ? 0 : POUR_EDGE_CLEARANCE}
      outline={outline && clockwise(outline.map((p) => at(p.x, p.y)))}
    />
  );
};

/** Corners of an axis-aligned rectangle, for `outline` and for tracks around something. */
export const rect = (
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Point[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];
