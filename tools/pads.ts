// Prints where the pads of a block are, in design coordinates, to route by:
//   bun tools/pads.ts buck          every part of the block
//   bun tools/pads.ts U3 C9         single parts
// Columns: part.pad, x, y, size along x, size along y.
import * as fp from "../lib/footprints";
import { BLOCKS, HANDOFFS, PLACEMENT } from "../lib/placement";
import { pad } from "../lib/routing/kit";

const args = Bun.argv.slice(2);
const parts = PLACEMENT.filter(
  (p) => args.includes(p.block) || args.includes(p.ref),
);
for (const part of parts) {
  const def: fp.FootprintDef = fp[part.footprint];
  console.log(
    `${part.ref} ${part.footprint} (${part.x}, ${part.y}) ${part.rotation} deg, block ${part.block}`,
  );
  const sideways = part.rotation % 180 !== 0;
  const seen = new Map<string, number>();
  for (const p of [...def.pads, ...(def.platedHoles ?? [])]) {
    // Pads that share a name (lead and tab of U6) are told apart by their order.
    const nth = seen.get(p.pin) ?? 0;
    seen.set(p.pin, nth + 1);
    const c = pad(part.ref, p.pin, nth);
    const [w, h] = "w" in p ? [p.w, p.h] : [p.padW, p.padH];
    const layer = "layer" in p && p.layer === "bottom" ? " bottom" : "";
    console.log(
      `  ${part.ref}.${p.pin}\t${c.x}\t${c.y}\t${sideways ? h : w}\t${sideways ? w : h}${layer}`,
    );
  }
}
for (const name of args.filter((a) => a in BLOCKS)) {
  console.log(`handoffs of ${name}:`);
  for (const h of HANDOFFS.filter((h) => h.from === name || h.to === name))
    console.log(
      `  ${h.net}\t${h.from} -> ${h.to}\t(${h.x}, ${h.y})\t${h.layer}\t${h.width}${h.note ? `\t${h.note}` : ""}`,
    );
}
