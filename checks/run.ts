// Runs the checks that need the built circuit.json. Run after `bun run build`.
import { loadCircuit } from "../tools/circuit";
import { builtNetlist, compareNetlists, loadFixture } from "../tools/netlist";
import { CHECKS, runChecks, skippedChecks } from "./board";
import { DESIGN_CHECKS, runDesignChecks, valuesOf } from "./design";

// --strict: a skipped check and an open layout finding are failures. Without
// it, the checks that depend on routing only report, because the blocks are
// routed one by one (docs/routing.md). Stage 4 ends by turning --strict on.
const strict = Bun.argv.includes("--strict");
const circuit = await loadCircuit(
  Bun.argv.slice(2).find((a) => !a.startsWith("--")),
);

const all = runChecks(circuit);
const open = strict ? [] : all.filter((f) => f.layout);
const board = all.filter((f) => !open.includes(f));
const skipped = skippedChecks(circuit);
for (const f of skipped) console.log(`[${f.check}] ${f.message}`);
for (const f of open) console.log(`(open) [${f.check}] ${f.message}`);
for (const f of board) console.log(`[${f.check}] ${f.message}`);
console.log(
  `board checks: ${CHECKS.length} checks, ${board.length} findings, ${open.length} open, ${skipped.length} skipped`,
);

const design = runDesignChecks(valuesOf(circuit));
for (const f of design) console.log(`[${f.check}] ${f.message}`);
console.log(
  `design checks: ${Object.keys(DESIGN_CHECKS).length} checks, ${design.length} findings`,
);

const reference = await loadFixture();
const built = builtNetlist(circuit);
const differences = compareNetlists(reference, built);
for (const d of differences) console.log(`[netlist] ${d}`);
const openPads = built.nets.filter((n) => n.length === 1).length;
console.log(
  `netlist: ${Object.keys(built.components).length} parts, ${built.nets.length - openPads} nets, ${openPads} open pads, ${differences.length} differences from rev D`,
);

if (strict && skipped.length > 0)
  console.log(`--strict: ${skipped.length} checks were skipped`);
if (
  board.length + design.length + differences.length > 0 ||
  (strict && skipped.length > 0)
)
  process.exit(1);
