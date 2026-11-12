// Drops the solder paste that tscircuit puts on the bottom side (under the
// shell legs of the USB-C receptacles): the board is assembled on one side,
// so there is no bottom stencil. Runs after `tsci build` (package.json build).
import { CIRCUIT_JSON, type Circuit, loadCircuit } from "./circuit";

export const withoutBottomPaste = (circuit: Circuit): Circuit =>
  circuit.filter(
    (e) =>
      !(
        e.type === "pcb_solder_paste" &&
        (e as { layer?: string }).layer === "bottom"
      ),
  );

if (import.meta.main) {
  const circuit = await loadCircuit();
  const kept = withoutBottomPaste(circuit);
  await Bun.write(CIRCUIT_JSON, JSON.stringify(kept));
  console.log(`bottom paste: ${circuit.length - kept.length} openings dropped`);
}
