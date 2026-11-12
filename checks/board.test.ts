// Each check must fail on a board that breaks its rule, so a check that
// silently stopped looking would be noticed here.
import { expect, test } from "bun:test";
import type { Circuit } from "../tools/circuit";
import { boardSize, mountingHoleCount, runChecks } from "./board";

const board = (
  width: number,
  height: number,
  thickness: number,
): Circuit[number] => ({
  type: "pcb_board",
  pcb_board_id: "pcb_board_0",
  center: { x: 0, y: 0 },
  width,
  height,
  thickness,
  num_layers: 2,
  material: "fr4",
});

const hole = (i: number, diameter: number): Circuit[number] => ({
  type: "pcb_hole",
  pcb_hole_id: `pcb_hole_${i}`,
  hole_shape: "circle",
  hole_diameter: diameter,
  x: i * 10,
  y: 0,
});

const good: Circuit = [
  board(88, 56, 1.6),
  hole(0, 3.2),
  hole(1, 3.2),
  hole(2, 3.2),
  hole(3, 3.2),
];

test("a board within the rules has no findings", () => {
  expect(runChecks(good)).toEqual([]);
});

test("boardSize fails on a board over 100 mm", () => {
  expect(boardSize([board(101, 56, 1.6)])).toHaveLength(1);
});

test("boardSize fails on the wrong thickness", () => {
  expect(boardSize([board(88, 56, 1.2)])).toHaveLength(1);
});

test("boardSize fails when there is no board", () => {
  expect(boardSize([])).toHaveLength(1);
});

test("mountingHoleCount fails with three M3 holes", () => {
  expect(
    mountingHoleCount([
      board(88, 56, 1.6),
      hole(0, 3.2),
      hole(1, 3.2),
      hole(2, 3.2),
      hole(3, 2.0),
    ]),
  ).toHaveLength(1);
});
