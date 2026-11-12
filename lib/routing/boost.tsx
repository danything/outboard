// Copper of the block "boost": boost to 12 V (U4, L2, D4).
// Design coordinates, Track / Via / Pour from ./kit (docs/routing.md).
//
// U4 has EN, VIN, NC on its west column and FB, GND, SW on its east column.
// VIN comes in from the band in the west and runs south of C17 and C16 to
// L2. SW leaves east to D4 and south to L2. The hot loop (SW, D4, C18, GND)
// closes east of U4: C18 sits between the cathode of D4 and the ground pin.
// The feedback divider is north of U4, away from SW and L2, on top only.
// Ground goes to the bottom through vias next to the pads. No track runs on
// the bottom in this block except the last 0.7 mm of EN at the band, west of
// every part: the ground under the hot loop stays whole.
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
// its ground pad, then east along y 21.75 to the handoff.
const C19_P = pad("C19", 1);
const C19_G = pad("C19", 2);
const V12_RUN = 21.75;
const v12Out: Point[] = [
  C19_P,
  { x: C19_P.x, y: V12_RUN },
  { x: V12_OUT.x, y: V12_RUN },
  { x: V12_OUT.x, y: V12_OUT.y },
];

// EN changes to the bottom just inside the block, west of every part.
const EN_VIA: Point = { x: EN_IN.x + 0.7, y: EN_IN.y };

export const BoostRouting = () => (
  <>
    {/* VIN: from the band south of C17 and C16, widened for the heat of the input diodes, to L2. */}
    <Pour
      net="VIN"
      layer="top"
      outline={[
        { x: VIN_IN.x, y: VIN_TOP },
        { x: 65.3, y: VIN_TOP },
        { x: 65.3, y: 26.7 },
        { x: 69.05, y: 26.7 },
        { x: 69.05, y: 32.75 },
        { x: 66, y: 32.75 },
        { x: 66, y: 34.4 },
        { x: VIN_IN.x, y: 34.4 },
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
    <Track net="V12_BOOST" width={0.8} layer="top" points={v12Out} />
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
        { x: C19_G.x - 0.7, y: 22.375 },
        { x: C19_G.x + 0.7, y: 22.375 },
        { x: C19_G.x + 0.7, y: 24.9 },
        { x: C19_G.x - 0.7, y: 24.9 },
      ]}
    />
    <Vias
      net="GND"
      at={[-0.425, 0.425].map((dx) => ({ x: C19_G.x + dx, y: 24.4 }))}
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
  </>
);
