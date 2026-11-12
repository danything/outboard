// Land patterns of every part on the board, as data.
//
// Units are millimetres; x to the right, y up (tscircuit's convention), origin
// at the part centre. Orientation follows the EasyEDA/JLCPCB library footprint
// of the same LCSC part, so the placement list rotations mean the same thing
// as in JLCPCB's library. Pad sizes and positions follow the manufacturer's
// recommended land pattern wherever one exists; docs/footprints.md lists what
// was compared against which drawing, and what was not.

export interface Pad {
  pin: string;
  x: number;
  y: number;
  /** Size along x. */
  w: number;
  /** Size along y. */
  h: number;
  layer?: "top" | "bottom";
  shape?: "rect" | "pill" | "circle";
}

export interface PlatedHole {
  pin: string;
  x: number;
  y: number;
  /** Drill size along x and y; equal for a round hole. */
  holeW: number;
  holeH: number;
  /** Copper size along x and y. */
  padW: number;
  padH: number;
  /** Square copper marks pin 1 on headers. */
  square?: boolean;
}

export interface Hole {
  x: number;
  y: number;
  diameter: number;
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface FootprintDef {
  pads: Pad[];
  platedHoles?: PlatedHole[];
  holes?: Hole[];
  courtyard: Box;
  /** Part body outline drawn on the silkscreen, when it helps assembly. */
  body?: Box;
  /** Silkscreen dot next to pin 1 (or the cathode). */
  pin1Mark?: { x: number; y: number };
  /** Maximum height above the board surface, from the datasheet. */
  height?: number;
  /** Pins joined by copper in the land pattern itself (a closed solder jumper). */
  tiedPins?: string[][];
  /**
   * No solder paste on the pads: bare copper that is not assembled (test
   * points, solder jumpers). Paste on an open jumper could bridge it in reflow.
   */
  noPaste?: boolean;
}

const box = (x0: number, y0: number, x1: number, y1: number): Box => ({
  x0,
  y0,
  x1,
  y1,
});

const centredBox = (w: number, h: number): Box =>
  box(-w / 2, -h / 2, w / 2, h / 2);

/** Two-terminal part along x: pin 1 at -x unless `pin1Right`. */
const twoPads = (
  pitch: number,
  w: number,
  h: number,
  pin1Right = false,
): Pad[] => [
  { pin: "1", x: ((pin1Right ? 1 : -1) * pitch) / 2, y: 0, w, h },
  { pin: "2", x: ((pin1Right ? -1 : 1) * pitch) / 2, y: 0, w, h },
];

/**
 * Two columns of leads, pin 1 at the bottom of the right column, counting up,
 * then down the left column (the EasyEDA orientation of the SOT packages).
 */
const rightUpLeftDown = (
  perSide: number,
  pitch: number,
  columnX: number,
  w: number,
  h: number,
): Pad[] => {
  const pads: Pad[] = [];
  const y0 = (-(perSide - 1) * pitch) / 2;
  for (let i = 0; i < perSide; i++)
    pads.push({ pin: String(i + 1), x: columnX, y: y0 + i * pitch, w, h });
  for (let i = 0; i < perSide; i++)
    pads.push({
      pin: String(perSide + i + 1),
      x: -columnX,
      y: -y0 - i * pitch,
      w,
      h,
    });
  return pads;
};

/**
 * Two rows of leads, pin 1 at the left of the bottom row, counting right,
 * then back along the top row (the EasyEDA orientation of the SOP packages).
 */
const bottomRightTopLeft = (
  perSide: number,
  pitch: number,
  rowY: number,
  w: number,
  h: number,
  shape: Pad["shape"] = "rect",
): Pad[] => {
  const pads: Pad[] = [];
  const x0 = (-(perSide - 1) * pitch) / 2;
  for (let i = 0; i < perSide; i++)
    pads.push({ pin: String(i + 1), x: x0 + i * pitch, y: -rowY, w, h, shape });
  for (let i = 0; i < perSide; i++)
    pads.push({
      pin: String(perSide + i + 1),
      x: -x0 - i * pitch,
      y: rowY,
      w,
      h,
      shape,
    });
  return pads;
};

// --- Passives -------------------------------------------------------------

export const R0603: FootprintDef = {
  pads: twoPads(1.5, 0.806, 0.864),
  courtyard: centredBox(3.08, 1.62),
  height: 0.55,
};

export const C0603: FootprintDef = {
  pads: twoPads(1.4, 0.8, 0.9),
  courtyard: centredBox(3.08, 1.72),
  height: 0.9,
};

export const R0805: FootprintDef = {
  pads: twoPads(2.0, 1.133, 1.377),
  courtyard: centredBox(3.82, 2.14),
  height: 0.65,
};

export const C0805: FootprintDef = {
  pads: twoPads(2.0, 1.41, 1.35),
  courtyard: centredBox(4.22, 2.1),
  height: 1.45,
};

/** F1: 1206L110/16NR. Manufacturer's land: 1.0 x 1.8 pads, 1.8 apart. */
export const F1206: FootprintDef = {
  pads: twoPads(2.8, 1.0, 1.8),
  courtyard: centredBox(4.84, 2.48),
  height: 1.4,
};

/** LED3, LED5: 0603 LED. Pin 1 (right) is the anode. */
export const LED0603: FootprintDef = {
  pads: twoPads(1.5, 0.8, 0.8, true),
  courtyard: box(-1.85, -0.85, 1.62, 0.85),
  pin1Mark: { x: -1.6, y: 0 },
  height: 0.7,
};

/** L1, L2: FXL0630. Pads follow the manufacturer's land (8.4 over all, 3.7 gap, 3.5 wide). */
export const IND_FXL0630: FootprintDef = {
  pads: twoPads(6.05, 2.35, 3.5),
  courtyard: centredBox(8.9, 7.1),
  body: centredBox(7.0, 6.6),
  height: 3.0,
};

// --- Diodes ---------------------------------------------------------------

/**
 * D1, D2: SS54 in SMA. Manufacturer's land: 1.52 x 1.68 pads, centres 3.93
 * apart (the EasyEDA pads sit 0.5 further out). Pin 1 (right) is the anode,
 * as in the EasyEDA part.
 */
export const SMA_SS54: FootprintDef = {
  pads: twoPads(3.93, 1.52, 1.68, true),
  courtyard: centredBox(7.364, 3.02),
  body: centredBox(4.4, 2.8),
  pin1Mark: { x: -3.9, y: 0 },
  height: 2.45,
};

/** D4: SS34 in SMA, same land as SS54. Pin 1 (left) is the cathode. */
export const SMA_SS34: FootprintDef = {
  pads: twoPads(3.93, 1.52, 1.68),
  courtyard: centredBox(6.7, 3.16),
  body: centredBox(4.3, 2.6),
  pin1Mark: { x: -3.6, y: 0 },
  height: 2.45,
};

/** D5, D6: 1N4148W. Pin 1 (left) is the cathode. */
export const SOD123F: FootprintDef = {
  pads: twoPads(3.46, 1.1, 1.0),
  courtyard: centredBox(4.86, 2.16),
  pin1Mark: { x: -2.7, y: 0 },
  height: 1.15,
};

/** D7: BZT52B12. Pin 1 (left) is the cathode. */
export const SOD123: FootprintDef = {
  pads: twoPads(3.28, 0.91, 1.22),
  courtyard: centredBox(4.49, 2.16),
  pin1Mark: { x: -2.5, y: 0 },
  height: 1.35,
};

// --- Transistors ----------------------------------------------------------

const sot23 = (columnX: number, w: number, h: number): Pad[] => [
  { pin: "1", x: columnX, y: -0.95, w, h },
  { pin: "2", x: columnX, y: 0.95, w, h },
  { pin: "3", x: -columnX, y: 0, w, h },
];

/** Q1: AO3401A. AOS's SOT-23 land: 0.8 x 0.8 pads, columns 2.4 apart. */
export const SOT23_AO3401A: FootprintDef = {
  pads: sot23(1.2, 0.8, 0.8),
  courtyard: centredBox(3.6, 3.3),
  height: 1.25,
};

/** Q2, Q3 (2N7002) and Q4 (MMBT3904). */
export const SOT23: FootprintDef = {
  pads: sot23(1.0, 1.0, 0.65),
  courtyard: centredBox(3.3, 3.36),
  height: 1.15,
};

// --- ICs ------------------------------------------------------------------

/** U1, U2: CH224A, ESSOP-10 with exposed pad (pin 11). */
export const ESSOP10: FootprintDef = {
  pads: [
    ...bottomRightTopLeft(5, 1.0, 3.0, 0.6, 1.5),
    { pin: "11", x: 0, y: 0, w: 3.3, h: 2.1 },
  ],
  courtyard: centredBox(5.3, 7.8),
  pin1Mark: { x: -2.9, y: -3.0 },
};

/**
 * U3: TPS62933, SOT-583 (TI DRL0008A). TI's land: columns 1.48 apart,
 * pads 0.67 x 0.30 at 0.5 pitch. The EasyEDA footprint has the columns at 1.28.
 */
export const SOT583: FootprintDef = {
  pads: rightUpLeftDown(4, 0.5, 0.74, 0.67, 0.3),
  courtyard: centredBox(2.66, 2.58),
  pin1Mark: { x: 1.45, y: -1.1 },
};

/** U4: MT3608B, SOT-23-6. Manufacturer's land: columns 2.60 apart, pads 1.20 x 0.60. */
export const SOT23_6_MT3608B: FootprintDef = {
  pads: rightUpLeftDown(3, 0.95, 1.3, 1.2, 0.6),
  courtyard: centredBox(4.3, 3.4),
  pin1Mark: { x: 2.2, y: -1.5 },
};

/** U5: SRV05-4, SOT-23-6. Manufacturer's land: columns 2.40 apart, pads 1.00 x 0.70. */
export const SOT23_6_SRV05: FootprintDef = {
  pads: rightUpLeftDown(3, 0.95, 1.2, 1.0, 0.7),
  courtyard: centredBox(4.1, 3.4),
  pin1Mark: { x: 2.0, y: -1.5 },
};

/**
 * U6: HT7550-1, SOT-89-3. The datasheet has no land pattern. The lead pads
 * are the EasyEDA ones lengthened 0.2 outwards, because the toe was small.
 * Pin 2 is the centre lead plus the tab.
 */
export const SOT89: FootprintDef = {
  pads: [
    { pin: "1", x: 1.46, y: -1.5, w: 1.775, h: 0.672 },
    { pin: "2", x: 1.42, y: 0, w: 1.85, h: 0.66 },
    { pin: "2", x: -1.32, y: 0, w: 3.84, h: 1.9 },
    { pin: "3", x: 1.46, y: 1.5, w: 1.775, h: 0.672 },
  ],
  courtyard: box(-3.49, -2.48, 2.6, 2.48),
  pin1Mark: { x: 2.3, y: -2.2 },
};

/**
 * Four rows of leads around a square body, pin 1 at the left of the bottom
 * row, counting counter-clockwise (the EasyEDA "BL" orientation of QFNs).
 */
const quadBottomLeft = (
  perSide: number,
  pitch: number,
  rowY: number,
  along: number,
  across: number,
): Pad[] => {
  const pads: Pad[] = [];
  const first = (-(perSide - 1) * pitch) / 2;
  for (let i = 0; i < perSide; i++) {
    const t = first + i * pitch;
    const n = (side: number) => String(side * perSide + i + 1);
    pads.push({ pin: n(0), x: t, y: -rowY, w: along, h: across });
    pads.push({ pin: n(1), x: rowY, y: t, w: across, h: along });
    pads.push({ pin: n(2), x: -t, y: rowY, w: along, h: across });
    pads.push({ pin: n(3), x: -rowY, y: -t, w: across, h: along });
  }
  return pads.sort((a, b) => Number(a.pin) - Number(b.pin));
};

/**
 * U8: CH334P, QFN-16 3 x 3, 0.5 pitch, exposed pad (pin 17, GND). WCH gives
 * the package (leads 0.25 x 0.35, pad 1.75) but no land pattern; the land is
 * the EasyEDA one: 0.28 x 0.665 centred 1.45 out, exposed pad 1.70.
 */
export const QFN16_3X3: FootprintDef = {
  pads: [
    ...quadBottomLeft(4, 0.5, 1.45, 0.28, 0.665),
    { pin: "17", x: 0, y: 0, w: 1.7, h: 1.7 },
  ],
  // The exposed pad is the hub's only ground and is closed in on four sides
  // by the leads: four plated holes in it take it to the ground on the bottom
  // (a via cannot be placed in a pad).
  platedHoles: [-0.45, 0.45].flatMap((x) =>
    [-0.45, 0.45].map((y) => ({
      pin: "17",
      x,
      y,
      holeW: 0.3,
      holeH: 0.3,
      padW: 0.7,
      padH: 0.7,
    })),
  ),
  courtyard: centredBox(4.1, 4.1),
  pin1Mark: { x: -1.6, y: -1.6 },
  height: 0.8,
};

/**
 * Y1: 12 MHz crystal, 3.2 x 2.5, four pads. 1 and 3 are the crystal, 2 and 4
 * ground (the EasyEDA land and pin names: 1.4 x 1.2 at +-1.1, +-0.85).
 */
export const XTAL3225: FootprintDef = {
  pads: [
    { pin: "1", x: -1.1, y: -0.85, w: 1.4, h: 1.2 },
    { pin: "2", x: 1.1, y: -0.85, w: 1.4, h: 1.2 },
    { pin: "3", x: 1.1, y: 0.85, w: 1.4, h: 1.2 },
    { pin: "4", x: -1.1, y: 0.85, w: 1.4, h: 1.2 },
  ],
  courtyard: centredBox(4.1, 3.4),
  pin1Mark: { x: -2.0, y: -1.5 },
  height: 0.8,
};

/** U7: CH32V003F4P6, TSSOP-20. */
export const TSSOP20: FootprintDef = {
  pads: bottomRightTopLeft(10, 0.65, 2.87, 0.364, 1.742, "pill"),
  courtyard: centredBox(7.0, 7.9),
  pin1Mark: { x: -3.6, y: -2.87 },
};

// --- Connectors -----------------------------------------------------------

const usbcSignal = (pin: string, x: number): Pad => ({
  pin,
  x,
  y: 2.47,
  w: 0.3,
  h: 1.3,
});
const usbcPower = (pin: string, x: number): Pad => ({
  pin,
  x,
  y: 2.47,
  w: 0.6,
  h: 1.3,
});
const usbcShell = (
  pin: string,
  x: number,
  y: number,
  slot: number,
  pad: number,
): PlatedHole => ({
  pin,
  x,
  y,
  holeW: 0.8,
  holeH: slot,
  padW: 1.2,
  padH: pad,
});

/** J1, J2: TYPE-C-31-M-12, USB-C 16P. The mouth faces -y. */
export const USBC_TYPE_C_31_M_12: FootprintDef = {
  pads: [
    usbcPower("A1B12", -3.2),
    usbcPower("A4B9", -2.4),
    usbcSignal("B8", -1.75),
    usbcSignal("A5", -1.25),
    usbcSignal("B7", -0.75),
    usbcSignal("A6", -0.25),
    usbcSignal("A7", 0.25),
    usbcSignal("B6", 0.75),
    usbcSignal("A8", 1.25),
    usbcSignal("B5", 1.75),
    usbcPower("B4A9", 2.4),
    usbcPower("B1A12", 3.2),
  ],
  platedHoles: [
    usbcShell("SH1", 4.33, 1.71, 1.5, 2.0),
    usbcShell("SH2", 4.33, -2.47, 1.2, 1.8),
    usbcShell("SH3", -4.33, -2.47, 1.2, 1.8),
    usbcShell("SH4", -4.33, 1.71, 1.5, 2.0),
  ],
  holes: [
    { x: -2.9, y: 1.21, diameter: 0.6 },
    { x: 2.9, y: 1.21, diameter: 0.6 },
  ],
  courtyard: box(-5.08, -5.24, 5.08, 3.27),
  height: 3.36,
};

/** Contact x positions of a PCIe x1 edge: 1.0 pitch, key between 11 and 12. */
const pcieX = (n: number): number => (n <= 11 ? -10.5 + n : -8.5 + n);

/**
 * J3: X1613WS-36D-9TV01, PCIe x1 straddle-mount for a 1.57 mm board.
 * Side B is on the top copper and side A on the bottom, directly opposite.
 * The EasyEDA footprint has the two sides swapped; this follows the datasheet.
 * The origin is the pad centre; the board edge is at y = +3.2.
 */
export const PCIE_X1_STRADDLE: FootprintDef = {
  pads: Array.from({ length: 18 }, (_, i) => i + 1).flatMap((n): Pad[] => [
    { pin: `B${n}`, x: pcieX(n), y: 0, w: 0.7, h: 3.6, layer: "top" },
    { pin: `A${n}`, x: pcieX(n), y: 0, w: 0.7, h: 3.6, layer: "bottom" },
  ]),
  holes: [
    { x: -14.3, y: 0.69, diameter: 2.0 },
    { x: 14.3, y: 0.69, diameter: 2.0 },
  ],
  // Soldered by hand on both sides (JLCPCB), so no stencil opening on either.
  noPaste: true,
  courtyard: box(-17.65, -5.8, 17.65, 3.2),
  height: 4.5,
};

const header = (
  pin: string,
  x: number,
  y: number,
  pad: number,
  drill: number,
): PlatedHole => ({
  pin,
  x,
  y,
  holeW: drill,
  holeH: drill,
  padW: pad,
  padH: pad,
  square: pin === "1",
});

/**
 * J4: PZ254R-12-10P, right-angle 2x5 header. Odd pins are the row nearer the
 * plastic (y = -1.27) and the lower level; the pins point to -y.
 */
export const HEADER_2X5_RIGHT_ANGLE: FootprintDef = {
  pads: [],
  platedHoles: Array.from({ length: 5 }, (_, i) => i).flatMap((i) => [
    header(String(2 * i + 1), -5.08 + 2.54 * i, -1.27, 1.8, 1.1),
    header(String(2 * i + 2), -5.08 + 2.54 * i, 1.27, 1.8, 1.1),
  ]),
  courtyard: box(-6.75, -11.8, 6.75, 2.32),
  body: box(-6.35, -5.31, 6.35, -2.81),
  height: 5.15,
};

/** JP1, JP2, J5: 1x2 header, not assembled. */
export const HEADER_1X2: FootprintDef = {
  pads: [],
  platedHoles: [
    header("1", -1.27, 0, 2.0, 1.1),
    header("2", 1.27, 0, 2.0, 1.1),
  ],
  courtyard: centredBox(5.38, 2.84),
};

// --- Bare copper ----------------------------------------------------------

/** TP1..TP5: 1.5 mm round pad. */
export const TESTPOINT_1V5: FootprintDef = {
  pads: [{ pin: "1", x: 0, y: 0, w: 1.5, h: 1.5, shape: "circle" }],
  noPaste: true,
  courtyard: centredBox(2.0, 2.0),
};

/** JP3..JP7: two 1.0 x 1.5 pads 0.3 apart. A closed jumper gets a copper bridge on the board. */
export const SOLDER_JUMPER: FootprintDef = {
  pads: twoPads(1.3, 1.0, 1.5),
  noPaste: true,
  courtyard: centredBox(2.8, 2.0),
};

/**
 * JP3..JP6: the same two pads, joined by a 0.5 x 1.0 bridge of copper that
 * overlaps both. The bridge is a third pad of pin 1 so that it is drawn,
 * exported and checked like any pad; the part ties pin 1 and pin 2 together
 * (lib/parts.tsx), so it is not a short. Cut the bridge to open the jumper.
 */
export const SOLDER_JUMPER_CLOSED: FootprintDef = {
  pads: [...twoPads(1.3, 1.0, 1.5), { pin: "1", x: 0, y: 0, w: 0.5, h: 1.0 }],
  tiedPins: [["1", "2"]],
  noPaste: true,
  courtyard: centredBox(2.8, 2.0),
};
