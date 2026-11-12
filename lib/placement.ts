// Where each part sits on the board, block by block.
//
// The board is long and shallow (lib/geometry.ts). Power runs along its
// length: USB-C at the rear -> VBUS1 along the card side and VBUS2 along the
// far side -> the two diodes -> VIN (a band across the board, then a strip
// along the far edge) -> boost and buck -> back along the card side to J3.
// The microcontroller and every signal that comes from the two ports sit in
// the pocket enclosed by VBUS1, VBUS2 and the VIN band, so none of them
// crosses a power path. The board has two layers: the lines from the
// microcontroller to the converters cross under the band, and PERST# and two
// lines of the 12 V switch hop under power copper (HANDOFFS, layer "bottom").
//
// A block has an origin and a rotation; its parts are placed in block-local
// coordinates (x right, y away from the card, like the design coordinates).
// Routing can be done per block and joined at the HANDOFFS.
import type { Box, FootprintDef } from "./footprints";
import * as fp from "./footprints";
import {
  BOARD_DEPTH,
  J1_Y,
  J2_Y,
  J3_ORIGIN,
  J4_ORIGIN,
  J6_ORIGIN,
  LED_EDGE_DISTANCE,
  type Point,
  type Rect,
  USBC_ORIGIN_X,
  at,
} from "./geometry";

export type FootprintName = {
  [K in keyof typeof fp]: (typeof fp)[K] extends FootprintDef ? K : never;
}[keyof typeof fp];

/** Compass direction on the board as drawn: N is towards the card. */
export type Dir = "N" | "E" | "S" | "W";

export interface PartSpec {
  footprint: FootprintName;
  /** Block-local position. */
  x: number;
  y: number;
  /** Counter-clockwise rotation in degrees as drawn, before the block's rotation. */
  rotation: number;
}

export interface BlockSpec {
  /** What the block is for. */
  title: string;
  origin: Point;
  rotation: 0 | 90 | 180 | 270;
  /** Area reserved for the block, in design coordinates. The rectangles of all blocks are disjoint. */
  region: Rect[];
  parts: Record<string, PartSpec>;
}

const DIR_ANGLE: Record<Dir, number> = { E: 0, N: 90, W: 180, S: 270 };
const norm = (deg: number): number => ((Math.round(deg) % 360) + 360) % 360;

/** Rotation that points pad 1 of the footprint in the given direction. */
const pin1Rotation = (name: FootprintName, dir: Dir): number => {
  const def: FootprintDef = fp[name];
  const pad =
    def.pads.find((p) => p.pin === "1") ??
    def.platedHoles?.find((h) => h.pin === "1");
  if (!pad || (pad.x === 0 && pad.y === 0))
    throw new Error(`${name}: pad 1 does not give a direction`);
  const angle = (Math.atan2(pad.y, pad.x) * 180) / Math.PI;
  return norm(DIR_ANGLE[dir] - angle);
};

/** A part at a block-local position. `turn` is degrees, or where pad 1 points. */
const p = (
  footprint: FootprintName,
  x: number,
  y: number,
  turn: number | Dir = 0,
): PartSpec => ({
  footprint,
  x,
  y,
  rotation:
    typeof turn === "number" ? norm(turn) : pin1Rotation(footprint, turn),
});

const rect = (x0: number, y0: number, x1: number, y1: number): Rect => ({
  x0,
  y0,
  x1,
  y1,
});

/** Parts written in design coordinates, for blocks that are not rotated. */
const absolute = (
  origin: Point,
  parts: Record<string, PartSpec>,
): Record<string, PartSpec> =>
  Object.fromEntries(
    Object.entries(parts).map(([ref, s]) => [
      ref,
      { ...s, x: s.x - origin.x, y: s.y - origin.y },
    ]),
  );

const J1: Point = { x: USBC_ORIGIN_X, y: J1_Y };
const J2: Point = { x: USBC_ORIGIN_X, y: J2_Y };
const U7: Point = { x: 30.5, y: 40.5 };
const BAND: Point = { x: 53, y: 17.4 };
const Q1: Point = { x: 77.6, y: 19.6 };
const LED_Y = BOARD_DEPTH - LED_EDGE_DISTANCE;

export const BLOCKS = {
  /** J1 (PC): PD controller, ESD protection of the data pair, shell RC, bleeder. */
  pdPc: {
    title: "USB-C to the PC, PD",
    origin: J1,
    rotation: 0,
    region: [
      rect(1.5, 0, 17.6, 11.5),
      rect(0, 11.5, 17.6, 31.1),
      rect(8, 31.1, 17.6, 32.6),
    ],
    parts: absolute(J1, {
      J1: p("USBC_TYPE_C_31_M_12", J1.x, J1.y, 270),
      // Straight behind the data pads, on the way to J4.
      U5: p("SOT23_6_SRV05", 15.4, 20.35, 0),
      U1: p("ESSOP10", 13.5, 27.8, 90),
      R1: p("R0603", 12.9, 31.4, "W"),
      C1: p("C0603", 16, 31.4, "E"),
      R3: p("R0603", 3.8, 12.9, "W"),
      C2: p("C0603", 3.8, 11, "W"),
      // Bleeder, clear of the J4 plug.
      R28: p("R0805", 11.2, 9.6, "W"),
      R29: p("R0805", 15.5, 9.6, "W"),
      R39: p("R0805", 11.2, 11.9, "W"),
      R40: p("R0805", 15.5, 11.9, "W"),
    }),
  },
  /** J2 (charger): PD controller and bleeder. VBUS2 runs east above the bleeder. */
  pdCharger: {
    title: "USB-C to the charger, PD",
    origin: J2,
    rotation: 0,
    // VBUS2 leaves along the far side (trunks.tsx); the bleeder sits south of it.
    region: [
      rect(0, 31.1, 8, 60),
      rect(8, 32.6, 17.6, 60),
    ],
    parts: absolute(J2, {
      J2: p("USBC_TYPE_C_31_M_12", J2.x, J2.y, 270),
      U2: p("ESSOP10", 13.7, 35.6, 90),
      R4: p("R0603", 12.3, 39.15, "W"),
      C3: p("C0603", 15.6, 39.15, "E"),
      // Bleeder south of U2, west of where VBUS2 comes down from J2.
      R30: p("R0805", 13.4, 42.2, "N"),
      R41: p("R0805", 15.9, 42.2, "N"),
      R31: p("R0805", 13.4, 46.1, "N"),
      R42: p("R0805", 15.9, 46.1, "N"),
    }),
  },
  /**
   * The card's two internal USB headers and the hub between them. J4's plug
   * lies towards the card over the VBUS1 copper; J6's plug, further south
   * (the rear ear of J3 is in the way), over the copper north of the hub.
   * The hub sits south of J4 and west of J6: upstream from the west, port 1
   * up to J4, port 2 east to J6, the crystal south, power west.
   */
  usb: {
    title: "Internal USB headers and hub",
    origin: J4_ORIGIN,
    rotation: 0,
    region: [
      rect(17.6, 0, 38, 9.1),
      rect(17.6, 9.1, 45.2, 31.8),
      rect(45.2, 16.85, 47, 31.8),
    ],
    parts: absolute(J4_ORIGIN, {
      J4: p("HEADER_2X5_RIGHT_ANGLE", J4_ORIGIN.x, J4_ORIGIN.y, 180),
      J6: p("HEADER_2X5_RIGHT_ANGLE", J6_ORIGIN.x, J6_ORIGIN.y, 180),
      U8: p("QFN16_3X3", 25.5, 24.9, 0),
      Y1: p("XTAL3225", 25.8, 29.2, 90),
      C35: p("C0603", 21.9, 25.3, "E"),
      C34: p("C0603", 21.9, 27.05, "E"),
      C36: p("C0805", 21.95, 29.0, "E"),
    }),
  },
  /** D1 and D2 join VBUS1 and VBUS2 into VIN: a band across the board and a strip along the far edge. */
  input: {
    title: "Input merge, VIN",
    origin: BAND,
    rotation: 0,
    region: [
      rect(47.5, 17.4, 59, 20.6),
      rect(53, 20.6, 59, 34.6),
      rect(47.5, 34.6, 59, 41.8),
      rect(52.4, 41.8, 59, 47.8),
      rect(59, 38.6, 86.9, 41.8),
    ],
    parts: absolute(BAND, {
      // Anode to the west (VBUS), cathode on the band.
      D1: p("SMA_SS54", 51.3, 19, "W"),
      D2: p("SMA_SS54", 51.3, 36.2, "W"),
      C4: p("C0805", 56, 23, "N"),
      C5: p("C0805", 56, 28, "N"),
      TP1: p("TESTPOINT_1V5", 56, 32),
    }),
  },
  /**
   * CH32V003 with its 5 V regulator and everything it senses. Pins 11 to 20
   * face the ports: I2C and the three sense lines that come from them. Pins 1
   * to 10 face the VIN band: the lines to the converters and the VIN and 12 V
   * sense, whose dividers sit next to them.
   */
  mcu: {
    title: "Microcontroller",
    origin: U7,
    rotation: 0,
    region: [
      rect(47, 20.6, 53, 31.8),
      rect(17.6, 31.8, 53, 34.3),
      rect(17.6, 34.3, 47.5, 53.4),
      rect(30.6, 57.4, 34.6, 60),
    ],
    parts: absolute(U7, {
      U7: p("TSSOP20", U7.x, U7.y, 90),
      // West: the lines from the ports come down the west edge of the pocket.
      R22: p("R0603", 21.4, 36.6, "N"),
      C24: p("C0603", 23.6, 38.4, "S"),
      R21: p("R0603", 20.6, 39.7, "N"),
      C23: p("C0603", 23.2, 41.6, "S"),
      R25: p("R0603", 19.6, 42.8, "N"),
      R26: p("R0603", 21.2, 45.4, "E"),
      C26: p("C0603", 24.3, 45.4, "E"),
      // South of the body: SWIO, the mode input, the decoupling, the LED.
      J5: p("HEADER_1X2", 25.5, 50.5, "W"),
      TP5: p("TESTPOINT_1V5", 21.0, 51.4),
      R19: p("R0603", 34.15, 35.4, "E"),
      JP7: p("SOLDER_JUMPER", 31.2, 35.4, 180),
      C22: p("C0603", 34.4, 50.6, "S"),
      C21: p("C0603", 36.2, 50.6, "S"),
      R20: p("R0603", 31.9, 52.5, "E"),
      TP4: p("TESTPOINT_1V5", 38.6, 51.8),
      // East: PERST#, the lines up to the band, the VIN sense, the clamp D5.
      R37: p("R0603", 28.9, 34.9, "S"),
      R38: p("R0603", 37.9, 42.125, "W"),
      R34: p("R0603", 37.9, 43.9, "W"),
      D5: p("SOD123F", 38.65, 38.85, "N"),
      R24: p("R0603", 33.75, 45.6, "N"),
      C25: p("C0603", 35.45, 45.6, "N"),
      R23: p("R0603", 36.3, 48.05, "E"),
      // The two regulators: U9 for the card's VBUS, U6 for the microcontroller.
      U9: p("SOT89", 43.6, 41.2, 0),
      C37: p("C0805", 42.3, 44.8, "E"),
      C38: p("C0805", 45.35, 37.6, "W"),
      JP3: p("SOLDER_JUMPER", 46.5, 35.1, "S"),
      U6: p("SOT89", 43.6, 48.6, 0),
      C6: p("C0805", 39.0, 48.4, "N"),
      C7: p("C0805", 45.4, 52.2, "W"),
      // North-east, next to the band: the 12 V sense divider and R8.
      C33: p("C0603", 49.9, 23.3, "W"),
      R33: p("R0603", 49.9, 25.05, "W"),
      R8: p("R0603", 51.45, 21.6, "W"),
      // Status LED on the far edge.
      LED5: p("LED0603", 32.6, LED_Y, "W"),
    }),
  },
  /** J3 and what belongs next to its contacts. */
  slot: {
    title: "PCIe slot",
    origin: J3_ORIGIN,
    rotation: 0,
    // The 3.3 V row runs on east of the front ear to the buck (x 83).
    region: [rect(38, 0, 74.5, 9.1), rect(45.2, 9.1, 83, 14.1)],
    parts: absolute(J3_ORIGIN, {
      J3: p("PCIE_X1_STRADDLE", J3_ORIGIN.x, J3_ORIGIN.y, 0),
      // 12 V, below contacts 1 to 3.
      C29: p("C0805", 47.5, 10.3, "W"),
      C30: p("C0603", 51.2, 10.3, "W"),
      TP3: p("TESTPOINT_1V5", 47.8, 12.8),
      R18: p("R0603", 50.9, 12.8, "W"),
      // 3.3 V, below contacts 8 to 10.
      JP4: p("SOLDER_JUMPER", 56.2, 10.05, "E"),
      C27: p("C0805", 59.8, 10.3, "W"),
      C28: p("C0603", 63.8, 10.3, "W"),
      TP2: p("TESTPOINT_1V5", 66.5, 10.3),
      // PERST#, which arrives on the bottom side at contact A11.
      D6: p("SOD123F", 60.2, 12.8, "E"),
      R27: p("R0603", 64.4, 12.8, "W"),
      C31: p("C0805", 68.1, 12.8, "W"),
    }),
  },
  /** VIN -> 12 V. The arrangement around U4 is the one proven in rev B, turned so the input faces the band. */
  boost: {
    title: "Boost to 12 V",
    origin: { x: 67.5, y: 24.3 },
    rotation: 180,
    // The strip x 59.6..64.15, y 17.2..17.7 is switch12's: 12 V passes south of JP2.
    region: [
      rect(59, 17.2, 59.6, 17.7),
      rect(64.15, 17.2, 72.5, 17.7),
      rect(59, 17.7, 72.5, 21.9),
      rect(59, 21.9, 79, 34.6),
      // V12_BOOST meets switch12 at y 21.75, clear of the ground pad of C19.
      rect(72.5, 21.75, 79, 21.9),
    ],
    parts: {
      U4: p("SOT23_6_MT3608B", 0, 0, 180),
      L2: p("IND_FXL0630", -3.4, -6.7, "E"),
      D4: p("SMA_SS34", -5.6, -1.5, "W"),
      C16: p("C0805", 4.05, -0.6, "N"),
      C17: p("C0603", 6.2, -0.6, "N"),
      // C18 and C19 0.15 west of rev B, and C19 0.1 south, so the 12 V
      // output can pass north of the ground pad of C19, under the gate of Q1.
      C18: p("C0805", -4.85, 1.25, "W"),
      C19: p("C0805", -9.15, 1.15, "E"),
      R12: p("R0603", -0.1, 3.22, "W"),
      R11: p("R0603", -3.3, 3.22, "W"),
      R13: p("R0603", 4, 3.05, "W"),
    },
  },
  /**
   * 12 V switch Q1 with its gate network, the row that carries 12 V back to
   * J3 (F1 at least 8 mm from Q1, D4 and L2), and the gate drive with the
   * over-voltage cut-off between the boost and the VIN strip.
   */
  switch12: {
    title: "12 V switch, PTC, over-voltage cut-off",
    origin: Q1,
    rotation: 0,
    region: [
      rect(45.2, 14.1, 83, 16.85),
      rect(47, 16.85, 83, 17.2),
      // 12 V (0.8 wide) passes south of JP2, whose holes block the row.
      rect(59.6, 17.2, 64.15, 17.7),
      rect(72.5, 17.2, 79, 21.75),
      rect(79, 17.2, 83, 21.9),
      rect(59, 34.6, 79, 38.6),
    ],
    parts: absolute(Q1, {
      // Drain to the north, towards the row.
      Q1: p("SOT23_AO3401A", Q1.x, Q1.y, 270),
      C32: p("C0603", 74.6, 19.2, "N"),
      R14: p("R0603", 81.2, 18.2, "W"),
      C20: p("C0603", 81.2, 20.1, "W"),
      R15: p("R0603", 81.2, 15.7, "W"),
      F1: p("F1206", 69, 15.7, "E"),
      JP6: p("SOLDER_JUMPER", 64.4, 15.7, "E"),
      JP2: p("HEADER_1X2", 60, 15.7, "E"),
      // South of the 12 V line, which passes north of it at y 14.7.
      R32: p("R0603", 55, 16.2, "E"),
      Q4: p("SOT23", 61.5, 36.6, 180),
      // OVP_Z to the west, next to its hop to D7; OVP_B to the east, next to R36.
      R35: p("R0603", 66.2, 35.42, "W"),
      // Cathode on the VIN strip.
      D7: p("SOD123", 66.2, 37.4, "E"),
      R36: p("R0603", 70.2, 35.42, "W"),
      R16: p("R0603", 70.2, 37.4, "W"),
      Q2: p("SOT23", 73.6, 36.6, 0),
      Q3: p("SOT23", 77.1, 36.6, 0),
    }),
  },
  /**
   * VIN -> 3.3 V. The arrangement around U3 is the one proven in rev B,
   * turned so the input faces the VIN strip and the output faces J3.
   */
  buck: {
    title: "Buck to 3.3 V",
    origin: { x: 85.3, y: 30 },
    rotation: 270,
    region: [
      rect(79, 21.9, 93, 38.6),
      rect(83, 8.8, 94.5, 21.9),
      rect(86.9, 38.6, 93, 60),
    ],
    parts: {
      U3: p("SOT583", 0, 0, 0),
      C10: p("C0603", 2.25, -0.5, "S"),
      C8: p("C0805", 4.25, -0.4, "S"),
      C9: p("C0805", 6.5, -0.4, "S"),
      C11: p("C0603", -2.4, -0.75, "S"),
      L1: p("IND_FXL0630", -7.75, -3.5, "E"),
      C12: p("C0603", -2.2, 2.2, "E"),
      R7: p("R0603", -1.4, 3.9, "E"),
      R6: p("R0603", 2.2, 3.9, "E"),
      C13: p("C0805", -13.7, -3.8, "S"),
      C14: p("C0805", -16.1, -3.8, "S"),
      // Closed jumper in the 3 A path, and the header in parallel with it.
      JP5: p("SOLDER_JUMPER", -19.1, -3.8, "E"),
      JP1: p("HEADER_1X2", -18.4, -7.45, "E"),
      // EN divider and capacitor.
      R9: p("R0603", 5.6, 3.9, "S"),
      C15: p("C0603", 7.4, 3.9, "S"),
      // 3.3 V LED on the far edge.
      R10: p("R0603", 10.3, -2.7, "E"),
      LED3: p("LED0603", LED_Y - 30, -5.7, "N"),
    },
  },
} satisfies Record<string, BlockSpec>;

export type BlockName = keyof typeof BLOCKS;

export interface Placed {
  ref: string;
  block: BlockName;
  footprint: FootprintName;
  /** Centre in design coordinates. */
  x: number;
  y: number;
  /** Counter-clockwise rotation in degrees as drawn. */
  rotation: number;
  /** Every part is on the top side (JLCPCB assembles one side). */
  side: "top";
  /** Courtyard in design coordinates. */
  courtyard: Rect;
}

const turn = (x: number, up: number, deg: number): [number, number] => {
  switch (norm(deg)) {
    case 0:
      return [x, up];
    case 90:
      return [-up, x];
    case 180:
      return [-x, -up];
    case 270:
      return [up, -x];
    default:
      throw new Error(`rotation ${deg} is not a multiple of 90`);
  }
};

/** A footprint box (y up) placed at a design position and rotation. */
export const placedBox = (
  box: Box,
  x: number,
  y: number,
  rotation: number,
): Rect => {
  const [ax, au] = turn(box.x0, box.y0, rotation);
  const [bx, bu] = turn(box.x1, box.y1, rotation);
  return {
    x0: x + Math.min(ax, bx),
    y0: y - Math.max(au, bu),
    x1: x + Math.max(ax, bx),
    y1: y - Math.min(au, bu),
  };
};

const round = (v: number): number => Math.round(v * 1000) / 1000;

const place = (block: BlockName): Placed[] => {
  const spec: BlockSpec = BLOCKS[block];
  return Object.entries(spec.parts).map(([ref, s]) => {
    const [dx, du] = turn(s.x, -s.y, spec.rotation);
    const x = round(spec.origin.x + dx);
    const y = round(spec.origin.y - du);
    const rotation = norm(s.rotation + spec.rotation);
    return {
      ref,
      block,
      footprint: s.footprint,
      x,
      y,
      rotation,
      side: "top",
      courtyard: placedBox(fp[s.footprint].courtyard, x, y, rotation),
    };
  });
};

/** Every part with its position in design coordinates. */
export const PLACEMENT: Placed[] = (Object.keys(BLOCKS) as BlockName[]).flatMap(
  place,
);

const BY_REF = new Map(PLACEMENT.map((part) => [part.ref, part]));

export interface Position {
  pcbX: number;
  pcbY: number;
  pcbRotation: number;
}

/** tscircuit position of the part called `name`. */
export const positionOf = (name: string): Position => {
  const part = BY_REF.get(name);
  if (!part) throw new Error(`${name} has no place in lib/placement.ts`);
  const c = at(part.x, part.y);
  return { pcbX: c.x, pcbY: c.y, pcbRotation: part.rotation };
};

export interface Handoff {
  net: string;
  /** The block the line leaves and the block it enters. */
  from: BlockName;
  to: BlockName;
  /** Point on the edge of `from`'s region, in design coordinates. */
  x: number;
  y: number;
  layer: "top" | "bottom";
  /** Trace width, or the width of the copper area for power. */
  width: number;
  note?: string;
}

const h = (
  net: string,
  from: BlockName,
  to: BlockName,
  x: number,
  y: number,
  width = 0.2,
  layer: "top" | "bottom" = "top",
  note?: string,
): Handoff => ({ net, from, to, x, y, layer, width, note });

/**
 * Where a net crosses from one block into another. Each block can be routed
 * on its own up to these points. The board has two layers: "bottom" marks the
 * few lines that cross a power path underneath; the rest stay on top. A note
 * says how the line goes on where it is not obvious.
 */
export const HANDOFFS: Handoff[] = [
  // --- Power, in the order the current flows -------------------------------
  h(
    "VBUS1",
    "pdPc",
    "usb",
    17.6,
    15.6,
    2.4,
    "top",
    "north of J4's pins; the area runs north of them and east past J4 to the band",
  ),
  h(
    "VBUS1",
    "usb",
    "input",
    47,
    18.4,
    3,
    "top",
    "the band y 16.9..19.9 from east of J4 (x 31) to the anode area of D1",
  ),
  h(
    "VBUS2",
    "pdCharger",
    "input",
    17.6,
    55.45,
    3.5,
    "top",
    "trunk: strip y 53.7..57.2 along the far side, then north at x 47.5..50.2 to D2",
  ),
  h(
    "VIN",
    "input",
    "boost",
    59,
    26.3,
    2.4,
    "top",
    "y 25.1..27.5, clear of the ground pads of C16 and C17",
  ),
  h(
    "VIN",
    "input",
    "buck",
    84.8,
    38.6,
    1.8,
    "top",
    "the stitch at x 84.8 from the strip into the buck's VIN area (the buck's 3.3 V line runs at x 87.2)",
  ),
  h("VIN", "input", "switch12", 67.84, 38.6, 0.3, "top", "cathode of D7"),
  h(
    "VIN",
    "input",
    "mcu",
    52.4,
    44.8,
    0.4,
    "bottom",
    "from a via in the band south of D2, under the VBUS2 area to a via at (47.2, 44.8): the two 5 V regulators",
  ),
  h(
    "V12_BOOST",
    "boost",
    "switch12",
    77.2,
    21.75,
    0.8,
    "top",
    "from C19 north to y 21.75, east; switch12 goes on from here to the source of Q1. At y 21.9 the 0.8 mm track would pass 0.075 mm from the ground pad of C19",
  ),
  h(
    "V12",
    "switch12",
    "slot",
    48,
    14.1,
    1,
    "top",
    "switch12 comes in 1 mm wide at x 47.8; the slot's leg is x 47.0..48.6, 0.25 mm from the PERST# via at (49.15, 13.65)",
  ),
  h("V3V3", "buck", "slot", 83, 10.4, 2.4, "top", "row y 9.2..11.6 to B8"),
  h(
    "V3V3",
    "buck",
    "switch12",
    79,
    37.6,
    0.2,
    "top",
    "gate of Q3, after a short hop under the VIN strip (lib/routing/buck.tsx)",
  ),
  // --- From the ports into the pocket (no power path crossed) ---------------
  // The order along the edge of pdPc follows the pads of J1, U5 and U1 (the
  // routing of pdPc chose it); the receiving blocks take them in that order.
  h(
    "USB_DN",
    "pdPc",
    "usb",
    17.6,
    19.4,
    0.2,
    "top",
    "south past the west end of J4, then east along y 22.27 to the hub",
  ),
  h(
    "USB_DP",
    "pdPc",
    "usb",
    17.6,
    21.3,
    0.2,
    "top",
    "south of D-, east along y 22.67 to the hub",
  ),
  h(
    "J1_CC2",
    "pdPc",
    "mcu",
    17.6,
    24.7,
    0.2,
    "top",
    "to R22 in the north row of the sense grid",
  ),
  h(
    "J1_CC1",
    "pdPc",
    "mcu",
    17.6,
    25.1,
    0.2,
    "top",
    "south in x 18.2..18.4, west of R22, to R21 in the second row",
  ),
  h(
    "I2C1_SDA",
    "pdPc",
    "mcu",
    17.6,
    27.8,
    0.15,
    "top",
    "down to y 28.33 before x 18.7, between the rows of R21 and R25; hops under the CC sense lines on the way to pins 11 and 12",
  ),
  h("I2C1_SCL", "pdPc", "mcu", 17.6, 28.8, 0.15, "top", "up to y 28.68"),
  h(
    "VBUS1",
    "pdPc",
    "mcu",
    17.6,
    29.8,
    0.3,
    "top",
    "R25 (VBUS1_SENSE divider)",
  ),
  h("I2C2_SDA", "pdCharger", "mcu", 17.6, 35.6, 0.2, "top", "east from pin 3 of U2"),
  h("I2C2_SCL", "pdCharger", "mcu", 17.6, 36.6, 0.2, "top", "east from pin 2 of U2"),
  // --- The hub's supplies -----------------------------------------------------
  h(
    "V3V3",
    "buck",
    "usb",
    86.9,
    58.0,
    0.3,
    "top",
    "trunk: from R10 west along y 58, north up the gap of D2, on the bottom under the lines of the microcontroller, west along y 31.35 to the hub",
  ),
  h(
    "USBH_VBUS",
    "mcu",
    "usb",
    45.08,
    31.8,
    0.5,
    "bottom",
    "from JP3 north on the bottom to pin 2 of J6, under the lines of the microcontroller and the hub's 3.3 V",
  ),
  // --- Through the gap between the pads of a diode ---------------------------
  h("V12_SENSE", "switch12", "input", 51.3, 17.2, 0.2, "top", "under D1"),
  h("V12_SENSE", "input", "mcu", 51.3, 20.6, 0.2, "top", "to R33 and C33"),
  h(
    "VBUS1",
    "input",
    "mcu",
    50.1,
    20.6,
    0.3,
    "top",
    "from the anode area of D1 to R8 (the pull-up of EN_3V3)",
  ),
  // --- Under the VIN band on the bottom; vias just outside it, no crossings ---
  h(
    "EN_12V",
    "mcu",
    "input",
    53,
    27.6,
    0.2,
    "bottom",
    "via at (52.1, 26.9), north of the ground groove under the band (y 27.9..28.8)",
  ),
  h(
    "EN_12V",
    "input",
    "boost",
    59,
    22,
    0.2,
    "bottom",
    "via at (59.6, 22), on top along y 22 to R13 and U4",
  ),
  h(
    "EN_3V3",
    "mcu",
    "input",
    53,
    29.1,
    0.2,
    "bottom",
    "via at (51.9, 29.1), on the edge of the pocket of C5's ground vias",
  ),
  h(
    "EN_3V3",
    "input",
    "boost",
    59,
    33.9,
    0.2,
    "bottom",
    "via at (59.4, 34), then on top along y 34.2: clear of R35 and R36",
  ),
  h("EN_3V3", "boost", "switch12", 78.6, 34.6, 0.2, "top", "on to (79, 35)"),
  h("EN_3V3", "switch12", "buck", 79, 35, 0.2),
  h(
    "Q2_G",
    "mcu",
    "input",
    53,
    30.9,
    0.2,
    "bottom",
    "via at (51.9, 30.9), on the edge of the pocket of C5's ground vias",
  ),
  h(
    "Q2_G",
    "input",
    "switch12",
    59,
    36.6,
    0.2,
    "bottom",
    "via at (59.4, 36.6), on top between the B and E pads of Q4 to its collector, then y 36.3 to R16 and Q2",
  ),
  // --- Lines inside switch12 that cross the boost (bottom hops) ---------------
  h(
    "Q2_D",
    "switch12",
    "boost",
    76.2,
    34.6,
    0.2,
    "bottom",
    "out of Q2 north to y 34.95, east to a via at (76.2, 34.95); hop under EN_3V3 outside L2, then on top north at x 76.2 and x 78.85 past D4 and C19",
  ),
  h(
    "Q2_D",
    "boost",
    "switch12",
    79,
    22.3,
    0.2,
    "top",
    "on top to here; the via at (79.45, 22.3) is switch12's: hop under V12_BOOST and Q1_G to a via at (82.75, 16.5), up to R15",
  ),
  // --- PERST#: contact A11 is on the bottom side -------------------------------
  h(
    "PERST_N",
    "mcu",
    "slot",
    47,
    21,
    0.2,
    "top",
    "west along y 21 under J6's plug to a via at (38.9, 21); bottom under VBUS1 and the 12 V row to a via at (49.15, 13.6) east of the V12 leg; top along y 13.65 to D6, R27 and C31; a via at (56, 13.65) and bottom north to A11 under the 3.3 V row",
  ),
];
