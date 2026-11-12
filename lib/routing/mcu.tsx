// Copper of the block "mcu": microcontroller (U7, U6, sense dividers, status LED).
//
// U7 takes most of its lines through the gap between its two rows of pads:
// PERST# leaves to the north, SWIO drops to the bottom, the I2C lines to U2
// and 5 V come in from the south, the LED line leaves to the south. That
// keeps the west side for the lines from the ports, with the capacitors of
// the sense lines next to their pins, and the east side for the lines to the
// converters. U6 sits in the south-west corner under the lines to the ports;
// 5 V and VIN run along the far edge of the block between it and U7.
// Design coordinates, Track / Via / Pour from ./kit (docs/routing.md).
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
export interface ViaSpec {
  net: Net;
  at: Point;
  hole: number;
  diameter: number;
}

const tracks: TrackSpec[] = [];
const vias: ViaSpec[] = [];
const t = (
  net: Net,
  width: number,
  points: Point[],
  layer: TrackLayer = "top",
) => tracks.push({ net, width, layer, points });
const v = (net: Net, x: number, y: number) =>
  vias.push({ net, at: { x, y }, ...VIA.signal });
const P = (x: number, y: number): Point => ({ x, y });
const at = (h: { x: number; y: number }): Point => P(h.x, h.y);

// --- U7 pins -------------------------------------------------------------------
const W = (pin: number) => pad("U7", pin);

// Lanes under the body (x). From the west pins: PERST# leaves to the north,
// SWIO drops to the bottom at once, the I2C lines to the charger's port come
// in from the south. From the east pins: 5 V comes in from the south to pin
// 9, the LED line leaves to the south, ground drops at pin 7.
const PERST_X = 38.3;
const SWIO_VIA = P(38.35, 29.425);
const SDA2_X = 38.95;
const SCL2_X = 39.45;
const V5_X = 40.1;
const LED_X = 40.75;
/** Rows south of U7, coming from the west. */
const SDA2_ROW = 31.4;
const SCL2_ROW = 31.85;
const V5_ROW = 32.45;

// --- Body ------------------------------------------------------------------------
// PERST#: pin 13 north to R37, then on the bottom to the slot.
t("PERST_MCU", 0.2, [
  W(13),
  P(PERST_X, W(13).y),
  P(PERST_X, pad("R37", 1).y),
  pad("R37", 1),
]);
t("PERST_N", 0.2, [pad("R37", 2), P(37.4, 21.1)]);
v("PERST_N", 37.4, 21.1);
t(
  "PERST_N",
  0.2,
  [P(37.4, 21.1), at(handoff("PERST_N", "mcu", "slot"))],
  "bottom",
);
// SWIO: pin 18 down to the bottom under the body, north to J5.
t("SWIO", 0.2, [W(18), SWIO_VIA]);
v("SWIO", SWIO_VIA.x, SWIO_VIA.y);
t("SWIO", 0.2, [SWIO_VIA, P(SWIO_VIA.x, 23.6), pad("J5", 1)], "bottom");
// I2C to U2 (the charger's port): up from the rows south of U7.
t("I2C2_SDA", 0.2, [P(SDA2_X, SDA2_ROW), P(SDA2_X, W(16).y), W(16)]);
t("I2C2_SCL", 0.2, [P(SCL2_X, SCL2_ROW), P(SCL2_X, W(15).y), W(15)]);
// 5 V: from the south up to pin 9; its pad carries it on to the east.
t("V5", 0.4, [P(V5_X, V5_ROW), P(V5_X, W(9).y)]);
t("V5", 0.3, [P(V5_X, W(9).y), W(9)]);
// LED: pin 8 west, south, and down to the bottom east of the body.
const LED_VIA = P(43.2, 31.65);
t("LED_STAT", 0.2, [W(8), P(LED_X, W(8).y), P(LED_X, 31.3), LED_VIA]);
v("LED_STAT", LED_VIA.x, LED_VIA.y);
const LED_OUT = at(handoff("LED_STAT", "mcu", "input"));
const LED_VIA2 = P(LED_OUT.x, 34.0);
t("LED_STAT", 0.2, [LED_VIA, LED_VIA2], "bottom");
v("LED_STAT", LED_VIA2.x, LED_VIA2.y);
t("LED_STAT", 0.2, [LED_VIA2, LED_OUT]);
// Ground of pin 7 under the body.
t("GND", 0.3, [W(7), P(41.5, W(7).y)]);
v("GND", 41.5, W(7).y);

// --- East --------------------------------------------------------------------------
// SW1_IN: pin 10 to R19 (pull-up) and JP7.
t("SW1_IN", 0.2, [
  W(10),
  P(44.0, W(10).y),
  P(44.0, pad("R19", 2).y),
  pad("R19", 2),
]);
t("SW1_IN", 0.2, [pad("R19", 2), pad("JP7", 1)]);
t("GND", 0.3, [pad("JP7", 2), P(46.65, 21.6), pad("C33", 2)]);
v("GND", 46.65, 21.6);
// 5 V: pin 9, C22, C21, D5 (cathode); up to R19.
t("V5", 0.3, [W(9), P(pad("D5", 1).x, W(9).y)]);
t("V5", 0.3, [P(46.15, W(9).y), pad("R19", 1)]);
// Ground of pin 7 and the decoupling.
t("GND", 0.3, [W(7), P(47.6, W(7).y)]);
v("GND", 47.6, W(7).y);
// 12 V sense: down between the pads of R8, west to pin 6 between the pads of D5.
const V12_X = 51.45;
t("V12_SENSE", 0.2, [
  at(handoff("V12_SENSE", "input", "mcu")),
  P(V12_X, 20.75),
  P(V12_X, W(6).y),
  W(6),
]);
t("V12_SENSE", 0.2, [P(V12_X, 22.5), P(48.9, 22.5)]);
t("V12_SENSE", 0.2, [
  pad("C33", 1),
  P(48.9, pad("C33", 1).y),
  P(48.9, pad("R33", 1).y),
  pad("R33", 1),
]);
t("GND", 0.3, [pad("R33", 2), P(pad("R33", 2).x, 24.35)]);
v("GND", pad("R33", 2).x, 24.35);
// VBUS1 from the anode area of D1 to R8.
t("VBUS1", 0.3, [at(handoff("VBUS1", "input", "mcu")), pad("R8", 1)]);
// EN_3V3: R8 down the east edge to its via; R38 and D5 (anode) join it there.
// The ground on the bottom passes east-west under the VIN band between the
// lines that cross it (input.tsx): a groove at y 27.9..28.8 and the pocket of
// C5's ground vias between EN_3V3 and Q2_G. The vias stay out of both: EN_12V
// north of the groove, EN_3V3 and Q2_G on the edges of the pocket.
const EN3_X = 52.75;
const EN3_VIA = P(51.9, at(handoff("EN_3V3", "mcu", "input")).y);
t("EN_3V3", 0.2, [
  pad("R8", 2),
  P(EN3_X, pad("R8", 2).y),
  P(EN3_X, EN3_VIA.y),
  EN3_VIA,
]);
t("EN_3V3", 0.2, [
  pad("R38", 2),
  P(pad("R38", 2).x, 29.3),
  P(51.7, 29.3),
  EN3_VIA,
]);
v("EN_3V3", EN3_VIA.x, EN3_VIA.y);
t("EN_3V3", 0.2, [EN3_VIA, at(handoff("EN_3V3", "mcu", "input"))], "bottom");
t("EN_MCU", 0.2, [W(3), pad("R38", 1)]);
// EN_12V: pin 5 east between the pads of D5, north past the end of the 12 V
// sense line to its via.
const EN12_VIA = P(52.1, 26.9);
t("EN_12V", 0.2, [W(5), P(EN12_VIA.x, W(5).y), EN12_VIA]);
v("EN_12V", EN12_VIA.x, EN12_VIA.y);
t("EN_12V", 0.2, [EN12_VIA, at(handoff("EN_12V", "mcu", "input"))], "bottom");
// SW12_ON: pin 2 to R34; Q2_G on to its via.
t("SW12_ON", 0.2, [W(2), P(pad("R34", 1).x, W(2).y), pad("R34", 1)]);
const Q2G_VIA = P(51.9, at(handoff("Q2_G", "mcu", "input")).y);
t("Q2_G", 0.2, [pad("R34", 2), P(51.5, pad("R34", 2).y), Q2G_VIA]);
v("Q2_G", Q2G_VIA.x, Q2G_VIA.y);
t("Q2_G", 0.2, [Q2G_VIA, at(handoff("Q2_G", "mcu", "input"))], "bottom");
// VIN_SENSE: pin 1 south-east to C25, R24 and R23.
const VINS_Y = 31.65;
t("VIN_SENSE", 0.2, [
  W(1),
  P(44.2, 31.2),
  P(44.4, VINS_Y),
  P(pad("R23", 2).x, VINS_Y),
  pad("R23", 2),
]);
t("VIN_SENSE", 0.2, [P(pad("C25", 1).x, VINS_Y), pad("C25", 1)]);
t("VIN_SENSE", 0.2, [P(pad("R24", 1).x, VINS_Y), pad("R24", 1)]);
t("GND", 0.3, [pad("R24", 2), P(49.4, pad("R24", 2).y)]);
v("GND", 49.4, pad("R24", 2).y);
t("GND", 0.3, [pad("C25", 2), P(43.0, pad("C25", 2).y)]);
v("GND", 43.0, pad("C25", 2).y);
// VIN: from the band to R23, and west along the far edge of the block to U6.
const VIN_IN = at(handoff("VIN", "input", "mcu"));
const VIN_ROW = 34.0;
t("VIN", 0.3, [VIN_IN, P(52.4, VIN_IN.y), pad("R23", 1)]);
t("VIN", 0.3, [
  P(52.4, VIN_IN.y),
  P(52.4, 33.25),
  P(50.4, 33.25),
  P(50.0, VIN_ROW),
  P(36.0, VIN_ROW),
]);

// --- West: the lines from the ports ---------------------------------------------------
// From the edge of pdPc (x 17.6) the order is CC2, CC1, SDA1, SCL1, VBUS1; at
// U7 it is SDA1, SCL1, CC2, CC1, VBUS1_SENSE. The two CC lines cross under the
// I2C lines once, on the bottom, right at the edge. The I2C lines to U2 come
// up from pdCharger, run south of the others over U6 and enter U7 from below.
const HOP_CC2 = [P(19.6, 25.0), P(21.6, 26.6)] as const;
const HOP_CC1 = [P(18.0, 25.45), P(20.3, 27.45)] as const;
/** Rows west of U7, north to south. */
const Y = {
  SDA1: 25.4,
  SCL1: 25.85,
  CC2: 26.6,
  CC1: 27.45,
  VB: 28.3,
  SDA2: 29.15,
  SCL2: 29.6,
};
/** Near U7 the CC2 row passes north of R26; the I2C1 rows move up with it. */
const BUMP = { SDA1: 25.15, SCL1: 25.6, CC2: 26.1 };
const CC1_GAP = 27.55;

t("J1_CC2", 0.2, [
  at(handoff("J1_CC2", "pdPc", "mcu")),
  P(18.6, 24.7),
  HOP_CC2[0],
]);
v("J1_CC2", HOP_CC2[0].x, HOP_CC2[0].y);
t("J1_CC2", 0.2, [HOP_CC2[0], HOP_CC2[1]], "bottom");
v("J1_CC2", HOP_CC2[1].x, HOP_CC2[1].y);
t("J1_CC2", 0.2, [HOP_CC2[1], pad("R22", 1)]);
t("J1_CC1", 0.2, [at(handoff("J1_CC1", "pdPc", "mcu")), HOP_CC1[0]]);
v("J1_CC1", HOP_CC1[0].x, HOP_CC1[0].y);
t(
  "J1_CC1",
  0.2,
  [HOP_CC1[0], P(18.0, 26.9), P(18.55, Y.CC1), HOP_CC1[1]],
  "bottom",
);
v("J1_CC1", HOP_CC1[1].x, HOP_CC1[1].y);
t("J1_CC1", 0.2, [HOP_CC1[1], pad("R21", 1)]);
// I2C to U1 (the PC's port): up at 45 degrees over the CC hops.
const SDA1_IN = at(handoff("I2C1_SDA", "pdPc", "mcu"));
const SCL1_IN = at(handoff("I2C1_SCL", "pdPc", "mcu"));
const fan = (net: Net, w: number, pin: number, row: number, bump: number) => {
  const p = W(pin);
  t(net, w, [
    p,
    P(36.0, p.y),
    P(36.0 - Math.abs(bump - p.y), bump),
    P(26.9, bump),
    P(26.9 - Math.abs(row - bump), row),
  ]);
};
t("I2C1_SDA", 0.15, [
  SDA1_IN,
  P(18.0, SDA1_IN.y),
  P(18.0 + SDA1_IN.y - Y.SDA1, Y.SDA1),
  P(26.9 - (Y.SDA1 - BUMP.SDA1), Y.SDA1),
]);
fan("I2C1_SDA", 0.15, 11, Y.SDA1, BUMP.SDA1);
t("I2C1_SCL", 0.15, [
  SCL1_IN,
  P(18.0, SCL1_IN.y),
  P(18.0 + SCL1_IN.y - Y.SCL1, Y.SCL1),
  P(26.9 - (Y.SCL1 - BUMP.SCL1), Y.SCL1),
]);
fan("I2C1_SCL", 0.15, 12, Y.SCL1, BUMP.SCL1);
// VBUS1 from the PC's port to R25 (VBUS1_SENSE divider).
const VB_IN = at(handoff("VBUS1", "pdPc", "mcu"));
t("VBUS1", 0.3, [VB_IN, P(VB_IN.x + (VB_IN.y - Y.VB), Y.VB), pad("R25", 1)]);
// CC2_SENSE: R22 east, up past R26, to pin 14 with C24 next to it.
t("CC2_SENSE", 0.2, [
  pad("R22", 2),
  P(27.2, Y.CC2),
  P(27.7, BUMP.CC2),
  P(31.0, BUMP.CC2),
  P(31.0 + Math.abs(W(14).y - BUMP.CC2), W(14).y),
  W(14),
]);
t("GND", 0.3, [pad("C24", 2), P(pad("C24", 2).x, 29.2)]);
v("GND", pad("C24", 2).x, 29.2);
// CC1_SENSE: R21 east between the pads of R26, down past C26 to pin 19, C23 next to it.
const CC1_DOWN = 30.94;
const VB_DOWN = 30.59;
t("CC1_SENSE", 0.2, [
  pad("R21", 2),
  P(27.6, CC1_GAP),
  P(CC1_DOWN, CC1_GAP),
  P(CC1_DOWN, W(19).y - 0.05),
  P(pad("C26", 1).x, W(19).y - 0.05),
  P(pad("C23", 1).x, W(19).y),
  W(19),
]);
t("GND", 0.3, [pad("C23", 2), P(pad("C23", 2).x, 27.75)]);
v("GND", pad("C23", 2).x, 27.75);
// VBUS1_SENSE: R25, R26 and down to pin 20 through C26.
t("VBUS1_SENSE", 0.2, [
  pad("R25", 2),
  pad("R26", 1),
  P(VB_DOWN, Y.VB),
  P(VB_DOWN, W(20).y),
  W(20),
]);
t("GND", 0.3, [pad("R26", 2), P(29.55, pad("R26", 2).y)]);
v("GND", 29.55, pad("R26", 2).y);
t("GND", 0.3, [pad("C26", 2), P(pad("C26", 2).x, 28.4)]);
v("GND", pad("C26", 2).x, 28.4);
// I2C to U2: up from the edge of pdCharger, over U6, down to the rows south of U7.
const SDA2_IN = at(handoff("I2C2_SDA", "pdCharger", "mcu"));
const SCL2_IN = at(handoff("I2C2_SCL", "pdCharger", "mcu"));
// Straight up past VBUS1 (which climbs away at 45 degrees) and C6, over the
// tab of U6, east to the rows south of U7. 0.15 wide past C6.
const SDA2_DROP = 30.265;
const SCL2_DROP = 29.965;
t("I2C2_SDA", 0.2, [SDA2_IN, P(SDA2_IN.x, 34.1)]);
t("I2C2_SDA", 0.15, [
  P(SDA2_IN.x, 34.1),
  P(SDA2_IN.x, Y.SDA2),
  P(SDA2_DROP, Y.SDA2),
  P(SDA2_DROP, SDA2_ROW),
  P(SDA2_X, SDA2_ROW),
]);
t("I2C2_SCL", 0.2, [SCL2_IN, P(SCL2_IN.x, 34.1)]);
t("I2C2_SCL", 0.15, [
  P(SCL2_IN.x, 34.1),
  P(SCL2_IN.x, Y.SCL2),
  P(SCL2_DROP, Y.SCL2),
  P(SCL2_DROP, SCL2_ROW),
  P(SCL2_X, SCL2_ROW),
]);

// --- U6: 5 V regulator ---------------------------------------------------------------
// VOUT (pin 3) east past C7, down to the row that feeds the body; from that
// row a hop on the bottom under the lines to the ports takes 5 V to TP4.
// (J4 took 5 V from here too until the card got its own regulator, U9.)
const V5_DOWN_X = 29.54;
t("V5", 0.5, [pad("U6", 3), P(pad("C7", 1).x, pad("U6", 3).y), pad("C7", 1)]);
t("V5", 0.4, [
  P(pad("C7", 1).x, pad("U6", 3).y),
  P(V5_DOWN_X, pad("U6", 3).y),
  P(V5_DOWN_X, V5_ROW),
  P(V5_X, V5_ROW),
]);
t("GND", 0.3, [pad("C7", 2), P(27.5, pad("C7", 2).y)]);
v("GND", 27.5, pad("C7", 2).y);
const V5_HOP_LOW = P(34.0, V5_ROW);
const V5_HOP_HIGH = P(34.6, 24.0);
v("V5", V5_HOP_LOW.x, V5_HOP_LOW.y);
t("V5", 0.5, [V5_HOP_LOW, V5_HOP_HIGH], "bottom");
v("V5", V5_HOP_HIGH.x, V5_HOP_HIGH.y);
t("V5", 0.3, [V5_HOP_HIGH, pad("TP4", 1)]);
// VIN under U6 to the tab; ground of pin 1 under the body.
t("VIN", 0.3, [P(36.0, VIN_ROW), P(23.0, VIN_ROW), P(23.0, 32.6)]);
t("VIN", 0.3, [pad("C6", 1), P(22.0, pad("C6", 1).y)]);
t("GND", 0.3, [pad("C6", 2), P(21.35, 33.55)]);
v("GND", 21.35, 33.55);
t("GND", 0.3, [pad("U6", 1), P(24.855, pad("U6", 1).y)]);
v("GND", 24.855, 33.35);

// --- Status LED, south of the VBUS2 area ------------------------------------------------
const LED_IN = at(handoff("LED_STAT", "input", "mcu"));
t("LED_STAT", 0.2, [LED_IN, P(pad("R20", 1).x, LED_IN.y), pad("R20", 1)]);
t("LED5_A", 0.2, [pad("R20", 2), pad("LED5", 1)]);
t("GND", 0.3, [pad("LED5", 2), P(46.2, pad("LED5", 2).y)]);
v("GND", 46.2, pad("LED5", 2).y);
t("GND", 0.3, [pad("TP5", 1), P(38.6, 40.5)]);
v("GND", 38.6, 40.5);

export const MCU_COPPER = { tracks, vias };

export const McuRouting = () => (
  <>
    {tracks.map((s) => (
      <Track
        key={`${s.net}${s.layer}${s.points.map((p) => `${p.x},${p.y}`).join(" ")}`}
        {...s}
      />
    ))}
    {vias.map((s) => (
      <Via key={`${s.net}${s.at.x},${s.at.y}`} {...s} />
    ))}
  </>
);
