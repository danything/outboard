// Copper of the block "usb": internal USB header (J4, JP3).
// Design coordinates, Track / Via / Pour from ./kit (docs/routing.md).
//
// J4 lies on its side with the odd row (1 VBUS, 3 D-, 5 D+, 7 GND) to the
// north. D- arrives north of that row and drops between pins 5 and 3; D+
// arrives 1.9 mm further south, takes the lane between the two rows and
// climbs into pin 5. D+ is the shorter of the two by nature, so it makes a
// U-turn west of J4 that is sized here to match the lengths. Nothing of
// this block runs on the bottom: GND (pins 7 and 8) reaches the ground on
// the bottom through the plated holes themselves.
//
// JP3 (V5 -> USBH_VBUS) is left without its copper bridge: lines run to its
// pads and stop.
import type { Net } from "../nets";
import { type Point, Track, type TrackLayer, handoff, pad } from "./kit";

export interface TrackSpec {
  net: Net;
  width: number;
  layer: TrackLayer;
  points: Point[];
}

const DN_IN = handoff("USB_DN", "pdPc", "usb");
const DP_IN = handoff("USB_DP", "pdPc", "usb");
const V5_IN = handoff("V5", "mcu", "usb");

const J4 = {
  VBUS: pad("J4", 1),
  VBUS2: pad("J4", 2),
  DN: pad("J4", 3),
  DP: pad("J4", 5),
};

/**
 * How much longer D+ has to be than D- inside this block, so that the whole
 * route from J1 to J4 matches (checks/rules.ts USB_PAIR). pdPc matches the
 * two up to its edge; this block takes up the rest.
 */
const DP_EXTRA = 0;

const pathLength = (points: Point[]): number =>
  points.slice(1).reduce((sum, p, i) => {
    const q = points[i] as Point;
    return sum + Math.hypot(p.x - q.x, p.y - q.y);
  }, 0);

// D-: along the north of the odd row, down between pins 5 and 3 (x 25.87
// is the middle of the gap), into pin 3 from the west.
const DN_DROP_X = (J4.DP.x + J4.DN.x) / 2;
const DN_PATH: Point[] = [
  DN_IN,
  { x: DN_DROP_X, y: DN_IN.y },
  { x: DN_DROP_X, y: J4.DN.y },
  J4.DN,
];

// D+: the lane between the rows, and the U-turn west of pin 9/10 that
// makes up the difference. The turn goes down at x 17.85 and back up at
// x 18.3, clear of pin 10 (its copper starts at x 18.62).
const DP_LANE_Y = (pad("J4", 9).y + pad("J4", 10).y) / 2;
const TURN_DOWN_X = 17.85;
const TURN_UP_X = 18.3;
const dpPath = (bottom: number): Point[] => [
  DP_IN,
  { x: TURN_DOWN_X, y: DP_IN.y + (TURN_DOWN_X - DP_IN.x) },
  { x: TURN_DOWN_X, y: bottom },
  { x: TURN_UP_X, y: bottom },
  { x: TURN_UP_X, y: DP_LANE_Y },
  { x: J4.DP.x, y: DP_LANE_Y },
  J4.DP,
];
// The length grows by 2 mm for each mm the turn goes down.
const DP_TURN_BOTTOM = (() => {
  const shortest = DP_LANE_Y;
  const missing = pathLength(DN_PATH) + DP_EXTRA - pathLength(dpPath(shortest));
  return Math.round((shortest + missing / 2) * 1000) / 1000;
})();
const DP_PATH = dpPath(DP_TURN_BOTTOM);

// USBH_VBUS: both VBUS pins of J4, then east to JP3. 0.5 A, so 0.5 mm.
const VBUS_PATH: Point[] = [
  J4.VBUS2,
  J4.VBUS,
  { x: pad("JP3", 2).x, y: J4.VBUS.y },
  pad("JP3", 2),
];

export const USB_COPPER: { tracks: TrackSpec[]; vias: [] } = {
  tracks: [
    { net: "USB_DN", width: DN_IN.width, layer: "top", points: DN_PATH },
    { net: "USB_DP", width: DP_IN.width, layer: "top", points: DP_PATH },
    { net: "USBH_VBUS", width: 0.5, layer: "top", points: VBUS_PATH },
    // V5 from the regulator (block mcu) to JP3.
    {
      net: "V5",
      width: V5_IN.width,
      layer: "top",
      points: [V5_IN, pad("JP3", 1)],
    },
  ],
  vias: [],
};

export const UsbRouting = () => (
  <>
    {USB_COPPER.tracks.map((t) => (
      <Track key={`${t.net}${t.points[0]?.x},${t.points[0]?.y}`} {...t} />
    ))}
  </>
);
