// Copper of the block "buck": VIN -> 3.3 V (U3, L1 and their parts).
// Design coordinates, Track / Via / Pour from ./kit (docs/routing.md).
//
// U3 has RT, EN, VIN, GND on its south row and FB, SS, BST, SW on its north
// row. VIN and GND leave south as two areas side by side over C10, C8 and C9
// (the hot loop); SW leaves north to L1; the output runs north from L1 over
// C13 and C14 to JP5 and JP1. The small signals stay west of U3.
import { Pour, Track, VIA, Via, Vias, handoff, pad } from "./kit";

// Where the lines to the neighbours leave the block.
const EN_IN = handoff("EN_3V3", "switch12", "buck");
const V3V3_TO_Q3 = handoff("V3V3", "buck", "switch12");

// The two vias of the hop of 3.3 V under the VIN area.
const Q3_HOP_EAST = { x: 87.2, y: 38.65 };
const Q3_HOP_WEST = { x: 83.3, y: 38.25 };

const U3 = {
  EN: pad("U3", 2),
  VIN: pad("U3", 3),
  GND: pad("U3", 4),
  SW: pad("U3", 5),
  BST: pad("U3", 6),
  SS: pad("U3", 7),
  FB: pad("U3", 8),
};

export const BuckRouting = () => (
  <>
    {/* VIN: a neck as wide as the pad, then 1.8 mm over C10, C8, C9 down to the VIN strip (y = 38.6). */}
    <Pour
      net="VIN"
      layer="top"
      outline={[
        { x: 85.4, y: 30.45 },
        { x: 85.7, y: 30.45 },
        { x: 85.7, y: 38.6 },
        { x: 83.9, y: 38.6 },
        { x: 83.9, y: 31.75 },
        { x: 85.4, y: 31.75 },
      ]}
    />
    {/* GND of the hot loop, next to VIN, with its vias to the ground on the bottom. */}
    <Pour
      net="GND"
      layer="top"
      outline={[
        { x: 85.95, y: 30.45 },
        { x: 86.2, y: 30.45 },
        { x: 86.2, y: 31.2 },
        { x: 88.6, y: 31.2 },
        { x: 88.6, y: 38 },
        { x: 85.95, y: 38 },
      ]}
    />
    <Vias
      net="GND"
      at={[31.8, 32.8, 33.8, 34.8].map((y) => ({ x: 87.9, y }))}
      {...VIA.signal}
    />
    {/* SW: from the pad over C11 to L1, kept small. */}
    <Pour
      net="SW_3V3"
      layer="top"
      outline={[
        { x: 85.95, y: 29.3 },
        { x: 86.2, y: 29.3 },
        { x: 86.2, y: 28.3 },
        { x: 89, y: 28.3 },
        { x: 89, y: 26.45 },
        { x: 90.55, y: 26.45 },
        { x: 90.55, y: 24.1 },
        { x: 87.05, y: 24.1 },
        { x: 87.05, y: 26.9 },
        { x: 85.95, y: 26.9 },
      ]}
    />
    <Track
      net="BST_3V3"
      width={0.25}
      layer="top"
      points={[U3.BST, { x: 85.55, y: 28 }, pad("C11", 1)]}
    />
    {/* Output: L1 over C13 and C14 to JP5, and a 1.4 mm arm to JP1. */}
    <Pour
      net="V3V3_BUCK"
      layer="top"
      outline={[
        { x: 87.05, y: 20.4 },
        { x: 90.55, y: 20.4 },
        { x: 90.55, y: 18.05 },
        { x: 89, y: 18.05 },
        { x: 89, y: 12.95 },
        { x: 93.75, y: 12.95 },
        { x: 93.75, y: 11.55 },
        { x: 89.85, y: 11.55 },
        { x: 89.85, y: 11.05 },
        { x: 87.05, y: 11.05 },
      ]}
    />
    <Pour
      net="GND"
      layer="top"
      outline={[
        { x: 89.4, y: 13.2 },
        { x: 91.7, y: 13.2 },
        { x: 91.7, y: 17 },
        { x: 89.4, y: 17 },
      ]}
    />
    <Vias
      net="GND"
      at={[14.5, 15.4, 16.3].map((y) => ({ x: 91.3, y }))}
      {...VIA.signal}
    />
    {/* 3.3 V after the jumpers: the row that runs west to J3 (the slot takes over at x = 83). */}
    <Pour
      net="V3V3"
      layer="top"
      outline={[
        { x: 83, y: 9.2 },
        { x: 93.75, y: 9.2 },
        { x: 93.75, y: 11.3 },
        { x: 91.75, y: 11.3 },
        { x: 91.75, y: 10.75 },
        { x: 86.8, y: 10.75 },
        { x: 86.8, y: 11.6 },
        { x: 83, y: 11.6 },
      ]}
    />
    {/* Feedback: sensed at the output capacitors, away from SW and L1. */}
    <Track
      net="V3V3_BUCK"
      width={0.3}
      layer="top"
      points={[
        pad("R6", 1),
        { x: 80.3, y: 32.95 },
        { x: 80.3, y: 22.8 },
        { x: 84.5, y: 22.8 },
        { x: 84.5, y: 17 },
        { x: 87.6, y: 17 },
      ]}
    />
    <Track
      net="FB_3V3"
      width={0.2}
      layer="top"
      points={[U3.FB, { x: 81.5, y: 29.26 }, pad("R7", 1), pad("R6", 2)]}
    />
    <Track
      net="SS_3V3"
      width={0.2}
      layer="top"
      points={[U3.SS, { x: 85.05, y: 28.5 }, pad("C12", 1)]}
    />
    {/* EN: out between RT and the VIN area, then to R9 and C15 and on to the block edge. */}
    <Track
      net="EN_3V3"
      width={0.2}
      layer="top"
      points={[
        U3.EN,
        { x: 85.05, y: 31.45 },
        { x: 83.5, y: 31.45 },
        { x: 83.5, y: 34.5 },
        { x: EN_IN.x + 0.5, y: 34.5 },
        EN_IN,
      ]}
    />
    <Track
      net="EN_3V3"
      width={0.2}
      layer="top"
      points={[{ x: 80.65, y: 34.5 }, pad("R9", 1), pad("C15", 1)]}
    />
    {/* Ground of the small parts: short tracks to a via each. */}
    <Via net="GND" at={{ x: 82.25, y: 27.1 }} {...VIA.signal} />
    <Track
      net="GND"
      width={0.3}
      layer="top"
      points={[pad("C12", 2), { x: 82.25, y: 27.1 }]}
    />
    <Track
      net="GND"
      width={0.3}
      layer="top"
      points={[pad("R7", 2), { x: 81.4, y: 27.1 }, { x: 82.25, y: 27.1 }]}
    />
    <Via net="GND" at={{ x: 83, y: 36.5 }} {...VIA.signal} />
    <Track
      net="GND"
      width={0.3}
      layer="top"
      points={[pad("R9", 2), pad("C15", 2)]}
    />
    <Track
      net="GND"
      width={0.3}
      layer="top"
      points={[
        { x: 82.15, y: 36.5 },
        { x: 83, y: 36.5 },
      ]}
    />
    {/*
      3.3 V for the LED and for the gate of Q3: a thin line from the east end
      of the 3.3 V row, down the east side of the block, clear of SW and L1.
    */}
    <Track
      net="V3V3"
      width={0.3}
      layer="top"
      points={[
        { x: 93.3, y: 9.6 },
        { x: 94.2, y: 9.6 },
        { x: 94.2, y: 21 },
        { x: 92.4, y: 22.8 },
        { x: 92.4, y: 38.65 },
        Q3_HOP_EAST,
        { x: Q3_HOP_EAST.x, y: pad("R10", 1).y },
        pad("R10", 1),
      ]}
    />
    {/*
      On to Q3: the only line of the block on the bottom. It crosses under
      the VIN area south of C9, 4 mm long, and comes back up at once.
    */}
    <Via net="V3V3" at={Q3_HOP_EAST} {...VIA.signal} />
    <Track
      net="V3V3"
      width={0.3}
      layer="bottom"
      points={[Q3_HOP_EAST, { x: 86.6, y: Q3_HOP_WEST.y }, Q3_HOP_WEST]}
    />
    <Via net="V3V3" at={Q3_HOP_WEST} {...VIA.signal} />
    <Track
      net="V3V3"
      width={0.3}
      layer="top"
      points={[
        Q3_HOP_WEST,
        { x: V3V3_TO_Q3.x + 0.65, y: Q3_HOP_WEST.y },
        V3V3_TO_Q3,
      ]}
    />
    <Track
      net="LED3_A"
      width={0.2}
      layer="top"
      points={[
        pad("R10", 2),
        { x: 91.3, y: 39.55 },
        { x: 91.75, y: 40 },
        pad("LED3", 1),
      ]}
    />
    <Via net="GND" at={{ x: 89.15, y: pad("LED3", 2).y }} {...VIA.signal} />
    <Track
      net="GND"
      width={0.3}
      layer="top"
      points={[pad("LED3", 2), { x: 89.15, y: pad("LED3", 2).y }]}
    />
  </>
);
