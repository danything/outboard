// Solids of the case with replicad (OpenCascade compiled to WebAssembly):
// the prims of case/layout.ts become boxes, cylinders and prisms, fused and
// cut. docs/mechanical.md ("ケースの道具") says why replicad.
import opencascade from "replicad-opencascadejs";
import {
  type Shape3D,
  drawPolysides,
  makeBox,
  makeCylinder,
  measureVolume,
  setOC,
} from "replicad";
import type { Body, Prim } from "./layout";

let ready: Promise<void> | undefined;

/** Load OpenCascade once (about 0.2 s). */
export const initCad = (): Promise<void> =>
  (ready ??= (async () => {
    // The module finds its .wasm next to itself.
    const oc = await (
      opencascade as unknown as (o: object) => Promise<unknown>
    )({});
    setOC(oc as Parameters<typeof setOC>[0]);
  })());

const DIR = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] } as const;
const PLANE = { x: "YZ", y: "XZ", z: "XY" } as const;

/** One prim as a solid. */
export const solidOf = (p: Prim): Shape3D => {
  if (p.kind === "box") return makeBox(p.min, p.max);
  const [a, b] = p.at;
  const lo = Math.min(p.from, p.to);
  const len = Math.abs(p.to - p.from);
  const start: [number, number, number] =
    p.axis === "x" ? [lo, a, b] : p.axis === "y" ? [a, lo, b] : [a, b, lo];
  if (!p.sides) return makeCylinder(p.r, len, start, [...DIR[p.axis]]);
  const prism = drawPolysides(p.r, p.sides)
    .sketchOnPlane(PLANE[p.axis], start)
    .extrude(len, { extrusionDirection: [...DIR[p.axis]] });
  return prism as Shape3D;
};

/** Several prims fused into one solid. */
export const fuseAll = (prims: Prim[]): Shape3D | undefined =>
  prims.reduce<Shape3D | undefined>(
    (shape, p) => (shape ? shape.fuse(solidOf(p)) : solidOf(p)),
    undefined,
  );

/** A printed part: its prims added, then cut. */
export const bodySolid = (body: Body): Shape3D => {
  const added = fuseAll(body.add);
  if (!added) throw new Error(`${body.name}: nothing to add`);
  return body.cut.reduce<Shape3D>((s, p) => s.cut(solidOf(p)), added);
};

/** Volume shared by two solids, in mm^3 (0 when they only touch). */
export const sharedVolume = (a: Shape3D, b: Shape3D): number => {
  const common = a.intersect(b);
  return common.solids.length === 0 ? 0 : measureVolume(common);
};

export { measureVolume };
