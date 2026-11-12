// Copper that belongs to no single block: the ground on the bottom, and the
// lines that cross the ground between blocks (outside every region of
// lib/placement.ts). They meet the blocks at the HANDOFFS.
// Design coordinates, Track / Via / Pour from ./kit (docs/routing.md).
//
// Between the blocks:
// - VBUS1 from pdPc (x 17.6) across the usb block to the anode area of D1 (input, x 47.5)
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
//
// Both anode areas have to reach 150 mm2 (checks/rules.ts COPPER_AREA) with
// what pdPc / pdCharger and input draw. The VBUS1 area also covers the usb
// block, which draws only the data pair and J4's own 5 V (lib/routing/usb.tsx),
// and the free ground north of the band (x 34.2 to 38.3, y 9.1 to 16.9).

const VBUS1_FROM_PC = handoff("VBUS1", "pdPc", "usb");
const VBUS2_IN = handoff("VBUS2", "pdCharger", "input");

/** USB_DN runs west to east at y 19.4 up to x 25.87, then south to J4.3 (usb.tsx). */
const DN_CLEAR = { y: 19.1, x: 26.2 };
/** The VBUS1 band from the usb block to D1 (the handoff: y 16.9 to 19.9). */
const BAND1 = { y0: 16.9, y1: 19.9 };
/** North edge of the area: the slot's region starts at y 9.1 east of x 38. */
const NORTH1 = 9.1;
/** East edge of the north part: west of the PERST# via at (38.9, 16.4). */
const NORTH1_EAST = 38.3;

const VBUS1_OUTLINE: Point[] = [
  { x: VBUS1_FROM_PC.x + POUR_GAP, y: NORTH1 },
  { x: NORTH1_EAST, y: NORTH1 },
  { x: NORTH1_EAST, y: BAND1.y0 },
  { x: INPUT_WEST - POUR_GAP, y: BAND1.y0 },
  { x: INPUT_WEST - POUR_GAP, y: BAND1.y1 },
  { x: DN_CLEAR.x, y: BAND1.y1 },
  { x: DN_CLEAR.x, y: DN_CLEAR.y },
  { x: VBUS1_FROM_PC.x + POUR_GAP, y: DN_CLEAR.y },
];
/** The joint into the anode area of D1: the y range both areas share. */
const VBUS1_JOINT = { y0: 17.5, y1: BAND1.y1 };

/** VBUS2 from pdCharger to D2, y 34.6 to 37.95: the free ground between the microcontroller's parts (y < 34.3 and y > 38.2). */
const VBUS2 = {
  x0: VBUS2_IN.x + POUR_GAP,
  x1: INPUT_WEST - POUR_GAP,
  y0: 34.6,
  y1: 37.95,
};

/** A wide track across a gap of POUR_GAP at `x`, overlapping both sides. */
const Joint = ({
  net,
  x,
  y,
  width,
}: {
  net: "VBUS1" | "VBUS2";
  x: number;
  y: number;
  width: number;
}) => (
  <Track
    net={net}
    width={width}
    layer="top"
    points={[
      { x: x - 0.3, y },
      { x: x + 0.3, y },
    ]}
  />
);

const Vbus = () => (
  <>
    <Pour net="VBUS1" layer="top" outline={VBUS1_OUTLINE} />
    {/* From the area of pdPc at its handoff, and into the anode area of D1. */}
    <Joint
      net="VBUS1"
      x={VBUS1_FROM_PC.x}
      y={VBUS1_FROM_PC.y}
      width={VBUS1_FROM_PC.width}
    />
    <Joint
      net="VBUS1"
      x={INPUT_WEST - POUR_GAP / 2}
      y={(VBUS1_JOINT.y0 + VBUS1_JOINT.y1) / 2}
      width={VBUS1_JOINT.y1 - VBUS1_JOINT.y0}
    />
    <Pour
      net="VBUS2"
      layer="top"
      outline={rect(VBUS2.x0, VBUS2.y0, VBUS2.x1, VBUS2.y1)}
    />
    <Joint net="VBUS2" x={VBUS2_IN.x} y={VBUS2_IN.y} width={VBUS2_IN.width} />
    <Joint
      net="VBUS2"
      x={INPUT_WEST - POUR_GAP / 2}
      y={VBUS2_IN.y}
      width={VBUS2_IN.width}
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
