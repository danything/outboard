import { expect, test } from "bun:test";
import * as fp from "./footprints";
import {
  BOARD_DEPTH,
  BOARD_WIDTH,
  J1_Y,
  J2_Y,
  J3_EAR_KEEPOUTS,
  MAX_PART_HEIGHT,
  MOUNTING_HOLE_KEEPOUT_RADIUS,
  MOUNTING_HOLE_POSITIONS,
  REAR_STEP,
  REAR_STEP_DEPTH,
  type Rect,
  USBC_PLUG_WIDTH,
  USBC_SHELL_MIN_Y,
  USBC_SHELL_WIDTH,
} from "./geometry";
import {
  BLOCKS,
  type BlockName,
  HANDOFFS,
  PLACEMENT,
  type Placed,
} from "./placement";

const EPS = 1e-6;

const overlap = (a: Rect, b: Rect): number =>
  Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) *
  Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

const area = (r: Rect): number => (r.x1 - r.x0) * (r.y1 - r.y0);

const byRef = (ref: string): Placed => {
  const part = PLACEMENT.find((q) => q.ref === ref);
  if (!part) throw new Error(`${ref} is not placed`);
  return part;
};

const distance = (a: Placed, b: Placed): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

const range = (prefix: string, numbers: number[]): string[] =>
  numbers.map((n) => `${prefix}${n}`);
const upTo = (n: number): number[] =>
  Array.from({ length: n }, (_, i) => i + 1);

// The parts of rev D and the hub (tools/netlist.ts checks this list again).
const REFS = [
  ...range("C", upTo(38)),
  ...range("D", [1, 2, 4, 5, 6, 7]),
  "F1",
  "F2",
  ...range("J", upTo(6)),
  ...range("JP", upTo(7)),
  ...range("L", [1, 2]),
  ...range("LED", [3, 5]),
  ...range("Q", upTo(4)),
  ...range("R", [1, 3, 4, ...upTo(42).filter((n) => n >= 6 && n !== 17)]),
  ...range("TP", upTo(5)),
  ...range("U", upTo(9)),
  "Y1",
];

test("every part is placed exactly once", () => {
  // 111 of rev D, J4 replaced, 9 added for the hub.
  expect(REFS).toHaveLength(121);
  expect(PLACEMENT.map((q) => q.ref).sort()).toEqual([...REFS].sort());
});

test("no two courtyards overlap", () => {
  const hits: string[] = [];
  PLACEMENT.forEach((a, i) => {
    for (const b of PLACEMENT.slice(i + 1))
      if (overlap(a.courtyard, b.courtyard) > EPS)
        hits.push(`${a.ref}/${b.ref}`);
  });
  expect(hits).toEqual([]);
});

test("parts are on the board; only the USB-C ports reach over an edge", () => {
  const off = PLACEMENT.filter((q) => {
    const c = q.courtyard;
    const left = c.y0 < REAR_STEP_DEPTH ? REAR_STEP : 0;
    return (
      c.x0 < left - EPS ||
      c.y0 < -EPS ||
      c.x1 > BOARD_WIDTH + EPS ||
      c.y1 > BOARD_DEPTH + EPS
    );
  }).map((q) => q.ref);
  expect(off.sort()).toEqual(["J1", "J2"]);
});

test("each part lies inside the region of its block", () => {
  const outside = PLACEMENT.filter((q) => {
    // The connectors that reach over the edge are checked on the board side only.
    const c: Rect = {
      x0: Math.max(
        q.courtyard.x0,
        q.courtyard.y0 < REAR_STEP_DEPTH ? REAR_STEP : 0,
      ),
      y0: Math.max(q.courtyard.y0, 0),
      x1: q.courtyard.x1,
      y1: q.courtyard.y1,
    };
    const covered = BLOCKS[q.block].region.reduce(
      (sum, r) => sum + overlap(c, r),
      0,
    );
    return Math.abs(covered - area(c)) > 1e-3;
  }).map((q) => q.ref);
  expect(outside).toEqual([]);
});

test("block regions do not overlap", () => {
  const rects = (Object.keys(BLOCKS) as BlockName[]).flatMap((name) =>
    BLOCKS[name].region.map((r) => ({ name, r })),
  );
  const hits: string[] = [];
  rects.forEach((a, i) => {
    for (const b of rects.slice(i + 1))
      if (overlap(a.r, b.r) > EPS) hits.push(`${a.name}/${b.name}`);
  });
  expect(hits).toEqual([]);
});

test("keep-out areas are free of parts", () => {
  const keepouts: { name: string; r: Rect; allow: string[] }[] = [
    ...J3_EAR_KEEPOUTS.map((r) => ({ name: "J3 ear", r, allow: ["J3"] })),
    ...MOUNTING_HOLE_POSITIONS.map((c, i) => ({
      name: `H${i + 1}`,
      r: {
        x0: c.x - MOUNTING_HOLE_KEEPOUT_RADIUS,
        y0: c.y - MOUNTING_HOLE_KEEPOUT_RADIUS,
        x1: c.x + MOUNTING_HOLE_KEEPOUT_RADIUS,
        y1: c.y + MOUNTING_HOLE_KEEPOUT_RADIUS,
      },
      allow: [],
    })),
  ];
  const hits = keepouts.flatMap((k) =>
    PLACEMENT.filter(
      (q) => !k.allow.includes(q.ref) && overlap(q.courtyard, k.r) > EPS,
    ).map((q) => `${q.ref} in ${k.name}`),
  );
  expect(hits).toEqual([]);
});

test("USB-C ports clear the bracket tongue, each other's plugs and H3", () => {
  expect(J1_Y - USBC_SHELL_WIDTH / 2).toBeGreaterThanOrEqual(USBC_SHELL_MIN_Y);
  expect(J2_Y - J1_Y).toBeGreaterThanOrEqual(USBC_PLUG_WIDTH + 0.5);
  expect(J2_Y + USBC_SHELL_WIDTH / 2).toBeLessThanOrEqual(BOARD_DEPTH - 1);
  expect(byRef("J1").y).toBe(J1_Y);
  expect(byRef("J2").y).toBe(J2_Y);
});

test("LEDs sit within 1 mm of the far edge, at least 5 mm apart", () => {
  const leds = [byRef("LED3"), byRef("LED5")];
  for (const led of leds) {
    // The body is 0.8 wide.
    expect(BOARD_DEPTH - (led.y + 0.4)).toBeLessThanOrEqual(1);
    expect(led.courtyard.y1).toBeLessThanOrEqual(BOARD_DEPTH);
  }
  expect(distance(byRef("LED3"), byRef("LED5"))).toBeGreaterThanOrEqual(5);
});

test("the PTC is at least 8 mm from the parts that get warm", () => {
  for (const ref of ["Q1", "D4", "L2"])
    expect(distance(byRef("F1"), byRef(ref))).toBeGreaterThanOrEqual(8);
});

test("no part is taller than the case allows", () => {
  const tall = PLACEMENT.filter(
    (q) => (fp[q.footprint].height ?? 0) > MAX_PART_HEIGHT,
  ).map((q) => q.ref);
  expect(tall).toEqual([]);
});

test("handoff points lie on the edge of the block they leave", () => {
  const onEdge = (x: number, y: number, r: Rect): boolean => {
    const within =
      x >= r.x0 - EPS && x <= r.x1 + EPS && y >= r.y0 - EPS && y <= r.y1 + EPS;
    const edge =
      Math.abs(x - r.x0) < EPS ||
      Math.abs(x - r.x1) < EPS ||
      Math.abs(y - r.y0) < EPS ||
      Math.abs(y - r.y1) < EPS;
    return within && edge;
  };
  const off = HANDOFFS.filter(
    (hand) => !BLOCKS[hand.from].region.some((r) => onEdge(hand.x, hand.y, r)),
  ).map((hand) => `${hand.net} ${hand.from}->${hand.to}`);
  expect(off).toEqual([]);
});

test("each handoff is found by its net and its two blocks alone", () => {
  const keys = HANDOFFS.map((hand) => `${hand.net} ${hand.from}->${hand.to}`);
  expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([]);
});
