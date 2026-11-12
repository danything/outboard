// Copper of the block "input": input merge (D1, D2, C4, C5).
// Design coordinates, Track / Via / Pour from ./kit (docs/routing.md).
//
// The anodes of D1 and D2 face west (VBUS1, VBUS2), the cathodes sit on the
// VIN band: one area across the board from D1 to D2 and on along the far
// edge to the buck. Both diodes get rid of their heat through this copper,
// and through six 0.8 mm vias each, to a small VIN area on the bottom right
// under them (KiCad flags a via joined on one side only).
//
// The lines that pass through the block:
// - top, between the pads of each diode: V12_SENSE under D1, the hub's +3V3
//   under D2 (trunks.tsx)
// - bottom, VIN for the two 5 V regulators (mcu.tsx) from the south of the band
// - bottom, under the band from the microcontroller to the boost and the
//   switch: EN_12V north, EN_3V3 and Q2_G south, side by side and never
//   crossing, clear of the ground vias of C4 and C5
import { type Point, Pour, Track, VIA, Vias, handoff, pad, rect } from "./kit";

const D1_K = pad("D1", 2);
const D2_K = pad("D2", 2);
const GROUND_PADS = [pad("C4", 2), pad("C5", 2)];

const p = (h: { x: number; y: number }): Point => ({ x: h.x, y: h.y });

// Columns of the three lines under the band, east of the ground vias of C4
// and C5 (x 56.75 at most).
const EN12_X = 57.6;
const Q2G_X = 57.6;
const EN3_X = 58.4;

const EN12_IN = p(handoff("EN_12V", "mcu", "input"));
const EN12_OUT = p(handoff("EN_12V", "input", "boost"));
const EN3_IN = p(handoff("EN_3V3", "mcu", "input"));
const EN3_OUT = p(handoff("EN_3V3", "input", "boost"));
const Q2G_IN = p(handoff("Q2_G", "mcu", "input"));
const Q2G_OUT = p(handoff("Q2_G", "input", "switch12"));
const SENSE_IN = p(handoff("V12_SENSE", "switch12", "input"));
const SENSE_OUT = p(handoff("V12_SENSE", "input", "mcu"));

// Where the VIN area of the buck (buck.tsx) meets the strip, widened by 0.2.
const BUCK_VIN = { x0: 83.7, x1: 85.9 };

/** South edge of the strip along the far side (the old board edge). */
const SOUTH = 41.7;
/** The band goes on south of D2, to feed the 5 V regulators on the bottom. */
const BAND_SOUTH = 47.5;

export const InputRouting = () => (
  <>
    {/* VBUS1 and VBUS2: the part of each area that lies in this block, up to the anode. */}
    <Pour net="VBUS1" layer="top" outline={rect(47.5, 17.5, 50.2, 20.6)} />
    <Pour net="VBUS2" layer="top" outline={rect(47.5, 34.6, 50.2, 41.8)} />
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
        { x: 59, y: SOUTH },
        { x: 59, y: BAND_SOUTH },
        { x: 52.4, y: BAND_SOUTH },
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
    {/* West of x 58.9 only: the ground via of Q4 at (59.45, 37.9) must stay in the bottom ground. */}
    <Pour net="VIN" layer="bottom" outline={rect(52.5, 37.3, 58.9, SOUTH)} />
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
    {/* 12 V sense from the switch, between the pads of D1. */}
    <Track
      net="V12_SENSE"
      width={0.2}
      layer="top"
      points={[SENSE_IN, SENSE_OUT]}
    />
    {/* Under the band, on the bottom: the vias at both ends belong to the blocks on either side. */}
    <Track
      net="EN_12V"
      width={0.2}
      layer="bottom"
      points={[
        EN12_IN,
        { x: EN12_X, y: EN12_IN.y },
        { x: EN12_X, y: EN12_OUT.y + 0.6 },
        { x: EN12_X + 0.6, y: EN12_OUT.y },
        EN12_OUT,
      ]}
    />
    <Track
      net="EN_3V3"
      width={0.2}
      layer="bottom"
      points={[
        EN3_IN,
        { x: EN3_X, y: EN3_IN.y },
        { x: EN3_X, y: EN3_OUT.y - 0.5 },
        { x: EN3_X + 0.5, y: EN3_OUT.y },
        EN3_OUT,
      ]}
    />
    <Track
      net="Q2_G"
      width={0.2}
      layer="bottom"
      points={[
        Q2G_IN,
        { x: Q2G_X, y: Q2G_IN.y },
        { x: Q2G_X, y: Q2G_OUT.y - 0.6 },
        { x: Q2G_X + 0.6, y: Q2G_OUT.y },
        Q2G_OUT,
      ]}
    />
  </>
);
