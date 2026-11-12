// Every number the layout checks compare against, in one place.
// docs/checks.md says which check guards what.

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
