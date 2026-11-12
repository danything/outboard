// Width through the copper as made: a pour is as narrow as its neck.
import { expect, test } from "bun:test";
import type { Circuit } from "../tools/circuit";
import { copperOf, padsOf } from "./copper";
import { gridNarrowest } from "./neck";
import { board, net, part, pour } from "./testboard";

// Two pads 10 mm apart in a 4 mm wide area; a cutout (another net's pad) leaves `neck` mm at y 0..neck.
const strip = (neck: number): Circuit => [
  board(40, 30),
  net("P"),
  ...part("A1", -6, 0, [{ pin: "1", net: "P", x: -6, y: 0, w: 1, h: 1 }]),
  ...part("B1", 6, 0, [{ pin: "1", net: "P", x: 6, y: 0, w: 1, h: 1 }]),
  pour("P", "top", [-7, -2, 7, 2], [[-1, -2.5, 1, 2 - neck]]),
];

const width = (c: Circuit) => {
  const b = copperOf(c);
  return gridNarrowest(b, "P", padsOf(b, "A1.1"), padsOf(b, "B1.1"), 1.5, 2);
};

test("gridNarrowest finds the neck of a pour", () => {
  expect(width(strip(0.5))).toBeCloseTo(0.5, 0);
  expect(width(strip(0.5)) as number).toBeLessThan(0.6);
  expect(width(strip(3)) as number).toBeGreaterThan(2.8);
});

test("gridNarrowest is undefined when nothing joins the pads", () => {
  expect(width(strip(0))).toBeUndefined();
});
