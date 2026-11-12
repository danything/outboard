// Reads the JSON report of `kicad-cli pcb drc` run on the KiCad board that
// tscircuit exported, drops the findings that come from the export itself
// (each with its reason below), and fails on anything left.
// This is the second opinion on the layout. What it guards and what the
// checks in checks/ guard is laid out in docs/checks.md.
import { BLOCKS, HANDOFFS } from "../lib/placement";

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

/** The exported board sits 100 mm right and down of the design coordinates. */
const KICAD_OFFSET = 100;
const MCU_PARTS = new Set(Object.keys(BLOCKS.mcu.parts));
const MCU_POINTS = HANDOFFS.filter((h) => h.from === "mcu" || h.to === "mcu");
/** A dangling end this close to a handoff point of the microcontroller waits for it. */
const NEAR_HANDOFF = 1;

/** True for an item that is a pad of the microcontroller block, or copper ending at one of its handoff points. */
export const waitsForMcu = (item: Item): boolean => {
  const ref = /\bof (\S+)/.exec(item.description)?.[1];
  if (ref && MCU_PARTS.has(ref)) return true;
  const p = item.pos;
  if (p === undefined) return false;
  // KiCad gives one end of a track and its length: the other end may be the handoff point.
  const track = /^Track \[(\S+)\] .*length ([\d.]+) mm/.exec(item.description);
  const reach = track ? Number(track[2]) + NEAR_HANDOFF : NEAR_HANDOFF;
  return MCU_POINTS.some(
    (h) =>
      (!track || h.net === track[1]) &&
      Math.hypot(p.x - KICAD_OFFSET - h.x, p.y - KICAD_OFFSET - h.y) <= reach,
  );
};

export const EXCLUSIONS: Exclusion[] = [
  {
    type: "lib_footprint_issues",
    reason:
      "The exported board names a footprint library 'tscircuit' that is not a KiCad library; the footprints are embedded in the board.",
  },
  {
    type: "unconnected_items",
    item: waitsForMcu,
    temporary: true,
    reason:
      "Only what waits for the microcontroller block (its pads, and copper at its handoff points): the last block being routed. Remove this entry when it is in.",
  },
  {
    type: "track_dangling",
    item: waitsForMcu,
    temporary: true,
    reason:
      "Tracks that end at a handoff point of the microcontroller block. Remove this entry together with the one above.",
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
