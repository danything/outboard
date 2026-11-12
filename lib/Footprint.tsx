import type { Box, FootprintDef, Hole, Pad, PlatedHole } from "./footprints";

const SILK_WIDTH = 0.15;
// Silkscreen stays this far from copper so it is not clipped by the mask opening.
const SILK_TO_PAD = 0.2;

const SmtPad = ({ pad }: { pad: Pad }) => {
  const common = {
    portHints: [pad.pin] as string[],
    pcbX: pad.x,
    pcbY: pad.y,
    layer: pad.layer ?? "top",
  };
  if (pad.shape === "circle")
    return <smtpad {...common} shape="circle" radius={pad.w / 2} />;
  if (pad.shape === "pill")
    return (
      <smtpad
        {...common}
        shape="pill"
        width={pad.w}
        height={pad.h}
        radius={Math.min(pad.w, pad.h) / 2}
      />
    );
  return <smtpad {...common} shape="rect" width={pad.w} height={pad.h} />;
};

const Plated = ({ hole }: { hole: PlatedHole }) => {
  const common = {
    portHints: [hole.pin] as string[],
    pcbX: hole.x,
    pcbY: hole.y,
  };
  if (hole.holeW !== hole.holeH)
    return (
      <platedhole
        {...common}
        shape="pill"
        holeWidth={hole.holeW}
        holeHeight={hole.holeH}
        outerWidth={hole.padW}
        outerHeight={hole.padH}
      />
    );
  if (hole.square)
    return (
      <platedhole
        {...common}
        shape="circular_hole_with_rect_pad"
        holeDiameter={hole.holeW}
        rectPadWidth={hole.padW}
        rectPadHeight={hole.padH}
      />
    );
  return (
    <platedhole
      {...common}
      shape="circle"
      holeDiameter={hole.holeW}
      outerDiameter={hole.padW}
    />
  );
};

const copperBoxes = (def: FootprintDef): Box[] => [
  ...def.pads
    .filter((p) => (p.layer ?? "top") === "top")
    .map((p) => ({
      x0: p.x - p.w / 2,
      y0: p.y - p.h / 2,
      x1: p.x + p.w / 2,
      y1: p.y + p.h / 2,
    })),
  ...(def.platedHoles ?? []).map((h) => ({
    x0: h.x - h.padW / 2,
    y0: h.y - h.padH / 2,
    x1: h.x + h.padW / 2,
    y1: h.y + h.padH / 2,
  })),
];

const overlaps = (a: Box, b: Box, margin: number): boolean =>
  a.x0 < b.x1 + margin &&
  a.x1 > b.x0 - margin &&
  a.y0 < b.y1 + margin &&
  a.y1 > b.y0 - margin;

/**
 * The four sides of the body outline, cut into short segments so that the ones
 * that would run over copper can be left out.
 */
const bodySegments = (
  def: FootprintDef,
): { x0: number; y0: number; x1: number; y1: number }[] => {
  const b = def.body;
  if (!b) return [];
  const copper = copperBoxes(def);
  const sides: [number, number, number, number][] = [
    [b.x0, b.y0, b.x1, b.y0],
    [b.x1, b.y0, b.x1, b.y1],
    [b.x1, b.y1, b.x0, b.y1],
    [b.x0, b.y1, b.x0, b.y0],
  ];
  const segments: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const STEP = 0.2;
  for (const [x0, y0, x1, y1] of sides) {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / STEP));
    let start: number | undefined;
    const at = (i: number) => ({
      x: x0 + ((x1 - x0) * i) / n,
      y: y0 + ((y1 - y0) * i) / n,
    });
    for (let i = 0; i <= n; i++) {
      const p = at(i);
      const clear = !copper.some((c) =>
        overlaps({ x0: p.x, y0: p.y, x1: p.x, y1: p.y }, c, SILK_TO_PAD),
      );
      if (clear && start === undefined) start = i;
      if ((!clear || i === n) && start !== undefined) {
        const end = clear ? i : i - 1;
        if (end > start) {
          const a = at(start);
          const e = at(end);
          segments.push({ x0: a.x, y0: a.y, x1: e.x, y1: e.y });
        }
        start = undefined;
      }
    }
  }
  return segments;
};

const Drill = ({ hole }: { hole: Hole }) => (
  <hole pcbX={hole.x} pcbY={hole.y} diameter={hole.diameter} />
);

const SilkLine = ({ line }: { line: Box }) => (
  <silkscreenpath
    route={[
      { x: line.x0, y: line.y0 },
      { x: line.x1, y: line.y1 },
    ]}
    strokeWidth={SILK_WIDTH}
  />
);

/** The `footprint` prop of a tscircuit part, built from a land pattern. */
export const footprintOf = (def: FootprintDef) => {
  const c = def.courtyard;
  return (
    <footprint>
      {def.pads.map((pad, i) => (
        <SmtPad key={`pad${i}`} pad={pad} />
      ))}
      {(def.platedHoles ?? []).map((hole, i) => (
        <Plated key={`plated${i}`} hole={hole} />
      ))}
      {(def.holes ?? []).map((hole, i) => (
        <Drill key={`hole${i}`} hole={hole} />
      ))}
      <courtyardrect
        pcbX={(c.x0 + c.x1) / 2}
        pcbY={(c.y0 + c.y1) / 2}
        width={c.x1 - c.x0}
        height={c.y1 - c.y0}
        strokeWidth={0.05}
      />
      {bodySegments(def).map((s, i) => (
        <SilkLine key={`silk${i}`} line={s} />
      ))}
      {def.pin1Mark && (
        <silkscreencircle
          pcbX={def.pin1Mark.x}
          pcbY={def.pin1Mark.y}
          radius={0.15}
          strokeWidth={SILK_WIDTH}
          isFilled
        />
      )}
    </footprint>
  );
};
