// Collects everything a board order needs into dist/fab:
// Gerbers, BOM and placement list (JLCPCB column names), schematic PDF,
// board pictures, circuit.json, and a SHA256SUMS file over all of them.
// Run after `bun run build`.
import { mkdir, readdir, rm } from "node:fs/promises";
import { REVISION } from "../lib/revision";
import { CIRCUIT_JSON, type Circuit, elementsOf, loadCircuit } from "./circuit";

const ENTRY = "index.circuit.tsx";
const OUT = "dist/fab";

const quote = (cell: string): string =>
  /[",\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell;

const csv = (rows: string[][]): string =>
  rows.map((r) => r.map(quote).join(",")).join("\n") + "\n";

const run = async (args: string[]): Promise<void> => {
  const proc = Bun.spawn(["bunx", "tsci", ...args], {
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await proc.exited) !== 0)
    throw new Error(`tsci ${args.join(" ")} failed`);
};

const exportAs = (
  format: string,
  file: string,
  extra: string[] = [],
): Promise<void> =>
  run([
    "export",
    ENTRY,
    "-f",
    format,
    "-o",
    `${OUT}/${file}`,
    "--disable-parts-engine",
    ...extra,
  ]);

export interface Part {
  designator: string;
  comment: string;
  footprint: string;
  lcsc: string;
  x: number;
  y: number;
  layer: "Top" | "Bottom";
  rotation: number;
}

// Only parts with an LCSC number are assembled; everything else is a bare footprint.
export const assembledParts = (circuit: Circuit): Part[] => {
  const sources = new Map(
    elementsOf(circuit, "source_component").map((s) => [
      s.source_component_id,
      s,
    ]),
  );
  const parts: Part[] = [];
  for (const pcb of elementsOf(circuit, "pcb_component")) {
    const source = sources.get(pcb.source_component_id);
    const lcsc = source?.supplier_part_numbers?.jlcpcb?.[0];
    if (!source || !lcsc) continue;
    parts.push({
      designator: source.name,
      comment:
        source.manufacturer_part_number ?? source.display_value ?? source.name,
      footprint: source.ftype ?? "",
      lcsc,
      x: pcb.center.x,
      y: pcb.center.y,
      layer: pcb.layer === "bottom" ? "Bottom" : "Top",
      rotation: pcb.rotation,
    });
  }
  return parts.sort((a, b) =>
    a.designator.localeCompare(b.designator, "en", { numeric: true }),
  );
};

export const bomCsv = (parts: Part[]): string => {
  const groups = new Map<string, Part[]>();
  for (const p of parts) groups.set(p.lcsc, [...(groups.get(p.lcsc) ?? []), p]);
  const rows = [...groups.values()].map((g) => {
    const first = g[0];
    if (!first) throw new Error("empty BOM group");
    return [
      first.comment,
      g.map((p) => p.designator).join(","),
      first.footprint,
      first.lcsc,
    ];
  });
  return csv([["Comment", "Designator", "Footprint", "LCSC Part #"], ...rows]);
};

export const cplCsv = (parts: Part[]): string =>
  csv([
    ["Designator", "Mid X", "Mid Y", "Layer", "Rotation"],
    ...parts.map((p) => [
      p.designator,
      `${p.x.toFixed(3)}mm`,
      `${p.y.toFixed(3)}mm`,
      p.layer,
      String(p.rotation),
    ]),
  ]);

const sha256 = async (path: string): Promise<string> =>
  new Bun.CryptoHasher("sha256")
    .update(await Bun.file(path).arrayBuffer())
    .digest("hex");

if (import.meta.main) {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const circuit = await loadCircuit();
  const parts = assembledParts(circuit);
  const name = `outboard-${REVISION}`;

  await Bun.write(`${OUT}/${name}-bom.csv`, bomCsv(parts));
  await Bun.write(`${OUT}/${name}-cpl.csv`, cplCsv(parts));
  await Bun.write(`${OUT}/${name}-circuit.json`, Bun.file(CIRCUIT_JSON));
  await Bun.write(`${OUT}/${name}-3d.png`, Bun.file("dist/index/3d.png"));
  await exportAs("gerbers", `${name}-gerbers.zip`);
  await exportAs("schematic-pdf", `${name}-schematic.pdf`);
  await exportAs("pcb-png", `${name}-top.png`, ["--layer", "top"]);
  await exportAs("pcb-png", `${name}-bottom.png`, ["--layer", "bottom"]);

  const files = (await readdir(OUT)).sort();
  const sums = await Promise.all(
    files.map(async (f) => `${await sha256(`${OUT}/${f}`)}  ${f}`),
  );
  await Bun.write(`${OUT}/SHA256SUMS`, sums.join("\n") + "\n");
  console.log(`${OUT}: ${files.length} files, ${parts.length} assembled parts`);
}
