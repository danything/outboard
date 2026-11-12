// 3D pictures of the assembled board, from the built circuit.json:
//   bun tools/render3d.ts      dist/index/3d.png and dist/index/3d-*.png (VIEWS)
// tools/snapshot.ts renders the same views into __snapshots__.
// The parts carry their models (lib/cad.ts). Around the board this adds the
// card and the bracket, translucent and cut short (lib/geometry.ts, all
// estimates); they are part of the pictures only, never of the board.
//
// tsci's own 3D snapshot looks at the origin of the board's coordinates, and
// the board lies off to one side of it (the origin is a corner), so the board
// ends up small in a corner. Here the camera is aimed at the middle of what is
// drawn and backed off until all of it fits.
import { mkdir } from "node:fs/promises";
// Both come with tscircuit (its CLI renders 3D with them) and are not listed
// in package.json on purpose: listing them changes how Bun hoists the
// packages, and tscircuit's own parts (@tscircuit/footprinter) end up at
// other versions. They move with tscircuit, so a tscircuit update may redraw
// the 3D pictures.
import { convertCircuitJsonToGltf } from "circuit-json-to-gltf";
import { renderGLTFToPNGFromGLB } from "poppygl";
import {
  BOARD_DEPTH,
  BOARD_THICKNESS,
  BOARD_WIDTH,
  BRACKET_FACE_X,
  BRACKET_FULL_WIDTH_Y,
  BRACKET_THICKNESS,
  BRACKET_TONGUE_Y,
  BRACKET_TONGUE_Z,
  BRACKET_Z,
  CARD_EDGE_Y,
  CARD_LENGTH_DRAWN,
  CARD_REAR_X,
  J3_ORIGIN,
} from "../lib/geometry";
import { type Solid, block, objDataUrl, prism } from "../lib/mesh";
import { CIRCUIT_JSON, type Circuit, loadCircuit } from "./circuit";

export type V3 = [number, number, number];

/** How much of the card (and of the bracket beside it) is drawn, from the card's edge. */
const CARD_DRAWN = 28;

// Design coordinates (lib/geometry.ts) have y away from the card; the board's have y up.
const flip = (y: number) => -y;

/** The card and its bracket, in board coordinates with z = 0 at the board's mid-plane. */
const surroundings = (): Extra[] => {
  const half = BOARD_THICKNESS / 2;
  const cardTop = CARD_EDGE_Y - CARD_DRAWN;
  const card: Solid[] = [
    block(
      [0.2, 0.55, 0.35],
      [CARD_REAR_X, flip(cardTop), -half],
      [CARD_REAR_X + CARD_LENGTH_DRAWN, flip(CARD_EDGE_Y), half],
    ),
    // The edge with the contacts, down into J3 (hidden in the slot).
    block(
      [0.2, 0.55, 0.35],
      [J3_ORIGIN.x - 10.65, flip(CARD_EDGE_Y), -half],
      [J3_ORIGIN.x + 10.65, flip(-0.5), half],
    ),
  ];
  // The plate seen from the side: full width beside the card, narrowing at
  // 45 degrees to the tongue that reaches over the board.
  const lowRise = BRACKET_TONGUE_Z.min - BRACKET_Z.min;
  const highDrop = BRACKET_Z.max - BRACKET_TONGUE_Z.max;
  const plate: [number, number][] = [
    [flip(cardTop), BRACKET_Z.min],
    [flip(BRACKET_FULL_WIDTH_Y), BRACKET_Z.min],
    [flip(BRACKET_FULL_WIDTH_Y + lowRise), BRACKET_TONGUE_Z.min],
    [flip(BRACKET_TONGUE_Y), BRACKET_TONGUE_Z.min],
    [flip(BRACKET_TONGUE_Y), BRACKET_TONGUE_Z.max],
    [flip(BRACKET_FULL_WIDTH_Y + highDrop), BRACKET_TONGUE_Z.max],
    [flip(BRACKET_FULL_WIDTH_Y), BRACKET_Z.max],
    [flip(cardTop), BRACKET_Z.max],
  ];
  const bracket = prism(
    [0.75, 0.77, 0.8],
    "x",
    plate,
    BRACKET_FACE_X,
    BRACKET_FACE_X + BRACKET_THICKNESS,
  );
  return [
    { solids: card, translucent: true },
    { solids: [bracket], translucent: false },
  ];
};

/** Solids drawn beside the board, in board coordinates (z = 0 at the board's mid-plane). */
export interface Extra {
  solids: Solid[];
  translucent: boolean;
}

/** The circuit plus extra CAD models (the card, the bracket, the case). */
export const withExtras = (circuit: Circuit, extras: Extra[]): Circuit => [
  ...circuit,
  ...extras.map(
    ({ solids, translucent }, i) =>
      ({
        type: "cad_component",
        cad_component_id: `render3d_surrounding_${i}`,
        pcb_component_id: "",
        source_component_id: "",
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        model_obj_url: objDataUrl(solids),
        model_origin_position: { x: 0, y: 0, z: 0 },
        show_as_translucent_model: translucent,
      }) as unknown as Circuit[number],
  ),
];

// --- Camera -----------------------------------------------------------------

// Scene (glTF) coordinates of circuit-json-to-gltf: x = -board x, y = up, z = board y.
const toScene = (x: number, y: number, z: number): V3 => [-x, z, y];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a: V3): V3 => {
  const l = Math.hypot(...a);
  return [a[0] / l, a[1] / l, a[2] / l];
};

export interface View {
  /** File name: `3d` for the main view, `3d-<name>` for the others. */
  name: string;
  /** Direction from the target to the camera, in board coordinates (z up). */
  from: V3;
  /** Draw the card and the bracket. */
  surroundings: boolean;
}

export const VIEWS: View[] = [
  // From above, off the corner away from the bracket, looking back at the USB-C side.
  { name: "3d", from: [0.55, -1, 0.85], surroundings: true },
  { name: "3d-top", from: [0, -0.0001, 1], surroundings: false },
  // From the long edge away from the card, nearly level: the heights.
  { name: "3d-side", from: [0, -1, 0.12], surroundings: false },
  // From outside the bracket: the plate, its tongue and the two USB-C mouths.
  { name: "3d-usb", from: [-1, -0.3, 0.3], surroundings: true },
];

/** The eight corners of a box, in board coordinates. */
export const boxCorners = ([x0, y0, z0]: V3, [x1, y1, z1]: V3): V3[] =>
  [x0, x1].flatMap((x) =>
    [y0, y1].flatMap((y) => [z0, z1].map((z): V3 => [x, y, z])),
  );

/** Corners of the box that holds what is drawn, in board coordinates. */
const extent = (surround: boolean): V3[] =>
  boxCorners(
    [
      surround ? Math.min(BRACKET_FACE_X, CARD_REAR_X) : -1.5,
      surround ? flip(CARD_EDGE_Y - CARD_DRAWN) : 12,
      surround ? BRACKET_Z.min : -6,
    ],
    [
      surround
        ? Math.max(BOARD_WIDTH, CARD_REAR_X + CARD_LENGTH_DRAWN)
        : BOARD_WIDTH,
      -BOARD_DEPTH - 1.5,
      surround ? BRACKET_Z.max : 6,
    ],
  );

const camera = (from: V3, frame: V3[], aspect: number, fov: number) => {
  const corners = frame.map(([x, y, z]) => toScene(x, y, z));
  const lo = [0, 1, 2].map((i) => Math.min(...corners.map((c) => c[i] ?? 0)));
  const hi = [0, 1, 2].map((i) => Math.max(...corners.map((c) => c[i] ?? 0)));
  const target: V3 = [0, 1, 2].map(
    (i) => ((lo[i] ?? 0) + (hi[i] ?? 0)) / 2,
  ) as V3;
  const back = unit(toScene(...from));
  const forward: V3 = [-back[0], -back[1], -back[2]];
  const right = unit(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const tanV = Math.tan((fov * Math.PI) / 360);
  const tanH = tanV * aspect;
  // Distance at which every corner is inside the frustum, plus a margin.
  const distance = Math.max(
    ...corners.map((c) => {
      const d = sub(c, target);
      const along = dot(d, back);
      return (
        along +
        Math.max(Math.abs(dot(d, right)) / tanH, Math.abs(dot(d, up)) / tanV)
      );
    }),
  );
  const margin = 1.04;
  const camPos: V3 = [
    target[0] + back[0] * distance * margin,
    target[1] + back[1] * distance * margin,
    target[2] + back[2] * distance * margin,
  ];
  return { camPos, lookAt: target };
};

export const WIDTH = 1200;
export const HEIGHT = 800;
const FOV = 30;

/**
 * The scene seen from direction `from`, framed so that every point of
 * `frame` (board coordinates) is in the picture.
 */
export const renderScene = async (
  scene: Circuit,
  from: V3,
  frame: V3[],
): Promise<Uint8Array> => {
  const glb = await convertCircuitJsonToGltf(scene as never, { format: "glb" });
  return renderGLTFToPNGFromGLB(glb as ArrayBuffer, {
    width: WIDTH,
    height: HEIGHT,
    fov: FOV,
    backgroundColor: [1, 1, 1],
    ...camera(from, frame, WIDTH / HEIGHT, FOV),
  });
};

export const renderView = (circuit: Circuit, view: View): Promise<Uint8Array> =>
  renderScene(
    view.surroundings ? withExtras(circuit, surroundings()) : circuit,
    view.from,
    extent(view.surroundings),
  );

/** Every view of the circuit in `circuitJson`, written to `out/<name>.png`. */
export const renderAll = async (
  circuitJson: string,
  out: string,
): Promise<string[]> => {
  await mkdir(out, { recursive: true });
  const circuit = await loadCircuit(circuitJson);
  const files: string[] = [];
  for (const view of VIEWS) {
    const file = `${out}/${view.name}.png`;
    await Bun.write(file, await renderView(circuit, view));
    files.push(file);
  }
  return files;
};

if (import.meta.main) {
  // Next to the built circuit: dist/index/3d.png (the main view, which
  // tools/fab.ts takes for the order) and dist/index/3d-*.png.
  for (const file of await renderAll(CIRCUIT_JSON, "dist/index"))
    console.log(file);
}
