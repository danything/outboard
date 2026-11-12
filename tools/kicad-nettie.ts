// Marks the closed solder jumpers as net ties in the exported KiCad board.
//
// A closed jumper (lib/parts.tsx, ClosedJumper) has a copper bridge between
// its two pads and its two pins on different nets, as in rev D: tscircuit
// knows the pins are tied (internally_connected_source_port_ids), but the
// KiCad export does not carry that, and KiCad's DRC would call the bridge a
// short. KiCad's own bridged jumpers are net ties; this adds the same
// `net_tie_pad_groups` to these footprints. Run after `tsci build`.
import { type Circuit, elementsOf, loadCircuit } from "./circuit";

export const KICAD_PCB = "dist/index/kicad/index.kicad_pcb";

/** References of the parts whose pins are tied inside the part, with the pad groups. */
export const tiedParts = (circuit: Circuit): Map<string, string[][]> => {
  const ports = new Map(
    elementsOf(circuit, "source_port").map((p) => [p.source_port_id, p]),
  );
  const out = new Map<string, string[][]>();
  for (const c of elementsOf(circuit, "source_component")) {
    const groups = c.internally_connected_source_port_ids ?? [];
    if (groups.length === 0) continue;
    out.set(
      c.name,
      groups.map((g) =>
        g.map((id) => {
          const p = ports.get(id);
          const n = p?.pin_number;
          if (n === undefined)
            throw new Error(`${c.name}: port ${id} has no pin number`);
          return String(n);
        }),
      ),
    );
  }
  return out;
};

/** The board text with a net tie added to every footprint in `tied`. */
export const addNetTies = (
  pcb: string,
  tied: Map<string, string[][]>,
): string => {
  const found = new Set<string>();
  // Footprints start with "  (footprint" at the top level of the board.
  const parts = pcb.split(/(?=^ {2}\(footprint\b)/m);
  const out = parts.map((part) => {
    const ref = part.match(/\(property "Reference" "([^"]+)"/)?.[1];
    const groups = ref ? tied.get(ref) : undefined;
    if (!ref || !groups) return part;
    const tie = `    (net_tie_pad_groups ${groups.map((g) => `"${g.join(",")}"`).join(" ")})\n`;
    const withTie = part.replace(/^( {4}\(attr [^\n]*\n)/m, `$1${tie}`);
    if (withTie === part)
      throw new Error(`${ref}: no (attr ...) line to put the net tie after`);
    found.add(ref);
    return withTie;
  });
  const missing = [...tied.keys()].filter((r) => !found.has(r));
  if (missing.length > 0)
    throw new Error(
      `no footprint in the KiCad board for ${missing.join(", ")}`,
    );
  return out.join("");
};

if (import.meta.main) {
  const tied = tiedParts(await loadCircuit());
  const pcb = await Bun.file(KICAD_PCB).text();
  await Bun.write(KICAD_PCB, addNetTies(pcb, tied));
  console.log(`net ties: ${[...tied.keys()].join(", ") || "none"}`);
}
