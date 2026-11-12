// Runs the board checks on the built circuit.json. Run after `bun run build`.
import { loadCircuit } from "../tools/circuit";
import { CHECKS, runChecks } from "./board";

const findings = runChecks(await loadCircuit(Bun.argv[2]));
for (const f of findings) console.log(`[${f.check}] ${f.message}`);
console.log(
  `board checks: ${CHECKS.length} checks, ${findings.length} findings`,
);
if (findings.length > 0) process.exit(1);
