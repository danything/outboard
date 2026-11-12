// The handoff check: both sides meet at the point, on the layer and at the width.
import { expect, test } from "bun:test";
import type { Handoff } from "../lib/placement";
import type { Circuit } from "../tools/circuit";
import { copperOf } from "./copper";
import { handoffProblems } from "./handoffs";
import { board, net, pour, track } from "./testboard";

// Block "usb" is x -5..0; the line leaves it at x 0, y 0 (y 0 is the same in both coordinates).
const REGION = [{ x0: -5, y0: -2, x1: 0, y1: 2 }];
const H: Handoff = {
  net: "SIG",
  from: "usb",
  to: "mcu",
  x: 0,
  y: 0,
  layer: "top",
  width: 0.2,
};

const problems = (parts: Circuit, h: Handoff = H) =>
  handoffProblems(copperOf([board(), net("SIG"), ...parts]), h, REGION);

const west = (width = 0.2, layer = "top") =>
  track(
    "SIG",
    width,
    [
      [-3, 0],
      [0, 0],
    ],
    layer,
  );
const east = (width = 0.2, layer = "top") =>
  track(
    "SIG",
    width,
    [
      [0, 0],
      [3, 0],
    ],
    layer,
  );

test("two tracks that meet at the point pass", () => {
  expect(problems([...west(), ...east()])).toEqual([]);
});

test("a track that stops at the point is missing the other side", () => {
  expect(problems(west())).toEqual([
    "SIG usb -> mcu at (0, 0) on top: nothing joins it on the mcu side",
  ]);
  expect(problems(east())).toEqual([
    "SIG usb -> mcu at (0, 0) on top: nothing joins it on the usb side",
  ]);
});

test("a track that stops short of the point does not join", () => {
  const short = track("SIG", 0.2, [
    [-3, 0],
    [-0.3, 0],
  ]);
  expect(problems([...short, ...east()])).toEqual([
    "SIG usb -> mcu at (0, 0) on top: nothing joins it on the usb side",
  ]);
});

test("copper on the other layer does not count", () => {
  expect(problems([...west(), ...east(0.2, "bottom")])).toEqual([
    "SIG usb -> mcu at (0, 0) on top: nothing joins it on the mcu side",
  ]);
});

test("a narrower track than the handoff is reported", () => {
  expect(problems([...west(0.15), ...east(0.15)])).toEqual([
    "SIG usb -> mcu at (0, 0) on top: 0.15 mm wide at the point, the handoff says 0.2",
  ]);
});

test("two pours joined by a track across the edge pass at their width", () => {
  const wide = { ...H, width: 2 };
  const pours = [
    pour("SIG", "top", [-4, -1, -0.3, 1]),
    pour("SIG", "top", [0.3, -1, 4, 1]),
  ];
  expect(
    problems(
      [
        ...pours,
        ...track("SIG", 2, [
          [-0.6, 0],
          [0.6, 0],
        ]),
      ],
      wide,
    ),
  ).toEqual([]);
  expect(problems(pours, wide)).toEqual([
    "SIG usb -> mcu at (0, 0) on top: no copper at the point",
  ]);
});

test("a point off the edge of the block is reported", () => {
  expect(problems([...west(), ...east()], { ...H, x: 1 })).toEqual([
    "SIG usb -> mcu at (1, 0) on top: the point is not on the edge of usb",
  ]);
});
