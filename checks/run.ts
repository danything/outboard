// Runs the board checks on the built circuit.json. Run after `bun run build`.
import { loadCircuit } from "../tools/circuit";
import { CHECKS, runChecks, skippedChecks } from "./board";

const circuit = await loadCircuit(Bun.argv[2]);
const findings = runChecks(circuit);
const skipped = skippedChecks(circuit);
for (const f of skipped) console.log(`[${f.check}] ${f.message}`);
for (const f of findings) console.log(`[${f.check}] ${f.message}`);
console.log(
  `board checks: ${CHECKS.length} checks, ${findings.length} findings, ${skipped.length} skipped`,
);
if (findings.length > 0) process.exit(1);
