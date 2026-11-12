// 3D models of the parts, for the 3D views only (the 3D tab of the site,
// tools/render3d.ts and the pictures made from it). They are drawn here from
// the package dimensions instead of being downloaded, so the repository holds
// no model under someone else's licence and the pictures need no network.
//
// Every land pattern of lib/footprints.ts that is assembled has a model in
// MODELS below. A land pattern without one still gets a plain box the size of
// its body (or pads) and its height, so a part added later shows up in 3D
// without anyone touching this file; give it a proper model when it matters.
//
// Coordinates are those of the land pattern (lib/footprints.ts): origin at
// the part origin, x to the right, y up, and z up from the top surface of the
// board. Models reach the manufacturing files nowhere: tscircuit keeps them
// in cad_component elements, which the Gerber, BOM and placement exports skip.
import * as fp from "./footprints";
import type { Box, FootprintDef, Pad } from "./footprints";
import {
  type Rgb,
  type Solid,
  block,
  objDataUrl,
  prism,
  roundedRect,
} from "./mesh";

// --- Colours ----------------------------------------------------------------

const BLACK: Rgb = [0.09, 0.09, 0.1];
const MOULD: Rgb = [0.14, 0.14, 0.15];
const TIN: Rgb = [0.78, 0.78, 0.76];
const GOLD: Rgb = [0.86, 0.69, 0.3];
const STEEL: Rgb = [0.72, 0.74, 0.77];
const MARK: Rgb = [0.75, 0.75, 0.72];
const CERAMIC: Rgb = [0.71, 0.57, 0.4];
const RESISTOR: Rgb = [0.12, 0.12, 0.12];
const FERRITE: Rgb = [0.27, 0.27, 0.29];
const LED_BASE: Rgb = [0.93, 0.93, 0.9];
const LED_LENS: Rgb = [0.9, 0.12, 0.1];
const PTC: Rgb = [0.55, 0.62, 0.3];
const PLAIN: Rgb = [0.45, 0.47, 0.5];

// --- Building blocks ----------------------------------------------------------

const centred = (w: number, h: number): Box => ({
  x0: -w / 2,
  y0: -h / 2,
  x1: w / 2,
  y1: h / 2,
});

/** Chip part (resistor, capacitor, fuse) along x: body between two end caps. */
const chip = (
  length: number,
  width: number,
  height: number,
  cap: number,
  body: Rgb,
): Solid[] => [
  block(
    body,
    [-length / 2 + cap, -width / 2, 0],
    [length / 2 - cap, width / 2, height],
  ),
  block(
    TIN,
    [-length / 2, -width / 2, 0],
    [-length / 2 + cap, width / 2, height],
  ),
  block(
    TIN,
    [length / 2 - cap, -width / 2, 0],
    [length / 2, width / 2, height],
  ),
];

/** Small square mark on the top of a body, at the corner nearest to `toward`. */
const dot = (
  body: Box,
  top: number,
  toward: { x: number; y: number },
): Solid => {
  const size = Math.min(0.5, (body.x1 - body.x0) / 4, (body.y1 - body.y0) / 4);
  const margin = size;
  const cx = Math.min(body.x1 - margin, Math.max(body.x0 + margin, toward.x));
  const cy = Math.min(body.y1 - margin, Math.max(body.y0 + margin, toward.y));
  return block(
    MARK,
    [cx - size / 2, cy - size / 2, top],
    [cx + size / 2, cy + size / 2, top + 0.02],
  );
};

/** Moulded body from z = `standoff` to `height`, with draft. */
const mould = (
  body: Box,
  standoff: number,
  height: number,
  color = MOULD,
): Solid =>
  block(color, [body.x0, body.y0, standoff], [body.x1, body.y1, height], 0.12);

/**
 * Gull-wing lead from the side of the body out to the pad: a shoulder at
 * `level` and a foot on the pad. Pads under the body (exposed pads) get none.
 */
const gullWing = (
  pad: Pad,
  body: Box,
  level: number,
  width: number,
  color = TIN,
): Solid[] => {
  const t = 0.12;
  const outX = pad.x > body.x1 || pad.x < body.x0;
  const outY = pad.y > body.y1 || pad.y < body.y0;
  if (!outX && !outY) return [];
  if (outX) {
    const s = Math.sign(pad.x);
    const edge = s > 0 ? body.x1 : body.x0;
    const toe = pad.x + (s * pad.w) / 4;
    const knee = edge + s * Math.min(0.25, Math.abs(toe - edge) / 3);
    const y0 = pad.y - width / 2;
    const y1 = pad.y + width / 2;
    return [
      block(color, [edge, y0, level - t / 2], [knee, y1, level + t / 2]),
      block(
        color,
        [knee - (s * t) / 2, y0, 0],
        [knee + (s * t) / 2, y1, level + t / 2],
      ),
      block(color, [knee, y0, 0], [toe, y1, t]),
    ];
  }
  const s = Math.sign(pad.y);
  const edge = s > 0 ? body.y1 : body.y0;
  const toe = pad.y + (s * pad.h) / 4;
  const knee = edge + s * Math.min(0.25, Math.abs(toe - edge) / 3);
  const x0 = pad.x - width / 2;
  const x1 = pad.x + width / 2;
  return [
    block(color, [x0, edge, level - t / 2], [x1, knee, level + t / 2]),
    block(
      color,
      [x0, knee - (s * t) / 2, 0],
      [x1, knee + (s * t) / 2, level + t / 2],
    ),
    block(color, [x0, knee, 0], [x1, toe, t]),
  ];
};

/** Leaded package (SOT, SOP): body, a lead to every pad outside it, pin-1 mark. */
const leaded = (
  def: FootprintDef,
  body: Box,
  height: number,
  lead: { level: number; width: number },
): Solid[] => [
  mould(body, 0.05, height),
  ...def.pads.flatMap((p) => gullWing(p, body, lead.level, lead.width)),
  ...(def.pin1Mark ? [dot(body, height, def.pin1Mark)] : []),
];

/**
 * Moulded diode (SOD, SMA) along x: body, flat leads out to the pads and the
 * cathode band at the end where the land pattern has its mark.
 */
const diode = (
  def: FootprintDef,
  length: number,
  width: number,
  height: number,
  leadWidth: number,
): Solid[] => {
  const body = centred(length, width);
  const cathode = Math.sign(def.pin1Mark?.x ?? -1);
  const band = length * 0.12;
  const bandX = cathode * (length / 2 - band * 1.6);
  const leads = def.pads.flatMap((p) => {
    const s = Math.sign(p.x);
    const toe = p.x + (s * p.w) / 4;
    return [
      block(
        TIN,
        [s * (length / 2 - 0.05), -leadWidth / 2, 0],
        [toe, leadWidth / 2, 0.15],
      ),
    ];
  });
  return [
    mould(body, 0.05, height, BLACK),
    block(
      MARK,
      [bandX - band / 2, -width / 2 + 0.15, height - 0.1],
      [bandX + band / 2, width / 2 - 0.15, height + 0.01],
    ),
    ...leads,
  ];
};

// --- Connectors -----------------------------------------------------------------

/**
 * USB-C receptacle TYPE-C-31-M-12: a steel shell 8.94 wide and 3.26 high
 * whose mouth is 5.07 in front of the origin (towards -y), the plug opening
 * with its tongue, and the contact tails on the pads behind the shell.
 */
const usbC = (def: FootprintDef): Solid[] => {
  const mouth = -5.07;
  const rear = 1.75;
  const height = def.height ?? 3.36;
  const zc = (height + 0.1) / 2;
  const shell = roundedRect(0, zc, 8.94, height - 0.1, 1.3);
  const opening = roundedRect(0, zc, 8.34, height - 0.7, 1.0);
  return [
    prism(
      STEEL,
      "y",
      shell.map(([x, z]) => [z, x] as const),
      mouth,
      rear,
    ),
    prism(
      BLACK,
      "y",
      opening.map(([x, z]) => [z, x] as const),
      mouth - 0.02,
      mouth + 3.5,
    ),
    block(MOULD, [-3.3, mouth - 0.03, zc - 0.35], [3.3, mouth + 4, zc + 0.35]),
    ...def.pads.map((p) =>
      block(
        TIN,
        [p.x - p.w / 3, rear - 0.2, 0],
        [p.x + p.w / 3, p.y + p.h / 4, 0.15],
      ),
    ),
    // Shell legs through the board.
    ...(def.platedHoles ?? []).map((h) =>
      block(
        STEEL,
        [h.x - 0.3, h.y - h.holeH / 3, -1.6 - 0.8],
        [h.x + 0.3, h.y + h.holeH / 3, 0.1],
      ),
    ),
  ];
};

/**
 * PCIe x1 straddle-mount slot X1613WS-36D-9TV01. The housing stands beyond
 * the board edge (y = +3.2) up to the card's mouth (y = +11.3, J3_MOUTH_Y in
 * lib/geometry.ts) and reaches 4.5 above the top and 3.78 below the bottom
 * surface; the ears clamp the board around the two holes. The contact tails
 * lie on the pads on both sides.
 */
const pcieSlot = (def: FootprintDef): Solid[] => {
  const edge = 3.2;
  const mouth = 11.3;
  const top = def.height ?? 4.5;
  const bottom = -1.6 - 3.78;
  const half = 17.65;
  const ear = 6.7;
  const tails = def.pads.map((p) =>
    p.layer === "bottom"
      ? block(GOLD, [p.x - 0.2, -1.6, -1.75], [p.x + 0.2, edge, -1.6])
      : block(GOLD, [p.x - 0.2, -1.6, 0], [p.x + 0.2, edge, 0.15]),
  );
  return [
    block(BLACK, [-half, edge, bottom], [half, mouth, top]),
    // Ears over and under the board.
    ...[-1, 1].flatMap((s) => [
      block(BLACK, [s * half, -5.8, 0], [s * (half - ear), edge, top]),
      block(BLACK, [s * half, -5.8, bottom], [s * (half - ear), edge, -1.6]),
    ]),
    // The slot the card's edge enters, centred on the board's mid-plane.
    block(MOULD, [-11, mouth, -0.8 - 0.9], [11, mouth + 0.02, -0.8 + 0.9]),
    ...tails,
  ];
};

/**
 * Right-angle 2x5 header PZ254R-12-10P: plastic block in front of the holes,
 * pins rising from the holes and bending towards -y (odd pins low, even pins
 * high).
 */
const header2x5 = (def: FootprintDef): Solid[] => {
  const body = def.body ?? { x0: -6.35, y0: -5.31, x1: 6.35, y1: -2.81 };
  const tip = body.y0 - 6;
  const pin = 0.32;
  const below = -1.6 - 1.4;
  return [
    block(BLACK, [body.x0, body.y0, 0], [body.x1, body.y1, 5.08]),
    ...(def.platedHoles ?? []).flatMap((h) => {
      const level = Number(h.pin) % 2 === 1 ? 1.27 : 3.81;
      return [
        block(
          GOLD,
          [h.x - pin, h.y - pin, below],
          [h.x + pin, h.y + pin, level + pin],
        ),
        block(
          GOLD,
          [h.x - pin, tip, level - pin],
          [h.x + pin, h.y + pin, level + pin],
        ),
      ];
    }),
  ];
};

// --- The models -------------------------------------------------------------------

const MODELS = new Map<FootprintDef, (def: FootprintDef) => Solid[]>([
  [fp.R0603, (d) => chip(1.6, 0.8, d.height ?? 0.45, 0.3, RESISTOR)],
  [fp.C0603, (d) => chip(1.6, 0.8, d.height ?? 0.8, 0.3, CERAMIC)],
  [fp.R0805, (d) => chip(2.0, 1.25, d.height ?? 0.5, 0.4, RESISTOR)],
  [fp.C0805, (d) => chip(2.0, 1.25, d.height ?? 1.25, 0.4, CERAMIC)],
  [fp.F1206, (d) => chip(3.2, 1.6, d.height ?? 1.0, 0.5, PTC)],
  [
    fp.LED0603,
    (d) => [
      ...chip(1.6, 0.8, 0.3, 0.3, LED_BASE),
      block(LED_LENS, [-0.5, -0.4, 0.3], [0.5, 0.4, d.height ?? 0.7], 0.1),
    ],
  ],
  [
    fp.IND_FXL0630,
    (d) => {
      const h = d.height ?? 3.0;
      return [
        block(FERRITE, [-3.5, -3.3, 0], [3.5, 3.3, h], 0.15),
        ...[-1, 1].map((s) =>
          block(TIN, [s * 3.5, -1.5, 0], [s * 3.56, 1.5, 1.2]),
        ),
      ];
    },
  ],
  [fp.SMA_SS54, (d) => diode(d, 4.4, 2.6, d.height ?? 2.3, 1.4)],
  [fp.SMA_SS34, (d) => diode(d, 4.3, 2.6, d.height ?? 2.3, 1.4)],
  [fp.SOD123F, (d) => diode(d, 2.7, 1.6, d.height ?? 1.0, 0.9)],
  [fp.SOD123, (d) => diode(d, 2.7, 1.6, d.height ?? 1.15, 0.6)],
  [
    fp.SOT23_AO3401A,
    (d) =>
      leaded(d, centred(1.3, 2.9), d.height ?? 1.1, {
        level: 0.45,
        width: 0.4,
      }),
  ],
  [
    fp.SOT23,
    (d) =>
      leaded(d, centred(1.3, 2.9), d.height ?? 1.0, {
        level: 0.45,
        width: 0.4,
      }),
  ],
  [
    fp.SOT23_6_MT3608B,
    (d) => leaded(d, centred(1.6, 2.9), 1.1, { level: 0.45, width: 0.4 }),
  ],
  [
    fp.SOT23_6_SRV05,
    (d) => leaded(d, centred(1.6, 2.9), 1.1, { level: 0.45, width: 0.4 }),
  ],
  [
    fp.SOT583,
    (d) => leaded(d, centred(1.2, 2.1), 0.55, { level: 0.2, width: 0.2 }),
  ],
  [
    fp.ESSOP10,
    (d) => leaded(d, centred(4.9, 3.9), 1.5, { level: 0.6, width: 0.42 }),
  ],
  [
    fp.TSSOP20,
    (d) => leaded(d, centred(6.5, 4.4), 1.1, { level: 0.5, width: 0.25 }),
  ],
  [
    fp.SOT89,
    (d) => {
      const body: Box = { x0: -1.6, y0: -2.25, x1: 0.9, y1: 2.25 };
      return [
        mould(body, 0.05, 1.5),
        block(TIN, [-2.1, -0.85, 0], [body.x0 + 0.1, 0.85, 0.4]),
        ...d.pads
          .filter((p) => p.x > 0)
          .map((p) =>
            block(
              TIN,
              [body.x1 - 0.05, p.y - (p.pin === "2" ? 0.27 : 0.22), 0],
              [p.x + p.w / 4, p.y + (p.pin === "2" ? 0.27 : 0.22), 0.4],
            ),
          ),
        ...(d.pin1Mark ? [dot(body, 1.5, d.pin1Mark)] : []),
      ];
    },
  ],
  [fp.USBC_TYPE_C_31_M_12, usbC],
  [fp.PCIE_X1_STRADDLE, pcieSlot],
  [fp.HEADER_2X5_RIGHT_ANGLE, header2x5],
]);

/** Bounding box of the copper of a land pattern on the top side. */
const padBounds = (def: FootprintDef): Box => {
  const boxes = [
    ...def.pads.map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h })),
    ...(def.platedHoles ?? []).map((h) => ({
      x: h.x,
      y: h.y,
      w: h.padW,
      h: h.padH,
    })),
  ];
  return {
    x0: Math.min(...boxes.map((b) => b.x - b.w / 2)),
    y0: Math.min(...boxes.map((b) => b.y - b.h / 2)),
    x1: Math.max(...boxes.map((b) => b.x + b.w / 2)),
    y1: Math.max(...boxes.map((b) => b.y + b.h / 2)),
  };
};

/**
 * No-lead package (QFN, DFN) of size w x h: moulded body on the board with
 * the ends of the leads showing at its sides, and the pin-1 mark.
 */
export const noLead = (
  def: FootprintDef,
  w: number,
  h: number,
  height = 0.9,
): Solid[] => {
  const body = centred(w, h);
  const ends = def.pads.flatMap((p) => {
    const onX =
      Math.abs(p.x) > Math.max(w / 2 - p.w, w / 4) &&
      Math.abs(p.x) >= Math.abs(p.y);
    const onY = Math.abs(p.y) > Math.max(h / 2 - p.h, h / 4) && !onX;
    if (onX) {
      const s = Math.sign(p.x);
      return [
        block(
          TIN,
          [s * (w / 2 - 0.35), p.y - 0.12, 0],
          [s * (w / 2 + 0.01), p.y + 0.12, 0.2],
        ),
      ];
    }
    if (onY) {
      const s = Math.sign(p.y);
      return [
        block(
          TIN,
          [p.x - 0.12, s * (h / 2 - 0.35), 0],
          [p.x + 0.12, s * (h / 2 + 0.01), 0.2],
        ),
      ];
    }
    return [];
  });
  return [
    block(MOULD, [body.x0, body.y0, 0.02], [body.x1, body.y1, height], 0.05),
    ...ends,
    ...(def.pin1Mark ? [dot(body, height, def.pin1Mark)] : []),
  ];
};

/**
 * Quartz crystal in a ceramic SMD package (3225: 3.2 x 2.5): ceramic base,
 * metal lid on top, and the four pads' metal at the corners.
 */
export const crystal = (
  def: FootprintDef,
  w = 3.2,
  h = 2.5,
  height = 0.8,
): Solid[] => [
  block(LED_BASE, [-w / 2, -h / 2, 0], [w / 2, h / 2, height * 0.35]),
  block(
    STEEL,
    [-w / 2 + 0.15, -h / 2 + 0.15, height * 0.35],
    [w / 2 - 0.15, h / 2 - 0.15, height],
    0.05,
  ),
  ...def.pads.map((p) =>
    block(
      GOLD,
      [p.x - p.w / 3, p.y - p.h / 3, 0],
      [p.x + p.w / 3, p.y + p.h / 3, 0.1],
    ),
  ),
];

/** Pads on all four sides around a centre pad: a QFN-like package. */
const looksLikeNoLead = (def: FootprintDef): boolean => {
  if (def.pads.length < 9) return false;
  const b = padBounds(def);
  const sides = new Set(
    def.pads.flatMap((p) => {
      const near = (a: number, c: number) => Math.abs(a - c) < 0.6;
      return [
        near(p.x + p.w / 2, b.x1) ? "r" : "",
        near(p.x - p.w / 2, b.x0) ? "l" : "",
        near(p.y + p.h / 2, b.y1) ? "t" : "",
        near(p.y - p.h / 2, b.y0) ? "b" : "",
      ].filter(Boolean);
    }),
  );
  return (
    sides.size === 4 &&
    def.pads.some((p) => Math.abs(p.x) < 0.3 && Math.abs(p.y) < 0.3)
  );
};

/** Four pads in two rows and two columns, nothing else: a crystal. */
const looksLikeCrystal = (def: FootprintDef): boolean =>
  def.pads.length === 4 &&
  !def.platedHoles?.length &&
  new Set(def.pads.map((p) => Math.sign(p.x))).size === 2 &&
  new Set(def.pads.map((p) => Math.sign(p.y))).size === 2;

/**
 * Model for a land pattern that is not in MODELS: a QFN-like or crystal-like
 * shape when the pads say so, else a plain box of its body (or pads).
 */
const placeholder = (def: FootprintDef): Solid[] => {
  const b = def.body ?? padBounds(def);
  if (looksLikeNoLead(def)) {
    const p = padBounds(def);
    // The pads reach about 0.35 past the body of a QFN.
    return noLead(def, p.x1 - p.x0 - 0.7, p.y1 - p.y0 - 0.7, def.height ?? 0.9);
  }
  if (looksLikeCrystal(def)) {
    const p = padBounds(def);
    // The pads reach about 0.2 past the body of a crystal.
    return crystal(
      def,
      p.x1 - p.x0 - 0.4,
      p.y1 - p.y0 - 0.4,
      def.height ?? 0.8,
    );
  }
  return [block(PLAIN, [b.x0, b.y0, 0], [b.x1, b.y1, def.height ?? 1], 0.1)];
};

/** Whether the land pattern has a drawn model (and not just the placeholder box). */
export const hasModel = (def: FootprintDef): boolean => MODELS.has(def);

/** The solids of a part, in the coordinates of its land pattern. */
export const solidsOf = (def: FootprintDef): Solid[] =>
  (MODELS.get(def) ?? placeholder)(def);

const cache = new Map<FootprintDef, string>();

/** The `cadModel` prop of a part with this land pattern. */
export const cadModelOf = (def: FootprintDef) => {
  let url = cache.get(def);
  if (!url) {
    url = objDataUrl(solidsOf(def));
    cache.set(def, url);
  }
  return {
    objUrl: url,
    // The model is drawn around the land pattern's origin, on the board surface.
    modelOriginPosition: { x: 0, y: 0, z: 0 },
  };
};
