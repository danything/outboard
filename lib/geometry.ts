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
// [EST] The shells must stay beyond the tip of the bracket tongue by 0.5.
// Kept at the first estimate of the tip (14.95, with J3's mouth at -8.1):
// with the mouth of the datasheet the tip is at 12.77 (BRACKET_TONGUE_Y), so
// this holds either way until J3 is measured.
export const USBC_SHELL_MIN_Y = 15.45;
// USB Type-C plug overmold, maximum 12.35 wide (USB Type-C spec, plug
// overmold boundary); the length drawn is cut short.
export const USBC_PLUG_WIDTH = 12.35;
export const USBC_PLUG_LENGTH = 15;

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
// (The datasheet's ears are smaller: J3_BODY below. These keep a margin.)
export const J3_EAR_KEEPOUTS: Rect[] = [
  { x0: 38.4, y0: 0, x1: 45.1, y1: 9 },
  { x0: 67, y0: 0, x1: 73.7, y1: 9 },
];
/**
 * [DS] The housing of J3 (LCSC C21263091 datasheet rev A2), T-shaped seen from
 * the top: the body, 25.0 long (DIM D), stands beyond the board edge up to the
 * mouth; the ears at its ends, 34.8 overall (DIM E), clamp the board. The
 * side view gives the ears 8.80 along y, 2.35 of it beyond the board edge
 * (the slot for the board is 6.45 deep), and their thickness 6.44 (z +-3.22
 * about the mid-plane). The body is 3.78 thick on either side of the
 * mid-plane, and 5.22 on the component side for the first 3.63 from the mouth.
 * Half lengths from J3_ORIGIN.x; y in design coordinates.
 */
export const J3_BODY = {
  bodyHalf: 12.5,
  earHalf: 17.4,
  earY0: -2.35,
  earY1: 6.45,
  earHalfZ: 3.22,
  bodyHalfZ: 3.78,
  lipZ: 5.22,
  lipLength: 3.63,
};

// --- The card ---------------------------------------------------------------

/** Rear end of the card's board: 45.65 from contact 1 (CEM 6-4). [EST] */
export const CARD_REAR_X = J3_ORIGIN.x - 9.5 - 45.65;
/**
 * [DS] Mouth of J3 (the top face of the housing): 10.2 from the board edge.
 * Section G-G of the datasheet gives 7.77 from the mouth to the floor of the
 * card's cavity; the floor is 2.43 above the bottom of the body, which sits
 * on the board edge (the slot for the board ends there; read off the drawing
 * at its scale, 39.5 px/mm, checked against the 4.09 to the lower contact).
 * The EasyEDA 3D model (CONN-SMD_36P-P1.00_X1613WS-36-9TV01) has 10.0.
 * To be measured on the delivered J3 before the case is ordered
 * (docs/mechanical.md, "実物で測る所" 4).
 */
export const J3_MOUTH_Y = -10.2;
/** [DS] Mouth to the floor of the card's cavity (section G-G). */
export const J3_CAVITY_DEPTH = 7.77;
/**
 * The bottom of the card's edge fingers (CEM datum W) rests on the floor of
 * the cavity.
 */
export const CARD_SEAT_Y = J3_MOUTH_Y + J3_CAVITY_DEPTH;
/**
 * [CEM] R4.0 Fig 61 (Detail F): the card's lower edge beside the fingers (the
 * shoulder) is 8.25 above the bottom of the tabs, which are 4.50 above datum W
 * (111.15 - 106.65): 12.75 in all. The shoulder therefore stands 4.98 beyond
 * the mouth.
 */
export const CARD_SHOULDER_HEIGHT = 12.75;
export const CARD_EDGE_Y = CARD_SEAT_Y - CARD_SHOULDER_HEIGHT;
/**
 * [CEM] R4.0 Fig 37: the finger tongue runs from 12.15 on the side of contact
 * 1 to 8.15 (DIM B, x1) on the other side of datum X (the key, J3_ORIGIN.x + 2).
 */
export const CARD_TONGUE = {
  x0: J3_ORIGIN.x + 2 - 12.15,
  x1: J3_ORIGIN.x + 2 + 8.15,
};
// [CEM] Tallest full-height card. The real card's height and length are not
// published; the length drawn is a placeholder.
export const CARD_MAX_HEIGHT = 111.15;
export const CARD_LENGTH_DRAWN = 125;
/** The drawings of the card and the bracket are cut off this far above the card edge. */
const REFERENCE_DRAWN_HEIGHT = 12;

// --- Bracket of the card (all [EST], CEM figures 6-4 and 6-16) --------------

// Plate thickness: catalogue values of brackets are 0.81 to 0.86.
export const BRACKET_THICKNESS = 0.86;
// The bracket is fixed to the card, so it moves with the card's shoulder.
// The two lengths below were read with the shoulder at y = -13 (7.68 and
// 14.95 then) and are kept as distances from the shoulder.
/** The plate is full width up to here, then narrows at 45 degrees to the tongue. */
export const BRACKET_FULL_WIDTH_Y = CARD_EDGE_Y + 20.68;
// Full-height bracket only (the card's maker lists no low-profile bracket).
export const BRACKET_TONGUE_Y = CARD_EDGE_Y + 27.95;
/** Extent of the plate across the board thickness; z = 0 is the board centre, + is the top. */
export const BRACKET_Z = { min: -2.06, max: 16.36 };
export const BRACKET_TONGUE_Z = { min: 2.05, max: 12.24 };

// [LAY] The rear edge steps in next to the card to let the bracket plate pass.
// The plate's lower edge rises at 45 degrees from z = -2.06 at the end of the
// full width and leaves the top surface of the board (z = +0.8) 2.86 later
// (y = 8.36 with the J3 of the datasheet; 10.54 if the mouth were at -8.1 as
// first estimated); 11.5 covers both. The board is not remade for this.
export const REAR_STEP = 1.5;
export const REAR_STEP_DEPTH = 11.5;

// --- Sockets for the card's internal USB cables (J4, J6) ----------------------

// [LAY] Side by side on the card-side edge, mating faces towards the card:
// the plugs stand out over the gap to the card and the cables run along it
// to the card's two ports. J6 ends 0.45 short of the rear ear of J3 (x 38.4), J4
// one courtyard further west; the bleeder of pdPc sits south of J4. Centres of the land patterns (lib/footprints.ts PH4_SIDE_ENTRY).
/** Mating face from the card-side edge: the nails are 0.2 in front of it, 0.35 from the edge. */
export const CARD_USB_FACE_Y = 0.55;
const PH_FACE_TO_ORIGIN = 4.4;
export const J4_POS: Point = {
  x: 18.9,
  y: CARD_USB_FACE_Y + PH_FACE_TO_ORIGIN,
};
export const J6_POS: Point = {
  x: 31.6,
  y: CARD_USB_FACE_Y + PH_FACE_TO_ORIGIN,
};
// [DS] PHR-4 housing: 9.8 wide (2.0 x 3 + 3.8), 4.5 high. [EST] It stands
// out about 6 from the mating face when pushed home; the cable bends
// within 4 more.
export const PH_PLUG = { width: 9.8, out: 6, bend: 4, height: 4.5 };
const phPlug = (c: Point): Rect => ({
  x0: c.x - PH_PLUG.width / 2,
  y0: CARD_USB_FACE_Y - PH_PLUG.out - PH_PLUG.bend,
  x1: c.x + PH_PLUG.width / 2,
  y1: CARD_USB_FACE_Y,
});
/** The plugs and the start of their cables, off the board towards the card. */
export const CARD_USB_PLUGS: Rect[] = [phPlug(J4_POS), phPlug(J6_POS)];

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
  // Behind the rear ear of J3, between the J6 socket and the 12 V area; the
  // card edge east of J1 is taken by the sockets J4 and J6.
  { x: 41.75, y: 12.4 },
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
      x0: CARD_TONGUE.x0,
      y0: CARD_EDGE_Y,
      x1: CARD_TONGUE.x1,
      y1: CARD_SEAT_Y,
    }),
  },
  ...CARD_USB_PLUGS.map((r, i) => ({
    label: `${i === 0 ? "J4" : "J6"} plug`,
    points: rectPoints(r),
  })),
  usbcPlug("USB-C plug (PC)", J1_Y),
  usbcPlug("USB-C plug (charger)", J2_Y),
  ...J3_EAR_KEEPOUTS.map((r) => ({ label: "J3 ear", points: rectPoints(r) })),
];
