// Copper of the block "usb": the hub U8, the sockets J4 and J6 for the
// card's two internal USB cables, and the card's 5 V regulator U9.
// Design coordinates, Track / Via / Pour from ./kit (docs/routing.md).
//
// - Upstream: D- and D+ come in from pdPc south of the VBUS1 band, go
//   down to the bottom just south of it, cross under it side by side and
//   come up next to the hub's west side (DMU, DPU).
// - Port 1 (west side, north of the upstream pins) goes west and north
//   into J4; port 2 (north side) goes north and east under J4's VBUS pad
//   into J6. In each socket D- is east of D+ (lib/card-usb.ts), so the
//   line that ends further east takes the lane further north (J4) or
//   further south (J6) and nothing crosses.
// - The crystal sits east of the hub, the hub's supply pins face south.
//   +3V3 comes up from the bottom at the east end (lib/routing/trunks.tsx)
//   and runs west along the north side of the band past C36, C34 and C35.
// - USBH_VBUS: U9 sits south of the band with its tab on it; its output
//   hops under the band to JP3, then west through the fuse F2 into J6's
//   VBUS pad from the south; from that pad a line under the bodies of J6
//   and J4 enters J4's VBUS pad from the north (CARD_VBUS).
// - Each pair is matched in length within its own route (checks/rules.ts
//   USB_PAIR): the shorter line gets a bump.
//
// The pins of the sockets are looked up by signal name (lib/card-usb.ts).
import { CARD_USB_PINOUT } from "../card-usb";
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
import { V33_HUB_VIA } from "./trunks";

export interface TrackSpec {
  net: Net;
  width: number;
  layer: TrackLayer;
  points: Point[];
}

interface ViaSpec {
  net: Net;
  at: Point;
  size: "signal" | "power";
}

const P = (x: number, y: number): Point => ({ x, y });
const socket = (ref: "J4" | "J6", pin: keyof typeof CARD_USB_PINOUT) =>
  pad(ref, CARD_USB_PINOUT[pin]);

/** Hub pins by name (lib/parts.tsx CH334P). */
const U8 = {
  XO: pad("U8", 1),
  XI: pad("U8", 2),
  DM2: pad("U8", 7),
  DP2: pad("U8", 8),
  DM1: pad("U8", 9),
  DP1: pad("U8", 10),
  DMU: pad("U8", 11),
  DPU: pad("U8", 12),
  V5: pad("U8", 15),
  VDD33: pad("U8", 16),
};

const PAIR_WIDTH = 0.2;

const pathLength = (points: Point[]): number =>
  points.slice(1).reduce((sum, p, i) => {
    const q = points[i] as Point;
    return sum + Math.hypot(p.x - q.x, p.y - q.y);
  }, 0);

const round = (v: number): number => Math.round(v * 1000) / 1000;

/**
 * A rectangular bump that adds `extra` mm to a path. It sits on the
 * straight segment from points[i] to points[i + 1], starting `at` mm from
 * points[i], `wide` mm wide, towards `side` (+1: left of the direction of
 * travel as drawn, -1: right).
 */
const bump = (
  points: Point[],
  i: number,
  at: number,
  wide: number,
  extra: number,
  side: 1 | -1,
): Point[] => {
  if (extra <= 0) return points;
  const a = points[i] as Point;
  const b = points[i + 1] as Point;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const [ux, uy] = [(b.x - a.x) / len, (b.y - a.y) / len];
  // Left of travel with y pointing down (design coordinates) is (uy, -ux).
  const [nx, ny] = [side * uy, -side * ux];
  const h = extra / 2;
  const s = (d: number, n: number): Point =>
    P(round(a.x + ux * d + nx * n), round(a.y + uy * d + ny * n));
  return [
    ...points.slice(0, i + 1),
    s(at, 0),
    s(at, h),
    s(at + wide, h),
    s(at + wide, 0),
    ...points.slice(i + 1),
  ];
};

// --- Upstream: J1 (pdPc) -> hub, under the VBUS1 band ---------------------------

const DN_IN = handoff("USB_DN", "pdPc", "usb");
const DP_IN = handoff("USB_DP", "pdPc", "usb");
/** The hops: south of the band (VBUS1 reaches y 19.1 here) and north of it (15.9). */
const HOP = { south: 19.6, north: 15.4, dn: 20.5, dp: 21.5 };

const UP_DN_TOP_IN: Point[] = [
  DN_IN,
  P(HOP.dn - 0.2, DN_IN.y),
  P(HOP.dn, HOP.south),
];
const UP_DP_TOP_IN: Point[] = [DP_IN, P(HOP.dp, DP_IN.y), P(HOP.dp, HOP.south)];
const UP_DN_TOP_OUT: Point[] = [
  P(HOP.dn, HOP.north),
  P(HOP.dn, U8.DMU.y),
  U8.DMU,
];
const UP_DP_TOP_OUT: Point[] = [
  P(HOP.dp, HOP.north),
  P(HOP.dp, U8.DPU.y),
  U8.DPU,
];
const UP_BOTTOM = (x: number): Point[] => [P(x, HOP.south), P(x, HOP.north)];

// --- Port 1 -> J4 ------------------------------------------------------------------

const J4_DN = socket("J4", "DN");
const J4_DP = socket("J4", "DP");
const P1_DN_BASE: Point[] = [U8.DM1, P(J4_DN.x, U8.DM1.y), J4_DN];
const P1_DP: Point[] = [U8.DP1, P(J4_DP.x, U8.DP1.y), J4_DP];
/** D- of port 1 ends 2 mm nearer: a bump north on its way west. */
const P1_DN = bump(
  P1_DN_BASE,
  0,
  0.6,
  0.6,
  pathLength(P1_DP) - pathLength(P1_DN_BASE),
  -1,
);

// --- Port 2 -> J6 ------------------------------------------------------------------

const J6_DN = socket("J6", "DN");
const J6_DP = socket("J6", "DP");
/** Lanes south of the sockets' pads: D+ north, D- south. */
const LANE = { dp: 9.9, dn: 10.4 };
const P2_DN: Point[] = [
  U8.DM2,
  P(U8.DM2.x, LANE.dn),
  P(J6_DN.x, LANE.dn),
  J6_DN,
];
const P2_DP_BASE: Point[] = [
  U8.DP2,
  P(U8.DP2.x, LANE.dp),
  P(J6_DP.x, LANE.dp),
  J6_DP,
];
/** D+ of port 2 ends 2 mm nearer: a bump north between the sockets. */
const P2_DP = bump(
  P2_DP_BASE,
  1,
  1.9,
  0.6,
  pathLength(P2_DN) - pathLength(P2_DP_BASE),
  1,
);

// --- Upstream matching ----------------------------------------------------------------
// pdPc leaves D+ shorter than D- by PDPC_DP_SHORT at its edge; here D+
// goes 1 mm further east and back, and D- takes what is left as a bump west
// of its climb to the hub.

/** D- minus D+ from J1 to the edge of pdPc (measured on the built board). */
const PDPC_DP_SHORT = -0.44;
const upLength = (top: Point[][]): number =>
  top.reduce((s, p) => s + pathLength(p), 0) + (HOP.south - HOP.north);
const UP_DN_OUT = bump(
  UP_DN_TOP_OUT,
  0,
  0.3,
  0.5,
  upLength([UP_DP_TOP_IN, UP_DP_TOP_OUT]) -
    PDPC_DP_SHORT -
    upLength([UP_DN_TOP_IN, UP_DN_TOP_OUT]),
  1,
);

// --- Crystal ---------------------------------------------------------------------------

const Y1 = {
  XI: pad("Y1", 1),
  G1: pad("Y1", 2),
  XO: pad("Y1", 3),
  G2: pad("Y1", 4),
};
/** XI climbs between the hub and the crystal, above the crystal's north-west pad. */
const XI_X = 26.0;
const XI_Y = 11.1;
const XTAL_GND_VIA = P(30.85, 14.45);

// --- Supply ----------------------------------------------------------------------------

/** +3V3 along the north side of the band, from the trunk's via west to C35. */
const V33_LANE_Y = V33_HUB_VIA.y;
const C35_GND_VIA = P(22.2, 16.1);
const C34_GND_VIA = XTAL_GND_VIA;
const C36_GND_VIA = P(pad("C36", 2).x, 14.0);

// --- VBUS of the card -------------------------------------------------------------------

/** The card VBUS under the bodies of the sockets: from J6's VBUS pad west to J4's, both from the north. */
const VBUS_BUS_Y = 5.0;
/** F2 is south-west of J6's VBUS pad: north from it, east under the pads of J6, north into the VBUS pad. */
const F2_TO_J6_Y = 10.0;
const JP3_COLUMN_X = pad("JP3", 2).x;
const V5_USB_NORTH = P(JP3_COLUMN_X, 13.2);
const V5_USB_SOUTH = P(32.0, pad("U9", 3).y);

// --- Ground of the sockets and the regulator ----------------------------------------

const J6_GND_VIA = P(27.6, 8.4);

export const USB_COPPER: { tracks: TrackSpec[]; vias: ViaSpec[] } = {
  tracks: [
    // Upstream.
    { net: "USB_DN", width: PAIR_WIDTH, layer: "top", points: UP_DN_TOP_IN },
    {
      net: "USB_DN",
      width: PAIR_WIDTH,
      layer: "bottom",
      points: UP_BOTTOM(HOP.dn),
    },
    { net: "USB_DN", width: PAIR_WIDTH, layer: "top", points: UP_DN_OUT },
    { net: "USB_DP", width: PAIR_WIDTH, layer: "top", points: UP_DP_TOP_IN },
    {
      net: "USB_DP",
      width: PAIR_WIDTH,
      layer: "bottom",
      points: UP_BOTTOM(HOP.dp),
    },
    { net: "USB_DP", width: PAIR_WIDTH, layer: "top", points: UP_DP_TOP_OUT },
    // Ports.
    { net: "USB1_DN", width: PAIR_WIDTH, layer: "top", points: P1_DN },
    { net: "USB1_DP", width: PAIR_WIDTH, layer: "top", points: P1_DP },
    { net: "USB2_DN", width: PAIR_WIDTH, layer: "top", points: P2_DN },
    { net: "USB2_DP", width: PAIR_WIDTH, layer: "top", points: P2_DP },
    // Crystal.
    { net: "HUB_XO", width: 0.15, layer: "top", points: [U8.XO, Y1.XO] },
    {
      net: "HUB_XI",
      width: 0.15,
      layer: "top",
      points: [U8.XI, P(XI_X, U8.XI.y), P(XI_X, XI_Y), P(Y1.XI.x, XI_Y), Y1.XI],
    },
    // The lid: both ground pads, between the crystal's pads, to a via.
    {
      net: "GND",
      width: 0.3,
      layer: "top",
      points: [
        Y1.G1,
        P((Y1.G1.x + Y1.G2.x) / 2, (Y1.G1.y + Y1.G2.y) / 2),
        Y1.G2,
        XTAL_GND_VIA,
      ],
    },
    // Supply: V5 and VDD33 together, down to C35, east along the band.
    {
      net: "V3V3",
      width: 0.3,
      layer: "top",
      points: [
        U8.V5,
        P(U8.V5.x, U8.V5.y + 0.45),
        P(U8.VDD33.x, U8.VDD33.y + 0.45),
      ],
    },
    {
      net: "V3V3",
      width: 0.3,
      layer: "top",
      points: [U8.VDD33, pad("C35", 1)],
    },
    {
      net: "V3V3",
      width: 0.3,
      layer: "top",
      points: [pad("C35", 1), P(pad("C35", 1).x, V33_LANE_Y), V33_HUB_VIA],
    },
    {
      net: "V3V3",
      width: 0.3,
      layer: "top",
      points: [pad("C34", 1), P(pad("C34", 1).x, V33_LANE_Y)],
    },
    {
      net: "V3V3",
      width: 0.3,
      layer: "top",
      points: [pad("C36", 1), P(pad("C36", 1).x, V33_LANE_Y)],
    },
    {
      net: "GND",
      width: 0.3,
      layer: "top",
      points: [pad("C35", 2), C35_GND_VIA],
    },
    {
      net: "GND",
      width: 0.3,
      layer: "top",
      points: [pad("C34", 2), C34_GND_VIA],
    },
    {
      net: "GND",
      width: 0.3,
      layer: "top",
      points: [pad("C36", 2), C36_GND_VIA],
    },
    // Card VBUS: U9 -> C38 -> under the band -> JP3 -> under the sockets.
    {
      net: "V5_USB",
      width: 0.5,
      layer: "top",
      points: [pad("U9", 3), P(pad("C38", 1).x, pad("U9", 3).y), pad("C38", 1)],
    },
    {
      net: "V5_USB",
      width: 0.5,
      layer: "bottom",
      points: [V5_USB_SOUTH, P(V5_USB_SOUTH.x, 19.0), V5_USB_NORTH],
    },
    {
      net: "V5_USB",
      width: 0.5,
      layer: "top",
      points: [V5_USB_NORTH, pad("JP3", 1)],
    },
    // JP3 -> F2 -> J6 from the south; on under the sockets to J4.
    {
      net: "USBH_VBUS",
      width: 0.5,
      layer: "top",
      points: [pad("JP3", 2), pad("F2", 2)],
    },
    {
      net: "CARD_VBUS",
      width: 0.5,
      layer: "top",
      points: [
        pad("F2", 1),
        P(pad("F2", 1).x, F2_TO_J6_Y),
        P(socket("J6", "VBUS").x, F2_TO_J6_Y),
        socket("J6", "VBUS"),
      ],
    },
    {
      net: "CARD_VBUS",
      width: 0.5,
      layer: "top",
      points: [
        socket("J6", "VBUS"),
        P(socket("J6", "VBUS").x, VBUS_BUS_Y),
        P(socket("J4", "VBUS").x, VBUS_BUS_Y),
        socket("J4", "VBUS"),
      ],
    },
    // U9: input capacitor from the band, ground pins to vias.
    {
      net: "VBUS1",
      width: 0.4,
      layer: "top",
      points: [pad("C37", 1), P(pad("C37", 1).x, 19.6)],
    },
    {
      net: "GND",
      width: 0.3,
      layer: "top",
      points: [pad("C37", 2), P(pad("C37", 2).x, 22.2)],
    },
    {
      net: "GND",
      width: 0.5,
      layer: "top",
      points: [pad("U9", 1), P(27.0, pad("U9", 1).y)],
    },
    {
      net: "GND",
      width: 0.4,
      layer: "top",
      points: [pad("C38", 2), P(pad("C38", 2).x, 20.45)],
    },
    // Sockets: J4's ground to the ground pad of R29 (pdPc), J6's to a via.
    {
      net: "GND",
      width: 0.3,
      layer: "top",
      points: [
        socket("J4", "GND"),
        P(socket("J4", "GND").x, 9.6),
        pad("R29", 2),
      ],
    },
    {
      net: "GND",
      width: 0.3,
      layer: "top",
      points: [socket("J6", "GND"), J6_GND_VIA],
    },
  ],
  vias: [
    ...[HOP.south, HOP.north].flatMap((y) => [
      { net: "USB_DN" as Net, at: P(HOP.dn, y), size: "signal" as const },
      { net: "USB_DP" as Net, at: P(HOP.dp, y), size: "signal" as const },
    ]),
    { net: "GND", at: XTAL_GND_VIA, size: "signal" },
    { net: "GND", at: C35_GND_VIA, size: "signal" },
    { net: "GND", at: C36_GND_VIA, size: "signal" },
    { net: "GND", at: P(pad("C37", 2).x, 22.2), size: "signal" },
    { net: "GND", at: P(27.0, pad("U9", 1).y), size: "power" },
    { net: "GND", at: P(pad("C38", 2).x, 20.45), size: "signal" },
    { net: "GND", at: J6_GND_VIA, size: "signal" },
    { net: "V5_USB", at: V5_USB_SOUTH, size: "power" },
    { net: "V5_USB", at: V5_USB_NORTH, size: "power" },
  ],
};

export const UsbRouting = () => (
  <>
    {USB_COPPER.tracks.map((t) => (
      <Track
        key={`${t.net}${t.layer}${t.points[0]?.x},${t.points[0]?.y}`}
        {...t}
      />
    ))}
    {USB_COPPER.vias.map((v) => (
      <Via
        key={`${v.net}${v.at.x},${v.at.y}`}
        net={v.net}
        at={v.at}
        {...VIA[v.size]}
      />
    ))}
  </>
);
