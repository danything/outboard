// The case, as plain numbers: what goes inside (the board with its parts, the
// card and what plugs into both) and the three printed parts (tray, lid,
// hatch) as boxes and cylinders that are added or cut. case/model.ts turns
// the printed parts into solids; case/case.test.ts checks them against the
// contents. Nothing here needs OpenCascade.
//
// Coordinates are the board's design coordinates (lib/geometry.ts): x along
// the board from its rear edge (the side of the USB-C ports and of the card's
// old bracket), y away from the card (the card lies at negative y), z up from
// the board's mid-plane, + towards the component side. The card lies in the
// same plane, held by J3. The tray is the bottom (-z), the lid the top.
//
// The numbers of the board come from lib/geometry.ts and lib/placement.ts,
// those of the card from case/card.ts (estimates). The ones decided here are
// marked [LAY] and explained in docs/mechanical.md ("ケース").
import { solidsOf } from "../lib/cad";
import * as fp from "../lib/footprints";
import {
  BOARD_DEPTH,
  BOARD_THICKNESS,
  BOARD_WIDTH,
  BRACKET_FACE_X,
  BRACKET_THICKNESS,
  CARD_EDGE_Y,
  CARD_REAR_X,
  CARD_USB_PLUGS,
  J1_Y,
  J2_Y,
  J3_EAR_KEEPOUTS,
  J3_ORIGIN,
  MOUNTING_HOLE_POSITIONS,
  PH_PLUG,
  type Point,
  REAR_STEP,
  REAR_STEP_DEPTH,
  USBC_PLUG_LENGTH,
  USBC_PLUG_WIDTH,
} from "../lib/geometry";
import { PLACEMENT, placedBox } from "../lib/placement";
import { BCAS, CARD } from "./card";

export type V3 = [number, number, number];

/** A box from `min` to `max`. */
export interface BoxPrim {
  kind: "box";
  min: V3;
  max: V3;
}

/**
 * A cylinder (or, with `sides`, a regular prism such as a hex nut, with
 * `r` to its corners) along `axis`, centred on `at` (the other two
 * coordinates in x, y, z order) and running from `from` to `to`.
 */
export interface CylPrim {
  kind: "cyl";
  axis: "x" | "y" | "z";
  at: [number, number];
  r: number;
  from: number;
  to: number;
  sides?: number;
}

export type Prim = BoxPrim | CylPrim;

/** A solid made of added prims minus cut prims (cuts apply after all adds). */
export interface Body {
  name: string;
  add: Prim[];
  cut: Prim[];
}

export interface Content {
  name: string;
  prims: Prim[];
  /** Outside the case (plugs, nuts): not used to size the inside. */
  outside?: boolean;
}

export interface CaseOptions {
  /** How the hatch stays shut: four magnets (two pairs), or snap bumps. */
  latch: "magnet" | "snap";
  /** M3 threads: brass heat-set inserts, or hex nuts in pockets from below. */
  fastener: "insert" | "nut";
  /** Side walls, floor and top. */
  wall: number;
}

export const DEFAULT_OPTIONS: CaseOptions = {
  latch: "magnet",
  fastener: "insert",
  wall: 2,
};

// --- [LAY] Decisions -----------------------------------------------------------

/** The wall with the F connectors and the USB-C ports (the bracket's place). F connectors want 3 or more. */
export const TERMINAL_WALL = 3;
/** Gap between the contents and the walls, floor and lid. */
export const CLEARANCE = 0.5;
/** Gap between the card's edges and the walls. */
export const CARD_GAP = 1;
/** Gap per side between parts that slide together (lid tongues, hatch); SLA resin. */
export const FIT = 0.15;
/** Over the F thread's radius, in the U slot. */
export const F_SLOT_PLAY = 0.3;
/** Around the USB-C plug's overmould (12.35 x 6.5), per side. */
export const USB_OPENING_PLAY = 0.25;
/** USB Type-C plug overmould height (12.35 wide: USBC_PLUG_WIDTH). */
export const USBC_PLUG_HEIGHT = 6.5;
/** Inward boss around each F connector, as thick as the old bracket: the connector's shoulder bears on it. */
export const F_BOSS_HALF_WIDTH = 7;
/** Bosses under the board and the card. */
export const STANDOFF_RADIUS = 3.5;
/** Posts that the lid is screwed to. */
export const POST_RADIUS = 3.5;
/** M3: heat-set insert hole (diameter, depth), clearance hole, nut pocket (across flats, depth). */
export const M3 = {
  insertHole: 4,
  insertDepth: 5.5,
  clearance: 3.4,
  nutFlats: 5.7,
  nutDepth: 2.6,
};
/** No part on the card's solder side within this radius of its screw holes (PCIe cards keep it clear for the bracket screws). [EST] */
export const CARD_SCREW_KEEPOUT = 4;
/** The B-CAS hatch: plate size (x, y), thickness, the ledge under it and the frame around it. */
export const HATCH = {
  length: 95,
  width: 60,
  thickness: 3,
  ledge: 3,
  frame: 3,
  /** Depth of the frame and the ledge below the lid's inside face. */
  depth: 4,
  slitWidth: 2,
  slitPitch: 5,
  slitMargin: 10,
  fingerNotch: 7,
};
/** Magnets of the hatch: diameter and thickness, and the pocket's extra. */
export const MAGNET = { diameter: 6, thickness: 2, play: 0.2, glue: 0.1 };
/** Light holes over the LEDs. */
export const LED_HOLE = 2;

// --- Helpers -----------------------------------------------------------------

export const box = (min: V3, max: V3): BoxPrim => ({
  kind: "box",
  min: [
    Math.min(min[0], max[0]),
    Math.min(min[1], max[1]),
    Math.min(min[2], max[2]),
  ],
  max: [
    Math.max(min[0], max[0]),
    Math.max(min[1], max[1]),
    Math.max(min[2], max[2]),
  ],
});

const cylZ = (x: number, y: number, r: number, from: number, to: number) =>
  ({ kind: "cyl", axis: "z", at: [x, y], r, from, to }) as CylPrim;
const cylX = (y: number, z: number, r: number, from: number, to: number) =>
  ({ kind: "cyl", axis: "x", at: [y, z], r, from, to }) as CylPrim;
const hexZ = (x: number, y: number, flats: number, from: number, to: number) =>
  ({
    kind: "cyl",
    axis: "z",
    at: [x, y],
    r: flats / Math.sqrt(3),
    from,
    to,
    sides: 6,
  }) as CylPrim;

/** Bounding box of a prim. */
export const bounds = (p: Prim): { min: V3; max: V3 } => {
  if (p.kind === "box") return { min: p.min, max: p.max };
  const [a, b] = p.at;
  const lo = Math.min(p.from, p.to);
  const hi = Math.max(p.from, p.to);
  if (p.axis === "x")
    return { min: [lo, a - p.r, b - p.r], max: [hi, a + p.r, b + p.r] };
  if (p.axis === "y")
    return { min: [a - p.r, lo, b - p.r], max: [a + p.r, hi, b + p.r] };
  return { min: [a - p.r, b - p.r, lo], max: [a + p.r, b + p.r, hi] };
};

export const overlaps = (
  a: { min: V3; max: V3 },
  b: { min: V3; max: V3 },
  eps = 1e-6,
): boolean =>
  [0, 1, 2].every(
    (i) =>
      (a.min[i] ?? 0) < (b.max[i] ?? 0) - eps &&
      (b.min[i] ?? 0) < (a.max[i] ?? 0) - eps,
  );

// --- Contents ------------------------------------------------------------------

const HALF = BOARD_THICKNESS / 2;
/** Card coordinates (case/card.ts) to design coordinates. */
const fromBracket = (d: number) => BRACKET_FACE_X + d;
const fromShoulder = (d: number) => CARD_EDGE_Y - d;

/** The card's board ends here (far from the bracket) and its top edge is here. */
export const CARD_END_X = fromBracket(CARD.length);
export const CARD_TOP_Y = fromShoulder(CARD.height);
/** The F connector's shoulder bore on the bracket's inside face. */
export const F_SHOULDER_X = BRACKET_FACE_X + BRACKET_THICKNESS;
export const F_AXIS_Z = HALF + CARD.fAxisHeight;
export const F_CONNECTORS: { name: string; y: number }[] = [
  { name: "F (near the contacts)", y: fromShoulder(CARD.fNear) },
  { name: "F (far)", y: fromShoulder(CARD.fFar) },
];
/** Middle of the B-CAS card across the card: the middle of the reader. */
export const BCAS_Y = fromShoulder((CARD.readerLow + CARD.readerHigh) / 2);
export const CARD_SCREWS: Point[] = [CARD.screwTop, CARD.screwBottom].map(
  ([b, s]) => ({ x: fromBracket(b), y: fromShoulder(s) }),
);

/** Centre height of the USB-C shell: lib/cad.ts draws it from 0.1 above the board to the part's height. */
const USBC_CENTRE_Z = HALF + (0.1 + (fp.USBC_TYPE_C_31_M_12.height ?? 0)) / 2;
export const USB_PORTS: { name: string; y: number; z: number }[] = [
  { name: "J1", y: J1_Y, z: USBC_CENTRE_Z },
  { name: "J2", y: J2_Y, z: USBC_CENTRE_Z },
];

/** Bounding boxes of a part's 3D model (lib/cad.ts), one per solid, in design coordinates. */
const partBoxes = (part: (typeof PLACEMENT)[number]): BoxPrim[] =>
  solidsOf(fp[part.footprint]).map((s) => {
    const xs = s.vertices.map((v) => v[0]);
    const ys = s.vertices.map((v) => v[1]);
    const zs = s.vertices.map((v) => v[2]);
    const r = placedBox(
      {
        x0: Math.min(...xs),
        y0: Math.min(...ys),
        x1: Math.max(...xs),
        y1: Math.max(...ys),
      },
      part.x,
      part.y,
      part.rotation,
    );
    return box(
      [r.x0, r.y0, HALF + Math.min(...zs)],
      [r.x1, r.y1, HALF + Math.max(...zs)],
    );
  });

const cardRect = (x0: number, y0: number, x1: number, y1: number) => ({
  x0: Math.min(x0, x1),
  y0: Math.min(y0, y1),
  x1: Math.max(x0, x1),
  y1: Math.max(y0, y1),
});

/** Everything in and around the case. */
export const contents = (): Content[] => {
  const board: Content = {
    name: "board",
    prims: [
      box([REAR_STEP, 0, -HALF], [BOARD_WIDTH, REAR_STEP_DEPTH, HALF]),
      box([0, REAR_STEP_DEPTH, -HALF], [BOARD_WIDTH, BOARD_DEPTH, HALF]),
    ],
  };
  const parts: Content[] = PLACEMENT.map((part) => ({
    name: part.ref,
    prims: partBoxes(part),
  }));
  const boardPlugs: Content[] = CARD_USB_PLUGS.map((r, i) => ({
    name: `${i === 0 ? "J4" : "J6"} plug`,
    prims: [box([r.x0, r.y0, HALF], [r.x1, r.y1, HALF + PH_PLUG.height])],
  }));
  const usbPlugs: Content[] = USB_PORTS.map((p) => ({
    name: `${p.name} USB-C plug`,
    outside: true,
    prims: [
      box(
        [
          BRACKET_FACE_X - USBC_PLUG_LENGTH,
          p.y - USBC_PLUG_WIDTH / 2,
          p.z - USBC_PLUG_HEIGHT / 2,
        ],
        [BRACKET_FACE_X, p.y + USBC_PLUG_WIDTH / 2, p.z + USBC_PLUG_HEIGHT / 2],
      ),
    ],
  }));

  // The card: its board, the tabs below the shoulder, the contacts in J3,
  // the parts on both sides as slabs, and what stands taller.
  const c = cardRect(CARD_REAR_X, CARD_TOP_Y, CARD_END_X, CARD_EDGE_Y);
  const pcb = (x0: number, y0: number, x1: number, y1: number) => {
    const r = cardRect(x0, y0, x1, y1);
    return box([r.x0, r.y0, -HALF], [r.x1, r.y1, HALF]);
  };
  const cardBoard: Content = {
    name: "card",
    prims: [
      pcb(c.x0, c.y0, c.x1, c.y1),
      pcb(
        CARD_REAR_X,
        CARD_EDGE_Y,
        fromBracket(CARD.tabEnd),
        CARD_EDGE_Y + CARD.tabDrop,
      ),
      pcb(
        fromBracket(CARD.tab2From),
        CARD_EDGE_Y,
        fromBracket(CARD.tab2To),
        CARD_EDGE_Y + CARD.tab2Drop,
      ),
      // The contacts, into J3 (as lib/geometry.ts draws them).
      pcb(J3_ORIGIN.x - 10.65, CARD_EDGE_Y, J3_ORIGIN.x + 10.65, -0.5),
    ],
  };
  const top = HALF + CARD.partsTop;
  const bottom = -HALF - CARD.partsBottom;
  // The solder-side slab, split around the screw holes (the bosses go there).
  const k = CARD_SCREW_KEEPOUT;
  const [s0, s1] = CARD_SCREWS as [Point, Point];
  const cy = (y: number) => Math.min(Math.max(y, c.y0), c.y1);
  const slab = (xa: number, ya: number, xb: number, yb: number): BoxPrim[] =>
    xb > xa && cy(yb) > cy(ya)
      ? [box([xa, cy(ya), bottom], [xb, cy(yb), -HALF])]
      : [];
  const below: BoxPrim[] = [
    ...slab(c.x0, c.y0, c.x1, s0.y - k),
    ...slab(c.x0, s0.y - k, s0.x - k, s0.y + k),
    ...slab(s0.x + k, s0.y - k, c.x1, s0.y + k),
    ...slab(c.x0, s0.y + k, c.x1, s1.y - k),
    ...slab(c.x0, s1.y - k, s1.x - k, c.y1),
    ...slab(s1.x + k, s1.y - k, c.x1, c.y1),
  ];
  const cardParts: Content[] = [
    {
      name: "card parts (component side)",
      prims: [box([c.x0, c.y0, HALF], [c.x1, c.y1, top])],
    },
    { name: "card parts (solder side)", prims: below },
    {
      name: "B-CAS reader",
      prims: [
        box(
          [fromBracket(CARD.readerFrom), fromShoulder(CARD.readerHigh), HALF],
          [
            fromBracket(CARD.readerTo),
            fromShoulder(CARD.readerLow),
            HALF + CARD.readerHeight,
          ],
        ),
      ],
    },
    {
      name: "B-CAS card",
      prims: [
        box(
          [
            fromBracket(CARD.bcasOuterEnd),
            BCAS_Y - BCAS.width / 2,
            HALF + CARD.bcasLift,
          ],
          [
            fromBracket(CARD.bcasOuterEnd) + BCAS.length,
            BCAS_Y + BCAS.width / 2,
            HALF + CARD.bcasLift + BCAS.thickness,
          ],
        ),
      ],
    },
    ...[CARD.usbNear, CARD.usbFar].flatMap((d, i): Content[] => {
      const y = fromShoulder(d);
      return [
        {
          name: `card USB socket ${i + 1}`,
          prims: [
            box(
              [
                fromBracket(CARD.usbHousingFrom),
                y - CARD.usbHousingWidth / 2,
                HALF,
              ],
              [
                CARD_END_X,
                y + CARD.usbHousingWidth / 2,
                HALF + CARD.usbHousingHeight,
              ],
            ),
          ],
        },
        {
          // Plug and the bend of its cable off the card's far end.
          name: `card USB plug ${i + 1}`,
          prims: [
            box(
              [CARD_END_X, y - PH_PLUG.width / 2, HALF],
              [
                CARD_END_X + PH_PLUG.out + PH_PLUG.bend,
                y + PH_PLUG.width / 2,
                HALF + CARD.usbHousingHeight,
              ],
            ),
          ],
        },
      ];
    }),
  ];
  const nutCorners = CARD.fNutFlats / Math.sqrt(3);
  const fConnectors: Content[] = F_CONNECTORS.flatMap(
    ({ name, y }): Content[] => [
      {
        name: `${name} body`,
        prims: [
          box(
            [F_SHOULDER_X, y - CARD.fBodyWidth / 2, HALF],
            [
              fromBracket(CARD.fBodyEnd),
              y + CARD.fBodyWidth / 2,
              HALF + CARD.fBodyHeight,
            ],
          ),
        ],
      },
      {
        name: `${name} thread`,
        prims: [
          cylX(
            y,
            F_AXIS_Z,
            CARD.fThreadDiameter / 2,
            BRACKET_FACE_X - CARD.fThreadOut,
            F_SHOULDER_X,
          ),
        ],
      },
      {
        name: `${name} nut`,
        outside: true,
        prims: [
          {
            ...cylX(
              y,
              F_AXIS_Z,
              nutCorners,
              BRACKET_FACE_X - TERMINAL_WALL - CARD.fNutThickness,
              BRACKET_FACE_X - TERMINAL_WALL,
            ),
            sides: 6,
          },
        ],
      },
    ],
  );
  return [
    board,
    ...parts,
    ...boardPlugs,
    ...usbPlugs,
    cardBoard,
    ...cardParts,
    ...fConnectors,
  ];
};

// --- The case ----------------------------------------------------------------

export interface Interior {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** Floor and ceiling (inside faces). */
  z0: number;
  z1: number;
}

/** The inside of the case, from what it holds. */
export const interior = (items: Content[] = contents()): Interior => {
  const inside = items
    .filter((c) => !c.outside)
    .flatMap((c) => c.prims.map(bounds));
  const lo = (i: number) => Math.min(...inside.map((b) => b.min[i] ?? 0));
  const hi = (i: number) => Math.max(...inside.map((b) => b.max[i] ?? 0));
  return {
    // [LAY] The inside face of the terminal wall is where the bracket's
    // outside face was: the USB-C mouths (lib/geometry.ts) sit flush with it.
    x0: BRACKET_FACE_X,
    x1: hi(0) + CLEARANCE,
    y0: Math.min(CARD_TOP_Y - CARD_GAP, lo(1) - CLEARANCE),
    y1: hi(1) + CLEARANCE,
    z0: lo(2) - CLEARANCE,
    z1: hi(2) + CLEARANCE,
  };
};

export interface Hole {
  name: string;
  x: number;
  y: number;
  r: number;
}

export interface CaseLayout {
  options: CaseOptions;
  inside: Interior;
  /** Outer extent of the closed case. */
  outer: { min: V3; max: V3 };
  standoffs: Hole[];
  posts: Point[];
  hatch: { x0: number; y0: number; x1: number; y1: number };
  opening: { x0: number; y0: number; x1: number; y1: number };
  tray: Body;
  lid: Body;
  hatchBody: Body;
}

/** Largest radius up to `max` that keeps a boss at (x, y) clear of `prims` below the board. */
const roomBelow = (x: number, y: number, prims: Prim[], max: number): number =>
  prims.reduce((r, p) => {
    const b = bounds(p);
    if (b.min[2] >= -HALF - 1e-6) return r;
    const dx = Math.max(b.min[0] - x, 0, x - b.max[0]);
    const dy = Math.max(b.min[1] - y, 0, y - b.max[1]);
    return Math.min(r, Math.hypot(dx, dy) - 0.2);
  }, max);

export const layout = (options: CaseOptions = DEFAULT_OPTIONS): CaseLayout => {
  const items = contents();
  const inside = interior(items);
  const { x0, x1, y0, y1, z0, z1 } = inside;
  const w = options.wall;
  const X0 = x0 - TERMINAL_WALL;
  const X1 = x1 + w;
  const Y0 = y0 - w;
  const Y1 = y1 + w;
  const Z0 = z0 - w;
  const Z1 = z1 + w;

  // Standoffs: the board's six holes and the card's two. Each as wide as
  // the parts under the board let it be.
  const under = items
    .filter((c) => c.name !== "board" && c.name !== "card")
    .flatMap((c) => c.prims);
  const standoffs: Hole[] = [
    ...MOUNTING_HOLE_POSITIONS.map((p, i) => ({
      name: `H${i + 1}`,
      ...p,
      r: roomBelow(p.x, p.y, under, STANDOFF_RADIUS),
    })),
    ...CARD_SCREWS.map((p, i) => ({
      name: `card ${i === 0 ? "top" : "bottom"} screw`,
      ...p,
      r: STANDOFF_RADIUS,
    })),
  ];

  // [LAY] Posts for the lid's screws, where neither the board nor the card
  // is: past the board's end, in the far corner beyond the card, and in the
  // gap between the card and the board past J3.
  const posts: Point[] = [
    { x: (BOARD_WIDTH + x1) / 2, y: BOARD_DEPTH / 2 },
    { x: x1 - POST_RADIUS - 1, y: y0 + POST_RADIUS + 1 },
    {
      x: ((J3_EAR_KEEPOUTS[1]?.x1 ?? 0) + BOARD_WIDTH) / 2,
      y: CARD_EDGE_Y / 2,
    },
  ];

  const threaded = (
    x: number,
    y: number,
    top: number,
    r: number,
  ): { add: Prim[]; cut: Prim[] } => ({
    add: [cylZ(x, y, r, z0, top)],
    cut:
      options.fastener === "insert"
        ? [cylZ(x, y, M3.insertHole / 2, top - M3.insertDepth, top + 0.01)]
        : [
            cylZ(x, y, M3.clearance / 2, Z0 - 0.01, top + 0.01),
            hexZ(x, y, M3.nutFlats, Z0 - 0.01, Z0 + M3.nutDepth),
          ],
  });

  // --- Tray: floor, the two long walls, the terminal wall ---
  const tray: Body = { name: "tray", add: [], cut: [] };
  tray.add.push(
    box([X0, Y0, Z0], [X1, Y1, z0]),
    box([X0, Y0, Z0], [X1, y0, z1]),
    box([X0, y1, Z0], [X1, Y1, z1]),
    box([X0, Y0, Z0], [x0, Y1, z1]),
  );
  for (const s of standoffs) {
    const t = threaded(s.x, s.y, -HALF, s.r);
    tray.add.push(...t.add);
    tray.cut.push(...t.cut);
  }
  for (const p of posts) {
    const t = threaded(p.x, p.y, z1, POST_RADIUS);
    tray.add.push(...t.add);
    tray.cut.push(...t.cut);
  }
  const fSlot = CARD.fThreadDiameter / 2 + F_SLOT_PLAY;
  for (const f of F_CONNECTORS) {
    tray.add.push(
      box(
        [x0, f.y - F_BOSS_HALF_WIDTH, z0],
        [F_SHOULDER_X, f.y + F_BOSS_HALF_WIDTH, z1],
      ),
    );
    // U slot: round bottom on the axis, open to the top.
    tray.cut.push(
      cylX(f.y, F_AXIS_Z, fSlot, X0 - 1, F_SHOULDER_X + 0.01),
      box(
        [X0 - 1, f.y - fSlot, F_AXIS_Z],
        [F_SHOULDER_X + 0.01, f.y + fSlot, z1 + 1],
      ),
    );
  }
  const usbHalfW = USBC_PLUG_WIDTH / 2 + USB_OPENING_PLAY;
  const usbHalfH = USBC_PLUG_HEIGHT / 2 + USB_OPENING_PLAY;
  for (const u of USB_PORTS)
    tray.cut.push(
      box(
        [X0 - 1, u.y - usbHalfW, u.z - usbHalfH],
        [x0 + 0.01, u.y + usbHalfW, z1 + 1],
      ),
    );

  // --- Lid: top, the far end wall, the tongues that close the U slots ---
  const lid: Body = { name: "lid", add: [], cut: [] };
  lid.add.push(
    box([X0, Y0, z1], [X1, Y1, Z1]),
    box([x1, y0 + FIT, z0], [X1, y1 - FIT, z1]),
  );
  for (const f of F_CONNECTORS) {
    lid.add.push(
      box(
        [X0, f.y - fSlot + FIT, F_AXIS_Z],
        [F_SHOULDER_X, f.y + fSlot - FIT, z1],
      ),
    );
    lid.cut.push(cylX(f.y, F_AXIS_Z, fSlot, X0 - 1, F_SHOULDER_X + 1));
  }
  for (const u of USB_PORTS)
    lid.add.push(
      box(
        [X0, u.y - usbHalfW + FIT, u.z + usbHalfH],
        [x0, u.y + usbHalfW - FIT, z1],
      ),
    );
  for (const p of posts)
    lid.cut.push(cylZ(p.x, p.y, M3.clearance / 2, z1 - 0.01, Z1 + 0.01));
  for (const led of PLACEMENT.filter((p) => p.footprint === "LED0603"))
    lid.cut.push(cylZ(led.x, led.y, LED_HOLE / 2, z1 - 0.01, Z1 + 0.01));

  // --- The B-CAS hatch ---
  // [LAY] Over the B-CAS card, centred on the reader across the card; along
  // the card it starts just past the F connectors (their bodies stand
  // higher than the hatch's frame bottom) and runs past the reader's mouth.
  const hy = BCAS_Y;
  const hx0 = fromBracket(CARD.fBodyEnd) + CLEARANCE + HATCH.frame + FIT;
  const hatch = {
    x0: hx0,
    y0: hy - HATCH.width / 2,
    x1: hx0 + HATCH.length,
    y1: hy + HATCH.width / 2,
  };
  const opening = {
    x0: hatch.x0 - FIT,
    y0: hatch.y0 - FIT,
    x1: hatch.x1 + FIT,
    y1: hatch.y1 + FIT,
  };
  // The hatch is flush with the lid's top and rests on a ledge below the lid.
  const hatchBottom = Z1 - HATCH.thickness;
  const ledgeBottom = z1 - HATCH.depth;
  const o = opening;
  const f = HATCH.frame;
  const l = HATCH.ledge;
  lid.add.push(
    // Frame around the opening, from the ledge's bottom up to the lid.
    box([o.x0 - f, o.y0 - f, ledgeBottom], [o.x1 + f, o.y0, z1]),
    box([o.x0 - f, o.y1, ledgeBottom], [o.x1 + f, o.y1 + f, z1]),
    box([o.x0 - f, o.y0, ledgeBottom], [o.x0, o.y1, z1]),
    box([o.x1, o.y0, ledgeBottom], [o.x1 + f, o.y1, z1]),
    // Ledge under the hatch's edge.
    box([o.x0, o.y0, ledgeBottom], [o.x1, o.y0 + l, hatchBottom]),
    box([o.x0, o.y1 - l, ledgeBottom], [o.x1, o.y1, hatchBottom]),
    box([o.x0, o.y0, ledgeBottom], [o.x0 + l, o.y1, hatchBottom]),
    box([o.x1 - l, o.y0, ledgeBottom], [o.x1, o.y1, hatchBottom]),
  );
  lid.cut.push(
    box([o.x0, o.y0, hatchBottom], [o.x1, o.y1, Z1 + 1]),
    // A notch for a finger at the far short side.
    cylZ(o.x1, hy, HATCH.fingerNotch, hatchBottom, Z1 + 1),
  );

  const hatchBody: Body = {
    name: "hatch",
    add: [box([hatch.x0, hatch.y0, hatchBottom], [hatch.x1, hatch.y1, Z1])],
    cut: [],
  };
  // Slits for air, over the card's parts.
  for (
    let x = hatch.x0 + HATCH.slitMargin;
    x + HATCH.slitWidth <= hatch.x1 - HATCH.slitMargin;
    x += HATCH.slitPitch
  )
    hatchBody.cut.push(
      box(
        [x, hatch.y0 + HATCH.slitMargin, hatchBottom - 1],
        [x + HATCH.slitWidth, hatch.y1 - HATCH.slitMargin, Z1 + 1],
      ),
    );

  const mx = (hatch.x0 + hatch.x1) / 2;
  if (options.latch === "magnet") {
    // Two pairs: one magnet in the ledge, one in the hatch, at the middle of each long side.
    const r = (MAGNET.diameter + MAGNET.play) / 2;
    const depth = MAGNET.thickness + MAGNET.glue;
    const pad = MAGNET.diameter + 4;
    for (const [edge, dir] of [
      [o.y0, 1],
      [o.y1, -1],
    ] as const) {
      const cy = edge + dir * (pad / 2);
      lid.add.push(
        box(
          [mx - pad / 2, edge, ledgeBottom],
          [mx + pad / 2, edge + dir * pad, hatchBottom],
        ),
      );
      lid.cut.push(cylZ(mx, cy, r, hatchBottom - depth, hatchBottom + 0.01));
      hatchBody.cut.push(
        cylZ(mx, cy, r, hatchBottom - 0.01, hatchBottom + depth),
      );
    }
  } else {
    // Snap: two bumps on each short side of the hatch, in grooves of the frame.
    const bump = 0.35;
    const zMid = (hatchBottom + Z1) / 2;
    for (const [x, dir] of [
      [hatch.x0, -1],
      [hatch.x1, 1],
    ] as const)
      for (const cy of [hy - HATCH.width / 4, hy + HATCH.width / 4]) {
        hatchBody.add.push(
          box([x, cy - 3, zMid - 0.5], [x + dir * bump, cy + 3, zMid + 0.5]),
        );
        lid.cut.push(
          box(
            [x, cy - 3.2, zMid - 0.7],
            [x + dir * (bump + FIT + 0.25), cy + 3.2, zMid + 0.7],
          ),
        );
      }
  }

  return {
    options,
    inside,
    outer: { min: [X0, Y0, Z0], max: [X1, Y1, Z1] },
    standoffs,
    posts,
    hatch,
    opening,
    tray,
    lid,
    hatchBody,
  };
};
