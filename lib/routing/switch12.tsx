// Copper of the block "switch12": 12 V switch, PTC, over-voltage cut-off (Q1..Q4, F1).
// Design coordinates, Track / Via / Pour from ./kit (docs/routing.md).
//
// North part: V12_BOOST comes up from the boost under Q1, the drain (V12_SW)
// leaves north to the row along the card side, and the row runs west through
// F1 and the jumpers to the slot. The gate network of Q1 sits east of it.
//
// South part, between the boost and the VIN strip: Q2_G runs east from Q4
// through the middle (y 36.3), with the over-voltage chain north of it and
// D7, R16 south of it. OVP_Z is the one line that has to cross it.
import { type Point, Track, VIA, Via, handoff, pad } from "./kit";

// --- Handoffs ---------------------------------------------------------------------

const V12_BOOST_IN = handoff("V12_BOOST", "boost", "switch12");
const V12_OUT = handoff("V12", "switch12", "slot");
const V12_SENSE_OUT = handoff("V12_SENSE", "switch12", "input");
const VIN_IN = handoff("VIN", "input", "switch12");
const V3V3_IN = handoff("V3V3", "buck", "switch12");
const EN_3V3_IN = handoff("EN_3V3", "boost", "switch12");
const EN_3V3_OUT = handoff("EN_3V3", "switch12", "buck");
const Q2_G_IN = handoff("Q2_G", "input", "switch12");
const Q2_D_OUT = handoff("Q2_D", "switch12", "boost");
const Q2_D_IN = handoff("Q2_D", "boost", "switch12");

// --- Widths -----------------------------------------------------------------------

/** The 12 V path (0.5 A): 1 mm where there is room, 0.8 mm (checks/rules.ts) where there is not. */
const POWER = 1.0;
const POWER_NARROW = 0.8;
const GATE = 0.25;
const SIGNAL = 0.2;
const GROUND = 0.3;

// --- North: Q1 and its gate network -----------------------------------------------

const Q1 = { G: pad("Q1", 1), S: pad("Q1", 2), D: pad("Q1", 3) };

/** Q1_G runs along this line between the drain and the source of Q1, east to R14, C20 and R15. */
const Q1_G_Y = 19.6;
/** Column of the gate resistors and C20 (their Q1_G pads). */
const Q1_G_X = pad("R14", 1).x;
/** Column east of R14 and C20 that takes V12_BOOST to them. */
const GATE_RC_X = 82.45;
/** V12_BOOST to R14 and C20 leaves the source south of the gate pad. */
const GATE_RC_Y = 21.6;
/** V12_SW from C32 joins the row west of Q1. */
const C32_LINK_X = 73.6;

/** Q2_D hops under V12_BOOST and Q1_G (HANDOFFS): from the boost's side to R15. */
const Q2_D_HOP_SOUTH: Point = { x: 79.45, y: Q2_D_IN.y };
const Q2_D_HOP_NORTH: Point = { x: 82.75, y: 16.5 };

const North = () => (
  <>
    {/*
      V12_BOOST: from the boost's handoff (y 21.75, clear of the ground pad of
      C19) to the source, short and 0.8 mm (the pad is 0.8).
    */}
    <Track
      net="V12_BOOST"
      width={POWER_NARROW}
      layer="top"
      points={[
        V12_BOOST_IN,
        { x: 78.1, y: V12_BOOST_IN.y },
        { x: Q1.S.x, y: 21.3 },
        Q1.S,
      ]}
    />
    {/* V12_BOOST to R14 and C20 (no load current): south of the gate, east, then north. */}
    <Track
      net="V12_BOOST"
      width={0.3}
      layer="top"
      points={[
        { x: Q1.S.x, y: GATE_RC_Y },
        { x: GATE_RC_X, y: GATE_RC_Y },
        { x: GATE_RC_X, y: pad("R14", 2).y },
        pad("R14", 2),
      ]}
    />
    <Track
      net="V12_BOOST"
      width={0.3}
      layer="top"
      points={[{ x: GATE_RC_X, y: pad("C20", 2).y }, pad("C20", 2)]}
    />
    {/* Q1_G: gate north between drain and source, east to the column of R15, R14 and C20; west to C32. */}
    <Track
      net="Q1_G"
      width={GATE}
      layer="top"
      points={[Q1.G, { x: Q1.G.x, y: Q1_G_Y }, { x: Q1_G_X, y: Q1_G_Y }]}
    />
    <Track
      net="Q1_G"
      width={GATE}
      layer="top"
      points={[pad("R15", 1), { x: Q1_G_X, y: pad("C20", 1).y }, pad("C20", 1)]}
    />
    <Track
      net="Q1_G"
      width={GATE}
      layer="top"
      points={[
        { x: Q1.G.x, y: Q1_G_Y },
        { x: 75.5, y: Q1_G_Y },
        { x: 75.5, y: pad("C32", 1).y },
        pad("C32", 1),
      ]}
    />
    {/* Q2_D: up from the boost's line, under V12_BOOST and Q1_G on the bottom (6.7 mm), up to R15. */}
    <Track
      net="Q2_D"
      width={SIGNAL}
      layer="top"
      points={[Q2_D_IN, Q2_D_HOP_SOUTH]}
    />
    <Via net="Q2_D" at={Q2_D_HOP_SOUTH} {...VIA.signal} />
    <Track
      net="Q2_D"
      width={SIGNAL}
      layer="bottom"
      points={[Q2_D_HOP_SOUTH, Q2_D_HOP_NORTH]}
    />
    <Via net="Q2_D" at={Q2_D_HOP_NORTH} {...VIA.signal} />
    <Track
      net="Q2_D"
      width={SIGNAL}
      layer="top"
      points={[Q2_D_HOP_NORTH, pad("R15", 2)]}
    />
    {/* V12_SW: the drain north to the row and west to F1, 1 mm all the way. */}
    <Track
      net="V12_SW"
      width={POWER}
      layer="top"
      points={[Q1.D, { x: Q1.D.x, y: pad("F1", 1).y }, pad("F1", 1)]}
    />
    {/* C32 (gate to drain) joins the row west of Q1, clear of its own gate pad. */}
    <Track
      net="V12_SW"
      width={0.4}
      layer="top"
      points={[
        pad("C32", 2),
        { x: C32_LINK_X, y: pad("C32", 2).y },
        { x: C32_LINK_X, y: pad("F1", 1).y },
      ]}
    />
  </>
);

// --- The row: F1, JP6 and JP2, R32, on to the slot -------------------------------------

/**
 * Along the row the pads alternate V12_F (F1, JP6.1), V12 (JP6.2), V12_F
 * (JP2.1), V12 (JP2.2), and JP2 has through holes, so neither layer can pass
 * it inside the row. V12_F takes the bottom from a via between F1 and JP6 to
 * the hole of JP2.1 (under JP6 only); V12 goes round JP2.1 on top, south of
 * it, just outside the row (y 16.9 to 17.7, where the boost has no parts).
 */
const V12_F_VIA: Point = {
  x: (pad("F1", 2).x + pad("JP6", 1).x) / 2,
  y: pad("F1", 2).y,
};
const AROUND_JP2_Y = 17.3;
/** V12 runs west along this line, north of R32, to the slot's leg. */
const V12_ROW_Y = 14.7;

const Row = () => (
  <>
    <Track
      net="V12_F"
      width={POWER}
      layer="top"
      points={[pad("F1", 2), pad("JP6", 1)]}
    />
    <Via net="V12_F" at={V12_F_VIA} {...VIA.power} />
    <Track
      net="V12_F"
      width={POWER_NARROW}
      layer="bottom"
      points={[V12_F_VIA, pad("JP2", 1)]}
    />
    {/* JP6 is closed by a copper bridge of its own (not drawn here); the tracks stop at its pads. */}
    <Track
      net="V12"
      width={POWER_NARROW}
      layer="top"
      points={[
        pad("JP6", 2),
        { x: pad("JP6", 2).x, y: AROUND_JP2_Y },
        { x: 60, y: AROUND_JP2_Y },
        pad("JP2", 2),
      ]}
    />
    {/* West of JP2: north of R32 and of V12_SENSE, then up into the slot's leg (x 47.0 to 48.6), clear of the PERST# via at x 49.15. */}
    <Track
      net="V12"
      width={POWER}
      layer="top"
      points={[
        pad("JP2", 2),
        { x: 57.8, y: V12_ROW_Y },
        { x: 47.8, y: V12_ROW_Y },
        { x: 47.8, y: V12_OUT.y },
      ]}
    />
    <Track
      net="V12"
      width={0.4}
      layer="top"
      points={[pad("R32", 1), { x: pad("R32", 1).x, y: V12_ROW_Y }]}
    />
    <Track
      net="V12_SENSE"
      width={SIGNAL}
      layer="top"
      points={[
        pad("R32", 2),
        { x: V12_SENSE_OUT.x + 1, y: pad("R32", 2).y },
        V12_SENSE_OUT,
      ]}
    />
  </>
);

// --- South: gate drive and over-voltage cut-off ---------------------------------------

/** Q2_G runs east along this line, between R35/R36 and D7. */
const Q2_G_Y = 36.3;
/** Q2_G passes south of R16 to reach the gate of Q2 (its drain is in the way at y 36.3). */
const Q2_G_SOUTH_Y = 38.2;
/** OVP_B joins Q4's base to R35 north of R35 (its OVP_Z pad is in between). */
const OVP_B_Y = 34.72;
/** OVP_Z crosses under Q2_G: about 2 mm on the bottom. */
const OVP_Z_HOP_NORTH: Point = { x: 64.45, y: pad("R35", 1).y };
const OVP_Z_HOP_SOUTH: Point = { x: 63.5, y: pad("D7", 2).y };
/** The via of the Q2_G handoff (HANDOFFS note). */
const Q2_G_VIA: Point = { x: 59.4, y: Q2_G_IN.y };
/** Q2_D leaves Q2 north and hops under EN_3V3 into the boost (HANDOFFS note). */
const Q2_D_VIA: Point = { x: Q2_D_OUT.x, y: 34.95 };
/** Ground vias: R36 and R16 share one between them. */
const GND_R36_R16: Point = { x: pad("R36", 2).x, y: 36.41 };
const GND_Q4: Point = { x: 59.45, y: 37.9 };
const GND_Q3: Point = { x: 77.2, y: 34.95 };

const Q2 = { G: pad("Q2", 1), S: pad("Q2", 2), D: pad("Q2", 3) };
const Q3 = { G: pad("Q3", 1), S: pad("Q3", 2), D: pad("Q3", 3) };
const Q4 = { B: pad("Q4", 1), E: pad("Q4", 2), C: pad("Q4", 3) };

const South = () => (
  <>
    {/* Q2_G: up from the bottom west of Q4, between its B and E pads to the collector, east to R16 and round R16 to Q2. */}
    <Track
      net="Q2_G"
      width={SIGNAL}
      layer="bottom"
      points={[Q2_G_IN, Q2_G_VIA]}
    />
    <Via net="Q2_G" at={Q2_G_VIA} {...VIA.signal} />
    <Track
      net="Q2_G"
      width={SIGNAL}
      layer="top"
      points={[
        Q2_G_VIA,
        Q4.C,
        { x: Q4.C.x + 0.4, y: Q2_G_Y },
        { x: pad("R16", 1).x, y: Q2_G_Y },
        pad("R16", 1),
        { x: pad("R16", 1).x, y: Q2_G_SOUTH_Y },
        { x: Q2.G.x, y: Q2_G_SOUTH_Y },
        Q2.G,
      ]}
    />
    {/* Over-voltage: VIN to the cathode of D7. */}
    <Track net="VIN" width={0.3} layer="top" points={[VIN_IN, pad("D7", 1)]} />
    {/* OVP_Z: anode of D7 under Q2_G to R35. */}
    <Track
      net="OVP_Z"
      width={SIGNAL}
      layer="top"
      points={[pad("D7", 2), OVP_Z_HOP_SOUTH]}
    />
    <Via net="OVP_Z" at={OVP_Z_HOP_SOUTH} {...VIA.signal} />
    <Track
      net="OVP_Z"
      width={SIGNAL}
      layer="bottom"
      points={[OVP_Z_HOP_SOUTH, OVP_Z_HOP_NORTH]}
    />
    <Via net="OVP_Z" at={OVP_Z_HOP_NORTH} {...VIA.signal} />
    <Track
      net="OVP_Z"
      width={SIGNAL}
      layer="top"
      points={[OVP_Z_HOP_NORTH, pad("R35", 1)]}
    />
    {/* OVP_B: base of Q4 north of R35 to R35, on to R36. */}
    <Track
      net="OVP_B"
      width={SIGNAL}
      layer="top"
      points={[
        Q4.B,
        { x: Q4.B.x, y: OVP_B_Y },
        { x: pad("R35", 2).x, y: OVP_B_Y },
        pad("R35", 2),
        pad("R36", 1),
      ]}
    />
    {/* Q2_D: drain north, east to the via of the hop under EN_3V3. */}
    <Track
      net="Q2_D"
      width={SIGNAL}
      layer="top"
      points={[Q2.D, { x: Q2.D.x, y: Q2_D_VIA.y }, Q2_D_VIA]}
    />
    <Via net="Q2_D" at={Q2_D_VIA} {...VIA.signal} />
    <Track
      net="Q2_D"
      width={SIGNAL}
      layer="bottom"
      points={[Q2_D_VIA, Q2_D_OUT]}
    />
    <Track net="Q2_S" width={GATE} layer="top" points={[Q2.S, Q3.D]} />
    {/* Gate of Q3 from 3.3 V (the buck's hop under the VIN strip). */}
    <Track net="V3V3" width={0.3} layer="top" points={[V3V3_IN, Q3.G]} />
    {/* EN_3V3 only passes through the corner of the block. */}
    <Track
      net="EN_3V3"
      width={SIGNAL}
      layer="top"
      points={[EN_3V3_IN, EN_3V3_OUT]}
    />
    {/* Ground: a via next to each pad. */}
    <Track
      net="GND"
      width={GROUND}
      layer="top"
      points={[pad("R36", 2), pad("R16", 2)]}
    />
    <Via net="GND" at={GND_R36_R16} {...VIA.signal} />
    <Track net="GND" width={GROUND} layer="top" points={[Q4.E, GND_Q4]} />
    <Via net="GND" at={GND_Q4} {...VIA.signal} />
    <Track net="GND" width={GROUND} layer="top" points={[Q3.S, GND_Q3]} />
    <Via net="GND" at={GND_Q3} {...VIA.signal} />
  </>
);

export const Switch12Routing = () => (
  <>
    <North />
    <Row />
    <South />
  </>
);
