// Every number the layout checks compare against, in one place.
// docs/checks.md says which check guards what.
import { REAR_STEP_DEPTH } from "../lib/geometry";

/**
 * JLCPCB's limits come from https://jlcpcb.com/capabilities/pcb-capabilities
 * (read 2026-11-12; FR-4, 1 oz outer copper). `jlc` is the published limit,
 * `design` is what this board holds itself to. A test keeps design >= jlc.
 */
export interface Limit {
  /** Row of the JLCPCB table the limit is taken from. */
  source: string;
  jlc: number;
  design: number;
}

export interface FabRules {
  traceWidth: Limit;
  /** Copper of different nets on one layer: track, pad, via, pour. */
  clearance: Limit;
  viaHole: Limit;
  viaDiameter: Limit;
  viaRing: Limit;
  /** Ring of a plated through hole of a part. */
  padRing: Limit;
  /** Edge to edge, between any two drilled holes. */
  holeToHole: Limit;
  /** Edge of a plated hole or a via hole to copper of another net. */
  holeToCopper: Limit;
  /** Edge of a hole without plating to any copper. */
  bareHoleToCopper: Limit;
  /** Copper to the routed outline. */
  edge: Limit;
}

const COMMON = {
  viaHole: {
    source: "Min. Via hole size/diameter (hole)",
    jlc: 0.15,
    design: 0.3,
  },
  viaDiameter: {
    source: "Min. Via hole size/diameter (diameter)",
    jlc: 0.25,
    design: 0.6,
  },
  // The page asks for a via 0.1 mm larger than its hole, 0.15 preferred.
  viaRing: {
    source: "Min. Via hole size/diameter (note)",
    jlc: 0.05,
    design: 0.15,
  },
  holeToHole: {
    source: "Pad Hole-to-Hole Spacing (vias: 0.2)",
    jlc: 0.45,
    design: 0.5,
  },
  holeToCopper: {
    source: "PTH to Track (via hole: 0.2)",
    jlc: 0.28,
    design: 0.3,
  },
  bareHoleToCopper: { source: "NPTH to Track", jlc: 0.2, design: 0.3 },
  edge: {
    source: "Routed: copper to board edge",
    jlc: 0.2,
    design: 0.3,
  },
} satisfies Partial<FabRules>;

/** By number of copper layers. The board is 2 layers; 4 is kept ready. */
export const FAB: Record<2 | 4, FabRules> = {
  2: {
    ...COMMON,
    traceWidth: {
      source: "Min. track width and spacing (1 oz), 1-2 layers",
      jlc: 0.1,
      design: 0.15,
    },
    // SMD pad to pad (different nets) is 0.15, the largest of the spacing rows.
    clearance: {
      source: "SMD pad to pad clearance (track spacing: 0.10)",
      jlc: 0.15,
      design: 0.15,
    },
    padRing: {
      source: "PTH annular ring, 2 layers, absolute minimum",
      jlc: 0.18,
      design: 0.18,
    },
  },
  4: {
    ...COMMON,
    traceWidth: {
      source: "Min. track width and spacing (1 oz), multilayer",
      jlc: 0.09,
      design: 0.15,
    },
    clearance: {
      source: "SMD pad to pad clearance (track spacing: 0.09)",
      jlc: 0.15,
      design: 0.15,
    },
    padRing: {
      source: "PTH annular ring, multilayer, absolute minimum",
      jlc: 0.15,
      design: 0.15,
    },
  },
};

export const fabRulesFor = (layers: number): FabRules =>
  FAB[layers > 2 ? 4 : 2];

/**
 * Copper may come closer to the outline than `edge.design` only here.
 * The connector maker's land pattern puts contacts 11 and 12 of the PCIe slot
 * 0.2 mm from the key notch (docs/history.md).
 */
export const EDGE_EXCEPTIONS: Record<string, number> = { J3: 0.2 };

/**
 * Parts that hang over the board edge on purpose (their shell or contacts
 * straddle it); their pads are not checked against the outline.
 */
export const OFF_BOARD_PARTS: string[] = [];

/** Clear copper around an M3 mounting hole: the screw head (6 mm) minus the hole. */
export const MOUNTING_HOLE_KEEPOUT = 1.4;

/** Geometry is compared with this much slack, in mm. */
export const EPSILON = 1e-6;

// --- Power: per net and per part ---------------------------------------------
// Net names are those of lib/nets.ts (+3V3 is V3V3, +12V is V12).
// The numbers come from docs/history.md ("基板で守ること") and from rev D's
// scripts/check_board.py.

/**
 * Narrowest track allowed anywhere on a net, outside a pour of the same net.
 * A track may be as narrow as a narrower pad it lands on.
 */
export const NET_MIN_WIDTH: Record<string, number> = {
  GND: 0.3,
  VIN: 0.3,
  VBUS1: 0.3,
  VBUS2: 0.3,
  V3V3: 0.3,
  V12_BOOST: 0.3,
  V12_SW: 0.3,
  V12: 0.3,
  SW_3V3: 0.3,
  SW_12V: 0.3,
};

/**
 * Current paths: the widest route from one pad to another must be at least
 * `min` wide at its narrowest. Pours and pads do not count as narrow.
 */
export interface PowerPath {
  net: string;
  from: string;
  to: string;
  min: number;
  why: string;
}

// A closed solder jumper (JP3..JP6) makes its two nets one, named after the
// main rail (checks/copper.ts): V3V3_BUCK is V3V3 here, V12_F is V12.
export const POWER_PATHS: PowerPath[] = [
  { net: "VBUS1", from: "J1.A4B9", to: "D1.A", min: 0.6, why: "3 A in" },
  { net: "VBUS1", from: "J1.B4A9", to: "D1.A", min: 0.5, why: "3 A in" },
  { net: "VBUS2", from: "J2.A4B9", to: "D2.A", min: 0.6, why: "3 A in" },
  { net: "VBUS2", from: "J2.B4A9", to: "D2.A", min: 0.5, why: "3 A in" },
  { net: "VIN", from: "D1.K", to: "C9.1", min: 1.5, why: "buck input" },
  { net: "VIN", from: "D2.K", to: "C9.1", min: 1.5, why: "buck input" },
  { net: "VIN", from: "C9.1", to: "U3.VIN", min: 1.5, why: "buck input" },
  { net: "VIN", from: "D1.K", to: "L2.1", min: 1.5, why: "boost input" },
  { net: "SW_3V3", from: "U3.SW", to: "L1.1", min: 1.5, why: "buck switch" },
  { net: "V3V3", from: "L1.2", to: "JP5.1", min: 1.5, why: "3.3 V 3 A" },
  { net: "V3V3", from: "L1.2", to: "JP1.1", min: 1.0, why: "3.3 V 3 A" },
  { net: "V3V3", from: "JP5.2", to: "J3.B8", min: 1.5, why: "3.3 V 3 A" },
  { net: "V3V3", from: "JP5.2", to: "J3.A9", min: 1.5, why: "3.3 V 3 A" },
  { net: "V3V3", from: "JP5.2", to: "J3.A10", min: 1.5, why: "3.3 V 3 A" },
  { net: "V3V3", from: "JP1.2", to: "J3.A10", min: 1.0, why: "3.3 V 3 A" },
  { net: "SW_12V", from: "L2.2", to: "U4.SW", min: 0.8, why: "boost switch" },
  { net: "SW_12V", from: "L2.2", to: "D4.A", min: 0.8, why: "boost switch" },
  { net: "V12_BOOST", from: "D4.K", to: "Q1.S", min: 0.8, why: "12 V 0.5 A" },
  { net: "V12_SW", from: "Q1.D", to: "F1.1", min: 0.8, why: "12 V 0.5 A" },
  { net: "V12", from: "F1.2", to: "JP6.1", min: 0.8, why: "12 V 0.5 A" },
  { net: "V12", from: "F1.2", to: "JP2.1", min: 0.8, why: "12 V 0.5 A" },
  { net: "V12", from: "JP6.2", to: "J3.A2", min: 0.8, why: "12 V 0.5 A" },
  { net: "V12", from: "JP6.2", to: "J3.A3", min: 0.8, why: "12 V 0.5 A" },
  { net: "V12", from: "JP6.2", to: "J3.B2", min: 0.8, why: "12 V 0.5 A" },
  { net: "GND", from: "U3.GND", to: "C9.2", min: 1.5, why: "buck hot loop" },
  { net: "GND", from: "U4.GND", to: "C18.2", min: 0.8, why: "boost hot loop" },
];

/**
 * The neck between a pad and the wide copper: within this distance of the
 * pad at either end of a path, a track may be narrower than the path, but
 * not narrower than the pad itself.
 */
export const NECK_LENGTH = 2.6;

/** A via this large is not counted as a narrow spot; their number is checked instead. */
export const POWER_VIA_DIAMETER = 0.8;

/** Vias of the pad's net close to a pad (centre to centre). */
export interface ViaRule {
  pad: string;
  net: string;
  within: number;
  count: number;
  /** Smallest via that counts. */
  outer?: number;
  why: string;
}

export const VIA_RULES: ViaRule[] = [
  {
    pad: "U3.GND",
    net: "GND",
    within: 4.6,
    count: 4,
    why: "buck loop and heat",
  },
  {
    pad: "U4.GND",
    net: "GND",
    within: 2.2,
    count: 2,
    why: "boost loop and heat",
  },
  { pad: "J1.A1B12", net: "GND", within: 2, count: 2, why: "USB-C ground" },
  { pad: "J1.B1A12", net: "GND", within: 2, count: 2, why: "USB-C ground" },
  { pad: "J2.A1B12", net: "GND", within: 2, count: 2, why: "USB-C ground" },
  { pad: "J2.B1A12", net: "GND", within: 2, count: 2, why: "USB-C ground" },
  {
    pad: "D1.K",
    net: "VIN",
    within: 4,
    count: 6,
    outer: 0.8,
    why: "heat to the bottom VIN copper",
  },
  {
    pad: "D2.K",
    net: "VIN",
    within: 4,
    count: 6,
    outer: 0.8,
    why: "heat to the bottom VIN copper",
  },
  {
    pad: "J3.A9",
    net: "V3V3",
    within: 6,
    count: 4,
    outer: 0.8,
    why: "2 A to the bottom contacts",
  },
];

/**
 * Copper of a net joined to the part on either side (pours plus tracks,
 * through vias) within `radius` of it, in mm2, for heat. Copper further away
 * does little for the diode. rev C asked 150 / 300 mm2 counted over the whole
 * net; within 10 mm the board has about 27 / 30 (anodes) and 82 / 120 (VIN),
 * and there is no free room near the anodes on two layers (docs/design.md).
 * The minimum keeps what there is; the temperature is measured on the
 * prototype (docs/bringup.md).
 */
export const COPPER_AREA: {
  net: string;
  part: string;
  min: number;
  /** Only copper this close to the part's centre counts, mm. */
  radius: number;
}[] = [
  { net: "VBUS1", part: "D1", min: 25, radius: 10 },
  { net: "VBUS2", part: "D2", min: 25, radius: 10 },
  { net: "VIN", part: "D1", min: 75, radius: 10 },
  { net: "VIN", part: "D2", min: 75, radius: 10 },
];

/** F1 (PTC) loses hold current when warm: centre to centre from the hot parts. */
export const FUSE_DISTANCE = { part: "F1", from: ["Q1", "D4", "L2"], min: 8 };

/** Boost hot loop: D4 cathode to C18 along the copper, C18 ground to U4 ground in a straight line. */
export const BOOST_LOOP = { diodeToCap: 4.0, capToGround: 3.5 };

// --- Signals -----------------------------------------------------------------

/**
 * USB D+ and D-: the three pairs (J1 to the hub, the hub to J4 and to J6).
 * Within a pair, the track lengths between the pads may differ by
 * `maxDifference`; `maxBottom` is how much of the pair may run on the bottom.
 */
export const USB_PAIRS: {
  name: string;
  nets: readonly [string, string];
  from: readonly [readonly string[], readonly string[]];
  to: readonly [readonly string[], readonly string[]];
  maxBottom: number;
}[] = [
  {
    name: "upstream (J1 to U8)",
    nets: ["USB_DP", "USB_DN"],
    from: [
      ["J1.A6", "J1.B6"],
      ["J1.A7", "J1.B7"],
    ],
    to: [["U8.DPU"], ["U8.DMU"]],
    // The flipped contact (A6 / B7) crosses at J1 (2.6), and both lines
    // pass under the VBUS1 band (4.2 each).
    maxBottom: 11.0,
  },
  {
    name: "port 1 (U8 to J4)",
    nets: ["USB1_DP", "USB1_DN"],
    from: [["U8.DP1"], ["U8.DM1"]],
    to: [["J4.DP"], ["J4.DN"]],
    maxBottom: 0,
  },
  {
    name: "port 2 (U8 to J6)",
    nets: ["USB2_DP", "USB2_DN"],
    from: [["U8.DP2"], ["U8.DM2"]],
    to: [["J6.DP"], ["J6.DN"]],
    maxBottom: 0,
  },
];
export const USB_PAIR_MAX_DIFFERENCE = 0.5;
/** Every USB data net. */
export const USB_DATA_NETS = USB_PAIRS.flatMap((p) => p.nets);

/** USB-C receptacles and their CC nets; nothing of these runs under the shell. */
export const USB_C_SHELLS: { part: string; nets: string[] }[] = [
  { part: "J1", nets: ["J1_CC1", "J1_CC2"] },
  { part: "J2", nets: ["J2_CC1", "J2_CC2"] },
];
/** Names of the shell legs of the receptacle (lib/parts.tsx). */
export const SHELL_PINS = ["SH1", "SH2", "SH3", "SH4"];

/** No bottom track under these groups of parts: it would cut the ground under them. */
export const NO_BOTTOM_UNDER: Record<string, string[]> = {
  buck: ["U3", "L1", "C8", "C9", "C10", "C11", "C13", "C14"],
  boost: ["U4", "L2", "D4", "C18", "C19"],
};
/** A bottom track of another net stays this far from a USB data track above it. */
export const USB_BOTTOM_MARGIN = 0.5;

/**
 * Bottom tracks that may cross under the USB pair: each one net, inside a
 * box (design coordinates) and no longer than `maxLength`. Anything else
 * there is still a finding.
 */
export const USB_BOTTOM_CROSSINGS: {
  net: string;
  box: { x0: number; y0: number; x1: number; y1: number };
  maxLength: number;
  why: string;
}[] = [
  {
    net: "J1_CC1",
    box: { x0: 10.3, y0: 18.1, x1: 10.7, y1: 22.45 },
    maxLength: 4.2,
    why: "CC1 of J1 has to reach U1 across the pair; with two layers the only way is one straight dive north of U1 (the shell and U5 block the others). CC is slow (PD signalling at about 300 kHz)",
  },
];

/** Feedback nets stay on top (docs/history.md, U4). */
export const TOP_ONLY_NETS = ["FB_3V3", "FB_12V"];

/**
 * Track on the bottom layer in all, mm. docs/history.md aims at 150; rev D
 * has the A row of J3 on the bottom, and rev D's check allowed 500.
 */
export const BOTTOM_TRACK = { limit: 500, target: 150 };

// --- Mechanical (docs/mechanical.md) ------------------------------------------

/** Tallest part above the top surface: the bracket reaches +16.36 from the board centre. */
export const TOP_HEIGHT_LIMIT = 15.56;
/** Deepest lead below the bottom surface: inside the body of J3. */
export const BOTTOM_DEPTH_LIMIT = 2.98;

/**
 * Heights of land patterns that have none in lib/footprints.ts, by export
 * name. Estimates carried over from rev D's check_board.py; move them into
 * lib/footprints.ts once read from the datasheets.
 */
export const HEIGHT_FALLBACK: Record<string, number> = {
  ESSOP10: 1.75,
  SOT583: 0.6,
  SOT23_6_MT3608B: 1.5,
  SOT23_6_SRV05: 1.5,
  SOT89: 1.6,
  TSSOP20: 1.2,
  HEADER_1X2: 8.6,
  TESTPOINT_1V5: 0,
  SOLDER_JUMPER: 0,
  SOLDER_JUMPER_CLOSED: 0,
};

/** How far each through-hole land pattern reaches below the board (estimates from rev D). */
export const DEPTH_BELOW: Record<string, number> = {
  PCIE_X1_STRADDLE: 2.98,
  // Plated holes in the exposed pad (ground), no lead goes through.
  QFN16_3X3: 0,
  HEADER_1X2: 1.4,
  USBC_TYPE_C_31_M_12: 0.8,
};

/**
 * Areas no part may enter, in the coordinates of docs/mechanical.md (x from
 * the rear edge, y away from the card). `except` lists parts that belong there.
 */
export const KEEP_OUT: {
  name: string;
  x: [number, number];
  y: [number, number];
  except?: string[];
}[] = [
  {
    name: "bracket plate (the stepped rear edge)",
    x: [-10, 1.5],
    y: [-10, REAR_STEP_DEPTH],
  },
  // The tongue of the bracket ends at y = 14.95; the USB-C shells start 0.5 further.
  { name: "bracket tongue", x: [-10, 0], y: [-10, 15.45] },
  { name: "J3 ear (rear)", x: [38.4, 45.1], y: [0, 9], except: ["J3"] },
  { name: "J3 ear (front)", x: [67.0, 73.7], y: [0, 9], except: ["J3"] },
];

/**
 * Which way a connector (a land pattern with a side in lib/footprints.ts) may
 * face on the board, in board coordinates, after the part's rotation. Cables leave
 * the case through the bracket at the rear edge (x-: J1, J2), and the card
 * and its internal USB cables are on the card side (y+: J3, J4, J6).
 */
export const CONNECTOR_FACING: Record<string, string> = {
  "x-": "the bracket",
  "y+": "the card",
};

/** Where the connectors must sit so that the USB-C mouths line up with the bracket. */
export const CONNECTOR_POSITION = {
  usbC: ["J1", "J2"],
  /** Footprint origin of the USB-C receptacles from the rear edge. */
  usbCX: 4.08,
  /** Between the two receptacles, centre to centre. */
  usbCSpacing: 15,
  /** Contact 1 of the slot from the rear edge (47.54 from the mouth). */
  slotPin: "J3.B1",
  slotPinX: 46.55,
  tolerance: 0.05,
};

/** Heights by reference, where the part in use is taller than its land pattern says. */
export const HEIGHT_OVERRIDE: Record<string, number> = {};
