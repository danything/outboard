// Reference designators on the bottom silkscreen. The top is too crowded for
// them, the bottom has no parts: each label sits under its part (as seen
// through the board), moved aside only where a bottom pad, a hole, the edge or
// another label is in the way.
import * as fp from "./footprints";
import { MOUNTING_HOLE_POSITIONS, type Point, type Rect, at } from "./geometry";
import { PLACEMENT, placedBox } from "./placement";

/** Text height and stroke, mm: JLCPCB asks for 1.0 and 0.15 at least. */
export const REFDES_HEIGHT = 1.0;
export const REFDES_STROKE = 0.15;
/** Width of one character of KiCad's stroke font, as a share of the height. */
const CHAR_WIDTH = 0.9;
/** Space kept around a label. */
const MARGIN = 0.25;

const box = (c: Point, text: string): Rect => {
  const w = text.length * CHAR_WIDTH * REFDES_HEIGHT;
  const h = REFDES_HEIGHT * 1.2;
  return { x0: c.x - w / 2, y0: c.y - h / 2, x1: c.x + w / 2, y1: c.y + h / 2 };
};

const overlaps = (a: Rect, b: Rect, margin = MARGIN): boolean =>
  a.x0 < b.x1 + margin &&
  b.x0 < a.x1 + margin &&
  a.y0 < b.y1 + margin &&
  b.y0 < a.y1 + margin;

/** What shows on the bottom: pads there, plated holes, mounting holes. */
const obstacles = (): Rect[] => {
  const out: Rect[] = [];
  for (const part of PLACEMENT) {
    const def: fp.FootprintDef = fp[part.footprint];
    for (const pad of def.pads.filter((p) => p.layer === "bottom"))
      out.push(
        placedBox(
          {
            x0: pad.x - pad.w / 2,
            y0: pad.y - pad.h / 2,
            x1: pad.x + pad.w / 2,
            y1: pad.y + pad.h / 2,
          },
          part.x,
          part.y,
          part.rotation,
        ),
      );
    for (const hole of def.platedHoles ?? [])
      out.push(
        placedBox(
          {
            x0: hole.x - hole.padW / 2,
            y0: hole.y - hole.padH / 2,
            x1: hole.x + hole.padW / 2,
            y1: hole.y + hole.padH / 2,
          },
          part.x,
          part.y,
          part.rotation,
        ),
      );
    for (const hole of def.holes ?? [])
      out.push(
        placedBox(
          {
            x0: hole.x - hole.diameter / 2,
            y0: hole.y - hole.diameter / 2,
            x1: hole.x + hole.diameter / 2,
            y1: hole.y + hole.diameter / 2,
          },
          part.x,
          part.y,
          part.rotation,
        ),
      );
  }
  for (const h of MOUNTING_HOLE_POSITIONS)
    out.push({ x0: h.x - 1.6, y0: h.y - 1.6, x1: h.x + 1.6, y1: h.y + 1.6 });
  // The rear step and the key notch of J3 (lib/geometry.ts).
  out.push({ x0: 0, y0: 0, x1: 1.5, y1: 11.5 });
  out.push({ x0: 57.1, y0: 0, x1: 59, y1: 6 });
  return out;
};

const INSIDE: Rect = { x0: 0.5, y0: 0.5, x1: 99.5, y1: 41.5 };

/** Where each label goes, in design coordinates. */
export const refdesPlaces = (): { ref: string; at: Point }[] => {
  const blocked = obstacles();
  const placed: Rect[] = [];
  const steps: Point[] = [{ x: 0, y: 0 }];
  for (let r = 0.5; r <= 6; r += 0.5)
    for (let a = 0; a < 16; a++) {
      const t = (a / 16) * 2 * Math.PI;
      steps.push({ x: r * Math.cos(t), y: r * Math.sin(t) });
    }
  return PLACEMENT.map((part) => {
    for (const s of steps) {
      const c = { x: part.x + s.x, y: part.y + s.y };
      const b = box(c, part.ref);
      if (
        b.x0 < INSIDE.x0 ||
        b.y0 < INSIDE.y0 ||
        b.x1 > INSIDE.x1 ||
        b.y1 > INSIDE.y1
      )
        continue;
      if (blocked.some((o) => overlaps(b, o))) continue;
      if (placed.some((o) => overlaps(b, o, 0.15))) continue;
      placed.push(b);
      return { ref: part.ref, at: c };
    }
    throw new Error(`no room for the label of ${part.ref} on the bottom`);
  });
};

const Label = ({ text, at: p }: { text: string; at: Point }) => {
  const q = at(p.x, p.y);
  return (
    <silkscreentext
      text={text}
      pcbX={q.x}
      pcbY={q.y}
      layer="bottom"
      fontSize={REFDES_HEIGHT}
      anchorAlignment="center"
    />
  );
};

export const Refdes = () => (
  <>
    {refdesPlaces().map(({ ref, at: p }) => (
      <Label key={ref} text={ref} at={p} />
    ))}
  </>
);
