// Copper of the block "input": input merge (D1, D2, C4, C5).
// Design coordinates, Track / Via / Pour from ./kit (docs/routing.md).
//
// The anodes of D1 and D2 face west (VBUS1, VBUS2), the cathodes sit on the
// VIN band: one area across the board from D1 to D2 and on along the far
// edge to the buck. Both diodes get rid of their heat through this copper,
// and through six 0.8 mm vias each, for a VIN area on the bottom. The bottom
// belongs to trunks.tsx; the areas asked for lie under the vias: x 52.5 to
// 58.8, y 17.5 to 21.3 for D1, and x 52.5 to 70, y 37.3 to the edge for D2.
//
// Kept free on purpose:
// - top, between the pads of each diode (x 50.3 to 52.3): V12_SENSE and LED_STAT
// - top, south of the VBUS2 area (y 38.2 and more, west of x 52.4): LED_STAT
// - bottom, the band between the ground vias of C4 and of C5 (y 25.6 to 29.8)
//   and between C5 and D2 (y 30.6 to 37.2): EN_12V, Q2_G and EN_3V3 cross there
import { Pour, Track, VIA, Vias, pad, rect } from "./kit";

const D1_K = pad("D1", 2);
const D2_K = pad("D2", 2);
const GROUND_PADS = [pad("C4", 2), pad("C5", 2)];

// Where the VIN area of the buck (buck.tsx) meets the strip, widened by 0.2.
const BUCK_VIN = { x0: 83.7, x1: 85.9 };

// Board edge minus the clearance to the outline.
const SOUTH = 41.7;

export const InputRouting = () => (
  <>
    {/* VBUS1 and VBUS2: the part of each area that lies in this block, up to the anode. */}
    <Pour net="VBUS1" layer="top" outline={rect(47.5, 17.5, 50.2, 20.6)} />
    <Pour net="VBUS2" layer="top" outline={rect(47.5, 34.6, 50.2, 38)} />
    {/* VIN: the band from D1 to D2 and the strip along the far edge to the buck. */}
    <Pour
      net="VIN"
      layer="top"
      outline={[
        { x: 52.4, y: 17.5 },
        { x: 59, y: 17.5 },
        { x: 59, y: 38.6 },
        // 0.1 mm clear of the VIN area of the buck, which ends at y 38.6:
        // KiCad refuses zones of one net that touch. The stitch below joins them.
        { x: BUCK_VIN.x0, y: 38.6 },
        { x: BUCK_VIN.x0, y: 38.7 },
        { x: BUCK_VIN.x1, y: 38.7 },
        { x: BUCK_VIN.x1, y: 38.6 },
        { x: 86.9, y: 38.6 },
        { x: 86.9, y: SOUTH },
        { x: 52.4, y: SOUTH },
        { x: 52.4, y: 34.6 },
        { x: 53, y: 34.6 },
        { x: 53, y: 20.6 },
        { x: 52.4, y: 20.6 },
      ]}
    />
    {/* Heat of D1 to the bottom: six vias east of the cathode. */}
    <Vias
      net="VIN"
      at={[54.9, 56.1].flatMap((x) =>
        [-1, 0.2, 1.4].map((dy) => ({ x, y: D1_K.y + dy })),
      )}
      {...VIA.power}
    />
    <Pour net="VIN" layer="bottom" outline={rect(52.5, 17.5, 58.8, 21.3)} />
    {/* Heat of D2: six vias south of the cathode. */}
    <Vias
      net="VIN"
      at={[53.3, 54.5, 55.7].flatMap((x) =>
        [1.7, 2.9].map((dy) => ({ x, y: D2_K.y + dy })),
      )}
      {...VIA.power}
    />
    <Pour net="VIN" layer="bottom" outline={rect(52.5, 37.3, 62, SOUTH)} />
    {/* Ground of C4 and C5: two vias each, in line with the pads so the band stays wide on both sides. */}
    {GROUND_PADS.map((g) => (
      <Track
        key={`${g.x},${g.y}`}
        net="GND"
        width={1.2}
        layer="top"
        points={[g, { x: g.x, y: g.y + 1.2 }]}
      />
    ))}
    <Vias
      net="GND"
      at={GROUND_PADS.flatMap((g) =>
        [-0.45, 0.45].map((dx) => ({ x: g.x + dx, y: g.y + 1.2 })),
      )}
      {...VIA.signal}
    />
    {/* Pours join only through a track, a pad or a via: a stitch from the strip into the VIN area of the buck, which ends where the strip begins. */}
    <Track
      net="VIN"
      width={1.8}
      layer="top"
      points={[
        { x: 84.8, y: 39.6 },
        { x: 84.8, y: 37.6 },
      ]}
    />
  </>
);
