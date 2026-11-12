// Copper that belongs to no single block: the ground on the bottom, and the
// lines that cross the ground between blocks. They meet the blocks at the
// HANDOFFS of lib/placement.ts.
// Design coordinates, Track / Via / Pour from ./kit (docs/routing.md).
//
// Between the blocks:
// - VBUS1 from pdPc (x 17.6) north of J4's pins, across the usb block and
//   along the band y 16.9..19.9 to the anode area of D1 (input, x 47.5)
// - VBUS2 from pdCharger (x 17.6) along the far side (y 53.7..57.2) and north
//   at x 47.5..50.2 to the anode area of D2 (input, y 41.8)
// - PERST# from the microcontroller (x 47, y 21) to the slot's line at
//   y 13.65: it hops under VBUS1 and under the 12 V row, on top in between
// - +3V3 for the hub, from R10 (buck) along the far edge, north through the
//   gap between the pads of D2, on the bottom under the lines of the
//   microcontroller, and west along y 31.35 to the hub (usb.tsx)
import {
  type Point,
  Pour,
  Track,
  VIA,
  Via,
  handoff,
  pad,

} from "./kit";

/** Pours of one net that share an edge are refused by KiCad; neighbours are kept this far apart and joined by a track. */
const POUR_GAP = 0.3;
/** West edge of the input block, where the anode areas of D1 and D2 begin. */
const INPUT_WEST = 47.5;
/** East edge of the anode area of D2 (input.tsx). */
const VBUS2_EAST = 50.2;
/** South edge of the input block. */
const INPUT_SOUTH = 41.8;

// --- VBUS1 and VBUS2 -------------------------------------------------------------

const VBUS1_FROM_PC = handoff("VBUS1", "pdPc", "usb");
const VBUS2_IN = handoff("VBUS2", "pdCharger", "input");

/** J4's odd row (pins 1..9) starts at y 17.63; the area stays north of it west of x 31. */
const J4_CLEAR = { y: 17.25, x: 31.0 };
/** The VBUS1 band from east of J4 to D1. */
const BAND1 = { y0: 16.9, y1: 19.9 };
/** North edge of the area: the slot's region starts at y 9.1 east of x 38. */
const NORTH1 = 9.1;
/** East edge of the north part: the rear ear of J3 and the slot's parts. */
const NORTH1_EAST = 38.3;

const VBUS1_OUTLINE: Point[] = [
  { x: VBUS1_FROM_PC.x + POUR_GAP, y: NORTH1 },
  { x: NORTH1_EAST, y: NORTH1 },
  { x: NORTH1_EAST, y: BAND1.y0 },
  { x: INPUT_WEST - POUR_GAP, y: BAND1.y0 },
  { x: INPUT_WEST - POUR_GAP, y: BAND1.y1 },
  { x: J4_CLEAR.x, y: BAND1.y1 },
  { x: J4_CLEAR.x, y: J4_CLEAR.y },
  { x: VBUS1_FROM_PC.x + POUR_GAP, y: J4_CLEAR.y },
];
/** The joint into the anode area of D1: the y range both areas share. */
const VBUS1_JOINT = { y0: 17.5, y1: BAND1.y1 };

/** VBUS2 along the far side and up to D2: one area, an L. */
const STRIP2 = { y0: VBUS2_IN.y - VBUS2_IN.width / 2, y1: VBUS2_IN.y + VBUS2_IN.width / 2 };
const VBUS2_OUTLINE: Point[] = [
  { x: VBUS2_IN.x + POUR_GAP, y: STRIP2.y0 },
  { x: INPUT_WEST, y: STRIP2.y0 },
  { x: INPUT_WEST, y: INPUT_SOUTH + POUR_GAP },
  { x: VBUS2_EAST, y: INPUT_SOUTH + POUR_GAP },
  { x: VBUS2_EAST, y: STRIP2.y1 },
  { x: VBUS2_IN.x + POUR_GAP, y: STRIP2.y1 },
];

/** A wide track across a gap of POUR_GAP at `at`, overlapping both sides. */
const Joint = ({
  net,
  at,
  width,
  vertical = false,
}: {
  net: "VBUS1" | "VBUS2";
  at: Point;
  width: number;
  vertical?: boolean;
}) => (
  <Track
    net={net}
    width={width}
    layer="top"
    points={
      vertical
        ? [
            { x: at.x, y: at.y - 0.3 },
            { x: at.x, y: at.y + 0.3 },
          ]
        : [
            { x: at.x - 0.3, y: at.y },
            { x: at.x + 0.3, y: at.y },
          ]
    }
  />
);

const Vbus = () => (
  <>
    <Pour net="VBUS1" layer="top" outline={VBUS1_OUTLINE} />
    {/* From the area of pdPc at its handoff, and into the anode area of D1. */}
    <Joint net="VBUS1" at={VBUS1_FROM_PC} width={VBUS1_FROM_PC.width} />
    <Joint
      net="VBUS1"
      at={{
        x: INPUT_WEST - POUR_GAP / 2,
        y: (VBUS1_JOINT.y0 + VBUS1_JOINT.y1) / 2,
      }}
      width={VBUS1_JOINT.y1 - VBUS1_JOINT.y0}
    />
    <Pour net="VBUS2" layer="top" outline={VBUS2_OUTLINE} />
    <Joint net="VBUS2" at={VBUS2_IN} width={VBUS2_IN.width} />
    <Joint
      net="VBUS2"
      at={{ x: (INPUT_WEST + VBUS2_EAST) / 2, y: INPUT_SOUTH + POUR_GAP / 2 }}
      width={VBUS2_EAST - INPUT_WEST}
      vertical
    />
  </>
);

// --- PERST# ----------------------------------------------------------------------

const PERST_IN = handoff("PERST_N", "mcu", "slot");
/** On top between the two hops, 0.4 mm north of VBUS1 and south of the 12 V row. */
const PERST_Y = 16.4;
/** The slot's line comes this far west on top (lib/routing/slot.tsx). */
const SLOT_END: Point = { x: 49.15, y: 13.65 };
/** West of the PERST lane, east of USBH_VBUS (x 45.08). */
const HOP_X = 46.0;
const HOP_SOUTH: Point = { x: HOP_X, y: PERST_IN.y };
const HOP_VBUS1: Point = { x: HOP_X, y: PERST_Y };
const HOP_V12: Point = { x: SLOT_END.x, y: PERST_Y };

/**
 * Two short hops on the bottom, each straight across what it passes under
 * (VBUS1: 4.6 mm, the 12 V row: 2.75 mm). One track each, so the cut in the
 * bottom ground is short.
 */
const Perst = () => (
  <>
    <Track
      net="PERST_N"
      width={PERST_IN.width}
      layer="top"
      points={[PERST_IN, HOP_SOUTH]}
    />
    <Via net="PERST_N" at={HOP_SOUTH} {...VIA.signal} />
    <Track
      net="PERST_N"
      width={PERST_IN.width}
      layer="bottom"
      points={[HOP_SOUTH, HOP_VBUS1]}
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

// --- +3V3 for the hub ------------------------------------------------------------

const V3_EDGE = handoff("V3V3", "buck", "usb");
/** Up the gap between the pads of D2, east of the LED... and clear of VIN (x 52.4). */
const V3_X = 51.6;
/** Where it dives under the lines of the microcontroller, and where it comes up. */
const V3_DOWN: Point = { x: V3_X, y: 34.9 };
const V3_UP: Point = { x: 46.3, y: 31.35 };
/** The hub's column of capacitors (usb.tsx starts there). */
const V3_HUB: Point = { x: pad("C36", 1).x, y: 31.35 };

const Hub3V3 = () => (
  <>
    <Track
      net="V3V3"
      width={V3_EDGE.width}
      layer="top"
      points={[
        pad("R10", 1),
        { x: pad("R10", 1).x, y: V3_EDGE.y },
        V3_EDGE,
        { x: V3_X, y: V3_EDGE.y },
        V3_DOWN,
      ]}
    />
    <Via net="V3V3" at={V3_DOWN} {...VIA.signal} />
    <Track
      net="V3V3"
      width={V3_EDGE.width}
      layer="bottom"
      points={[V3_DOWN, V3_UP]}
    />
    <Via net="V3V3" at={V3_UP} {...VIA.signal} />
    <Track
      net="V3V3"
      width={V3_EDGE.width}
      layer="top"
      points={[V3_UP, V3_HUB]}
    />
  </>
);

export const TrunkRouting = () => (
  <>
    {/* Bottom: ground, cut only by the few tracks that have to run there. */}
    <Pour net="GND" layer="bottom" />
    <Vbus />
    <Perst />
    <Hub3V3 />
  </>
);

