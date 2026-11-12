// Copper of the block "pdCharger": USB-C to the charger, PD (J2, U2, bleeder).
// Design coordinates, Track / Via / Pour from ./kit (docs/routing.md).
//
// J2 carries no data, so only CC1, CC2 and the two VBUS contacts leave its
// row (east). The north VBUS contact joins the south one through a bridge on
// the bottom under the contact row; from the south contact VBUS2 runs as one
// area under U2, R4 and C3 and down the west of the bleeder to the far side,
// where the trunk takes it east (trunks.tsx). U2's I2C leaves east on the
// top without crossing VBUS2.
import { type Point, Pour, Track, VIA, Vias, handoff, pad } from "./kit";

const OUT = 7.1;
const row = (pin: string) => pad("J2", pin).y;

const SDA = handoff("I2C2_SDA", "pdCharger", "mcu");
const SCL = handoff("I2C2_SCL", "pdCharger", "mcu");
const VBUS2_END = handoff("VBUS2", "pdCharger", "input");
/** Where VBUS2 comes down to the far side, west of the bleeder. */
const DOWN_EAST = 11.6;
const STRIP = {
  y0: VBUS2_END.y - VBUS2_END.width / 2,
  y1: VBUS2_END.y + VBUS2_END.width / 2,
};

const NORTH_VIAS: Point[] = [
  { x: 7.75, y: row("A4B9") },
  { x: 8.15, y: 33.05 },
];
const SOUTH_VIAS: Point[] = [
  { x: 7.75, y: 38.6 },
  { x: 8.55, y: 38.6 },
];
const BRIDGE_X = 6.3;
/** West of U2: CC2 goes up to pin 7, the VBUS feed to pin 8 east of it. */
const CC2_X = 8.95;
const FEED_X = 9.45;

export const PdChargerRouting = () => (
  <>
    {/* VBUS2: south contact -> under U2 (VHV, C3) -> R30 and R41 -> down to the far side. */}
    <Pour
      net="VBUS2"
      layer="top"
      outline={[
        { x: 7.0, y: 38.3 },
        { x: 10.6, y: 38.3 },
        { x: 10.6, y: 39.82 },
        { x: 15.52, y: 39.82 },
        { x: 15.52, y: 37.75 },
        { x: VBUS2_END.x - 0.3, y: 37.75 },
        // Over the top pads of R30 and R41.
        { x: VBUS2_END.x - 0.3, y: 41.0 },
        { x: DOWN_EAST, y: 41.0 },
        { x: DOWN_EAST, y: STRIP.y0 },
        { x: VBUS2_END.x - 0.3, y: STRIP.y0 },
        { x: VBUS2_END.x - 0.3, y: STRIP.y1 },
        { x: 8.15, y: STRIP.y1 },
        { x: 8.15, y: 38.88 },
        { x: 7.0, y: 38.88 },
      ]}
    />
    {/* North VBUS contact: down through two vias, south under the contact row. */}
    <Track
      net="VBUS2"
      width={0.6}
      layer="top"
      points={[{ x: 7.0, y: row("A4B9") }, ...NORTH_VIAS]}
    />
    <Vias net="VBUS2" at={[...NORTH_VIAS, ...SOUTH_VIAS]} {...VIA.signal} />
    <Track
      net="VBUS2"
      width={0.7}
      layer="bottom"
      points={[
        NORTH_VIAS[1] as Point,
        NORTH_VIAS[0] as Point,
        { x: BRIDGE_X, y: row("A4B9") },
        { x: BRIDGE_X, y: (SOUTH_VIAS[0] as Point).y },
        SOUTH_VIAS[1] as Point,
      ]}
    />
    {/* U2 VBUS (pin 8), from the area. */}
    <Track
      net="VBUS2"
      width={0.3}
      layer="top"
      points={[
        { x: FEED_X, y: 38.4 },
        { x: FEED_X, y: pad("U2", 8).y },
        pad("U2", 8),
      ]}
    />

    {/* Ground of the contact row: two vias per pad, clear of the shell. */}
    <Track
      net="GND"
      width={0.3}
      layer="top"
      points={[
        { x: OUT, y: row("A1B12") },
        { x: 7.45, y: 32.35 },
        { x: 7.45, y: 31.55 },
      ]}
    />
    <Vias
      net="GND"
      at={[
        { x: 7.45, y: 32.35 },
        { x: 7.45, y: 31.55 },
      ]}
      {...VIA.signal}
    />
    <Track
      net="GND"
      width={0.3}
      layer="top"
      points={[
        { x: OUT, y: row("B1A12") },
        { x: 7.6, y: 39.9 },
        { x: 7.6, y: 40.7 },
      ]}
    />
    <Vias
      net="GND"
      at={[
        { x: 7.6, y: 39.9 },
        { x: 7.6, y: 40.7 },
      ]}
      {...VIA.signal}
    />

    {/* CC: the IC's pins are swapped so that the two lines do not cross. */}
    <Track
      net="J2_CC1"
      width={0.2}
      layer="top"
      points={[
        { x: OUT, y: row("A5") },
        { x: 7.6, y: row("A5") },
        { x: 7.6 + (row("A5") - pad("U2", 6).y), y: pad("U2", 6).y },
        pad("U2", 6),
      ]}
    />
    <Track
      net="J2_CC2"
      width={0.2}
      layer="top"
      points={[
        { x: OUT, y: row("B5") },
        { x: CC2_X, y: row("B5") },
        { x: CC2_X, y: pad("U2", 7).y },
        pad("U2", 7),
      ]}
    />

    {/* I2C: east to the microcontroller. */}
    <Track
      net="I2C2_SDA"
      width={0.2}
      layer="top"
      points={[{ x: 17.35, y: pad("U2", 3).y }, SDA]}
    />
    <Track
      net="I2C2_SCL"
      width={0.2}
      layer="top"
      points={[{ x: 17.35, y: pad("U2", 2).y }, SCL]}
    />

    {/* CFG1 down the inside of the west row to R4; R4 and C3 to ground through the EP. */}
    <Track
      net="CFG1_U2"
      width={0.2}
      layer="top"
      points={[
        { x: 11.35, y: pad("U2", 9).y },
        { x: 11.95, y: pad("U2", 9).y },
        { x: 11.95, y: 38.5 },
        pad("R4", 1),
      ]}
    />
    <Track
      net="GND"
      width={0.3}
      layer="top"
      points={[pad("R4", 2), { x: pad("R4", 2).x, y: 37.0 }]}
    />
    <Track
      net="GND"
      width={0.3}
      layer="top"
      points={[pad("C3", 2), { x: 14.5, y: 38.5 }, { x: 14.5, y: 37.0 }]}
    />
    <Vias
      net="GND"
      at={[
        { x: 13.75, y: 37.65 },
        { x: 13.75, y: 38.45 },
      ]}
      {...VIA.signal}
    />
    {/* The EP's vias sit just south of it (no via in a pad). */}
    <Track
      net="GND"
      width={0.3}
      layer="top"
      points={[
        { x: 13.75, y: 37.0 },
        { x: 13.75, y: 38.45 },
      ]}
    />

    {/* Bleeder: R30 / R41 from VBUS2 (the area covers their north pads), R31 / R42 to ground. */}
    {[
      ["R30", "R31"],
      ["R41", "R42"],
    ].map(([top, bottom]) => (
      <Track
        key={top}
        net="BLD2"
        width={0.3}
        layer="top"
        points={[pad(top as string, 2), pad(bottom as string, 1)]}
      />
    ))}
    <Track
      net="BLD2"
      width={0.3}
      layer="top"
      points={[pad("R30", 2), pad("R41", 2)]}
    />
    {[pad("R31", 2), pad("R42", 2)].map((p) => (
      <Track
        key={p.x}
        net="GND"
        width={0.3}
        layer="top"
        points={[p, { x: p.x, y: 48.2 }]}
      />
    ))}
    <Vias
      net="GND"
      at={[pad("R31", 2), pad("R42", 2)].map((p) => ({ x: p.x, y: 48.2 }))}
      {...VIA.signal}
    />
  </>
);
