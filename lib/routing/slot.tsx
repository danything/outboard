// Copper of the block "slot": PCIe slot (J3 and the parts next to its contacts).
// Design coordinates, Track / Via / Pour from ./kit (docs/routing.md).
//
// J3 straddles the card-side edge: row B on top, row A on the bottom, pads
// from y = 1.4 to 5.0. Every track leaves its pad straight along the pad
// (south) and turns only beyond it, because the card is pushed in and
// pulled out against these pads.
//
// West to east: 12 V (contacts 1 to 3), 3.3 V (8 to 10), the key notch, and
// ground. The bottom is the ground layer, so the bottom copper is kept to
// the necks of row A, two short bars to their vias, and PERST#, which runs
// south from A11 next to the notch, under the 3.3 V row, and comes up at D6.
import { type Point, Pour, Track, VIA, Via, Vias, handoff, pad } from "./kit";

const J3 = (pin: string): Point => pad("J3", pin);

/** Width of the neck on a contact of J3: the width of the pad. */
const NECK = 0.7;
/** Ground vias of the contacts: one row, 0.6 mm clear of the pads. */
const GND_VIA_Y = 5.9;

/** A straight neck south from a contact to `y`. */
const Neck = ({
  net,
  pin,
  layer,
  y,
}: {
  net: "V12" | "V3V3";
  pin: string;
  layer: "top" | "bottom";
  y: number;
}) => (
  <Track
    net={net}
    width={NECK}
    layer={layer}
    points={[J3(pin), { x: J3(pin).x, y }]}
  />
);

// --- 12 V ----------------------------------------------------------------------

const V12_IN = handoff("V12", "switch12", "slot");

/** B1..B3 on top; A2 and A3 on the bottom, up through two vias. */
const V12 = () => (
  <>
    {/* Top: a block below the contacts, a column over C29, and the row with TP3, R18 and C30 down to the handoff. */}
    <Pour
      net="V12"
      layer="top"
      outline={[
        { x: 46.2, y: 6.2 },
        { x: 48.9, y: 6.2 },
        { x: 48.9, y: 8.4 },
        { x: 47.4, y: 8.4 },
        { x: 47.4, y: 11.6 },
        { x: 49.9, y: 11.6 },
        { x: 49.9, y: 9.8 },
        { x: 50.9, y: 9.8 },
        { x: 50.9, y: 13.3 },
        // A leg 1.6 mm wide down to the handoff, leaving room east of it for
        // PERST#, which comes up from the bottom at x 49.15 (the note of the PERST_N handoff).
        { x: V12_IN.x + 0.6, y: 13.3 },
        { x: V12_IN.x + 0.6, y: V12_IN.y },
        { x: V12_IN.x - 1, y: V12_IN.y },
        { x: V12_IN.x - 1, y: 13.3 },
        { x: 45.8, y: 13.3 },
        { x: 45.8, y: 8.4 },
        { x: 46.2, y: 8.4 },
      ]}
    />
    {["B1", "B2", "B3"].map((pin) => (
      <Neck key={pin} net="V12" pin={pin} layer="top" y={6.6} />
    ))}
    {/* Bottom: A2 and A3 down to a bar with the two vias. */}
    {["A2", "A3"].map((pin) => (
      <Neck key={pin} net="V12" pin={pin} layer="bottom" y={7.1} />
    ))}
    <Track
      net="V12"
      width={0.9}
      layer="bottom"
      points={[
        { x: J3("A2").x, y: 7.1 },
        { x: J3("A3").x, y: 7.1 },
      ]}
    />
    <Vias
      net="V12"
      at={[J3("A2").x, J3("A3").x].map((x) => ({ x, y: 7.1 }))}
      {...VIA.power}
    />
    {/* Ground of C29, and of C30 and R18. */}
    <Via net="GND" at={{ x: 48.6, y: 9.05 }} {...VIA.signal} />
    <Track
      net="GND"
      width={0.5}
      layer="top"
      points={[pad("C29", 2), { x: 48.6, y: 9.05 }]}
    />
    <Via net="GND" at={{ x: 51.9, y: 11.55 }} {...VIA.signal} />
    <Track
      net="GND"
      width={0.4}
      layer="top"
      points={[pad("C30", 2), { x: 51.9, y: 11.55 }, pad("R18", 2)]}
    />
  </>
);

// --- 3.3 V ---------------------------------------------------------------------

const V33_IN = handoff("V3V3", "buck", "slot");
/** The 3.3 V row that comes from the buck (y 9.2 to 11.6). */
const ROW = {
  top: V33_IN.y - V33_IN.width / 2 + 0.3,
  bottom: V33_IN.y + 1.2,
};

/**
 * The row stops short of the buck's pour, and a wide track joins the two:
 * KiCad rejects two pours of one net that share an edge (zones_intersect).
 */
const ROW_GAP = 0.3;

/** Vias that carry 3.3 V to row A: four, all within 6 mm of A9 (checks/rules.ts). */
const V33_VIAS: Point[] = [
  { x: 53.35, y: 7.9 },
  { x: 54.45, y: 7.9 },
  { x: 53.35, y: 8.95 },
  { x: 54.45, y: 8.95 },
];

/** Ground vias of the 3.3 V capacitors, just north of their pads. */
const C27_GND: Point = { x: pad("C27", 2).x, y: 9 };
const C28_GND: Point = { x: pad("C28", 2).x, y: 9.25 };

/**
 * The row ends in a column south of contacts 8 to 10. B8 takes a 0.7 mm neck
 * 2.4 mm long into it on top; A9 and A10 take 1.3 mm necks into a bottom bar
 * that drops to the four vias inside the column. The longer top neck makes up
 * for the vias, so the three contacts (1.1 A each) see about the same copper.
 */
const V33 = () => (
  <>
    <Pour
      net="V3V3"
      layer="top"
      outline={[
        // Column over the vias, up to the neck of B8, west of the 3.3 Vaux line.
        { x: 52.9, y: 7.3 },
        { x: 54.75, y: 7.3 },
        // South round JP4.2 (3.3 Vaux), 1.6 mm wide, and up to JP4.1.
        { x: 54.75, y: 11 },
        { x: 56.25, y: 11 },
        { x: 56.25, y: ROW.top },
        // East of the key notch the row widens north to y 6.6, so the
        // ground pads of C27 and C28 and their vias leave it wide enough.
        { x: 59.4, y: ROW.top },
        { x: 59.4, y: 6.6 },
        { x: 66.6, y: 6.6 },
        { x: 66.6, y: ROW.top },
        // The row east to the handoff, clear of the rear ear of J3 (y < 9).
        { x: V33_IN.x - ROW_GAP, y: ROW.top },
        { x: V33_IN.x - ROW_GAP, y: ROW.bottom },
        // Tab to the cathode of D6 and to R27.1.
        { x: 64.1, y: ROW.bottom },
        { x: 64.1, y: 13.3 },
        { x: 61.2, y: 13.3 },
        { x: 61.2, y: ROW.bottom },
        { x: 57.6, y: ROW.bottom },
        { x: 57.6, y: 12.6 },
        { x: 52.9, y: 12.6 },
      ]}
    />
    <Track
      net="V3V3"
      width={ROW.bottom - ROW.top}
      layer="top"
      points={[
        { x: V33_IN.x - 1, y: (ROW.top + ROW.bottom) / 2 },
        { x: V33_IN.x, y: (ROW.top + ROW.bottom) / 2 },
      ]}
    />
    <Neck net="V3V3" pin="B8" layer="top" y={7.4} />
    <Vias net="V3V3" at={V33_VIAS} {...VIA.power} />
    <Neck net="V3V3" pin="A9" layer="bottom" y={6.9} />
    <Neck net="V3V3" pin="A10" layer="bottom" y={6.9} />
    <Track
      net="V3V3"
      width={1.2}
      layer="bottom"
      points={[
        { x: J3("A10").x, y: 6.9 },
        { x: 53.9, y: 6.9 },
      ]}
    />
    <Track
      net="V3V3"
      width={1.6}
      layer="bottom"
      points={[
        { x: 53.9, y: 6.9 },
        { x: 53.9, y: 8.95 },
      ]}
    />
    {/* 3.3 Vaux: B10 straight to the jumper. The bridge of JP4 is not drawn here. */}
    <Track
      net="V3V3AUX"
      width={0.5}
      layer="top"
      points={[J3("B10"), pad("JP4", 2)]}
    />
    {/* Ground of C27 and C28: a via just north of each pad, inside the row. */}
    <Via net="GND" at={C27_GND} {...VIA.signal} />
    <Track
      net="GND"
      width={0.5}
      layer="top"
      points={[pad("C27", 2), C27_GND]}
    />
    <Via net="GND" at={C28_GND} {...VIA.signal} />
    <Track
      net="GND"
      width={0.5}
      layer="top"
      points={[pad("C28", 2), C28_GND]}
    />
  </>
);

// --- Ground contacts -------------------------------------------------------------

/** A ground contact straight south to its via. */
const GroundStub = ({
  pin,
  layer,
  width = 0.5,
}: {
  pin: string;
  layer: "top" | "bottom";
  width?: number;
}) => (
  <Track
    net="GND"
    width={width}
    layer={layer}
    points={[J3(pin), { x: J3(pin).x, y: GND_VIA_Y }]}
  />
);

/**
 * Each ground contact on top has a track to a via (B4/A4 and B18/A18 share
 * one). A12 and A15 sit in the bottom ground layer itself; their stubs only
 * keep the joint solid.
 */
const Ground = () => (
  <>
    {["B4", "B7", "B13", "B16", "B18"].map((pin) => (
      <GroundStub key={pin} pin={pin} layer="top" />
    ))}
    {["A4", "A15", "A18"].map((pin) => (
      <GroundStub key={pin} pin={pin} layer="bottom" />
    ))}
    {/* A12 is next to the key notch: narrower, 0.35 mm from the outline. */}
    <GroundStub pin="A12" layer="bottom" width={0.4} />
    <Vias
      net="GND"
      at={["B4", "B7", "B13", "B16", "B18"].map((pin) => ({
        x: J3(pin).x,
        y: GND_VIA_Y,
      }))}
      {...VIA.signal}
    />
  </>
);

// --- PERST# ----------------------------------------------------------------------

/** Where PERST# comes up to the top side, south of the 3.3 V copper. */
const PERST_VIA: Point = { x: J3("A11").x, y: 13.2 };
/** The line that joins D6, R27 and C31, south of their pads. */
const PERST_Y = 13.65;
/**
 * The line from the microcontroller comes up from the bottom here, east of
 * the 12 V leg (the note of the PERST_N handoff). Its via is the trunk's.
 */
const PERST_FROM_MCU_X = 49.15;

/**
 * Bottom only as far as the 3.3 V copper forces it (10 mm, 0.45 mm from the
 * key notch): crossing it on top would cut B8 and the vias off from the row.
 */
const Perst = () => (
  <>
    <Track
      net="PERST_N"
      width={0.2}
      layer="bottom"
      points={[J3("A11"), PERST_VIA]}
    />
    <Via net="PERST_N" at={PERST_VIA} {...VIA.signal} />
    <Track
      net="PERST_N"
      width={0.2}
      layer="top"
      points={[
        PERST_VIA,
        { x: pad("D6", 2).x, y: PERST_VIA.y },
        pad("D6", 2),
        { x: pad("D6", 2).x, y: PERST_Y },
        { x: pad("R27", 2).x, y: PERST_Y },
        pad("R27", 2),
        pad("C31", 1),
      ]}
    />
    {/* West along the same line to where the line from the microcontroller comes up. */}
    <Track
      net="PERST_N"
      width={0.2}
      layer="top"
      points={[
        { x: pad("D6", 2).x, y: PERST_Y },
        { x: PERST_FROM_MCU_X, y: PERST_Y },
      ]}
    />
    <Via net="GND" at={{ x: 70.5, y: 12.8 }} {...VIA.signal} />
    <Track
      net="GND"
      width={0.5}
      layer="top"
      points={[pad("C31", 2), { x: 70.5, y: 12.8 }]}
    />
  </>
);

export const SlotRouting = () => (
  <>
    <V12 />
    <V33 />
    <Ground />
    <Perst />
  </>
);
