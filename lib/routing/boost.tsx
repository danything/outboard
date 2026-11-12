// Copper of the block "boost": boost to 12 V (U4, L2, D4).
// Design coordinates, Track / Via / Pour from ./kit (docs/routing.md).
//
// U4 has EN, VIN, NC on its west column and FB, GND, SW on its east column.
// VIN comes in from the band in the west and runs south of C17 and C16 to
// L2. SW leaves east to D4 and south to L2. The hot loop (SW, D4, C18, GND)
// closes east of U4: C18 sits between the cathode of D4 and the ground pin.
// The feedback divider is north of U4, away from SW and L2, on top only.
// Ground goes to the bottom through vias next to the pads. On the bottom
// there are only three short hops, all outside the parts: EN_12V and EN_3V3
// coming up from under the band, and Q2_D under EN_3V3 south of L2. The
// ground under the hot loop stays whole.
import { type Point, Pour, Track, VIA, Via, Vias, handoff, pad } from "./kit";

const U4 = {
  SW: pad("U4", 1),
  GND: pad("U4", 2),
  FB: pad("U4", 3),
  EN: pad("U4", 4),
  VIN: pad("U4", 5),
};

const VIN_IN = handoff("VIN", "input", "boost");
const V12_OUT = handoff("V12_BOOST", "boost", "switch12");
const EN_IN = handoff("EN_12V", "input", "boost");

// The VIN area meets the band over the width of the handoff, but not north
// of the VIN pads of C16 and C17 (their ground pads are there).
const VIN_TOP = Math.max(VIN_IN.y - VIN_IN.width / 2, 25.1);
// The bridge over the seam between the band and this area, clear of C17's ground.
const BRIDGE_Y = Math.max(VIN_IN.y, 25.6);

// V12_BOOST leaves from the positive pad of C19 to the north, never behind
// its ground pad, then east at the level of the handoff, between that pad
// and the gate pad of Q1, to the handoff.
const C19_P = pad("C19", 1);
const C19_G = pad("C19", 2);
const v12Out: Point[] = [
  C19_P,
  { x: C19_P.x, y: V12_OUT.y },
  { x: V12_OUT.x, y: V12_OUT.y },
];

// EN changes to the bottom just inside the block, west of every part.
const EN_VIA: Point = { x: EN_IN.x + 0.6, y: EN_IN.y };

// Two lines pass through the block along its edges (lib/placement.ts):
// EN_3V3 from the band to the buck along the south edge, and Q2_D from Q2
// north to R15 east of L2, D4 and C19.
const EN3_IN = handoff("EN_3V3", "input", "boost");
const EN3_OUT = handoff("EN_3V3", "boost", "switch12");
const EN3_VIA: Point = { x: EN3_IN.x + 0.4, y: EN3_IN.y + 0.1 };
const EN3_Y = 34.2;
const Q2D_IN = handoff("Q2_D", "switch12", "boost");
const Q2D_OUT = handoff("Q2_D", "boost", "switch12");
// Q2_D hops under EN_3V3 south of L2 (outside the parts of the boost) and
// comes back up at once.
const Q2D_VIA: Point = { x: Q2D_IN.x, y: 33.55 };
const Q2D_X = 78.85;

export const BoostRouting = () => (
  <>
    {/* VIN: from the band south of C17 and C16, widened for the heat of the input diodes, to L2. */}
    <Pour
      net="VIN"
      layer="top"
      // 0.1 mm off the band: KiCad refuses zones of one net that touch.
      outline={[
        { x: VIN_IN.x + 0.1, y: VIN_TOP },
        { x: 65.3, y: VIN_TOP },
        { x: 65.3, y: 26.7 },
        { x: 69.05, y: 26.7 },
        { x: 69.05, y: 32.75 },
        { x: 66, y: 32.75 },
        { x: 66, y: 33.8 },
        { x: VIN_IN.x + 0.1, y: 33.8 },
      ]}
    />
    {/* Pours join only through a track, a pad or a via: a 1.6 mm bridge from the band. */}
    <Track
      net="VIN"
      width={1.6}
      layer="top"
      points={[
        { x: VIN_IN.x - 1, y: BRIDGE_Y },
        { x: VIN_IN.x + 0.9, y: BRIDGE_Y },
      ]}
    />
    {/* Supply pin of U4: its own short track from the area. */}
    <Track
      net="VIN"
      width={0.5}
      layer="top"
      points={[U4.VIN, { x: 65, y: U4.VIN.y }, { x: 65, y: 25.4 }]}
    />
    {/* Ground of the input capacitors and of R13, three vias to the bottom. */}
    <Pour
      net="GND"
      layer="top"
      outline={[
        { x: 60.85, y: 22.2 },
        { x: 64.125, y: 22.2 },
        { x: 64.125, y: 24.6 },
        { x: 60.85, y: 24.6 },
      ]}
    />
    <Vias
      net="GND"
      at={[61.4, 62.4, 63.4].map((x) => ({ x, y: 22.75 }))}
      {...VIA.signal}
    />
    <Track
      net="GND"
      width={0.3}
      layer="top"
      points={[pad("R13", 2), { x: 62.75, y: 22.4 }]}
    />
    {/* SW: U4 to D4 and L2, as small as the current allows. */}
    <Pour
      net="SW_12V"
      layer="top"
      outline={[
        { x: 68.2, y: 24.95 },
        { x: 71.9, y: 24.95 },
        { x: 71.9, y: 27.2 },
        { x: 75.1, y: 27.2 },
        { x: 75.1, y: 32.75 },
        { x: 72.75, y: 32.75 },
        { x: 72.75, y: 28.6 },
        { x: 70.4, y: 28.6 },
        { x: 70.4, y: 26.2 },
        { x: 68.2, y: 26.2 },
      ]}
    />
    {/* Output: the cathode of D4 with C18 and C19 right above it. */}
    <Pour
      net="V12_BOOST"
      layer="top"
      outline={[
        { x: 72.8, y: 21.95 },
        { x: C19_P.x + 0.7, y: 21.95 },
        { x: C19_P.x + 0.7, y: 24.5 },
        { x: 75.83, y: 24.5 },
        { x: 75.83, y: 26.64 },
        { x: 74.3, y: 26.64 },
        { x: 74.3, y: 24.5 },
        { x: 72.8, y: 24.5 },
      ]}
    />
    <Track net="V12_BOOST" width={V12_OUT.width} layer="top" points={v12Out} />
    {/*
      Ground of the hot loop: 0.9 mm out of the pin of U4 (all there is
      between FB and SW), then wide to C18, with two vias to the bottom.
    */}
    <Pour
      net="GND"
      layer="top"
      outline={[
        { x: 68.2, y: 23.85 },
        { x: 69.65, y: 23.85 },
        { x: 69.65, y: 22.375 },
        { x: 72.2, y: 22.375 },
        { x: 72.2, y: 24.75 },
        { x: 68.2, y: 24.75 },
      ]}
    />
    <Vias
      net="GND"
      at={[
        { x: 70.2, y: 23 },
        { x: 70.2, y: 24.1 },
      ]}
      {...VIA.signal}
    />
    {/* Two more under the body of U4, on a 0.5 mm track from the pin. */}
    <Track
      net="GND"
      width={0.5}
      layer="top"
      points={[U4.GND, { x: 67.5, y: U4.GND.y }]}
    />
    <Track
      net="GND"
      width={0.5}
      layer="top"
      points={[
        { x: 67.5, y: 23.75 },
        { x: 67.5, y: 24.85 },
      ]}
    />
    <Vias
      net="GND"
      at={[
        { x: 67.5, y: 23.75 },
        { x: 67.5, y: 24.85 },
      ]}
      {...VIA.signal}
    />
    {/* Ground of C19. */}
    <Pour
      net="GND"
      layer="top"
      outline={[
        { x: C19_G.x - 0.7, y: C19_G.y - 0.675 },
        { x: C19_G.x + 0.7, y: C19_G.y - 0.675 },
        { x: C19_G.x + 0.7, y: C19_G.y + 1.85 },
        { x: C19_G.x - 0.7, y: C19_G.y + 1.85 },
      ]}
    />
    <Vias
      net="GND"
      at={[-0.425, 0.425].map((dx) => ({ x: C19_G.x + dx, y: C19_G.y + 1.35 }))}
      {...VIA.signal}
    />
    {/* Feedback: top only, north of U4, away from SW and L2. Sensed at C18. */}
    <Track
      net="FB_12V"
      width={0.2}
      layer="top"
      points={[
        U4.FB,
        { x: 68.8, y: 22.2 },
        { x: 68.35, y: 21.75 },
        pad("R12", 1),
        pad("R11", 2),
      ]}
    />
    <Track
      net="V12_BOOST"
      width={0.3}
      layer="top"
      points={[
        pad("R11", 1),
        { x: 72.3, y: 21.08 },
        { x: 72.3, y: 21.95 },
        { x: 73, y: 22.15 },
      ]}
    />
    {/* The low end of the divider has a via of its own, on the quiet side. */}
    <Via net="GND" at={{ x: 66.85, y: 19.95 }} {...VIA.signal} />
    <Track
      net="GND"
      width={0.3}
      layer="top"
      points={[pad("R12", 2), { x: 66.85, y: 19.95 }]}
    />
    {/* EN: U4 to R13, then west on top. */}
    <Track
      net="EN_12V"
      width={0.2}
      layer="top"
      points={[
        U4.EN,
        { x: 65.4, y: 23.35 },
        { x: 64.45, y: 22.4 },
        { x: 64.45, y: 21.25 },
        pad("R13", 1),
        { x: 64.25, y: 20.3 },
        { x: 60.6, y: 20.3 },
        { x: EN_VIA.x, y: 21.2 },
        EN_VIA,
      ]}
    />
    {/* The bottom only for the step to the handoff, where the line from the microcontroller arrives under the band. */}
    <Via net="EN_12V" at={EN_VIA} {...VIA.signal} />
    <Track
      net="EN_12V"
      width={0.2}
      layer="bottom"
      points={[EN_VIA, { x: EN_IN.x, y: EN_IN.y }]}
    />
    {/* EN_3V3: up from under the band, then along the south edge on top. */}
    <Track
      net="EN_3V3"
      width={0.2}
      layer="bottom"
      points={[{ x: EN3_IN.x, y: EN3_IN.y }, EN3_VIA]}
    />
    <Via net="EN_3V3" at={EN3_VIA} {...VIA.signal} />
    <Track
      net="EN_3V3"
      width={0.2}
      layer="top"
      points={[
        EN3_VIA,
        { x: EN3_VIA.x + 0.2, y: EN3_Y },
        { x: EN3_OUT.x - 0.4, y: EN3_Y },
        { x: EN3_OUT.x, y: EN3_OUT.y },
      ]}
    />
    {/* Q2_D: under EN_3V3 for 1 mm, then on top north, east of D4 and C19. */}
    <Track
      net="Q2_D"
      width={0.2}
      layer="bottom"
      points={[{ x: Q2D_IN.x, y: Q2D_IN.y }, Q2D_VIA]}
    />
    <Via net="Q2_D" at={Q2D_VIA} {...VIA.signal} />
    <Track
      net="Q2_D"
      width={0.2}
      layer="top"
      points={[
        Q2D_VIA,
        { x: Q2D_VIA.x, y: 29.2 },
        { x: Q2D_X, y: 26.55 },
        { x: Q2D_X, y: Q2D_OUT.y },
        { x: Q2D_OUT.x, y: Q2D_OUT.y },
      ]}
    />
  </>
);
