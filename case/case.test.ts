// The case against what it holds: nothing inside (board, parts, card, plugs,
// F connectors) runs into a printed part, the printed parts do not run into
// each other, the bosses are under the board's and the card's holes at the
// right height, and the terminal wall fits the ports. Contents are checked
// as boxes (each solid of a part's 3D model, lib/cad.ts) and cylinders
// against the real solids.
import { beforeAll, describe, expect, test } from "bun:test";
import { makeBox } from "replicad";
import type { Shape3D } from "replicad";
import {
  BRACKET_FACE_X,
  BRACKET_THICKNESS,
  MOUNTING_HOLE_POSITIONS,
  USBC_PLUG_WIDTH,
} from "../lib/geometry";
import { BCAS, CARD } from "./card";
import {
  BCAS_Y,
  CARD_SCREWS,
  type CaseLayout,
  type CaseOptions,
  type Content,
  DEFAULT_OPTIONS,
  F_AXIS_Z,
  F_CONNECTORS,
  M3,
  TERMINAL_WALL,
  USB_OPENING_PLAY,
  USB_PORTS,
  type V3,
  bounds,
  box,
  contents,
  layout,
  overlaps,
} from "./layout";
import { bodySolid, initCad, sharedVolume, solidOf } from "./model";

const TOUCH = 0.01; // mm^3: faces that only touch leave nothing

interface Built {
  plan: CaseLayout;
  parts: { name: string; shape: Shape3D; adds: { min: V3; max: V3 }[] }[];
}

const build = (options: CaseOptions): Built => {
  const plan = layout(options);
  return {
    plan,
    parts: [plan.tray, plan.lid, plan.hatchBody].map((b) => ({
      name: b.name,
      shape: bodySolid(b),
      adds: b.add.map(bounds),
    })),
  };
};

const VARIANTS: CaseOptions[] = [
  DEFAULT_OPTIONS,
  { ...DEFAULT_OPTIONS, latch: "snap", fastener: "nut" },
  { ...DEFAULT_OPTIONS, wall: 1.5 },
];
const built = new Map<CaseOptions, Built>();
const get = (o: CaseOptions): Built => {
  const b = built.get(o);
  if (!b) throw new Error("not built");
  return b;
};

beforeAll(async () => {
  await initCad();
  for (const o of VARIANTS) built.set(o, build(o));
});

/** Contents that share volume with a printed part; only boxes near what a part adds are tried. */
const collisions = (parts: Built["parts"], items: Content[]) => {
  const hits: string[] = [];
  let checked = 0;
  for (const c of items)
    for (const p of c.prims) {
      const b = bounds(p);
      for (const part of parts) {
        if (!part.adds.some((a) => overlaps(a, b))) continue;
        checked++;
        const v = sharedVolume(part.shape, solidOf(p));
        if (v > TOUCH)
          hits.push(`${c.name} / ${part.name}: ${v.toFixed(3)} mm3`);
      }
    }
  return { hits, checked };
};

const HALF = 0.8;
const probe = (shape: Shape3D, [x, y, z]: V3): boolean => {
  const d = 0.02;
  const cube = makeBox([x - d, y - d, z - d], [x + d, y + d, z + d]);
  return sharedVolume(shape, cube) > (2 * d) ** 3 / 2;
};

for (const options of VARIANTS) {
  const label = `${options.latch}, ${options.fastener}, wall ${options.wall}`;
  describe(label, () => {
    test("nothing inside runs into the case", () => {
      const { parts } = get(options);
      const { hits, checked } = collisions(parts, contents());
      expect(hits).toEqual([]);
      // The plugs, the F threads and the parts by the walls were looked at.
      expect(checked).toBeGreaterThan(10);
    });

    test("the check sees a part that runs into the floor or a wall", () => {
      const { plan, parts } = get(options);
      const { min, max } = plan.outer;
      const misplaced: Content[] = [
        {
          name: "into the floor",
          prims: [box([10, 10, min[2] + 1], [12, 12, 0])],
        },
        {
          name: "into the far wall",
          prims: [box([max[0] - 3, 10, 0], [max[0] + 1, 12, 1])],
        },
      ];
      expect(collisions(parts, misplaced).hits).toHaveLength(2);
    });

    test("the printed parts do not run into each other", () => {
      const [tray, lid, hatch] = get(options).parts as [
        Built["parts"][number],
        Built["parts"][number],
        Built["parts"][number],
      ];
      expect(sharedVolume(tray.shape, lid.shape)).toBeLessThan(TOUCH);
      expect(sharedVolume(tray.shape, hatch.shape)).toBeLessThan(TOUCH);
      expect(sharedVolume(lid.shape, hatch.shape)).toBeLessThan(TOUCH);
    });

    test("a boss under every hole of the board and the card, up to the board's underside", () => {
      const { plan, parts } = get(options);
      const tray = parts[0]?.shape as Shape3D;
      // The holes come from lib/geometry.ts (the board) and case/card.ts (the card).
      expect(plan.standoffs.map((s) => ({ x: s.x, y: s.y }))).toEqual([
        ...MOUNTING_HOLE_POSITIONS,
        ...CARD_SCREWS,
      ]);
      for (const s of plan.standoffs) {
        const hole =
          (options.fastener === "insert" ? M3.insertHole : M3.clearance) / 2;
        // At least 1 mm of wall around the thread.
        expect(s.r - hole, s.name).toBeGreaterThanOrEqual(1);
        const ring = (hole + s.r) / 2;
        expect(
          probe(tray, [s.x + ring, s.y, -HALF - 0.05]),
          `${s.name} boss`,
        ).toBe(true);
        expect(
          probe(tray, [s.x + ring, s.y, -HALF + 0.05]),
          `${s.name} top`,
        ).toBe(false);
        expect(probe(tray, [s.x, s.y, -HALF - 1]), `${s.name} hole`).toBe(
          false,
        );
      }
    });
  });
}

describe("terminal wall", () => {
  test("the USB-C mouths are flush with the wall's inside face, the plugs pass", () => {
    const { parts } = get(DEFAULT_OPTIONS);
    const [tray, lid] = parts.map((p) => p.shape) as [Shape3D, Shape3D];
    for (const u of USB_PORTS) {
      // Beside the opening on the card's side (the other side of J2 is the long wall).
      const beside = u.y - USBC_PLUG_WIDTH / 2 - USB_OPENING_PLAY - 1;
      expect(probe(tray, [BRACKET_FACE_X - 0.05, beside, u.z])).toBe(true);
      expect(probe(tray, [BRACKET_FACE_X + 0.05, beside, u.z])).toBe(false);
      for (const z of [u.z - 3, u.z, u.z + 3]) {
        const at: V3 = [BRACKET_FACE_X - TERMINAL_WALL / 2, u.y, z];
        expect(probe(tray, at) || probe(lid, at), `${u.name} at z ${z}`).toBe(
          false,
        );
      }
    }
  });

  test("F connectors: 3 mm or more of wall, room on the thread for the nut, the nut within the case's height", () => {
    const { plan } = get(DEFAULT_OPTIONS);
    expect(TERMINAL_WALL).toBeGreaterThanOrEqual(3);
    // The shoulder bore on the bracket's inside face; it bears on the boss now.
    expect(CARD.fThreadOut - TERMINAL_WALL).toBeGreaterThanOrEqual(
      CARD.fNutThickness,
    );
    const corners = CARD.fNutFlats / Math.sqrt(3);
    expect(F_AXIS_Z - corners).toBeGreaterThanOrEqual(plan.outer.min[2]);
    expect(F_AXIS_Z + corners).toBeLessThanOrEqual(plan.outer.max[2]);
    expect(F_CONNECTORS).toHaveLength(2);
    expect(BRACKET_THICKNESS).toBeGreaterThan(0);
  });
});

test("the hatch lets the B-CAS card out", () => {
  const { plan } = get(DEFAULT_OPTIONS);
  const outer = BRACKET_FACE_X + CARD.bcasOuterEnd;
  // Room for a finger beside the card's outer end, and the reader's mouth in view.
  expect(plan.hatch.x0).toBeLessThan(outer - 10);
  expect(plan.hatch.x1).toBeGreaterThan(BRACKET_FACE_X + CARD.readerFrom);
  expect(plan.hatch.y0).toBeLessThan(BCAS_Y - BCAS.width / 2);
  expect(plan.hatch.y1).toBeGreaterThan(BCAS_Y + BCAS.width / 2);
});

test("docs/mechanical.md lists every estimate of case/card.ts", async () => {
  const doc = await Bun.file(
    new URL("../docs/mechanical.md", import.meta.url),
  ).text();
  const rows = doc.split("\n").filter((l) => l.startsWith("| `"));
  for (const [key, value] of Object.entries(CARD)) {
    const row = rows.find((l) => l.startsWith(`| \`${key}\``));
    const shown = Array.isArray(value) ? value.join(", ") : String(value);
    expect(row, key).toContain(`| ${shown} `);
  }
});
