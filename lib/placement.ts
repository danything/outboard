// Where each part sits on the board.
//
// PROVISIONAL: only the connectors are where they will stay (their positions
// come from the card's bracket and edge connector, docs/mechanical.md). The
// large parts are lined up in a band and everything else is dealt onto a grid
// in the order it appears in the circuit, so that the board builds without
// overlaps. The real floorplan replaces this table in the layout stage.
import { at } from "./geometry";

export interface Position {
  pcbX: number;
  pcbY: number;
  pcbRotation?: number;
}

const pos = (x: number, y: number, pcbRotation = 0): Position => {
  const p = at(x, y);
  return { pcbX: p.x, pcbY: p.y, pcbRotation };
};

const FIXED: Record<string, Position> = {
  // PCIe slot on the card-side edge; contact B1/A1 is 47.54 from the bracket face.
  J3: pos(56.05, 3.2),
  // USB-C, mouths flush with the outside of the bracket (x = -0.99).
  J1: pos(4.08, 20, -90),
  J2: pos(4.08, 36.2, -90),
  // Internal USB header, pins pointing away from the bracket.
  J4: pos(13, 9, 90),
  // Large parts, in a band below the slot.
  U1: pos(29, 13.75),
  U2: pos(35.3, 13.75),
  U7: pos(42.5, 13.75),
  L1: pos(51.5, 13.75),
  L2: pos(61.4, 13.75),
  U6: pos(70.5, 13.75),
  // Wide two-pin parts, along the far edge.
  D1: pos(14, 52.5),
  D2: pos(22, 52.5),
  D4: pos(30, 52.5),
  JP1: pos(37, 52.5),
  JP2: pos(43, 52.5),
  J5: pos(49, 52.5),
};

const GRID = { x0: 14, y0: 21, dx: 5.6, dy: 3.8, columns: 12, rows: 8 };
const dealt = new Map<string, Position>();

/** Position of the part called `name`. */
export const positionOf = (name: string): Position => {
  const fixed = FIXED[name];
  if (fixed) return fixed;
  const known = dealt.get(name);
  if (known) return known;
  const i = dealt.size;
  if (i >= GRID.columns * GRID.rows)
    throw new Error(`no room on the provisional grid for ${name}`);
  const p = pos(
    GRID.x0 + (i % GRID.columns) * GRID.dx,
    GRID.y0 + Math.floor(i / GRID.columns) * GRID.dy,
  );
  dealt.set(name, p);
  return p;
};
