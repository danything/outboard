// Where the origin of each part's land pattern ended up on the board.
//
// circuit.json records the centre of a part's pad bounding box, which is not
// the footprint origin for parts whose pads are lopsided (SOT-89, USB-C).
// The placement list has to give the origin, because that is the point
// JLCPCB's library footprint is placed by. This finds, for every part, the
// land pattern of lib/footprints.ts that explains all of its pads, and from
// it the origin. A part that no land pattern explains is an error, so this
// also proves that what was built is what the land patterns say: every pad's
// name, position, size and layer.
import * as all from "../lib/footprints";
import type { FootprintDef } from "../lib/footprints";
import { type Circuit, elementsOf } from "./circuit";

export interface BuiltPad {
  name: string;
  x: number;
  y: number;
  layer: "top" | "bottom" | "both";
  /** Copper size along x and y on the board. */
  w: number;
  h: number;
}

interface LocalPad extends BuiltPad {}

const TOLERANCE = 1e-3;

const defs = Object.entries(all).filter(
  (entry): entry is [string, FootprintDef] =>
    typeof entry[1] === "object" && "courtyard" in entry[1],
);

const localPads = (def: FootprintDef): LocalPad[] => [
  ...def.pads.map((p): LocalPad => ({
    name: p.pin,
    x: p.x,
    y: p.y,
    layer: p.layer ?? "top",
    w: p.w,
    h: p.h,
  })),
  ...(def.platedHoles ?? []).map((h): LocalPad => ({
    name: h.pin,
    x: h.x,
    y: h.y,
    layer: "both",
    w: h.padW,
    h: h.padH,
  })),
];

const rotate = (
  x: number,
  y: number,
  degrees: number,
): { x: number; y: number } => {
  const a = (degrees * Math.PI) / 180;
  return {
    x: x * Math.cos(a) - y * Math.sin(a),
    y: x * Math.sin(a) + y * Math.cos(a),
  };
};

const near = (a: number, b: number): boolean => Math.abs(a - b) < TOLERANCE;

/** The origin that places `def` (rotated) onto `pads`, or undefined when it does not fit. */
const fit = (
  def: FootprintDef,
  pads: BuiltPad[],
  rotation: number,
): { x: number; y: number } | undefined => {
  const local = localPads(def);
  if (local.length !== pads.length) return undefined;
  const first = local[0];
  if (!first) return undefined;
  const quarter = Math.abs(Math.round(rotation / 90)) % 2 === 1;
  for (const anchor of pads.filter((p) => p.name === first.name)) {
    const offset = rotate(first.x, first.y, rotation);
    const origin = { x: anchor.x - offset.x, y: anchor.y - offset.y };
    const explained = local.every((l) => {
      const at = rotate(l.x, l.y, rotation);
      const [w, h] = quarter ? [l.h, l.w] : [l.w, l.h];
      return pads.some(
        (p) =>
          p.name === l.name &&
          p.layer === l.layer &&
          near(p.x, origin.x + at.x) &&
          near(p.y, origin.y + at.y) &&
          near(p.w, w) &&
          near(p.h, h),
      );
    });
    if (explained) return origin;
  }
  return undefined;
};

export interface Origin {
  x: number;
  y: number;
  /** Name of the land pattern in lib/footprints.ts. */
  footprint: string;
}

export const originOf = (
  ref: string,
  pads: BuiltPad[],
  rotation: number,
): Origin => {
  for (const [name, def] of defs) {
    const origin = fit(def, pads, rotation);
    if (origin) return { ...origin, footprint: name };
  }
  throw new Error(
    `${ref}: the built pads match no land pattern in lib/footprints.ts`,
  );
};

const padName = (hints: string[] | undefined): string =>
  hints?.find((h) => !h.startsWith("unnamed_")) ?? "";

/** Pads of every part, by pcb_component_id. */
export const builtPads = (circuit: Circuit): Map<string, BuiltPad[]> => {
  const pads = new Map<string, BuiltPad[]>();
  const add = (id: string | undefined, pad: BuiltPad) => {
    if (id) pads.set(id, [...(pads.get(id) ?? []), pad]);
  };
  for (const p of elementsOf(circuit, "pcb_smtpad")) {
    const layer = p.layer === "bottom" ? "bottom" : "top";
    const name = padName(p.port_hints);
    if (p.shape === "rect" || p.shape === "pill")
      add(p.pcb_component_id, {
        name,
        x: p.x,
        y: p.y,
        layer,
        w: p.width,
        h: p.height,
      });
    else if (p.shape === "circle")
      add(p.pcb_component_id, {
        name,
        x: p.x,
        y: p.y,
        layer,
        w: p.radius * 2,
        h: p.radius * 2,
      });
    else if (p.shape === "rotated_pill") {
      // tscircuit keeps the unrotated size of a pill on a turned part.
      const quarter = Math.round(p.ccw_rotation / 90) % 2 !== 0;
      add(p.pcb_component_id, {
        name,
        x: p.x,
        y: p.y,
        layer,
        w: quarter ? p.height : p.width,
        h: quarter ? p.width : p.height,
      });
    } else throw new Error(`unexpected pad shape ${p.shape}`);
  }
  for (const h of elementsOf(circuit, "pcb_plated_hole")) {
    const name = padName(h.port_hints);
    const common = { name, x: h.x, y: h.y, layer: "both" as const };
    if (h.shape === "circle")
      add(h.pcb_component_id, {
        ...common,
        w: h.outer_diameter,
        h: h.outer_diameter,
      });
    else if (h.shape === "pill" || h.shape === "oval") {
      // A slot keeps its own size and carries the rotation separately.
      const turned = Math.abs(Math.round((h.ccw_rotation ?? 0) / 90)) % 2 === 1;
      add(h.pcb_component_id, {
        ...common,
        w: turned ? h.outer_height : h.outer_width,
        h: turned ? h.outer_width : h.outer_height,
      });
    } else if (h.shape === "circular_hole_with_rect_pad")
      add(h.pcb_component_id, {
        ...common,
        w: h.rect_pad_width,
        h: h.rect_pad_height,
      });
    else throw new Error(`unexpected plated hole shape ${h.shape}`);
  }
  return pads;
};
