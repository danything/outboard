// Mechanical: part heights inside the case, everything on top, nothing where
// the card's bracket or the ears of the slot are, connectors where the
// bracket needs them. The numbers are in rules.ts and docs/mechanical.md.
import * as footprints from "../lib/footprints";
import type { FootprintDef } from "../lib/footprints";
import { at as fromDesign } from "../lib/geometry";
import { type Check, skip } from "./finding";
import {
  type Copper,
  type Part,
  boxesOverlap,
  copperOf,
  padsOf,
} from "./copper";
import { layoutCheck } from "./power";
import {
  BOTTOM_DEPTH_LIMIT,
  CONNECTOR_FACING,
  CONNECTOR_POSITION,
  DEPTH_BELOW,
  EPSILON,
  HEIGHT_FALLBACK,
  HEIGHT_OVERRIDE,
  KEEP_OUT,
  TOP_HEIGHT_LIMIT,
} from "./rules";

const DEFS = Object.entries(footprints).filter(
  (e): e is [string, FootprintDef] =>
    typeof e[1] === "object" && e[1] !== null && "courtyard" in e[1],
);

/**
 * circuit.json does not say which land pattern a part uses, so it is found
 * again by its number of pads and the size of its courtyard.
 */
export const landPatternsOf = (part: Part): string[] =>
  DEFS.filter(([, def]) => {
    const c = def.courtyard;
    const [w, h] = [c.x1 - c.x0, c.y1 - c.y0];
    return (
      def.pads.length + (def.platedHoles ?? []).length === part.pads &&
      part.courtyard !== undefined &&
      Math.abs(Math.max(w, h) - part.courtyard[0]) < 0.01 &&
      Math.abs(Math.min(w, h) - part.courtyard[1]) < 0.01
    );
  }).map(([name]) => name);

const heightOf = (name: string): number | undefined =>
  (footprints as unknown as Record<string, FootprintDef>)[name]?.height ??
  HEIGHT_FALLBACK[name];

const withParts =
  (name: string, run: (b: Copper) => string[]): Check =>
  (circuit) => {
    const b = copperOf(circuit);
    return b.parts.size === 0
      ? skip(name, "there are no parts on the board")
      : run(b).map((message) => ({ check: name, message }));
  };

export const partsOnTop = withParts("partsOnTop", (b) =>
  [...b.parts.values()]
    .filter((p) => p.layer !== "top")
    .map((p) => `${p.ref} is on the ${p.layer} side; every part goes on top`),
);

export const partHeight = withParts("partHeight", (b) => {
  const out: string[] = [];
  for (const p of b.parts.values()) {
    const names = landPatternsOf(p);
    const override = HEIGHT_OVERRIDE[p.ref];
    if (names.length === 0 && override === undefined) {
      out.push(
        `${p.ref}: no land pattern in lib/footprints.ts matches it, so its height is unknown`,
      );
      continue;
    }
    // Several patterns can share a courtyard; the tallest decides.
    const heights = names.map(heightOf);
    if (override === undefined && heights.some((h) => h === undefined)) {
      out.push(`${p.ref} (${names.join("/")}): no height in the tables`);
      continue;
    }
    const top = override ?? Math.max(...(heights as number[]));
    if (top > TOP_HEIGHT_LIMIT + EPSILON)
      out.push(`${p.ref} is ${top} mm tall, limit ${TOP_HEIGHT_LIMIT}`);
    const hasLeads = b.pads.some((pad) => pad.ref === p.ref && pad.hole);
    if (!hasLeads) continue;
    const depths = names.map((n) => DEPTH_BELOW[n]);
    if (depths.some((d) => d === undefined))
      out.push(
        `${p.ref} (${names.join("/")}): through-hole part with no depth below the board in the table`,
      );
    else if (Math.max(...(depths as number[])) > BOTTOM_DEPTH_LIMIT + EPSILON)
      out.push(
        `${p.ref} reaches ${Math.max(...(depths as number[]))} mm below the board, limit ${BOTTOM_DEPTH_LIMIT}`,
      );
  }
  return out;
});

export const keepOut = layoutCheck("keepOut", (b) => {
  if (b.parts.size === 0) return { skip: "there are no parts on the board" };
  const out: string[] = [];
  for (const zone of KEEP_OUT) {
    const p = fromDesign(zone.x[0], zone.y[0]);
    const q = fromDesign(zone.x[1], zone.y[1]);
    const box = {
      x0: Math.min(p.x, q.x) + EPSILON,
      y0: Math.min(p.y, q.y) + EPSILON,
      x1: Math.max(p.x, q.x) - EPSILON,
      y1: Math.max(p.y, q.y) - EPSILON,
    };
    for (const part of b.parts.values())
      if (!zone.except?.includes(part.ref) && boxesOverlap(part.box, box))
        out.push(`${part.ref} is in the keep-out for the ${zone.name}`);
  }
  return out;
});

export const connectorPosition = withParts("connectorPosition", (b) => {
  const c = CONNECTOR_POSITION;
  const usb = c.usbC.map((ref) => b.parts.get(ref));
  const pin = padsOf(b, c.slotPin)[0];
  const out: string[] = [];
  const rear = fromDesign(0, 0).x;
  c.usbC.forEach((ref, i) => {
    const p = usb[i];
    if (!p) out.push(`${ref} is not on the board`);
    else if (Math.abs(p.origin.x - rear - c.usbCX) > c.tolerance)
      out.push(
        `${ref} is at x = ${(p.origin.x - rear).toFixed(2)}, its mouth meets the bracket at ${c.usbCX}`,
      );
  });
  const [j1, j2] = usb;
  if (j1 && j2 && Math.abs(j1.origin.y - j2.origin.y) < c.usbCSpacing - EPSILON)
    out.push(
      `${c.usbC.join(" and ")} are ${Math.abs(j1.origin.y - j2.origin.y).toFixed(2)} mm apart, minimum ${c.usbCSpacing}`,
    );
  if (!pin) out.push(`${c.slotPin} is not on the board`);
  else if (Math.abs(pin.center.x - rear - c.slotPinX) > c.tolerance)
    out.push(
      `${c.slotPin} is at x = ${(pin.center.x - rear).toFixed(2)}, the card needs ${c.slotPinX}`,
    );
  return out;
});

const SIDE: Record<string, [number, number]> = {
  from_top: [0, 1],
  from_bottom: [0, -1],
  from_left: [-1, 0],
  from_right: [1, 0],
};

/**
 * Connectors face where their cable or card goes (CONNECTOR_FACING). The
 * side comes from the land pattern (lib/footprints.ts), turned with the part.
 */
export const connectorFacing = withParts("connectorFacing", (b) => {
  const out: string[] = [];
  for (const p of b.parts.values()) {
    const sides = landPatternsOf(p).flatMap((name) => {
      const side = (footprints as unknown as Record<string, FootprintDef>)[name]
        ?.insertionDirection;
      return side && SIDE[side] ? [SIDE[side]] : [];
    });
    const [side] = sides;
    if (!side) continue;
    const a = (p.rotation * Math.PI) / 180;
    const x = side[0] * Math.cos(a) - side[1] * Math.sin(a);
    const y = side[0] * Math.sin(a) + side[1] * Math.cos(a);
    const facing =
      Math.abs(x) > Math.abs(y) ? (x > 0 ? "x+" : "x-") : y > 0 ? "y+" : "y-";
    if (!CONNECTOR_FACING[facing])
      out.push(
        `${p.ref} faces ${facing}; a connector faces ${Object.entries(
          CONNECTOR_FACING,
        )
          .map(([d, what]) => `${d} (${what})`)
          .join(" or ")}`,
      );
  }
  return out;
});

/**
 * tscircuit's own warning that a connector faces away from the board edge
 * stays away: it is shown over the board on the site, and its idea of the
 * edges is wrong on this board (index.circuit.tsx). connectorFacing checks
 * the directions instead. The build turns the check off, so this finds
 * nothing today; it stays as the guard for a tscircuit update that brings
 * the warning back by another way.
 */
export const noConnectorWarnings: Check = (circuit) =>
  circuit
    .filter(
      (e) => e.type === "pcb_connector_not_in_accessible_orientation_warning",
    )
    .map((e) => ({
      check: "noConnectorWarnings",
      message: `tscircuit: ${(e as { message?: string }).message ?? ""}`,
    }));

export const MECHANICAL_CHECKS: Check[] = [
  partsOnTop,
  partHeight,
  keepOut,
  connectorPosition,
  connectorFacing,
  noConnectorWarnings,
];
