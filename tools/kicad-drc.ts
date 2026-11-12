// Reads the JSON report of `kicad-cli pcb drc` run on the KiCad board that
// tscircuit exported, drops the findings that come from the export itself
// (each with its reason below), and fails on anything left.
// This is the second opinion on the layout: KiCad catches hole sizes, annular
// rings and hole-to-copper overlaps that tscircuit's own checks let through.

export interface Violation {
  type: string;
  severity: string;
  description: string;
  items?: { description: string; pos?: { x: number; y: number } }[];
}

export interface Report {
  violations?: Violation[];
  unconnected_items?: Violation[];
}

interface Exclusion {
  type: string;
  /** When set, only violations whose description matches are dropped. */
  match?: RegExp;
  reason: string;
}

export const EXCLUSIONS: Exclusion[] = [
  {
    type: "lib_footprint_issues",
    reason:
      "The exported board names a footprint library 'tscircuit' that is not a KiCad library; the footprints are embedded in the board.",
  },
];

export const remaining = (report: Report): Violation[] =>
  [...(report.violations ?? []), ...(report.unconnected_items ?? [])].filter(
    (v) =>
      !EXCLUSIONS.some(
        (x) => x.type === v.type && (x.match?.test(v.description) ?? true),
      ),
  );

if (import.meta.main) {
  const path = Bun.argv[2];
  if (!path) throw new Error("usage: bun tools/kicad-drc.ts <drc.json>");
  const report = (await Bun.file(path).json()) as Report;
  const total =
    (report.violations?.length ?? 0) + (report.unconnected_items?.length ?? 0);
  const left = remaining(report);
  for (const v of left) {
    const where = v.items
      ?.map(
        (i) => `${i.description}${i.pos ? ` @(${i.pos.x}, ${i.pos.y})` : ""}`,
      )
      .join(" / ");
    console.log(
      `[${v.type}] ${v.severity}: ${v.description}${where ? ` -- ${where}` : ""}`,
    );
  }
  console.log(
    `KiCad DRC: ${total} reported, ${total - left.length} excluded, ${left.length} left`,
  );
  if (left.length > 0) process.exit(1);
}
