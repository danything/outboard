// Copper of the block "pdPc": USB-C to the PC, PD (J1, U1, U5, bleeder).
// Design coordinates, Track / Via / Pour from ./kit (docs/routing.md).
//
// J1's contact row runs north to south: GND, VBUS, -, CC1, D-, D+, D-, D+,
// -, CC2, VBUS, GND. Everything leaves the row to the east, so:
// - VBUS: the north pad opens into the VBUS1 area, which runs east to the
//   usb block between the bleeder and U5. The south pad joins it through a
//   bridge on the bottom under the contact row (no data track above it there).
// - USB: the flipped pair is joined with one bridge (A6 under A7), which
//   leaves D- north and D+ south. The pair passes through U5, whose IO pads
//   face the edge, and leaves on the pads' rows.
// - CC1 is the only line that has to cross the pair: it dives once, at
//   right angles, under D-, D+ and CC2 (docs/routing.md, 2 layers).
// - CC2 and the local VBUS feed run south along the west side of U1; CC1
//   and CC2 reach the microcontroller along the north side of U1, I2C and
//   the VBUS sense straight east from U1.
import { type Point, Pour, Track, VIA, Via, Vias, handoff, pad } from "./kit";

const EDGE_X = handoff("VBUS1", "pdPc", "usb").x;

// Ends on the east edge, towards usb and mcu. Proposed to the HANDOFFS
// (they are not in the table yet): replace with handoff() once they are.
const EDGE = {
  USB_DN: { x: EDGE_X, y: pad("U5", 3).y },
  USB_DP: { x: EDGE_X, y: pad("U5", 1).y },
  J1_CC2: { x: EDGE_X, y: 24.7 },
  J1_CC1: { x: EDGE_X, y: 25.1 },
  SDA: { x: EDGE_X, y: pad("U1", 3).y },
  SCL: { x: EDGE_X, y: pad("U1", 2).y },
  VBUS_SENSE: { x: EDGE_X, y: pad("U1", 1).y },
};

/** Where a track leaves a contact of J1: inside the pad, east of the shell legs. */
const OUT = 7.1;
const row = (pin: string) => pad("J1", pin).y;

const length = (points: Point[]): number =>
  points
    .slice(1)
    .reduce(
      (sum, p, i) =>
        sum +
        Math.hypot(p.x - (points[i] as Point).x, p.y - (points[i] as Point).y),
      0,
    );

// --- USB pair ---------------------------------------------------------------

/** Lane of D- along the north of U5, and of D+ along the south (symmetric about U5). */
const U5_Y = pad("U5", 2).y;
const DN_LANE = 18.78;
const DP_LANE = 2 * U5_Y - DN_LANE;
/** Corridor between the two pad columns of U5. */
const U5_GAP_X = (pad("U5", 4).x + pad("U5", 3).x) / 2;

const V1: Point = { x: 7.95, y: 19.69 };
const V2: Point = { x: 7.95, y: 20.85 };

const dpPath: Point[] = [
  pad("J1", "B6"),
  { x: OUT, y: row("B6") },
  { x: 7.6, y: row("B6") },
  { x: 7.7, y: V2.y },
  { x: 11.5, y: V2.y },
  { x: 11.5 + (DP_LANE - V2.y), y: DP_LANE },
  { x: U5_GAP_X, y: DP_LANE },
  { x: U5_GAP_X, y: pad("U5", 1).y },
  EDGE.USB_DP,
];

const dnHead: Point[] = [
  pad("J1", "B7"),
  { x: OUT, y: row("B7") },
  { x: 7.45, y: row("B7") },
  { x: 7.45 + (row("B7") - DN_LANE), y: DN_LANE },
];
const dnTail: Point[] = [
  { x: U5_GAP_X, y: DN_LANE },
  { x: U5_GAP_X, y: pad("U5", 3).y },
  EDGE.USB_DN,
];

/**
 * D- runs straighter than D+; a 45 degree bump to the south between the CC1
 * bridge and U5 makes the outer contacts (B7, B6) equally far from the edge.
 */
const dnPath = (): Point[] => {
  const short = length(dpPath) - length([...dnHead, ...dnTail]);
  const h = Math.max(0, short / (2 * (Math.SQRT2 - 1)));
  const x0 = 11.8;
  return [
    ...dnHead,
    { x: x0, y: DN_LANE },
    { x: x0 + h, y: DN_LANE + h },
    { x: x0 + h + 0.4, y: DN_LANE + h },
    { x: x0 + 2 * h + 0.4, y: DN_LANE },
    ...dnTail,
  ];
};

// --- VBUS bridge under the contact row ----------------------------------------

const BRIDGE_X = 6.1;
const NORTH_VIAS: Point[] = [
  { x: 7.65, y: 17.65 },
  { x: 8.45, y: 17.65 },
];
const SOUTH_VIAS: Point[] = [
  { x: 7.75, y: 22.45 },
  { x: 8.55, y: 22.45 },
];
/** VBUS1 on the west of U1, and the loop under R1 and C1 to VHV. */
const FEED_X = 8.55;
const LOOP_Y = 32.27;

// --- CC1 bridge -------------------------------------------------------------

const CC1_X = pad("U1", 6).x;
const CC1_NORTH: Point = { x: CC1_X, y: 18.2 };
const CC1_SOUTH: Point = { x: CC1_X, y: 22.35 };
const CC2_X = 9.3;
const CC2_LANE = CC1_SOUTH.y;

const DN = dnPath();

export const PdPcRouting = () => {
  const dn = DN;
  return (
    <>
      {/* VBUS1: from the north contact east to the usb block, and up to R28 and R39. */}
      <Pour
        net="VBUS1"
        layer="top"
        outline={[
          { x: 7.0, y: 17.32 },
          { x: 8.1, y: 17.32 },
          { x: 8.1, y: 13.1 },
          { x: 9.5, y: 13.1 },
          { x: 9.5, y: 8.8 },
          { x: 10.9, y: 8.8 },
          { x: 10.9, y: 13.1 },
          { x: EDGE_X, y: 13.1 },
          { x: EDGE_X, y: 18.46 },
          { x: 11.3, y: 18.46 },
          { x: 11.15, y: 18.0 },
          { x: 11.05, y: 17.65 },
          { x: 9.95, y: 17.65 },
          { x: 9.85, y: 18.03 },
          { x: 7.9, y: 18.03 },
          { x: 7.9, y: 17.88 },
          { x: 7.0, y: 17.88 },
        ]}
      />
      {/* South VBUS contact: down through two vias, north under the contact row, up again. */}
      <Track
        net="VBUS1"
        width={0.6}
        layer="top"
        points={[
          { x: 7.0, y: row("B4A9") },
          { x: 8.55, y: row("B4A9") },
        ]}
      />
      <Vias net="VBUS1" at={[...NORTH_VIAS, ...SOUTH_VIAS]} {...VIA.signal} />
      <Track
        net="VBUS1"
        width={0.6}
        layer="bottom"
        points={[
          SOUTH_VIAS[1] as Point,
          { x: BRIDGE_X, y: (SOUTH_VIAS[1] as Point).y },
          { x: BRIDGE_X, y: (NORTH_VIAS[1] as Point).y },
          NORTH_VIAS[1] as Point,
        ]}
      />
      {/* U1: VBUS (pin 8) from the west, VHV (pin 1) round R1 and C1. */}
      <Track
        net="VBUS1"
        width={0.4}
        layer="top"
        points={[
          { x: FEED_X, y: row("B4A9") },
          { x: FEED_X, y: LOOP_Y },
          { x: pad("C1", 1).x, y: LOOP_Y },
          { x: pad("C1", 1).x, y: pad("U1", 1).y },
        ]}
      />
      <Track
        net="VBUS1"
        width={0.4}
        layer="top"
        points={[{ x: FEED_X, y: pad("U1", 8).y }, pad("U1", 8)]}
      />
      <Track
        net="VBUS1"
        width={0.3}
        layer="top"
        points={[{ x: 17.0, y: EDGE.VBUS_SENSE.y }, EDGE.VBUS_SENSE]}
      />

      {/* Ground of the contact row: two vias per pad, clear of the shell. */}
      <Track
        net="GND"
        width={0.3}
        layer="top"
        points={[
          { x: OUT, y: row("A1B12") },
          { x: 7.55, y: 16.35 },
          { x: 7.55, y: 15.55 },
        ]}
      />
      <Vias
        net="GND"
        at={[
          { x: 7.55, y: 16.35 },
          { x: 7.55, y: 15.55 },
        ]}
        {...VIA.signal}
      />
      <Track
        net="GND"
        width={0.3}
        layer="top"
        points={[
          { x: OUT, y: row("B1A12") },
          { x: 7.45, y: 23.95 },
          { x: 7.45, y: 24.8 },
        ]}
      />
      <Vias
        net="GND"
        at={[
          { x: 7.45, y: 23.95 },
          { x: 7.45, y: 24.8 },
        ]}
        {...VIA.signal}
      />

      {/* USB D+: A6 dives under A7 and comes up on the line from B6. */}
      <Track
        net="USB_DP"
        width={0.2}
        layer="top"
        points={[{ x: OUT, y: row("A6") }, V1]}
      />
      <Vias net="USB_DP" at={[V1, V2]} {...VIA.signal} />
      <Track net="USB_DP" width={0.2} layer="bottom" points={[V1, V2]} />
      <Track net="USB_DP" width={0.2} layer="top" points={dpPath.slice(1)} />
      {/* USB D-: B7 is the lane; A7 joins it once A6 has gone down. */}
      <Track net="USB_DN" width={0.2} layer="top" points={dn.slice(1)} />
      <Track
        net="USB_DN"
        width={0.2}
        layer="top"
        points={[
          { x: OUT, y: row("A7") },
          { x: 8.6, y: row("A7") },
          { x: 8.6, y: DN_LANE },
        ]}
      />
      {/* U5 ground, between the pair inside the corridor. */}
      <Via net="GND" at={{ x: U5_GAP_X, y: U5_Y }} {...VIA.signal} />
      <Track
        net="GND"
        width={0.3}
        layer="top"
        points={[pad("U5", 2), { x: U5_GAP_X, y: U5_Y }]}
      />

      {/* CC1: east above the pair, under D-, D+ and CC2 on the bottom, down to U1 pin 6. */}
      <Track
        net="J1_CC1"
        width={0.2}
        layer="top"
        points={[
          { x: OUT, y: row("A5") },
          { x: 7.4, y: row("A5") },
          { x: 7.8, y: 18.35 },
          { x: CC1_X, y: 18.35 },
          CC1_NORTH,
        ]}
      />
      <Vias net="J1_CC1" at={[CC1_NORTH, CC1_SOUTH]} {...VIA.signal} />
      <Track
        net="J1_CC1"
        width={0.2}
        layer="bottom"
        points={[CC1_NORTH, CC1_SOUTH]}
      />
      <Track
        net="J1_CC1"
        width={0.2}
        layer="top"
        points={[CC1_SOUTH, pad("U1", 6)]}
      />
      <Track
        net="J1_CC1"
        width={0.2}
        layer="top"
        points={[{ x: CC1_X, y: EDGE.J1_CC1.y }, EDGE.J1_CC1]}
      />
      {/* CC2: south to U1 pin 7, and east under U5 to the microcontroller. */}
      <Track
        net="J1_CC2"
        width={0.2}
        layer="top"
        points={[
          { x: OUT, y: row("B5") },
          { x: CC2_X, y: row("B5") },
          { x: CC2_X, y: pad("U1", 7).y },
          pad("U1", 7),
        ]}
      />
      <Track
        net="J1_CC2"
        width={0.2}
        layer="top"
        points={[
          { x: CC2_X, y: row("B5") },
          { x: 10.9, y: row("B5") },
          { x: 10.9 + (CC2_LANE - row("B5")), y: CC2_LANE },
          { x: 17.3, y: CC2_LANE },
          { x: 17.3, y: EDGE.J1_CC2.y },
          EDGE.J1_CC2,
        ]}
      />

      {/* U1: I2C straight east, CFG1 down the inside of the west row to R1, EP to ground. */}
      <Track
        net="I2C1_SDA"
        width={0.2}
        layer="top"
        points={[{ x: 17.0, y: EDGE.SDA.y }, EDGE.SDA]}
      />
      <Track
        net="I2C1_SCL"
        width={0.2}
        layer="top"
        points={[{ x: 17.0, y: EDGE.SCL.y }, EDGE.SCL]}
      />
      <Track
        net="CFG1_U1"
        width={0.2}
        layer="top"
        points={[
          { x: 11.15, y: pad("U1", 9).y },
          { x: 11.75, y: pad("U1", 9).y },
          { x: 11.75, y: 30.9 },
          pad("R1", 1),
        ]}
      />
      <Vias
        net="GND"
        at={[
          { x: 13.0, y: 30.1 },
          { x: 14.0, y: 30.1 },
        ]}
        {...VIA.signal}
      />
      {/* The EP's vias sit just south of it (no via in a pad). */}
      <Track
        net="GND"
        width={0.3}
        layer="top"
        points={[
          { x: 13.5, y: 29.3 },
          { x: 13.5, y: 30.1 },
        ]}
      />
      <Track
        net="GND"
        width={0.3}
        layer="top"
        points={[
          { x: 13.0, y: 30.1 },
          { x: 14.0, y: 30.1 },
        ]}
      />
      <Track
        net="GND"
        width={0.3}
        layer="top"
        points={[pad("R1", 2), pad("C1", 2)]}
      />
      <Track
        net="GND"
        width={0.3}
        layer="top"
        points={[
          { x: 14.48, y: pad("R1", 2).y },
          { x: 14.48, y: 30.75 },
        ]}
      />
      <Via net="GND" at={{ x: 14.48, y: 30.75 }} {...VIA.signal} />

      {/* Bleeder: R28 / R39 from VBUS1, R29 / R40 to ground, the middle joined. */}
      <Track
        net="BLD1"
        width={0.3}
        layer="top"
        points={[pad("R28", 2), pad("R29", 1)]}
      />
      <Track
        net="BLD1"
        width={0.3}
        layer="top"
        points={[pad("R39", 2), pad("R40", 1)]}
      />
      <Track
        net="BLD1"
        width={0.3}
        layer="top"
        points={[
          { x: 13.35, y: pad("R28", 2).y },
          { x: 13.35, y: pad("R39", 2).y },
        ]}
      />
      <Track
        net="GND"
        width={0.3}
        layer="top"
        points={[pad("R29", 2), pad("R40", 2)]}
      />
      <Via
        net="GND"
        at={{ x: pad("R29", 2).x, y: (pad("R29", 2).y + pad("R40", 2).y) / 2 }}
        {...VIA.signal}
      />

      {/* Shell: the four legs joined (SHIELD1), to ground through R3 and C2. */}
      <Track
        net="SHIELD1"
        width={0.3}
        layer="top"
        points={[pad("J1", "SH3"), pad("J1", "SH4")]}
      />
      <Track
        net="SHIELD1"
        width={0.3}
        layer="top"
        points={[pad("J1", "SH3"), pad("J1", "SH2")]}
      />
      <Track
        net="SHIELD1"
        width={0.3}
        layer="top"
        points={[
          pad("J1", "SH4"),
          { x: 4.0, y: 16.6 },
          { x: 4.0, y: 23.4 },
          pad("J1", "SH1"),
        ]}
      />
      <Track
        net="SHIELD1"
        width={0.3}
        layer="top"
        points={[
          pad("J1", "SH3"),
          { x: pad("J1", "SH3").x, y: 14.2 },
          pad("R3", 1),
          pad("C2", 1),
        ]}
      />
      <Track
        net="GND"
        width={0.3}
        layer="top"
        points={[pad("C2", 2), pad("R3", 2)]}
      />
      <Track
        net="GND"
        width={0.3}
        layer="top"
        points={[
          { x: 4.52, y: 11.95 },
          { x: 5.45, y: 11.95 },
        ]}
      />
      <Via net="GND" at={{ x: 5.45, y: 11.95 }} {...VIA.signal} />
    </>
  );
};
