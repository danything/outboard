// Copper of the block "slot": PCIe slot (J3 and the parts next to its contacts).
// Design coordinates, Track / Via / Pour from ./kit (docs/routing.md).
//
// J3 straddles the card-side edge: row B on top, row A on the bottom, pads
// from y = 1.4 to 5.0. Every track leaves its pad straight along the pad
// (south) and turns only in the copper beyond, because the card is pushed in
// and pulled out against these pads.
//
// West to east: 12 V (contacts 1 to 3), 3.3 V (8 to 10), the key notch, and
// ground. PERST# (A11, bottom) runs south next to the notch, under the
// 3.3 V row, and comes up to the top side at D6.
import { HANDOFFS } from "../placement";
import { type Point, Pour, Track, VIA, Via, Vias, pad, rect } from "./kit";

/** Where a net is handed to this block (lib/placement.ts), by name. */
const handoff = (net: string) => {
  const found = HANDOFFS.filter(
    (h) => h.net === net && (h.to === "slot" || h.from === "slot"),
  );
  if (found.length !== 1)
    throw new Error(`slot: expected one handoff of ${net}, got ${found.length}`);
  return found[0] as (typeof HANDOFFS)[number];
};

/** The copper below was drawn for a handoff at this place; fail loudly when it moves. */
const expectHandoff = (
  net: string,
  layer: "top" | "bottom",
  x: [number, number],
  y: [number, number],
) => {
  const h = handoff(net);
  if (h.layer !== layer || h.x < x[0] || h.x > x[1] || h.y < y[0] || h.y > y[1])
    throw new Error(
      `slot: the handoff of ${net} moved to (${h.x}, ${h.y}) ${h.layer}; redraw lib/routing/slot.tsx`,
    );
  return h;
};

const J3 = (pin: string): Point => pad("J3", pin);

/** Width of the neck on a contact of J3: the width of the pad. */
const NECK = 0.7;
/** The necks end here, 1.5 mm beyond the pads. */
const NECK_END_Y = 6.6;
/** Ground vias of the contacts: one row, 0.6 mm clear of the pads. */
const GND_VIA_Y = 5.9;

/** A neck straight south from a contact into the copper that feeds it. */
const Neck = ({
  net,
  pin,
  layer,
}: {
  net: "V12" | "V3V3";
  pin: string;
  layer: "top" | "bottom";
}) => (
  <Track
    net={net}
    width={NECK}
    layer={layer}
    points={[J3(pin), { x: J3(pin).x, y: NECK_END_Y }]}
  />
);

/** A ground contact: straight south to a via (top) or into the ground area (bottom). */
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

// --- 12 V ----------------------------------------------------------------------

const v12 = expectHandoff("V12", "top", [47, 49.5], [14.1, 14.1]);

/** B1..B3 on top; A2 and A3 through two vias under the top area. */
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
        { x: 50.9, y: v12.y },
        { x: 45.8, y: v12.y },
        { x: 45.8, y: 8.4 },
        { x: 46.2, y: 8.4 },
      ]}
    />
    {["B1", "B2", "B3"].map((pin) => (
      <Neck key={pin} net="V12" pin={pin} layer="top" />
    ))}
    {/* Bottom: a small area for A2 and A3. */}
    <Pour net="V12" layer="bottom" outline={rect(47, 6.2, 48.9, 8)} />
    {["A2", "A3"].map((pin) => (
      <Neck key={pin} net="V12" pin={pin} layer="bottom" />
    ))}
    <Vias
      net="V12"
      at={[47.45, 48.45].map((x) => ({ x, y: 7.1 }))}
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

const v33 = expectHandoff("V3V3", "top", [74.5, 83], [10.4, 10.4]);
const ROW = { top: v33.y - v33.width / 2 + 0.3, bottom: v33.y + 1.2 };

/** Vias that carry 3.3 V to the bottom, all within 6 mm of A9 (checks/rules.ts). */
const V33_VIAS: Point[] = [
  { x: 53.5, y: 9 },
  { x: 54.6, y: 9 },
  { x: 55.7, y: 9 },
  { x: 54.2, y: 7.6 },
];

/**
 * The row arrives from the east and ends in one junction south of contacts
 * 8 to 10. From there B8 is fed on top and A9, A10 through the vias and a
 * bottom area, each over a neck of the same length, so the three contacts
 * (1.1 A each) share the 3 A evenly.
 */
const V33 = () => (
  <>
    <Pour
      net="V3V3"
      layer="top"
      outline={[
        // Column up to the neck of B8.
        { x: 52.9, y: 6.5 },
        { x: 54.75, y: 6.5 },
        { x: 54.75, y: 8.3 },
        // Around JP4.2 (3.3 Vaux) to JP4.1.
        { x: 56.35, y: 8.3 },
        { x: 56.35, y: 6.6 },
        { x: 57.35, y: 6.6 },
        { x: 57.35, y: ROW.top },
        // The row, over C27, C28 and TP2.
        { x: v33.x, y: ROW.top },
        { x: v33.x, y: ROW.bottom },
        // Tab to the cathode of D6 and to R27.
        { x: 63, y: ROW.bottom },
        { x: 63, y: 12.9 },
        { x: 60.6, y: 12.9 },
        { x: 60.6, y: ROW.bottom },
        { x: 52.9, y: ROW.bottom },
      ]}
    />
    <Neck net="V3V3" pin="B8" layer="top" />
    <Vias net="V3V3" at={V33_VIAS} {...VIA.power} />
    <Pour net="V3V3" layer="bottom" outline={rect(52.9, 6.5, 56.2, 9.6)} />
    <Neck net="V3V3" pin="A9" layer="bottom" />
    <Neck net="V3V3" pin="A10" layer="bottom" />
    {/* 3.3 Vaux: B10 straight to the jumper. The bridge of JP4 is not drawn here. */}
    <Track
      net="V3V3AUX"
      width={0.5}
      layer="top"
      points={[J3("B10"), pad("JP4", 2)]}
    />
    {/* Ground of C27 and C28, north of the row. */}
    <Via net="GND" at={{ x: 60, y: 6.95 }} {...VIA.signal} />
    <Track
      net="GND"
      width={0.5}
      layer="top"
      points={[pad("C27", 2), { x: 60, y: 6.95 }]}
    />
    <Via net="GND" at={{ x: 62.6, y: 7.3 }} {...VIA.signal} />
    <Track
      net="GND"
      width={0.5}
      layer="top"
      points={[pad("C28", 2), { x: 62.6, y: 7.3 }]}
    />
  </>
);

// --- Ground contacts -------------------------------------------------------------

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
      at={["B4", "B7", "A12", "B13", "A15", "B16", "B18"].map((pin) => ({
        x: J3(pin).x,
        y: GND_VIA_Y,
      }))}
      {...VIA.signal}
    />
  </>
);

// --- PERST# ----------------------------------------------------------------------

/** Where PERST# comes up to the top side, south of the 3.3 V row. */
const PERST_VIA: Point = { x: J3("A11").x, y: 12.5 };
/** The line that joins D6, R27 and C31, south of their pads. */
const PERST_Y = 13.65;

const Perst = () => (
  <>
    {/* Bottom: straight south from A11, 0.45 mm from the notch, under the 3.3 V row. */}
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
        pad("D6", 2),
        { x: pad("D6", 2).x, y: PERST_Y },
        { x: pad("R27", 2).x, y: PERST_Y },
        pad("R27", 2),
        pad("C31", 1),
      ]}
    />
    <Via net="GND" at={{ x: 69.9, y: 12.8 }} {...VIA.signal} />
    <Track
      net="GND"
      width={0.5}
      layer="top"
      points={[pad("C31", 2), { x: 69.9, y: 12.8 }]}
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
