// Pictures of the case with the board and the card in it, drawn by the same
// renderer as the board's 3D views (tools/render3d.ts): the built
// circuit.json for the board and its parts, plus the card (case/card.ts)
// and the printed parts as extra models.
import { mkdir } from "node:fs/promises";
import { type Rgb, type Solid, block, prism } from "../lib/mesh";
import { type Circuit, loadCircuit } from "../tools/circuit";
import {
  type Extra,
  type V3 as SceneV3,
  boxCorners,
  renderScene,
  withExtras,
} from "../tools/render3d";
import { type CaseLayout, type Content, type Prim, contents } from "./layout";
import type { Shape3D } from "replicad";

// Design coordinates (y away from the card) to the board's (y up).
const flip = (y: number) => -y;

const GREEN: Rgb = [0.13, 0.5, 0.3];
const GOLD: Rgb = [0.85, 0.68, 0.3];
const STEEL: Rgb = [0.72, 0.74, 0.77];
const WHITE: Rgb = [0.93, 0.92, 0.88];
const DARK: Rgb = [0.2, 0.2, 0.22];
const GREY: Rgb = [0.45, 0.46, 0.5];
const BLUE: Rgb = [0.3, 0.45, 0.8];

/** One prim as a mesh solid in board coordinates. */
const meshOf = (p: Prim, color: Rgb): Solid => {
  if (p.kind === "box")
    return block(
      color,
      [p.min[0], flip(p.max[1]), p.min[2]],
      [p.max[0], flip(p.min[1]), p.max[2]],
    );
  const n = p.sides ?? 24;
  const [a, b] = p.at;
  const ring = Array.from({ length: n }, (_, i): [number, number] => {
    const t = (2 * Math.PI * i) / n;
    return [p.r * Math.cos(t), p.r * Math.sin(t)];
  });
  // prism(): (y, z) for x, (z, x) for y, (x, y) for z.
  if (p.axis === "x")
    return prism(
      color,
      "x",
      ring.map(([u, v]) => [flip(a + u), b + v] as const),
      p.from,
      p.to,
    );
  if (p.axis === "z")
    return prism(
      color,
      "z",
      ring.map(([u, v]) => [a + u, flip(b + v)] as const),
      p.from,
      p.to,
    );
  return prism(
    color,
    "y",
    ring.map(([u, v]) => [b + v, a + u] as const),
    flip(p.from),
    flip(p.to),
  );
};

/** Colour of a content in the pictures; undefined leaves it out (slabs that stand for many parts, the board drawn by the circuit). */
const colorOf = (c: Content): Rgb | undefined => {
  if (c.name === "card") return GREEN;
  if (c.name === "B-CAS reader") return GREY;
  if (c.name === "B-CAS card") return BLUE;
  if (c.name.endsWith("USB-C plug")) return DARK;
  if (c.name.includes("USB socket") || c.name.endsWith("plug")) return WHITE;
  if (c.name.endsWith("nut")) return STEEL;
  if (c.name.startsWith("F ")) return GOLD;
  return undefined;
};

/** The card and the plugs, as drawn. */
export const cardSolids = (): Solid[] =>
  contents().flatMap((c) => {
    const color = colorOf(c);
    return color ? c.prims.map((p) => meshOf(p, color)) : [];
  });

/** A printed part's triangles as a mesh solid in board coordinates. */
export const shapeSolid = (shape: Shape3D, color: Rgb): Solid => {
  const m = shape.mesh({ tolerance: 0.05, angularTolerance: 0.3 });
  const vertices: [number, number, number][] = [];
  for (let i = 0; i < m.vertices.length; i += 3)
    vertices.push([
      m.vertices[i] ?? 0,
      flip(m.vertices[i + 1] ?? 0),
      m.vertices[i + 2] ?? 0,
    ]);
  const faces: number[][] = [];
  // Flipping y mirrors the mesh, so each triangle turns the other way round.
  for (let i = 0; i < m.triangles.length; i += 3)
    faces.push([
      m.triangles[i] ?? 0,
      m.triangles[i + 2] ?? 0,
      m.triangles[i + 1] ?? 0,
    ]);
  return { color, vertices, faces };
};

export interface CaseSolids {
  tray: Shape3D;
  lid: Shape3D;
  hatch: Shape3D;
}

const TRAY: Rgb = [0.8, 0.8, 0.82];
const LID: Rgb = [0.62, 0.66, 0.74];
const HATCH: Rgb = [0.5, 0.55, 0.66];

interface CaseView {
  name: string;
  from: SceneV3;
  lid: boolean;
}

export const CASE_VIEWS: CaseView[] = [
  // The tray with the board and the card in it, from above the far corner.
  { name: "case", from: [0.45, -0.75, 1], lid: false },
  // The terminal wall from outside: F connectors with their nuts, the two USB-C ports.
  { name: "case-terminal", from: [-1, 0.35, 0.4], lid: true },
  // Closed, with the B-CAS hatch on the top.
  { name: "case-closed", from: [0.5, 0.7, 0.9], lid: true },
];

/** Every view of the case, written to `out/<name>.png`. */
export const renderCase = async (
  circuit: Circuit | string,
  layout: CaseLayout,
  solids: CaseSolids,
  out: string,
): Promise<string[]> => {
  await mkdir(out, { recursive: true });
  const board =
    typeof circuit === "string" ? await loadCircuit(circuit) : circuit;
  const card: Extra = { solids: cardSolids(), translucent: false };
  const tray: Extra = {
    solids: [shapeSolid(solids.tray, TRAY)],
    translucent: false,
  };
  const top: Extra = {
    solids: [shapeSolid(solids.lid, LID), shapeSolid(solids.hatch, HATCH)],
    translucent: false,
  };
  const { min, max } = layout.outer;
  // Frame the case and what stands out of its terminal wall.
  const frame = boxCorners(
    [min[0] - 15, flip(max[1]), min[2]],
    [max[0], flip(min[1]), max[2]],
  );
  const files: string[] = [];
  for (const view of CASE_VIEWS) {
    const scene = withExtras(
      board,
      view.lid ? [card, tray, top] : [card, tray],
    );
    const file = `${out}/${view.name}.png`;
    await Bun.write(file, await renderScene(scene, view.from, frame));
    files.push(file);
  }
  return files;
};
