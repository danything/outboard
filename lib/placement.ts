// Where each part sits on the board, block by block.
//
// The board is long and shallow (lib/geometry.ts). Power runs along its
// length: USB-C at the rear -> VBUS1 along the card side and VBUS2 along the
// far side -> the two diodes -> VIN (a band across the board, then a strip
// along the far edge) -> boost and buck -> back along the card side to J3.
// The microcontroller and every signal that comes from the two ports sit in
// the pocket enclosed by VBUS1, VBUS2 and the VIN band, so none of them
// crosses a power path. Only the lines from the microcontroller to the
// converters cross the band (HANDOFFS, layer "bottom").
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
const U7: Point = { x: 44.5, y: 28.3 };
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
      U5: p("SOT23_6_SRV05", 15.4, 21, 180),
      U1: p("ESSOP10", 13.5, 27.6, 90),
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
    region: [
      rect(0, 31.1, 8, 42),
      rect(8, 32.6, 17.6, 42),
      rect(17.6, 34.3, 38, 42),
    ],
    parts: absolute(J2, {
      J2: p("USBC_TYPE_C_31_M_12", J2.x, J2.y, 270),
      U2: p("ESSOP10", 13.5, 36.95, 90),
      R4: p("R0603", 12.9, 40.7, "W"),
      C3: p("C0603", 19, 39.9, "S"),
      R30: p("R0805", 23.5, 39.9, "W"),
      R41: p("R0805", 27.5, 39.9, "W"),
      R31: p("R0805", 31.5, 39.9, "W"),
      R42: p("R0805", 35.5, 39.9, "W"),
    }),
  },
  /** J4: its plug lies towards the card over the VBUS1 copper, which has no parts. */
  usb: {
    title: "Internal USB header",
    origin: J4_ORIGIN,
    rotation: 0,
    region: [rect(17.6, 0, 34.2, 24.7)],
    parts: absolute(J4_ORIGIN, {
      J4: p("HEADER_2X5_RIGHT_ANGLE", J4_ORIGIN.x, J4_ORIGIN.y, 180),
      JP3: p("SOLDER_JUMPER", 33, 22.6, "S"),
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
      rect(17.6, 24.7, 53, 34.3),
      rect(34.2, 20.6, 53, 24.7),
      rect(38, 38.2, 47.4, 42),
    ],
    parts: absolute(U7, {
      U7: p("TSSOP20", U7.x, U7.y, 90),
      J5: p("HEADER_1X2", 44.5, 22.4, "W"),
      // Decoupling next to VDD (pin 9).
      C21: p("C0603", 50.6, 25.6, "W"),
      C22: p("C0603", 50.6, 27.35, "W"),
      // Series parts of the lines that cross the VIN band, in the order of
      // the pins they come from (5, 3, 1), and the VIN divider at pin 1.
      R38: p("R0603", 50.6, 29.1, "W"),
      R34: p("R0603", 50.6, 30.9, "W"),
      R23: p("R0603", 50.6, 32.7, "E"),
      R24: p("R0603", 47.4, 33.3, "E"),
      C25: p("C0603", 44.3, 33.3, "E"),
      // 12 V divider: the sense line arrives from the north, under D1.
      R33: p("R0603", 50.3, 22.7, "N"),
      C33: p("C0603", 52.05, 22.7, "N"),
      // PERST#: pin 13 leaves under the body to the north.
      R37: p("R0603", 39.6, 23.3, "E"),
      R8: p("R0603", 41.1, 33, "W"),
      D5: p("SOD123F", 37, 33, "W"),
      // 5 V regulator, tab (VIN) to the east.
      U6: p("SOT89", 36, 28.3, 180),
      C7: p("C0805", 30.9, 26.6, "E"),
      C6: p("C0805", 30.9, 29, "E"),
      TP4: p("TESTPOINT_1V5", 30.9, 31.6),
      TP5: p("TESTPOINT_1V5", 33, 33.2),
      // Dividers and capacitors of what is sensed at the ports, nearest them.
      R21: p("R0603", 20, 25.8, "W"),
      R22: p("R0603", 20, 27.6, "W"),
      R25: p("R0603", 20, 29.4, "W"),
      R26: p("R0603", 20, 31.2, "W"),
      C23: p("C0603", 23.6, 25.8, "W"),
      C24: p("C0603", 23.6, 27.6, "W"),
      C26: p("C0603", 23.6, 29.4, "W"),
      R19: p("R0603", 26.9, 27.6, "W"),
      JP7: p("SOLDER_JUMPER", 26.9, 29.7, "W"),
      // Status LED on the far edge.
      R20: p("R0603", 41, LED_Y, "W"),
      LED5: p("LED0603", 44.5, LED_Y, "W"),
    }),
  },
  /** J3 and what belongs next to its contacts. */
  slot: {
    title: "PCIe slot",
    origin: J3_ORIGIN,
    rotation: 0,
    region: [rect(38, 0, 74.5, 9.1), rect(45.2, 9.1, 74.5, 14.1)],
    parts: absolute(J3_ORIGIN, {
      J3: p("PCIE_X1_STRADDLE", J3_ORIGIN.x, J3_ORIGIN.y, 0),
      // 12 V, below contacts 1 to 3.
      C29: p("C0805", 47.5, 10.3, "W"),
      C30: p("C0603", 51.2, 10.3, "W"),
      TP3: p("TESTPOINT_1V5", 47.8, 12.8),
      R18: p("R0603", 50.9, 12.8, "W"),
      // 3.3 V, below contacts 8 to 10.
      JP4: p("SOLDER_JUMPER", 55.55, 10.5, "S"),
      C27: p("C0805", 59.5, 10.3, "W"),
      C28: p("C0603", 63.4, 10.3, "W"),
      TP2: p("TESTPOINT_1V5", 66.5, 10.3),
      // PERST#, which arrives on the bottom side at contact A11.
      D6: p("SOD123F", 59, 12.8, "W"),
      R27: p("R0603", 63.4, 12.8, "W"),
      C31: p("C0805", 67.5, 12.8, "W"),
    }),
  },
  /** VIN -> 12 V. The arrangement around U4 is the one proven in rev B, turned so the input faces the band. */
  boost: {
    title: "Boost to 12 V",
    origin: { x: 67.5, y: 24.3 },
    rotation: 180,
    region: [rect(59, 17.2, 72.5, 21.9), rect(59, 21.9, 79, 34.6)],
    parts: {
      U4: p("SOT23_6_MT3608B", 0, 0, 180),
      L2: p("IND_FXL0630", -3.4, -6.7, "E"),
      D4: p("SMA_SS34", -5.6, -1.5, "W"),
      C16: p("C0805", 4.05, -0.6, "N"),
      C17: p("C0603", 6.2, -0.6, "N"),
      C18: p("C0805", -5, 1.25, "W"),
      C19: p("C0805", -9.3, 1.25, "E"),
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
      rect(45.2, 14.1, 83, 17.2),
      rect(72.5, 17.2, 83, 21.9),
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
      R32: p("R0603", 55, 15.7, "E"),
      Q4: p("SOT23", 61.5, 36.6, 180),
      R35: p("R0603", 66.2, 35.42, "E"),
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
      rect(86.9, 38.6, 93, 42),
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
 * on its own up to these points.
 */
export const HANDOFFS: Handoff[] = [
  // --- Power, in the order the current flows -------------------------------
  h("VBUS1", "pdPc", "usb", 17.6, 17.4, 3, "top", "between R40 and U5"),
  h("VBUS1", "usb", "input", 34.2, 19, 3, "top", "strip y 17.4..20.6 to D1"),
  h(
    "VBUS2",
    "pdCharger",
    "input",
    38,
    36.2,
    3,
    "top",
    "strip y 34.4..38 to D2",
  ),
  h("VIN", "input", "boost", 59, 24.9, 4),
  h("VIN", "input", "buck", 86.9, 40, 3, "top", "end of the strip, up to C9"),
  h("VIN", "input", "switch12", 66.2, 38.6, 0.3, "top", "D7"),
  h(
    "VIN",
    "input",
    "mcu",
    53,
    32.7,
    0.3,
    "top",
    "R23; U6 is fed below the top",
  ),
  h("V12_BOOST", "boost", "switch12", 79, 23.05, 1, "top", "C19 to Q1 source"),
  h("V12", "switch12", "slot", 48, 14.1, 1.5, "top", "up to contacts B1..B3"),
  h("V3V3", "buck", "slot", 83, 10.4, 3, "top", "row y 9.2..11.6 to B8"),
  h("V3V3", "buck", "switch12", 79, 37.6, 0.2, "top", "gate of Q3"),
  // --- From the ports into the pocket (no power path crossed) ---------------
  h("USB_DP", "pdPc", "usb", 17.6, 20.6),
  h("USB_DN", "pdPc", "usb", 17.6, 21),
  h("VBUS1", "pdPc", "mcu", 17.6, 29.4, 0.3, "top", "R25, R8"),
  h("J1_CC1", "pdPc", "mcu", 17.6, 25.8),
  h("J1_CC2", "pdPc", "mcu", 17.6, 27.6),
  h("I2C1_SDA", "pdPc", "mcu", 17.6, 30.6),
  h("I2C1_SCL", "pdPc", "mcu", 17.6, 31),
  h("I2C2_SDA", "pdCharger", "mcu", 19, 34.3),
  h("I2C2_SCL", "pdCharger", "mcu", 19.4, 34.3),
  h("V5", "mcu", "usb", 33, 24.7, 0.5, "top", "JP3"),
  // --- Through the gap between the pads of a diode ---------------------------
  h("V12_SENSE", "switch12", "input", 51.3, 17.2, 0.2, "top", "under D1"),
  h("V12_SENSE", "input", "mcu", 51.3, 20.6, 0.2, "top", "under D1"),
  h("LED_STAT", "mcu", "input", 51.3, 34.3, 0.2, "top", "under D2"),
  // --- Under the VIN band, on the bottom side ---------------------------------
  h("EN_12V", "mcu", "input", 53, 31.8, 0.2, "bottom"),
  h("EN_12V", "input", "boost", 59, 22, 0.2, "bottom"),
  h("Q2_G", "mcu", "input", 53, 30.9, 0.2, "bottom"),
  h("Q2_G", "input", "switch12", 59, 36.6, 0.2, "bottom"),
  h("EN_3V3", "mcu", "input", 53, 29.1, 0.2, "bottom"),
  h(
    "EN_3V3",
    "input",
    "switch12",
    59,
    35,
    0.2,
    "bottom",
    "on to R9 along y 34.8",
  ),
  h("EN_3V3", "switch12", "buck", 79, 35, 0.2),
  // --- PERST#: contact A11 is on the bottom side -------------------------------
  h(
    "PERST_N",
    "mcu",
    "slot",
    38.9,
    20.6,
    0.2,
    "bottom",
    "via beside R37, then under VBUS1 and the 12 V row to A11",
  ),
  h("Q2_D", "switch12", "switch12", 79, 36.6, 0.2, "top", "up x 79..80 to R15"),
];
