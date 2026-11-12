// docs/mechanical.md repeats a few numbers of lib/geometry.ts for readers.
// This keeps them the same.
import { expect, test } from "bun:test";
import {
  BOARD_DEPTH,
  BOARD_WIDTH,
  J1_Y,
  J2_Y,
  J4_ORIGIN,
  MOUNTING_HOLE_POSITIONS,
  REAR_STEP,
  REAR_STEP_DEPTH,
  USBC_SHELL_WIDTH,
} from "./geometry";

const doc = await Bun.file(
  new URL("../docs/mechanical.md", import.meta.url),
).text();

const cells = (line: string): string[] =>
  line
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());

const round = (v: number): number => Math.round(v * 100) / 100;

test("mounting hole table", () => {
  MOUNTING_HOLE_POSITIONS.forEach((hole, i) => {
    const row = doc
      .split("\n")
      .map(cells)
      .find((c) => c[0] === `H${i + 1}`);
    expect(row?.slice(1, 3)).toEqual([String(hole.x), String(round(hole.y))]);
  });
});

test("outline, step and connector positions", () => {
  expect(doc).toContain(`長さ (x) ${BOARD_WIDTH} × 奥行き (y) ${BOARD_DEPTH}`);
  expect(doc).toContain(
    `y < ${REAR_STEP_DEPTH} では辺を x = ${REAR_STEP} に引っ込める`,
  );
  expect(doc).toContain(`J1 (PC) は y = ${J1_Y}、J2 (充電器) は y = ${J2_Y}`);
  expect(doc).toContain(`原点 (${J4_ORIGIN.x}, ${J4_ORIGIN.y})`);
});

test("the depth budget adds up", () => {
  const half = USBC_SHELL_WIDTH / 2;
  const parts = [
    J1_Y - half,
    USBC_SHELL_WIDTH,
    J2_Y - J1_Y - USBC_SHELL_WIDTH,
    USBC_SHELL_WIDTH,
    BOARD_DEPTH - J2_Y - half,
  ];
  for (const part of parts) expect(doc).toContain(`| ${round(part)} `);
  expect(round(parts.reduce((a, b) => a + b, 0))).toBe(BOARD_DEPTH);
});
