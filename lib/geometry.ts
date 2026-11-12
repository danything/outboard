// Mechanical facts of the board, in one place: outline, mounting holes,
// connector positions and the things around the board that the layout has to
// keep clear of (bracket, card, plugs). docs/mechanical.md explains them; the
// numbers live here.
//
// Design coordinates: origin at the rear (bracket side) corner of the
// card-side edge, x to the right, y away from the card, in millimetres.
// tscircuit has y pointing up, so `at` negates y, and nothing else does.
//
// Where a number comes from is marked on each constant:
//   [DS]  the part's datasheet (land pattern or outline drawing)
//   [CEM] PCI Express Card Electromechanical Specification 2.0, figure given
//   [EST] estimated from those; to be measured on the real card
//   [LAY] a layout decision made here
export interface Point {
  x: number;
  y: number;
}

/** Axis-aligned rectangle in design coordinates. */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Convert design coordinates to tscircuit coordinates. */
export const at = (x: number, y: number): Point => ({ x, y: -y });

// --- Board ----------------------------------------------------------------

// [LAY] The card lies in the same plane, so the depth (y) adds directly to
// the width of the case, while the length (x) runs along the card and is
// free. Depth is therefore as small as the two USB-C ports allow:
//   tongue clearance 15.53 + shell 8.94 + gap 7.26 (mounting hole H3)
//   + shell 8.94 + 1.33 to the edge = 42.
// The length is JLCPCB's 100 mm price limit.
export const BOARD_WIDTH = 100;
export const BOARD_DEPTH = 42;
// [DS] J3 is made for a 1.57 mm board.
export const BOARD_THICKNESS = 1.6;

// --- USB-C (J1 = PC, J2 = charger) ----------------------------------------

// [DS] TYPE-C-31-M-12: board edge 4.08 from the footprint origin, mouth 5.07.
export const USBC_ORIGIN_X = 4.08;
/** The mouth of both USB-C ports = the outside face of the bracket. */
export const BRACKET_FACE_X = USBC_ORIGIN_X - 5.07;
// [DS] Shell width.
export const USBC_SHELL_WIDTH = 8.94;
// [LAY] J1 as close to the card as the bracket tongue allows; J2 one plug
// width plus the mounting hole H3 further.
export const J1_Y = 20;
export const J2_Y = 36.2;
// [EST] The shells must stay beyond the tip of the bracket tongue (14.95) by 0.5.
export const USBC_SHELL_MIN_Y = 15.45;
// USB Type-C plug overmold, maximum 12.35 wide (USB Type-C spec, plug
// overmold boundary); the length drawn is cut short.
export const USBC_PLUG_WIDTH = 12.35;
export const USBC_PLUG_LENGTH = 15;

// --- Bracket of the card (all [EST], CEM figures 6-4 and 6-16) --------------

// Plate thickness: catalogue values of brackets are 0.81 to 0.86.
export const BRACKET_THICKNESS = 0.86;
/** The plate is full width up to here, then narrows at 45 degrees to the tongue. */
export const BRACKET_FULL_WIDTH_Y = 7.68;
// Full-height bracket only (the card's maker lists no low-profile bracket).
export const BRACKET_TONGUE_Y = 14.95;
/** Extent of the plate across the board thickness; z = 0 is the board centre, + is the top. */
export const BRACKET_Z = { min: -2.06, max: 16.36 };
export const BRACKET_TONGUE_Z = { min: 2.05, max: 12.24 };

// [LAY] The rear edge steps in next to the card to let the bracket plate pass.
// The plate's lower edge rises at 45 degrees from z = -2.06 at y = 7.68 and
// leaves the top surface of the board (z = +0.8) at y = 10.54; 11.5 adds margin.
export const REAR_STEP = 1.5;
export const REAR_STEP_DEPTH = 11.5;

// --- PCIe x1 straddle connector J3 ------------------------------------------

// [EST] Centre of contact 1 to the outside face of the bracket (CEM 6-4).
export const PIN1_TO_BRACKET = 47.54;
// [DS] Contact 1 is 9.5 from the footprint origin; pad centres are 3.2 from the edge.
export const J3_ORIGIN: Point = {
  x: BRACKET_FACE_X + PIN1_TO_BRACKET + 9.5,
  y: 3.2,
};
// [DS] Key notch between contacts 11 and 12: 2.0 right of the origin.
export const KEY_NOTCH_X = J3_ORIGIN.x + 2;
export const KEY_NOTCH_WIDTH = 1.9;
export const KEY_NOTCH_DEPTH = 6;
// [EST] The ears of J3 clamp the board here; no parts on either side.
export const J3_EAR_KEEPOUTS: Rect[] = [
  { x0: 38.4, y0: 0, x1: 45.1, y1: 9 },
  { x0: 67, y0: 0, x1: 73.7, y1: 9 },
];

// --- The card (all [EST]) ---------------------------------------------------

/** Rear end of the card's board: 45.65 from contact 1 (CEM 6-4). */
export const CARD_REAR_X = J3_ORIGIN.x - 9.5 - 45.65;
/** Mouth of J3 and the edge of the card that carries the contacts. */
export const J3_MOUTH_Y = -8.1;
export const CARD_EDGE_Y = -13;
// [CEM] Tallest full-height card. The real card's height and length are not
// published; the length drawn is a placeholder.
export const CARD_MAX_HEIGHT = 111.15;
export const CARD_LENGTH_DRAWN = 125;
/** The drawings of the card and the bracket are cut off this far above the card edge. */
const REFERENCE_DRAWN_HEIGHT = 12;

// --- Internal USB header J4 -------------------------------------------------

// [LAY] Below the VBUS1 copper, pins pointing at the card: the plug lies over
// copper only, and the data pair reaches it without crossing VBUS1.
export const J4_ORIGIN: Point = { x: 24.6, y: 22.3 };
// [DS] Plastic 3.09 to 5.63 from the origin. [EST] Plug 14 long, 13.2 wide,
// 0.2 above the board: no parts under it.
export const J4_PLUG: Rect = {
  x0: J4_ORIGIN.x - 6.6,
  y0: J4_ORIGIN.y - 5.63 - 14,
  x1: J4_ORIGIN.x + 6.6,
  y1: J4_ORIGIN.y - 5.63,
};

// --- LEDs ---------------------------------------------------------------------

// [LAY] On the long edge away from the card, centre this far from the edge.
export const LED_EDGE_DISTANCE = 1;

// --- Height ---------------------------------------------------------------------

/** Tallest part allowed on the top side: bracket overhang minus half the board. */
export const MAX_PART_HEIGHT = BRACKET_Z.max - BOARD_THICKNESS / 2;
// [DS] Leads may stick out of the bottom side this far (inside J3's body, 3.78).
export const MAX_BOTTOM_PROTRUSION = 2.98;

// --- Outline ------------------------------------------------------------------

const arc = (
  cx: number,
  cy: number,
  r: number,
  fromDeg: number,
  toDeg: number,
  steps: number,
): Point[] =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const a = ((fromDeg + ((toDeg - fromDeg) * i) / steps) * Math.PI) / 180;
    return at(cx + r * Math.cos(a), cy + r * Math.sin(a));
  });

/** Board outline, clockwise from the stepped rear corner. */
export const boardOutline = (): Point[] => {
  const r = KEY_NOTCH_WIDTH / 2;
  return [
    at(REAR_STEP, 0),
    at(KEY_NOTCH_X - r, 0),
    // Round end of the key notch: left wall down, half circle, right wall up.
    ...arc(KEY_NOTCH_X, KEY_NOTCH_DEPTH - r, r, 180, 0, 12),
    at(KEY_NOTCH_X + r, 0),
    at(BOARD_WIDTH, 0),
    at(BOARD_WIDTH, BOARD_DEPTH),
    at(0, BOARD_DEPTH),
    at(0, REAR_STEP_DEPTH),
    at(REAR_STEP, REAR_STEP_DEPTH),
  ];
};

// --- Mounting holes ---------------------------------------------------------------

// [LAY] M3, not plated. Three sit in corners, 4 in from the edges (H1 from
// the stepped rear edge). The rear far corner is taken by J2, so H3 sits
// between the two USB-C shells. H5 and H6 flank J3, so that pushing the card
// in and pulling it out does not bend the board around the slot.
export const MOUNTING_HOLE_DIAMETER = 3.2;
const HOLE_INSET = 4;
/** H1..H6 in design coordinates. */
export const MOUNTING_HOLE_POSITIONS: Point[] = [
  { x: REAR_STEP + HOLE_INSET, y: HOLE_INSET },
  { x: BOARD_WIDTH - HOLE_INSET, y: HOLE_INSET },
  { x: 3.5, y: (J1_Y + J2_Y) / 2 },
  { x: BOARD_WIDTH - HOLE_INSET, y: BOARD_DEPTH - HOLE_INSET },
  // Between the J4 plug (x <= 31.2) and the rear ear of J3 (x >= 38.4).
  { x: 35.3, y: 5 },
  // Past the front ear of J3; the 3.3 V row (y >= 8.9) stays clear of the screw.
  { x: 78.5, y: 5.5 },
];
/** Nothing but copper within this radius of a hole centre (M3 pan head). */
export const MOUNTING_HOLE_KEEPOUT_RADIUS = 3;

/** H1..H6 in tscircuit coordinates. */
export const mountingHoles: Point[] = MOUNTING_HOLE_POSITIONS.map((p) =>
  at(p.x, p.y),
);

// --- Reference drawings (never manufactured) ---------------------------------------

export interface ReferenceShape {
  label: string;
  /** Closed polygon in design coordinates. */
  points: Point[];
}

const rectPoints = (r: Rect): Point[] => [
  { x: r.x0, y: r.y0 },
  { x: r.x1, y: r.y0 },
  { x: r.x1, y: r.y1 },
  { x: r.x0, y: r.y1 },
];

const usbcPlug = (label: string, y: number): ReferenceShape => ({
  label,
  points: rectPoints({
    x0: BRACKET_FACE_X - USBC_PLUG_LENGTH,
    y0: y - USBC_PLUG_WIDTH / 2,
    x1: BRACKET_FACE_X,
    y1: y + USBC_PLUG_WIDTH / 2,
  }),
});

/** What surrounds the board, as seen from the top side. */
export const referenceShapes = (): ReferenceShape[] => [
  {
    // The plate seen edge-on. It reaches the tongue tip only above the board.
    label: "bracket",
    points: rectPoints({
      x0: BRACKET_FACE_X,
      y0: CARD_EDGE_Y - REFERENCE_DRAWN_HEIGHT,
      x1: BRACKET_FACE_X + BRACKET_THICKNESS,
      y1: BRACKET_TONGUE_Y,
    }),
  },
  {
    label: "card",
    points: rectPoints({
      x0: CARD_REAR_X,
      y0: CARD_EDGE_Y - REFERENCE_DRAWN_HEIGHT,
      x1: CARD_REAR_X + CARD_LENGTH_DRAWN,
      y1: CARD_EDGE_Y,
    }),
  },
  {
    label: "card edge in J3",
    points: rectPoints({
      x0: J3_ORIGIN.x - 10.65,
      y0: CARD_EDGE_Y,
      x1: J3_ORIGIN.x + 10.65,
      y1: 0,
    }),
  },
  { label: "J4 plug", points: rectPoints(J4_PLUG) },
  usbcPlug("USB-C plug (PC)", J1_Y),
  usbcPlug("USB-C plug (charger)", J2_Y),
  ...J3_EAR_KEEPOUTS.map((r) => ({ label: "J3 ear", points: rectPoints(r) })),
];
