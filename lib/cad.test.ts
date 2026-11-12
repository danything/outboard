// The 3D models (lib/cad.ts) stay inside the heights the mechanical check
// uses, every assembled land pattern has a drawn model, and a land pattern
// added later still gets a sensible shape without an entry of its own.
import { expect, test } from "bun:test";
import { HEIGHT_FALLBACK } from "../checks/rules";
import { hasModel, solidsOf } from "./cad";
import * as all from "./footprints";
import type { FootprintDef, Pad } from "./footprints";

const defs = Object.entries(all).filter(
  (entry): entry is [string, FootprintDef] =>
    typeof entry[1] === "object" && "courtyard" in entry[1],
);

/** Land patterns that are never assembled (bare copper, empty holes). */
const BARE = [
  "HEADER_1X2",
  "TESTPOINT_1V5",
  "SOLDER_JUMPER",
  "SOLDER_JUMPER_CLOSED",
];

const top = (def: FootprintDef): number =>
  Math.max(...solidsOf(def).flatMap((s) => s.vertices.map((v) => v[2])));

test("every assembled land pattern has a drawn model", () => {
  const missing = defs
    .filter(([name, def]) => !BARE.includes(name) && !hasModel(def))
    .map(([name]) => name);
  expect(missing).toEqual([]);
});

test("no model is taller than the height the checks use", () => {
  const over = defs
    .filter(([name]) => !BARE.includes(name))
    .flatMap(([name, def]) => {
      const limit = def.height ?? HEIGHT_FALLBACK[name];
      if (limit === undefined) return [`${name}: no height`];
      // Marks on the top (cathode band, pin-1 dot) may stand 0.02 proud.
      return top(def) > limit + 0.03 ? [`${name}: ${top(def)} > ${limit}`] : [];
    });
  expect(over).toEqual([]);
});

const pad = (pin: number, x: number, y: number, w: number, h: number): Pad => ({
  pin: String(pin),
  x,
  y,
  w,
  h,
});

test("a QFN without a model of its own is drawn as a no-lead package", () => {
  // QFN-16, 3 x 3, 0.5 pitch: four pads a side and the exposed pad.
  const side = [-0.75, -0.25, 0.25, 0.75];
  const qfn: FootprintDef = {
    pads: [
      ...side.map((y, i) => pad(i + 1, -1.45, -y, 0.8, 0.25)),
      ...side.map((x, i) => pad(i + 5, x, -1.45, 0.25, 0.8)),
      ...side.map((y, i) => pad(i + 9, 1.45, y, 0.8, 0.25)),
      ...side.map((x, i) => pad(i + 13, -x, 1.45, 0.25, 0.8)),
      pad(17, 0, 0, 1.7, 1.7),
    ],
    courtyard: { x0: -2, y0: -2, x1: 2, y1: 2 },
  };
  const solids = solidsOf(qfn);
  const xs = solids.flatMap((s) => s.vertices.map((v) => v[0]));
  expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(3.0, 1);
  expect(top(qfn)).toBeCloseTo(0.9, 5);
  // The body and one lead end for each of the 16 leads.
  expect(solids.length).toBe(17);
});

test("four pads in a square without a model of their own are drawn as a crystal", () => {
  // 3225 crystal land: 1.4 x 1.15 pads, centres 2.2 x 1.6 apart.
  const xtal: FootprintDef = {
    pads: [
      pad(1, -1.1, -0.8, 1.4, 1.15),
      pad(2, 1.1, -0.8, 1.4, 1.15),
      pad(3, 1.1, 0.8, 1.4, 1.15),
      pad(4, -1.1, 0.8, 1.4, 1.15),
    ],
    courtyard: { x0: -2.2, y0: -1.8, x1: 2.2, y1: 1.8 },
  };
  const xs = solidsOf(xtal).flatMap((s) => s.vertices.map((v) => v[0]));
  expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(3.2, 1);
  expect(top(xtal)).toBeCloseTo(0.8, 5);
});

test("anything else gets a box of its body and height", () => {
  const odd: FootprintDef = {
    pads: [pad(1, -2, 0, 1, 1), pad(2, 2, 0, 1, 1), pad(3, 0, 2, 1, 1)],
    courtyard: { x0: -3, y0: -1, x1: 3, y1: 3 },
    height: 2.5,
  };
  expect(solidsOf(odd)).toHaveLength(1);
  expect(top(odd)).toBe(2.5);
});
