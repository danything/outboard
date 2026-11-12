// The stencil: every solder paste opening of the board is decided here.
// Runs after `tsci build` (package.json build) and rewrites the openings
// that tscircuit put into circuit.json; the Gerbers (tools/fab.ts) are
// exported from that file.
//
// - tscircuit makes every opening 70 % of its pad along each side (49 % of
//   the area). On the 0.5 mm pitch leads that leaves openings whose area
//   ratio (opening area / wall area) is below 0.66, where paste stops
//   leaving the stencil cleanly. The rule here is 1:1, less on large pads
//   (PASTE), and the check `solderPaste` holds every opening to the area ratio.
// - No paste on the bottom: the board is assembled on one side, so there is
//   no bottom stencil (tscircuit puts some under the shell legs of USB-C).
// - No paste over a hole inside a pad (the two ground holes of U8's
//   exposed pad): it would run down the hole. The exposed pad of U8 gets
//   windows between the holes instead (PASTE).
import type { Box } from "../lib/footprints";
import { type FootprintName, PLACEMENT } from "../lib/placement";
import { CIRCUIT_JSON, type Circuit, loadCircuit } from "./circuit";

/** How one pad is pasted. */
export interface PadPaste {
  /** Opening / pad along each side (1 = 1:1). */
  ratio?: number;
  /**
   * Openings instead of one: boxes in the land pattern's frame, relative
   * to the pad centre (y up, like lib/footprints.ts).
   */
  windows?: Box[];
}

/** The rule of a land pattern: a ratio for all its pads, and pads by pin with their own. */
export interface LandPaste extends PadPaste {
  /** By pin. `tab` is the larger of two pads that share a pin (SOT-89). */
  pads?: Record<string, PadPaste>;
  /** Why it is not 1:1. */
  why: string;
}

/** Ratio of every pad that PASTE does not name. */
export const DEFAULT_RATIO = 1.0;

const box = (x0: number, y0: number, x1: number, y1: number): Box => ({
  x0,
  y0,
  x1,
  y1,
});

/** The same box in all four quadrants. */
const quadrants = (x0: number, y0: number, x1: number, y1: number): Box[] =>
  [1, -1].flatMap((sx) =>
    [1, -1].map((sy) =>
      box(
        Math.min(sx * x0, sx * x1),
        Math.min(sy * y0, sy * y1),
        Math.max(sx * x0, sx * x1),
        Math.max(sy * y0, sy * y1),
      ),
    ),
  );

/**
 * Land patterns that are not pasted 1:1. The fine-pitch leads (U8, U3)
 * get 90 %: the area ratio stays above 0.66 and the gap between openings
 * grows by 10 % of the lead width. Large pads get less, against too much
 * solder lifting or tilting the part.
 */
export const PASTE: Partial<Record<FootprintName, LandPaste>> = {
  QFN16_3X3: {
    ratio: 0.9,
    pads: {
      // Exposed pad 1.70 square with two holes at (0, +-0.5): four windows
      // 0.55 x 0.75, 0.15 clear of each drill, 57 % of the pad.
      "17": { windows: quadrants(0.3, 0.1, 0.85, 0.85) },
    },
    why: "0.5 mm pitch; exposed pad with holes",
  },
  SOT583: { ratio: 0.9, why: "0.5 mm pitch" },
  // Exposed pad 3.3 x 2.1: four windows 1.4 x 0.75, 61 % of the pad.
  ESSOP10: {
    pads: { "11": { windows: quadrants(0.1, 0.125, 1.5, 0.875) } },
    why: "exposed pad",
  },
  SOT89: { pads: { tab: { ratio: 0.85 } }, why: "tab (72 % of its area)" },
  SMA_SS54: { ratio: 0.9, why: "large pads (81 %)" },
  SMA_SS34: { ratio: 0.9, why: "large pads (81 %)" },
  IND_FXL0630: { ratio: 0.9, why: "large pads (81 %)" },
};

/** The paste rule of a pad, by land pattern, pin and whether it is the larger of a shared pin. */
export const padPaste = (
  footprint: FootprintName,
  pin: string,
  tab = false,
): PadPaste => {
  const land = PASTE[footprint];
  const own = land?.pads?.[tab ? "tab" : pin];
  if (own) return own;
  return { ratio: land?.ratio ?? DEFAULT_RATIO };
};

type Raw = Record<string, unknown> & { type: string };
type Xy = { x: number; y: number };

const num = (e: Raw, k: string): number => Number(e[k] ?? 0);

/** Board-frame offset of a point given in the land pattern's frame, turned ccw by `deg`. */
const turn = (x: number, y: number, deg: number): Xy => {
  const r = (deg * Math.PI) / 180;
  const [c, s] = [Math.round(Math.cos(r)), Math.round(Math.sin(r))];
  return { x: x * c - y * s, y: x * s + y * c };
};

const insidePad = (p: Xy, pad: Raw): boolean => {
  const [w, h] =
    pad.shape === "circle"
      ? [2 * num(pad, "radius"), 2 * num(pad, "radius")]
      : [num(pad, "width"), num(pad, "height")];
  return (
    Math.abs(p.x - num(pad, "x")) < w / 2 &&
    Math.abs(p.y - num(pad, "y")) < h / 2
  );
};

/** circuit.json with the stencil openings of this board. */
export const withBoardPaste = (circuit: Circuit): Circuit => {
  const raw = circuit as unknown as Raw[];
  const names = new Map(
    raw
      .filter((e) => e.type === "source_component")
      .map((e) => [e.source_component_id, String(e.name)]),
  );
  const components = new Map(
    raw
      .filter((e) => e.type === "pcb_component")
      .map((e) => [e.pcb_component_id, e]),
  );
  const footprints = new Map(PLACEMENT.map((p) => [p.ref, p.footprint]));
  const pads = new Map(
    raw.filter((e) => e.type === "pcb_smtpad").map((e) => [e.pcb_smtpad_id, e]),
  );
  const padsOf = (componentId: unknown): Raw[] =>
    [...pads.values()].filter((p) => p.pcb_component_id === componentId);
  const holes = raw.filter((e) => e.type === "pcb_plated_hole");

  const out: Raw[] = [];
  let next = 0;
  for (const e of raw) {
    if (e.type !== "pcb_solder_paste") {
      out.push(e);
      continue;
    }
    if (e.layer === "bottom") continue;
    const pad = pads.get(e.pcb_smtpad_id);
    if (!pad) {
      // An opening of a plated hole. Inside a pad it is a hole of the pad
      // (U8): no paste. Otherwise a lead goes through it (USB-C shells).
      const hole = holes.find(
        (h) =>
          h.pcb_component_id === e.pcb_component_id &&
          Math.abs(num(h, "x") - num(e, "x")) < 1e-6 &&
          Math.abs(num(h, "y") - num(e, "y")) < 1e-6,
      );
      const inPad =
        hole &&
        padsOf(hole.pcb_component_id).some((p) =>
          insidePad(e as unknown as Xy, p),
        );
      if (!inPad) out.push(e);
      continue;
    }
    const component = components.get(pad.pcb_component_id);
    const ref = names.get(component?.source_component_id);
    const footprint = ref ? footprints.get(ref) : undefined;
    if (!component || !ref || !footprint)
      throw new Error(
        `paste on a pad of an unknown part: ${JSON.stringify(e)}`,
      );
    const pin = String((pad.port_hints as string[] | undefined)?.[0] ?? "");
    const area = (p: Raw) => num(p, "width") * num(p, "height");
    const tab = padsOf(pad.pcb_component_id).some(
      (p) =>
        p !== pad &&
        (p.port_hints as string[] | undefined)?.[0] === pin &&
        area(p) < area(pad),
    );
    const rule = padPaste(footprint, pin, tab);
    if (rule.windows) {
      const rotation = num(component, "rotation");
      for (const w of rule.windows) {
        const c = turn((w.x0 + w.x1) / 2, (w.y0 + w.y1) / 2, rotation);
        const size = turn(w.x1 - w.x0, w.y1 - w.y0, rotation);
        out.push({
          type: "pcb_solder_paste",
          pcb_solder_paste_id: `pcb_solder_paste_window_${next++}`,
          pcb_component_id: e.pcb_component_id,
          pcb_smtpad_id: e.pcb_smtpad_id,
          subcircuit_id: e.subcircuit_id,
          layer: e.layer,
          shape: "rect",
          x: num(pad, "x") + c.x,
          y: num(pad, "y") + c.y,
          width: Math.abs(size.x),
          height: Math.abs(size.y),
        });
      }
      continue;
    }
    const ratio = rule.ratio ?? DEFAULT_RATIO;
    if (pad.shape === "circle")
      out.push({ ...e, radius: num(pad, "radius") * ratio });
    else {
      const width = num(pad, "width") * ratio;
      const height = num(pad, "height") * ratio;
      out.push({
        ...e,
        width,
        height,
        ...("radius" in e ? { radius: Math.min(width, height) / 2 } : {}),
      });
    }
  }
  return out as unknown as Circuit;
};

if (import.meta.main) {
  const circuit = await loadCircuit();
  const kept = withBoardPaste(circuit);
  await Bun.write(CIRCUIT_JSON, JSON.stringify(kept));
  const count = (c: Circuit) =>
    c.filter((e) => e.type === "pcb_solder_paste").length;
  console.log(`paste: ${count(circuit)} openings in, ${count(kept)} out`);
}
