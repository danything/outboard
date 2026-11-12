// Copper of the block "mcu": the microcontroller (U7) with its sense lines,
// the two 5 V regulators (U6 for U7, U9 for the card's VBUS) and the parts
// next to the VIN band (mcuN: R8, C33, R33).
// Design coordinates, Track / Via / Pour from ./kit (docs/routing.md).
//
// U7 sits in the pocket south of the hub and J6. Its west pins take the
// lines from the ports, which come down the west edge of the pocket; the I2C
// lines to U2 come from further south, run under U7 and up into their pins
// between the two rows of pads. Its east pins send the lines to the
// converters up to a band (y 31.95..33.35) that runs east to mcuN, where
// they meet the vias that cross under the VIN band (input.tsx). 5 V comes up
// under the body from U6 (south-east); the LED line goes down under the body
// to the far edge.
//
// Short hops on the bottom: the two CC lines under the I2C lines at the edge
// of pdPc, 5 V to D5 under the lines going up to the band, the LED under
// 5 V and under VBUS2, SWIO from under U7 to J5, VIN from the band south of
// D2, and VBUS of the card from JP3 to J6 (usb.tsx).
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
/** A hop on the bottom between two vias. */
const hop = (net: Net, width: number, points: Point[]) => {
  const a = points[0] as Point;
  const b = points[points.length - 1] as Point;
  v(net, a.x, a.y);
  v(net, b.x, b.y);
  t(net, width, points, "bottom");
};

// --- U7 pins -------------------------------------------------------------------
const W = (pin: number) => pad("U7", pin);
/** Inner and outer ends of a pad (pads are 1.742 long, along x). */
const inner = (pin: number): Point =>
  P(W(pin).x + (pin > 10 ? 0.87 : -0.87), W(pin).y);
const outer = (pin: number): Point =>
  P(W(pin).x + (pin > 10 ? -0.87 : 0.87), W(pin).y);

// Lanes under the body (x 28.5..32.5), west to east.
const PERST_X = 28.9;
const SDA2_X = 29.55;
const SCL2_X = 30.0;
const V5_X = 31.2;
const LED_X = 31.8;

// --- West: the lines from the ports ----------------------------------------------
// Entering at x 17.6 (north to south): CC2, CC1, SDA1, SCL1, VBUS1. They go
// south side by side; the two CC lines cross under the I2C lines on the
// bottom, so that south of the crossing the order is SDA1, SCL1, CC2, CC1,
// VBUS1, which is the order of their pins on U7 (11, 12, 14, 19, 20).
const X = { VB: 17.75, CC1: 18.35, CC2: 19.05, SCL1: 19.575, SDA1: 19.875 };
const ROW = { SDA1: 33.0, SCL1: 33.4, CC2: 33.8, CC1: 34.2, VB: 34.6 };
const CC2_IN = at(handoff("J1_CC2", "pdPc", "mcu"));
const CC1_IN = at(handoff("J1_CC1", "pdPc", "mcu"));
const SDA1_IN = at(handoff("I2C1_SDA", "pdPc", "mcu"));
const SCL1_IN = at(handoff("I2C1_SCL", "pdPc", "mcu"));
const VB_IN = at(handoff("VBUS1", "pdPc", "mcu"));

t("J1_CC2", 0.2, [CC2_IN, P(X.CC2, CC2_IN.y), P(X.CC2, 27.25)]);
hop("J1_CC2", 0.2, [P(X.CC2, 27.25), P(X.CC2, 29.35)]);
t("J1_CC2", 0.2, [
  P(X.CC2, 29.35),
  P(X.CC2, ROW.CC2),
  P(pad("R22", 1).x, ROW.CC2),
  pad("R22", 1),
]);
t("J1_CC1", 0.2, [CC1_IN, P(X.CC1, CC1_IN.y), P(X.CC1, 26.9)]);
hop("J1_CC1", 0.2, [P(X.CC1, 26.9), P(X.CC1, 29.7)]);
t("J1_CC1", 0.2, [
  P(X.CC1, 29.7),
  P(X.CC1, ROW.CC1),
  P(pad("R21", 1).x, ROW.CC1),
  pad("R21", 1),
]);
const SDA1_X = 26.2;
const SCL1_X = 25.8;
t("I2C1_SDA", 0.15, [
  SDA1_IN,
  P(X.SDA1, SDA1_IN.y),
  P(X.SDA1, ROW.SDA1),
  P(SDA1_X, ROW.SDA1),
  P(SDA1_X, W(11).y),
  outer(11),
]);
t("I2C1_SCL", 0.15, [
  SCL1_IN,
  P(X.SCL1, SCL1_IN.y),
  P(X.SCL1, ROW.SCL1),
  P(SCL1_X, ROW.SCL1),
  P(SCL1_X, W(12).y),
  outer(12),
]);
t("VBUS1", 0.3, [
  VB_IN,
  P(X.VB, VB_IN.y),
  P(X.VB, ROW.VB),
  P(pad("R25", 1).x, ROW.VB),
  pad("R25", 1),
]);
// CC2_SENSE: R22 to C24 and pin 14.
t("CC2_SENSE", 0.2, [
  pad("R22", 2),
  P(22.6, 38.55),
  pad("C24", 1),
  P(24.2, W(14).y),
  outer(14),
]);
t("GND", 0.3, [pad("C24", 2), P(pad("C24", 2).x, 36.8)]);
v("GND", pad("C24", 2).x, 36.8);
// CC1_SENSE: R21 to C23 and pin 19.
t("CC1_SENSE", 0.2, [
  pad("R21", 2),
  P(22.1, 41.65),
  P(22.1, pad("C23", 1).y),
  pad("C23", 1),
  P(24.1, W(19).y),
  outer(19),
]);
t("GND", 0.3, [pad("C23", 2), P(pad("C23", 2).x, 40.0)]);
v("GND", pad("C23", 2).x, 40.0);
// VBUS1_SENSE: R25 east to pin 20, with R26 and C26 hanging off it.
t("VBUS1_SENSE", 0.2, [pad("R25", 2), P(pad("R25", 2).x, W(20).y), outer(20)]);
t("VBUS1_SENSE", 0.2, [P(pad("R26", 1).x, W(20).y), pad("R26", 1)]);
t("VBUS1_SENSE", 0.2, [P(pad("C26", 1).x, W(20).y), pad("C26", 1)]);
for (const ref of ["R26", "C26"]) {
  const g = pad(ref, 2);
  t("GND", 0.3, [g, P(g.x, 46.3)]);
  v("GND", g.x, 46.3);
}

// --- I2C to U2: down the west edge, under U7, up into pins 16 and 15 -------------
const SDA2_IN = at(handoff("I2C2_SDA", "pdCharger", "mcu"));
const SCL2_IN = at(handoff("I2C2_SCL", "pdCharger", "mcu"));
t("I2C2_SDA", 0.2, [
  SDA2_IN,
  P(18.05, SDA2_IN.y),
  P(18.05, 47.0),
  P(SDA2_X, 47.0),
  P(SDA2_X, W(16).y),
  inner(16),
]);
t("I2C2_SCL", 0.2, [
  SCL2_IN,
  P(17.75, SCL2_IN.y),
  P(17.75, 47.5),
  P(SCL2_X, 47.5),
  P(SCL2_X, W(15).y),
  inner(15),
]);

// --- PERST#, the mode input, SWIO --------------------------------------------------
t("PERST_MCU", 0.2, [inner(13), P(PERST_X, W(13).y), pad("R37", 1)]);
// SW1_IN: pin 10 north to R19 (pull-up to 5 V) and JP7 (to ground).
t("SW1_IN", 0.2, [
  outer(10),
  P(33.25, 36.6),
  pad("R19", 2),
  pad("JP7", 1),
]);
t("GND", 0.3, [pad("JP7", 2), P(pad("JP7", 2).x, 34.15)]);
v("GND", pad("JP7", 2).x, 34.15);
// SWIO: under the body to the bottom, to J5.
hop("SWIO", 0.2, [P(28.95, W(18).y), pad("J5", 1)]);
vias.pop(); // J5 is a plated hole: the bottom track ends on it.
t("SWIO", 0.2, [inner(18), P(28.95, W(18).y)]);
t("GND", 0.3, [pad("J5", 2), P(pad("J5", 2).x, 48.9)]);
v("GND", pad("J5", 2).x, 48.9);
// Ground of pin 7, east of the pad.
t("GND", 0.3, [outer(7), P(35.9, W(7).y)]);
v("GND", 35.9, W(7).y);

// --- East: up to the band ----------------------------------------------------------
// Risers, west to east, and the rows of the band, north to south.
const BAND = { PERST: 31.95, V12: 32.3, EN12: 32.65, EN3: 33.0, Q2G: 33.35 };
const RISE = { V12: 36.6, EN12: 37.05, EN3: 39.45, Q2G: 39.95 };
// The lanes in mcuN, and the vias that cross under the VIN band.
const LANE = { PERST: 47.2, V12: 47.6, EN12: 48.0, EN3: 51.0, Q2G: 51.6 };
const VIA_EN12 = P(52.0, 26.05);
const VIA_EN3 = P(52.55, at(handoff("EN_3V3", "mcu", "input")).y);
const VIA_Q2G = P(52.55, at(handoff("Q2_G", "mcu", "input")).y);
const PERST_OUT = at(handoff("PERST_N", "mcu", "slot"));

t("PERST_N", 0.2, [
  pad("R37", 2),
  P(PERST_X, BAND.PERST),
  P(LANE.PERST, BAND.PERST),
  P(LANE.PERST, PERST_OUT.y),
  PERST_OUT,
]);
t("V12_SENSE", 0.2, [
  outer(6),
  P(RISE.V12, W(6).y),
  P(RISE.V12, BAND.V12),
  P(LANE.V12, BAND.V12),
  P(LANE.V12, pad("C33", 1).y),
  pad("C33", 1),
]);
t("V12_SENSE", 0.2, [P(LANE.V12, pad("R33", 1).y), pad("R33", 1)]);
t("EN_12V", 0.2, [
  outer(5),
  P(RISE.EN12, W(5).y),
  P(RISE.EN12, BAND.EN12),
  P(LANE.EN12, BAND.EN12),
  P(LANE.EN12, VIA_EN12.y),
  VIA_EN12,
]);
v("EN_12V", VIA_EN12.x, VIA_EN12.y);
t(
  "EN_12V",
  0.2,
  [VIA_EN12, at(handoff("EN_12V", "mcu", "input"))],
  "bottom",
);
// EN_MCU through R38 to EN_3V3; D5 (from 5 V) joins it.
t("EN_MCU", 0.2, [outer(3), pad("R38", 1)]);
t("EN_3V3", 0.2, [
  pad("R38", 2),
  P(RISE.EN3, pad("R38", 2).y),
  P(RISE.EN3, BAND.EN3),
  P(LANE.EN3, BAND.EN3),
  P(LANE.EN3, VIA_EN3.y),
  VIA_EN3,
]);
t("EN_3V3", 0.2, [pad("D5", 2), P(RISE.EN3, pad("D5", 2).y)]);
v("EN_3V3", VIA_EN3.x, VIA_EN3.y);
t(
  "EN_3V3",
  0.2,
  [VIA_EN3, at(handoff("EN_3V3", "mcu", "input"))],
  "bottom",
);
// SW12_ON through R34 to Q2_G.
t("SW12_ON", 0.2, [
  outer(2),
  P(36.4, W(2).y),
  P(36.4, pad("R34", 1).y),
  pad("R34", 1),
]);
t("Q2_G", 0.2, [
  pad("R34", 2),
  P(RISE.Q2G, pad("R34", 2).y),
  P(RISE.Q2G, BAND.Q2G),
  P(LANE.Q2G, BAND.Q2G),
  P(LANE.Q2G, VIA_Q2G.y),
  VIA_Q2G,
]);
v("Q2_G", VIA_Q2G.x, VIA_Q2G.y);
t("Q2_G", 0.2, [VIA_Q2G, at(handoff("Q2_G", "mcu", "input"))], "bottom");

// --- mcuN: the 12 V sense divider and the pull-up of EN_3V3 ------------------------
const V12_X = 51.45;
t("V12_SENSE", 0.2, [
  at(handoff("V12_SENSE", "input", "mcu")),
  P(V12_X, 20.75),
  P(V12_X, 22.4),
  P(pad("C33", 1).x, 22.4),
  pad("C33", 1),
]);
t("GND", 0.3, [pad("C33", 2), pad("R33", 2)]);
t("GND", 0.3, [P(pad("C33", 2).x, 24.05), P(51.5, 24.05)]);
v("GND", 51.5, 24.05);
t("VBUS1", 0.3, [at(handoff("VBUS1", "input", "mcu")), pad("R8", 1)]);
t("EN_3V3", 0.2, [
  pad("R8", 2),
  P(52.75, pad("R8", 2).y),
  P(52.75, VIA_EN3.y),
  VIA_EN3,
]);

// --- VIN sense ---------------------------------------------------------------------
// Down between R24 and C25 to R23, both of them joined on the way.
const VINS_X = 34.65;
t("VIN_SENSE", 0.2, [
  outer(1),
  P(VINS_X, W(1).y),
  P(VINS_X, 47.7),
  pad("R23", 2),
]);
t("VIN_SENSE", 0.2, [P(VINS_X, pad("R24", 1).y), pad("R24", 1)]);
t("VIN_SENSE", 0.2, [P(VINS_X, pad("C25", 1).y), pad("C25", 1)]);
t("GND", 0.3, [pad("R24", 2), P(pad("R24", 2).x, 47.3)]);
v("GND", pad("R24", 2).x, 47.3);
t("GND", 0.3, [pad("C25", 2), P(36.4, pad("C25", 2).y)]);
v("GND", 36.4, pad("C25", 2).y);

// --- VIN, the two regulators -------------------------------------------------------
const VIN_IN = at(handoff("VIN", "input", "mcu"));
const VIN_A = P(52.8, VIN_IN.y);
const VIN_B = P(47.1, VIN_IN.y);
v("VIN", VIN_A.x, VIN_A.y);
v("VIN", VIN_B.x, VIN_B.y);
t("VIN", 0.5, [VIN_A, VIN_B], "bottom");
t("VIN", 0.5, [VIN_B, pad("C37", 1)]);
t("VIN", 0.5, [pad("C37", 1), P(pad("C37", 1).x, 41.6)]);
t("VIN", 0.5, [pad("C37", 1), P(pad("C37", 1).x, 48.0)]);
t("VIN", 0.4, [P(40.6, 47.9), pad("C6", 1), pad("R23", 1)]);
t("GND", 0.3, [pad("C37", 2), P(pad("C37", 2).x, 46.1)]);
v("GND", pad("C37", 2).x, 46.1);
t("GND", 0.3, [pad("U9", 1), P(46.6, pad("U9", 1).y)]);
v("GND", 46.6, pad("U9", 1).y);
t("GND", 0.3, [pad("U6", 1), P(46.3, 49.2)]);
v("GND", 46.3, 49.2);
t("GND", 0.3, [pad("C6", 2), P(37.85, pad("C6", 2).y)]);
v("GND", 37.85, pad("C6", 2).y);

// The card's VBUS: U9 -> C38 -> JP3 -> on the bottom to J6 (usb.tsx).
t("V5_USB", 0.5, [
  pad("U9", 3),
  P(44.6, pad("U9", 3).y),
  pad("C38", 1),
  P(pad("C38", 1).x, pad("JP3", 1).y),
  pad("JP3", 1),
]);
t("GND", 0.3, [pad("C38", 2), P(pad("C38", 2).x, 38.9)]);
v("GND", pad("C38", 2).x, 38.9);
const VBUS_OUT = at(handoff("USBH_VBUS", "mcu", "usb"));
const VBUS_VIA = P(VBUS_OUT.x, pad("JP3", 2).y);
t("USBH_VBUS", 0.5, [pad("JP3", 2), VBUS_VIA]);
v("USBH_VBUS", VBUS_VIA.x, VBUS_VIA.y);
t("USBH_VBUS", 0.5, [VBUS_VIA, VBUS_OUT], "bottom");

// 5 V: U6 east and south round itself, west along y 50.95 to the lane under
// U7 and up to pin 9. Its pad carries it on to a via, a hop to D5, and R19.
const V5_ROW = 50.95;
t("V5", 0.4, [
  pad("U6", 3),
  P(47.05, pad("U6", 3).y),
  P(47.05, V5_ROW),
  P(V5_X, V5_ROW),
]);
t("V5", 0.3, [P(V5_X, V5_ROW), P(V5_X, W(9).y), inner(9)]);
for (const ref of ["C7", "C21", "C22"])
  t("V5", 0.3, [P(pad(ref, 1).x, V5_ROW), pad(ref, 1)]);
t("V5", 0.3, [P(pad("TP4", 1).x, V5_ROW), pad("TP4", 1)]);
const V5_VIA = P(34.85, W(9).y);
t("V5", 0.3, [outer(9), V5_VIA, P(V5_VIA.x, pad("R19", 1).y), pad("R19", 1)]);
v("V5", V5_VIA.x, V5_VIA.y);
const V5_D5 = P(37.6, 36.6);
v("V5", V5_D5.x, V5_D5.y);
t("V5", 0.3, [V5_VIA, V5_D5], "bottom");
t("V5", 0.3, [V5_D5, pad("D5", 1)]);
for (const ref of ["C21", "C22"]) {
  const g = pad(ref, 2);
  t("GND", 0.3, [g, P(g.x, 49.0)]);
  v("GND", g.x, 49.0);
}
t("GND", 0.3, [pad("C7", 2), P(43.25, pad("C7", 2).y)]);
v("GND", 43.25, pad("C7", 2).y);

// --- Status LED, on the far edge ---------------------------------------------------
const LED_A = P(LED_X, 50.2);
const LED_B = P(32.3, 51.6);
t("LED_STAT", 0.2, [inner(8), P(LED_X, W(8).y), LED_A]);
hop("LED_STAT", 0.2, [LED_A, LED_B]);
t("LED_STAT", 0.2, [LED_B, pad("R20", 1)]);
const LED5_A = P(30.2, 53.15);
const LED5_B = P(31.8, 57.7);
t("LED5_A", 0.2, [pad("R20", 2), P(LED5_A.x, pad("R20", 2).y), LED5_A]);
hop("LED5_A", 0.2, [LED5_A, LED5_B]);
t("LED5_A", 0.2, [LED5_B, pad("LED5", 1)]);
t("GND", 0.3, [pad("LED5", 2), P(34.4, pad("LED5", 2).y)]);
v("GND", 34.4, pad("LED5", 2).y);
t("GND", 0.3, [pad("TP5", 1), P(pad("TP5", 1).x, 49.9)]);
v("GND", pad("TP5", 1).x, 49.9);

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
