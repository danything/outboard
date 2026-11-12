// Copper that belongs to no single block: the ground on the bottom, and the
// lines that run from block to block (VIN, VBUS, 3.3 V, 12 V, USB data, the
// control lines of the microcontroller). They meet the blocks at the
// HANDOFFS of lib/placement.ts.
// Design coordinates, Track / Via / Pour from ./kit (docs/routing.md).
import { Pour } from "./kit";

export const TrunkRouting = () => (
  <>
    {/* Bottom: ground, cut only by the few tracks that have to run there. */}
    <Pour net="GND" layer="bottom" />
  </>
);
