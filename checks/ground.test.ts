// The bottom ground in one piece.
import { expect, test } from "bun:test";
import type { Circuit } from "../tools/circuit";
import { groundPlane } from "./ground";
import { board, net, pour, track, via } from "./testboard";

const routed = (extra: Circuit): Circuit => [
  board(40, 30),
  net("GND"),
  net("A"),
  pour("GND", "bottom", [-19, -14, 19, 14]),
  ...extra,
];

test("groundPlane passes when a bottom track leaves the ground in one piece", () => {
  const short = track(
    "A",
    0.2,
    [
      [-5, 0],
      [5, 0],
    ],
    "bottom",
  );
  expect(groundPlane(routed(short))).toEqual([]);
});

test("groundPlane fails when a bottom track cuts the ground in two", () => {
  const across = track(
    "A",
    0.2,
    [
      [0, -16],
      [0, 16],
    ],
    "bottom",
  );
  const found = groundPlane(routed(across));
  expect(found).toHaveLength(1);
  expect(found[0]?.message).toContain("separate piece");
});

test("groundPlane ignores copper of other nets on top", () => {
  const top = track("A", 0.2, [
    [0, -16],
    [0, 16],
  ]);
  expect(groundPlane(routed(top))).toEqual([]);
});

test("groundPlane fails on a ground via cut off in a hole of another net's area", () => {
  // Q4's emitter: its via in a small hole of the bottom VIN area.
  const island = [
    net("VIN"),
    pour("VIN", "bottom", [-5, -5, 5, 5], [[-0.6, -0.6, 0.6, 0.6]]),
    via("GND", 0, 0),
  ];
  const found = groundPlane(routed(island)).map((f) => f.message);
  expect(found).toEqual([
    "GND via at (0.00, 0.00) is not on the main piece of the bottom ground",
  ]);
  // The same via outside the area is fine.
  expect(groundPlane(routed([net("VIN"), via("GND", 10, 10)]))).toEqual([]);
});
