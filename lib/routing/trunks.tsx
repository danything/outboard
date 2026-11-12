// Copper that belongs to no single block: the layers that cover the whole
// board, and the lines that run from block to block (VIN, VBUS, 12 V, USB
// data, the control lines of the microcontroller). They meet the blocks at
// the HANDOFFS of lib/placement.ts.
// Design coordinates, Track / Via / Pour from ./kit (docs/routing.md).
import { Pour } from "./kit";

export const TrunkRouting = () => (
  <>
    {/* Inner 1: ground, never cut by a track. */}
    <Pour net="GND" layer="inner1" />
    {/* Inner 2: 3.3 V. A part that needs 3.3 V drops a via onto it. */}
    <Pour net="V3V3" layer="inner2" />
    {/* Bottom: ground around the few tracks that run there. */}
    <Pour net="GND" layer="bottom" />
  </>
);
