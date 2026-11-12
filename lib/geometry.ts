// Board coordinates used throughout the design notes: origin at the rear
// (bracket side) corner of the card-side edge, x to the right, y away from the
// card, in millimetres. tscircuit has y pointing up, so y is negated here and
// nowhere else.
export interface Point {
  x: number;
  y: number;
}

export const BOARD_WIDTH = 88;
export const BOARD_DEPTH = 56;
export const BOARD_THICKNESS = 1.6;

// The rear edge steps in by this much next to the card (y < REAR_STEP_DEPTH)
// to clear the card's bracket.
export const REAR_STEP = 1.5;
export const REAR_STEP_DEPTH = 10;

// Key notch of the PCIe x1 straddle connector J3 (between contacts 11 and 12).
export const KEY_NOTCH_X = 58.05;
export const KEY_NOTCH_WIDTH = 1.9;
export const KEY_NOTCH_DEPTH = 6;

export const MOUNTING_HOLE_DIAMETER = 3.2;

/** Convert design-note coordinates to tscircuit coordinates. */
export const at = (x: number, y: number): Point => ({ x, y: -y });

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

export const mountingHoles: [Point, Point, Point, Point] = [
  at(84, 4),
  at(84, BOARD_DEPTH - 4),
  at(4, BOARD_DEPTH - 4),
  at(30, 4),
];
