// The bottom ground in one piece.
import { expect, test } from "bun:test";
import type { Circuit } from "../tools/circuit";
import { groundPlane } from "./ground";
import { board, net, pour, track } from "./testboard";

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
