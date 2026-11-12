// Copper of the block "usb": the card's two internal USB headers (J4, J6)
// and the hub between them (U8, Y1, C34 to C36).
// Design coordinates, Track / Via / Pour from ./kit (docs/routing.md).
//
// U8 (CH334P) sits south of J4 and west of J6, unrotated: its north side
// takes the upstream pair (west half) and port 1 (east half), its east side
// port 2, the crystal is south and power west.
// - Upstream: from U5 (block pdPc) south past the west end of J4 and east
//   along the south of J4's pins into the north side of U8.
// - Port 1 to J4: up through the gaps of J4's even row into the lane between
//   the two rows, and into pins 5 (D+) and 3 (D-), which are in the odd row.
// - Port 2 to J6: east under J6's plug. D+ drops into pin 5 from the north;
//   D- drops through the gap between pins 9 and 7 into the lane between the
//   rows and runs east to pin 3.
// The pairs are matched pair by pair (checks/rules.ts USB_PAIRS) with a bump
// on the shorter line. Nothing of a pair runs on the bottom; GND of the
// headers (pins 7 and 8) reaches the bottom through the plated holes.
//
// J4's and J6's VBUS (USBH_VBUS) comes from JP3 (block mcu) on the bottom to
// pin 2 of J6, and from pin 1 of J6 north and west along y 21.6 to J4.
// +3V3 of the hub comes along y 31.35 from the east (trunks.tsx).
import type { Net } from "../nets";
import {
  type Point,
  Track,
  type TrackLayer,
  VIA,
  Via,
  handoff,
  pad,
} from "./kit";

export interface TrackSpec {
  net: Net;
  width: number;
  layer: TrackLayer;
  points: Point[];
}

const tracks: TrackSpec[] = [];
const vias: { net: Net; at: Point }[] = [];
const t = (net: Net, width: number, points: Point[]) =>
  tracks.push({ net, width, layer: "top", points });
const v = (net: Net, x: number, y: number) => vias.push({ net, at: { x, y } });
const P = (x: number, y: number): Point => ({ x, y });

export const pathLength = (points: Point[]): number =>
  points.slice(1).reduce((sum, p, i) => {
    const q = points[i] as Point;
    return sum + Math.hypot(p.x - q.x, p.y - q.y);
  }, 0);

/** A bump of `depth` in a straight horizontal run from a to b (adds 2 x depth). */
const bump = (a: Point, b: Point, x0: number, x1: number, depth: number) => [
  a,
  P(x0, a.y),
  P(x0, a.y + depth),
  P(x1, a.y + depth),
  P(x1, b.y),
  b,
];

const U8 = (pin: number) => pad("U8", pin);
const J4 = (pin: number) => pad("J4", pin);
const J6 = (pin: number) => pad("J6", pin);
/** Inner end of a pad of U8 on its north side (pads 0.665 long). */
const north = (pin: number): Point => P(U8(pin).x, U8(pin).y - 0.33);

// --- Upstream: U5 -> U8 ------------------------------------------------------------
const DN_IN = handoff("USB_DN", "pdPc", "usb");
const DP_IN = handoff("USB_DP", "pdPc", "usb");
/** Rows south of J4's pins (its even row ends at y 21.97). */
const UP_DN_Y = 22.27;
const UP_DP_Y = 22.67;
const UP_DN_X = 18.15;
const UP_DP_X = 17.8;

const upDn: Point[] = [
  P(DN_IN.x, DN_IN.y),
  P(UP_DN_X, DN_IN.y),
  P(UP_DN_X, UP_DN_Y),
  P(U8(11).x, UP_DN_Y),
  north(11),
];
// D+ starts 1.9 mm further south, so it is the shorter one: a bump towards
// the south, west of the hub's capacitors, takes up the difference.
const upDpPlain: Point[] = [
  P(DP_IN.x, DP_IN.y),
  P(UP_DP_X, DP_IN.y),
  P(UP_DP_X, UP_DP_Y),
  P(U8(12).x, UP_DP_Y),
  north(12),
];
/**
 * How much longer D+ is than D- before the edge of pdPc (pdPc matches its
 * own part; this block takes up the rest).
 */
const UP_DP_EXTRA = 0;
const upDepth =
  Math.round(
    ((pathLength(upDn) - pathLength(upDpPlain) - UP_DP_EXTRA) / 2) * 1000,
  ) / 1000;
const upDp: Point[] = [
  P(DP_IN.x, DP_IN.y),
  P(UP_DP_X, DP_IN.y),
  ...bump(P(UP_DP_X, UP_DP_Y), P(U8(12).x, UP_DP_Y), 19.9, 20.5, upDepth),
  north(12),
];
t("USB_DN", 0.2, upDn);
t("USB_DP", 0.2, upDp);

// --- Port 1: U8 -> J4 --------------------------------------------------------------
/** The lane between J4's rows, and the gaps of its even row. */
const J4_LANE = (J4(5).y + J4(6).y) / 2;
const GAP_64 = (J4(6).x + J4(4).x) / 2;
const GAP_42 = (J4(4).x + J4(2).x) / 2;
const P1_DN_Y = 22.45;
const p1Dn: Point[] = [
  north(9),
  P(U8(9).x, P1_DN_Y),
  P(GAP_42, P1_DN_Y),
  P(GAP_42, J4_LANE),
  P(J4(3).x + 0.4, J4_LANE),
  J4(3),
];
const p1DpTo = (west: number): Point[] => [
  north(10),
  P(U8(10).x, 22.75),
  P(GAP_64, 22.6),
  P(GAP_64, J4_LANE),
  P(west, J4_LANE),
  J4(5),
];
/** D+ is the shorter: it runs on west in the lane and comes back to pin 5. */
const p1West = (() => {
  let lo = 22.9;
  let hi = J4(5).x;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (pathLength(p1DpTo(mid)) > pathLength(p1Dn)) lo = mid;
    else hi = mid;
  }
  return Math.round(lo * 1000) / 1000;
})();
t("USB1_DN", 0.2, p1Dn);
t("USB1_DP", 0.2, p1DpTo(p1West));

// --- Port 2: U8 -> J6 --------------------------------------------------------------
const J6_LANE = (J6(5).y + J6(6).y) / 2;
const GAP_97 = (J6(9).x + J6(7).x) / 2;
const east = (pin: number): Point => P(U8(pin).x + 0.33, U8(pin).y);
const p2Dn: Point[] = [
  east(7),
  P(GAP_97, U8(7).y),
  P(GAP_97, J6_LANE),
  P(J6(3).x - 0.5, J6_LANE),
  J6(3),
];
const p2DpPlain: Point[] = [east(8), P(J6(5).x, U8(8).y), J6(5)];
const p2Depth =
  Math.round(((pathLength(p2Dn) - pathLength(p2DpPlain)) / 4) * 1000) / 1000;
/** D+ is the shorter: two bumps north under J6's plug. */
const p2Dp: Point[] = [
  east(8),
  P(31.0, U8(8).y),
  P(31.0, U8(8).y - p2Depth),
  P(32.6, U8(8).y - p2Depth),
  P(32.6, U8(8).y),
  P(34.4, U8(8).y),
  P(34.4, U8(8).y - p2Depth),
  P(36.0, U8(8).y - p2Depth),
  P(36.0, U8(8).y),
  P(J6(5).x, U8(8).y),
  J6(5),
];
t("USB2_DN", 0.2, p2Dn);
t("USB2_DP", 0.2, p2Dp);

// --- Crystal -------------------------------------------------------------------------
const south = (pin: number): Point => P(U8(pin).x, U8(pin).y + 0.33);
t("HUB_XO", 0.2, [south(1), pad("Y1", 3)]);
const XI_X = 27.55;
t("HUB_XI", 0.2, [
  south(2),
  P(U8(2).x, 27.0),
  P(XI_X, 27.0),
  P(XI_X, pad("Y1", 1).y),
  pad("Y1", 1),
]);
// The crystal's lid: pin 2 across the middle to pin 4, a via south-west of it.
t("GND", 0.3, [pad("Y1", 2), pad("Y1", 4), P(23.8, 30.5)]);
v("GND", 23.8, 30.5);

// --- Power ---------------------------------------------------------------------------
// +3V3 from the east along y 31.35 (trunks.tsx), up the column of capacitors
// to V5 and VDD33, which are joined at their pads.
const V3_X = pad("C36", 1).x;
const V3_IN = P(V3_X, 31.35);
t("V3V3", 0.4, [
  V3_IN,
  P(V3_X, pad("C36", 1).y),
  pad("C36", 1),
  P(pad("C34", 1).x, pad("C34", 1).y),
  pad("C35", 1),
]);
t("V3V3", 0.3, [
  pad("C35", 1),
  P(23.3, pad("C35", 1).y),
  P(23.3, U8(15).y),
  P(U8(15).x - 0.33, U8(15).y),
]);
t("V3V3", 0.25, [P(23.3, U8(15).y), P(23.3, U8(16).y), P(U8(16).x - 0.33, U8(16).y)]);
// Ground of the capacitors: joined down their west pads, a via at each end.
t("GND", 0.3, [
  P(pad("C35", 2).x, 24.3),
  pad("C35", 2),
  pad("C34", 2),
  pad("C36", 2),
  P(pad("C36", 2).x, 30.4),
]);
v("GND", pad("C35", 2).x, 24.3);
v("GND", pad("C36", 2).x, 30.4);

// --- VBUS of the card ----------------------------------------------------------------
const VBUS_IN = handoff("USBH_VBUS", "mcu", "usb");
const VBUS_Y = 21.6;
t("USBH_VBUS", 0.5, [
  J6(1),
  P(J6(1).x, VBUS_Y),
  P(J4(1).x + 0.9, VBUS_Y),
  J4(2),
]);
t("USBH_VBUS", 0.5, [J4(2), J4(1)]);
t("USBH_VBUS", 0.5, [J6(2), J6(1)]);
// The bottom track from JP3 ends on pin 2 of J6 (a plated hole).
tracks.push({
  net: "USBH_VBUS",
  width: 0.5,
  layer: "bottom",
  points: [P(VBUS_IN.x, VBUS_IN.y), J6(2)],
});

export const USB_COPPER = { tracks, vias };

export const UsbRouting = () => (
  <>
    {tracks.map((s) => (
      <Track
        key={`${s.net}${s.layer}${s.points.map((p) => `${p.x},${p.y}`).join(" ")}`}
        {...s}
      />
    ))}
    {vias.map((s) => (
      <Via key={`${s.net}${s.at.x},${s.at.y}`} {...s} {...VIA.signal} />
    ))}
  </>
);
