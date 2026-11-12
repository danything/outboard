// Reads the JSON report of `kicad-cli pcb drc` run on the KiCad board that
// tscircuit exported, drops the findings that come from the export itself
// (each with its reason below), and fails on anything left.
// This is the second opinion on the layout. What it guards and what the
// checks in checks/ guard is laid out in docs/checks.md.

export interface Item {
  description: string;
  pos?: { x: number; y: number };
}

export interface Violation {
  type: string;
  severity: string;
  description: string;
  items?: Item[];
}

export interface Report {
  violations?: Violation[];
  unconnected_items?: Violation[];
}

interface Exclusion {
  type: string;
  /** When set, only violations with an item that matches are dropped. */
  item?: RegExp | ((item: Item) => boolean);
  reason: string;
  /** Must be gone before a board is ordered; printed on every run. */
  temporary?: boolean;
}

export const EXCLUSIONS: Exclusion[] = [
  {
    type: "lib_footprint_issues",
    reason:
      "The exported board names a footprint library 'tscircuit' that is not a KiCad library; the footprints are embedded in the board.",
  },
];

const matches = (x: Exclusion, i: Item): boolean =>
  x.item === undefined ||
  (x.item instanceof RegExp ? x.item.test(i.description) : x.item(i));

export const remaining = (report: Report): Violation[] =>
  [...(report.violations ?? []), ...(report.unconnected_items ?? [])].filter(
    (v) =>
      !EXCLUSIONS.some(
        (x) =>
          x.type === v.type &&
          (x.item === undefined || (v.items ?? []).some((i) => matches(x, i))),
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
  for (const x of EXCLUSIONS.filter((e) => e.temporary))
    console.log(`[temporary exclusion] ${x.type}: ${x.reason}`);
  console.log(
    `KiCad DRC: ${total} reported, ${total - left.length} excluded, ${left.length} left`,
  );
  if (left.length > 0) process.exit(1);
}
