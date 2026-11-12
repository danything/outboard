// Copper that belongs to no single block: the ground on the bottom, and the
// lines that cross the ground between blocks (outside every region of
// lib/placement.ts). They meet the blocks at the HANDOFFS.
// Design coordinates, Track / Via / Pour from ./kit (docs/routing.md).
//
// Between the blocks:
// - VBUS1 from the usb block (x 34.2) to the anode area of D1 (input, x 47.5)
// - VBUS2 from the pdCharger block (x 38) to the anode area of D2 (input, x 47.5)
// - PERST# from the microcontroller (bottom, x 38.9) to the slot's line at
//   y 13.65: it has to cross VBUS1 and the 12 V row, so it hops under each
//   of them once, on top in between.
import { type Point, Pour, Track, VIA, Via, handoff, rect } from "./kit";

/** Pours of one net that share an edge are refused by KiCad; neighbours are kept this far apart and joined by a track. */
const POUR_GAP = 0.3;
/** West edge of the input block, where the anode areas of D1 and D2 begin. */
const INPUT_WEST = 47.5;

// --- VBUS1 and VBUS2 -------------------------------------------------------------

const VBUS1_IN = handoff("VBUS1", "usb", "input");
const VBUS2_IN = handoff("VBUS2", "pdCharger", "input");

/** VBUS1 runs y 16.9 to 19.9 (the handoff); the anode area of D1 is y 17.5 to 20.6. */
const VBUS1 = {
  x0: VBUS1_IN.x + POUR_GAP,
  x1: INPUT_WEST - POUR_GAP,
  y0: VBUS1_IN.y - VBUS1_IN.width / 2,
  y1: VBUS1_IN.y + VBUS1_IN.width / 2,
};
/** The joint into the anode area: the y range both areas share. */
const VBUS1_JOINT = { y0: 17.5, y1: VBUS1.y1 };

/** VBUS2 runs y 34.7 to 37.7 (the handoff), clear of the microcontroller (y < 34.3, y > 38.2). */
const VBUS2 = {
  x0: VBUS2_IN.x + POUR_GAP,
  x1: INPUT_WEST - POUR_GAP,
  y0: VBUS2_IN.y - VBUS2_IN.width / 2,
  y1: VBUS2_IN.y + VBUS2_IN.width / 2,
};

/** A wide track across a gap of POUR_GAP at `x`, overlapping both sides. */
const Joint = ({
  net,
  x,
  y0,
  y1,
}: {
  net: "VBUS1" | "VBUS2";
  x: number;
  y0: number;
  y1: number;
}) => (
  <Track
    net={net}
    width={y1 - y0}
    layer="top"
    points={[
      { x: x - 0.4, y: (y0 + y1) / 2 },
      { x: x + 0.4, y: (y0 + y1) / 2 },
    ]}
  />
);

const Vbus = () => (
  <>
    <Pour
      net="VBUS1"
      layer="top"
      outline={rect(VBUS1.x0, VBUS1.y0, VBUS1.x1, VBUS1.y1)}
    />
    {/* Into the usb block's area at the handoff, and into the anode area of D1. */}
    <Joint net="VBUS1" x={VBUS1_IN.x} y0={VBUS1.y0} y1={VBUS1.y1} />
    <Joint
      net="VBUS1"
      x={INPUT_WEST - POUR_GAP / 2}
      y0={VBUS1_JOINT.y0}
      y1={VBUS1_JOINT.y1}
    />
    <Pour
      net="VBUS2"
      layer="top"
      outline={rect(VBUS2.x0, VBUS2.y0, VBUS2.x1, VBUS2.y1)}
    />
    <Joint net="VBUS2" x={VBUS2_IN.x} y0={VBUS2.y0} y1={VBUS2.y1} />
    <Joint
      net="VBUS2"
      x={INPUT_WEST - POUR_GAP / 2}
      y0={VBUS2.y0}
      y1={VBUS2.y1}
    />
  </>
);

// --- PERST# ----------------------------------------------------------------------

const PERST_IN = handoff("PERST_N", "mcu", "slot");
/** On top between the two hops, 0.4 mm north of VBUS1 and south of the 12 V row. */
const PERST_Y = 16.4;
/** The slot's line comes this far west on top (lib/routing/slot.tsx). */
const SLOT_END: Point = { x: 49.15, y: 13.65 };
const HOP_VBUS1: Point = { x: PERST_IN.x, y: PERST_Y };
const HOP_V12: Point = { x: SLOT_END.x, y: PERST_Y };

/**
 * Two short hops on the bottom, each straight across what it passes under
 * (VBUS1: 4.2 mm, the 12 V row: 2.75 mm). One track each, so the cut in the
 * bottom ground is short and needs no stitching: there is no ground on top
 * here for a via to join (KiCad's via_dangling).
 */
const Perst = () => (
  <>
    <Track
      net="PERST_N"
      width={PERST_IN.width}
      layer="bottom"
      points={[PERST_IN, HOP_VBUS1]}
    />
    <Via net="PERST_N" at={HOP_VBUS1} {...VIA.signal} />
    <Track
      net="PERST_N"
      width={PERST_IN.width}
      layer="top"
      points={[HOP_VBUS1, HOP_V12]}
    />
    <Via net="PERST_N" at={HOP_V12} {...VIA.signal} />
    <Track
      net="PERST_N"
      width={PERST_IN.width}
      layer="bottom"
      points={[HOP_V12, SLOT_END]}
    />
    <Via net="PERST_N" at={SLOT_END} {...VIA.signal} />
  </>
);

export const TrunkRouting = () => (
  <>
    {/* Bottom: ground, cut only by the few tracks that have to run there. */}
    <Pour net="GND" layer="bottom" />
    <Vbus />
    <Perst />
  </>
);
