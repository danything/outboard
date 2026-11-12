// A tiny mesh builder for the 3D pictures: coloured solids made of flat
// faces, written out as a Wavefront OBJ with a colour on every vertex.
// Nothing here reaches the manufacturing files; the meshes only feed the 3D
// views (lib/cad.ts for the parts, tools/render3d.ts for the card and the
// bracket around the board).
//
// Units are millimetres, z up. Faces are convex polygons listed
// counter-clockwise as seen from outside.

export type Rgb = readonly [number, number, number];
export type Vec3 = readonly [number, number, number];

export interface Solid {
  color: Rgb;
  vertices: Vec3[];
  faces: number[][];
}

/**
 * Box from (x0, y0, z0) to (x1, y1, z1). `inset` pulls the top face in on
 * all four sides, which gives moulded bodies their draft.
 */
export const block = (
  color: Rgb,
  [x0, y0, z0]: Vec3,
  [x1, y1, z1]: Vec3,
  inset = 0,
): Solid => {
  const lo = (a: number, b: number) => Math.min(a, b);
  const hi = (a: number, b: number) => Math.max(a, b);
  const [ax, bx, ay, by, az, bz] = [
    lo(x0, x1),
    hi(x0, x1),
    lo(y0, y1),
    hi(y0, y1),
    lo(z0, z1),
    hi(z0, z1),
  ];
  const i = Math.min(inset, (bx - ax) / 2 - 1e-3, (by - ay) / 2 - 1e-3);
  return {
    color,
    vertices: [
      [ax, ay, az],
      [bx, ay, az],
      [bx, by, az],
      [ax, by, az],
      [ax + i, ay + i, bz],
      [bx - i, ay + i, bz],
      [bx - i, by - i, bz],
      [ax + i, by - i, bz],
    ],
    faces: [
      [0, 3, 2, 1],
      [4, 5, 6, 7],
      [0, 1, 5, 4],
      [1, 2, 6, 5],
      [2, 3, 7, 6],
      [3, 0, 4, 7],
    ],
  };
};

/**
 * A convex outline in the plane across `axis`, extruded along `axis` from
 * `from` to `to`. Outline points are (u, v): (y, z) for x, (z, x) for y and
 * (x, y) for z, counter-clockwise.
 */
export const prism = (
  color: Rgb,
  axis: "x" | "y" | "z",
  outline: readonly (readonly [number, number])[],
  from: number,
  to: number,
): Solid => {
  const place = (u: number, v: number, w: number): Vec3 =>
    axis === "x" ? [w, u, v] : axis === "y" ? [v, w, u] : [u, v, w];
  const [a, b] = from < to ? [from, to] : [to, from];
  const n = outline.length;
  // Accept either winding: turn a clockwise outline around.
  const area = outline.reduce((sum, [u0, v0], k) => {
    const [u1, v1] = outline[(k + 1) % n] ?? [u0, v0];
    return sum + u0 * v1 - u1 * v0;
  }, 0);
  if (area < 0) outline = [...outline].reverse();
  const vertices = [
    ...outline.map(([u, v]) => place(u, v, a)),
    ...outline.map(([u, v]) => place(u, v, b)),
  ];
  const faces = [
    Array.from({ length: n }, (_, k) => n - 1 - k),
    Array.from({ length: n }, (_, k) => n + k),
    ...Array.from({ length: n }, (_, k) => {
      const k1 = (k + 1) % n;
      return [k, k1, n + k1, n + k];
    }),
  ];
  return { color, vertices, faces };
};

/** Rectangle with rounded corners, counter-clockwise, centred on (cu, cv). */
export const roundedRect = (
  cu: number,
  cv: number,
  w: number,
  h: number,
  r: number,
  steps = 4,
): [number, number][] => {
  const corners: [number, number, number][] = [
    [cu + w / 2 - r, cv - h / 2 + r, -90],
    [cu + w / 2 - r, cv + h / 2 - r, 0],
    [cu - w / 2 + r, cv + h / 2 - r, 90],
    [cu - w / 2 + r, cv - h / 2 + r, 180],
  ];
  return corners.flatMap(([u, v, start]) =>
    Array.from({ length: steps + 1 }, (_, i): [number, number] => {
      const a = ((start + (90 * i) / steps) * Math.PI) / 180;
      return [u + r * Math.cos(a), v + r * Math.sin(a)];
    }),
  );
};

const num = (v: number): string => {
  const s = v.toFixed(3).replace(/\.?0+$/, "");
  return s === "-0" ? "0" : s;
};

/**
 * Wavefront OBJ text. The colours are materials defined inline (newmtl/Kd),
 * which is how circuit-json-to-gltf reads colours out of an OBJ.
 */
export const toObj = (solids: Solid[]): string => {
  const colors = [...new Set(solids.map((s) => s.color.map(num).join(" ")))];
  const lines = colors.flatMap((c, i) => [`newmtl m${i}`, `Kd ${c}`]);
  let base = 1;
  for (const s of solids) {
    const color = s.color.map(num).join(" ");
    lines.push(`usemtl m${colors.indexOf(color)}`);
    // The colour again on every vertex, for viewers that read colours that
    // way (three.js's OBJLoader in the 3D tab of the site).
    for (const [x, y, z] of s.vertices)
      lines.push(`v ${num(x)} ${num(y)} ${num(z)} ${color}`);
    for (const f of s.faces)
      lines.push(`f ${f.map((i) => i + base).join(" ")}`);
    base += s.vertices.length;
  }
  return lines.join("\n") + "\n";
};

/** The OBJ as a data: URL, so the model travels inside circuit.json. */
export const objDataUrl = (solids: Solid[]): string =>
  `data:model/obj;base64,${btoa(toObj(solids))}`;
