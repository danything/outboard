// tscircuit's own placement checks (the ones <board> runs before routing),
// run here on the built board instead. The board turns them off
// (placementDrcChecksDisabled in index.circuit.tsx) because one of them
// judges which way the connectors face against the wrong board edges;
// that one is left out here and connectorFacing (mechanical.ts) does the job.
// The courtyard overlap check is not exported by @tscircuit/checks; KiCad's
// DRC (tools/kicad-drc.ts) checks courtyards.
//
// @tscircuit/checks comes with tscircuit and moves with it; it is not listed
// in package.json (listing it changes how Bun hoists tscircuit's packages).
import {
  checkCopperToBoardEdgeClearance,
  checkCopperToCutoutClearance,
  checkPadPadClearance,
  checkPcbBendZonePlacement,
  checkPcbBoardSupport,
  checkPcbComponentOverCutout,
  checkPcbComponentOverlap,
  checkPcbComponentsMissingCourtyard,
  checkPcbComponentsOutOfBoard,
  checkPcbCopperOverKeepout,
  checkPcbCourtyardOverKeepout,
  checkTestPointAccessibility,
  checkViasInPads,
} from "@tscircuit/checks";
import type { Circuit } from "../tools/circuit";
import type { Check } from "./finding";

type Run = (circuit: Circuit) => { type: string; message?: string }[];

export const RUNS: [name: string, run: Run][] = [
  ["copperToBoardEdge", checkCopperToBoardEdgeClearance],
  ["viasInPads", checkViasInPads],
  ["componentsOutOfBoard", checkPcbComponentsOutOfBoard],
  ["componentOverCutout", checkPcbComponentOverCutout],
  ["boardSupport", checkPcbBoardSupport],
  [
    "copperToCutout",
    (c) =>
      checkCopperToCutoutClearance(c, {
        elementTypes: [
          "pcb_via",
          "pcb_smtpad",
          "pcb_plated_hole",
          "pcb_copper_pour",
        ],
      }),
  ],
  ["copperOverKeepout", checkPcbCopperOverKeepout],
  ["bendZonePlacement", checkPcbBendZonePlacement],
  ["courtyardOverKeepout", checkPcbCourtyardOverKeepout],
  ["componentOverlap", checkPcbComponentOverlap],
  ["missingCourtyard", checkPcbComponentsMissingCourtyard],
  ["padPadClearance", checkPadPadClearance],
  ["testPointAccessibility", checkTestPointAccessibility],
];

export const tscircuitPlacement: Check = (circuit) =>
  RUNS.flatMap(([name, run]) =>
    run(circuit).map((e) => ({
      check: "tscircuitPlacement",
      message: `${name}: ${e.message ?? e.type}`,
    })),
  );

export const PLACEMENT_CHECKS: Check[] = [tscircuitPlacement];
