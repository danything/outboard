// Board checks that read circuit.json. tscircuit's own checks and the KiCad
// DRC run separately; these hold the rules that are specific to this board.
import { BOARD_THICKNESS, MOUNTING_HOLE_DIAMETER } from "../lib/geometry";
import { type Circuit, elementsOf } from "../tools/circuit";
import { FAB_CHECKS } from "./fab";
import { GROUND_CHECKS } from "./ground";
import { HANDOFF_CHECKS } from "./handoffs";
import { MECHANICAL_CHECKS } from "./mechanical";
import { PLACEMENT_CHECKS } from "./placement";
import { POWER_CHECKS } from "./power";
import { SIGNAL_CHECKS } from "./signal";

import { type Check, type Finding } from "./finding";

export { type Check, type Finding, skip } from "./finding";

/** JLCPCB's cheapest price tier ends at 100 x 100 mm. */
export const MAX_BOARD_SIZE = 100;
const EPSILON = 1e-6;

export const boardSize: Check = (circuit) => {
  const findings: Finding[] = [];
  const boards = elementsOf(circuit, "pcb_board");
  if (boards.length !== 1)
    return [
      {
        check: "boardSize",
        message: `expected 1 pcb_board, found ${boards.length}`,
      },
    ];
  for (const board of boards) {
    const { width, height, thickness } = board;
    if (width === undefined || height === undefined) {
      findings.push({
        check: "boardSize",
        message: "board has no width/height",
      });
      continue;
    }
    if (width > MAX_BOARD_SIZE + EPSILON || height > MAX_BOARD_SIZE + EPSILON)
      findings.push({
        check: "boardSize",
        message: `board is ${width} x ${height} mm, limit is ${MAX_BOARD_SIZE}`,
      });
    // J3 straddles the board edge and is made for this thickness.
    if (Math.abs(thickness - BOARD_THICKNESS) > EPSILON)
      findings.push({
        check: "boardSize",
        message: `board is ${thickness} mm thick, J3 needs ${BOARD_THICKNESS}`,
      });
  }
  return findings;
};

export const mountingHoleCount: Check = (circuit) => {
  const holes = elementsOf(circuit, "pcb_hole").filter(
    (h) =>
      h.hole_shape === "circle" &&
      Math.abs(h.hole_diameter - MOUNTING_HOLE_DIAMETER) < EPSILON,
  );
  return holes.length >= 4
    ? []
    : [
        {
          check: "mountingHoleCount",
          message: `expected 4 or more M3 mounting holes, found ${holes.length}`,
        },
      ];
};

export const CHECKS: Check[] = [
  boardSize,
  mountingHoleCount,
  ...FAB_CHECKS,
  ...POWER_CHECKS,
  ...SIGNAL_CHECKS,
  ...MECHANICAL_CHECKS,
  ...HANDOFF_CHECKS,
  ...GROUND_CHECKS,
  ...PLACEMENT_CHECKS,
];

const runAll = (circuit: Circuit): Finding[] =>
  CHECKS.flatMap((check) => check(circuit));

/** Broken rules. An empty list is a pass. */
export const runChecks = (circuit: Circuit): Finding[] =>
  runAll(circuit).filter((f) => !f.skipped);

/** Checks that did not look, each with its reason. */
export const skippedChecks = (circuit: Circuit): Finding[] =>
  runAll(circuit).filter((f) => f.skipped);
