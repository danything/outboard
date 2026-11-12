// The numbers that were read from datasheets, pinned down so that an edit to
// a land pattern has to change a test on purpose. docs/footprints.md has the
// sources.
import { expect, test } from "bun:test";
import * as all from "./footprints";
import type { Box, FootprintDef, Pad } from "./footprints";

const defs = Object.entries(all).filter(
  (entry): entry is [string, FootprintDef] =>
    typeof entry[1] === "object" && "courtyard" in entry[1],
);

const pad = (def: FootprintDef, pin: string): Pad => {
  const found = def.pads.find((p) => p.pin === pin);
  if (!found) throw new Error(`no pad ${pin}`);
  return found;
};

const padBox = (p: Pad): Box => ({
  x0: p.x - p.w / 2,
  y0: p.y - p.h / 2,
  x1: p.x + p.w / 2,
  y1: p.y + p.h / 2,
});

const copper = (
  def: FootprintDef,
): { pin: string; layer: string; box: Box }[] => [
  ...def.pads.map((p) => ({
    pin: p.pin,
    layer: p.layer ?? "top",
    box: padBox(p),
  })),
  ...(def.platedHoles ?? []).map((h) => ({
    pin: h.pin,
    layer: "both",
    box: {
      x0: h.x - h.padW / 2,
      y0: h.y - h.padH / 2,
      x1: h.x + h.padW / 2,
      y1: h.y + h.padH / 2,
    },
  })),
];

/** Gap between two boxes; negative when they overlap. */
const gap = (a: Box, b: Box): number =>
  Math.max(a.x0 - b.x1, b.x0 - a.x1, a.y0 - b.y1, b.y0 - a.y1);

test.each(defs)(
  "%s: pads of different pins are at least 0.15 mm apart",
  (_name, def) => {
    const items = copper(def);
    for (const a of items)
      for (const b of items) {
        if (a.pin === b.pin) continue;
        if (a.layer !== b.layer && a.layer !== "both" && b.layer !== "both")
          continue;
        expect(gap(a.box, b.box)).toBeGreaterThanOrEqual(0.15 - 1e-9);
      }
  },
);

test.each(defs)(
  "%s: copper and holes are inside the courtyard",
  (_name, def) => {
    const c = def.courtyard;
    const boxes = [
      ...copper(def).map((i) => i.box),
      ...(def.holes ?? []).map((h) => ({
        x0: h.x - h.diameter / 2,
        y0: h.y - h.diameter / 2,
        x1: h.x + h.diameter / 2,
        y1: h.y + h.diameter / 2,
      })),
    ];
    for (const b of boxes) {
      expect(b.x0).toBeGreaterThanOrEqual(c.x0);
      expect(b.y0).toBeGreaterThanOrEqual(c.y0);
      expect(b.x1).toBeLessThanOrEqual(c.x1);
      expect(b.y1).toBeLessThanOrEqual(c.y1);
    }
  },
);

test.each(defs)(
  "%s: plated holes leave an annular ring of 0.2 mm or more",
  (_name, def) => {
    for (const h of def.platedHoles ?? []) {
      expect((h.padW - h.holeW) / 2).toBeGreaterThanOrEqual(0.2 - 1e-9);
      expect((h.padH - h.holeH) / 2).toBeGreaterThanOrEqual(0.2 - 1e-9);
    }
  },
);

test("SOT-583 follows TI's land: columns 1.48 apart, 0.67 x 0.30 pads at 0.5 pitch", () => {
  const def = all.SOT583;
  expect(pad(def, "1").x - pad(def, "8").x).toBeCloseTo(1.48);
  expect(pad(def, "2").y - pad(def, "1").y).toBeCloseTo(0.5);
  expect(pad(def, "1")).toMatchObject({ w: 0.67, h: 0.3 });
  // Pin 1 and pin 8 face each other; 4 and 5 face each other.
  expect(pad(def, "1").y).toBeCloseTo(pad(def, "8").y);
  expect(pad(def, "4").y).toBeCloseTo(pad(def, "5").y);
});

test("SOT-23-6 lands follow each manufacturer", () => {
  expect(
    pad(all.SOT23_6_MT3608B, "1").x - pad(all.SOT23_6_MT3608B, "6").x,
  ).toBeCloseTo(2.6);
  expect(pad(all.SOT23_6_MT3608B, "1")).toMatchObject({ w: 1.2, h: 0.6 });
  expect(
    pad(all.SOT23_6_SRV05, "1").x - pad(all.SOT23_6_SRV05, "6").x,
  ).toBeCloseTo(2.4);
  expect(pad(all.SOT23_6_SRV05, "1")).toMatchObject({ w: 1.0, h: 0.7 });
});

test("ESSOP-10 and TSSOP-20 rows", () => {
  expect(pad(all.ESSOP10, "10").y - pad(all.ESSOP10, "1").y).toBeCloseTo(6.0);
  expect(pad(all.ESSOP10, "1").x).toBeCloseTo(pad(all.ESSOP10, "10").x);
  expect(pad(all.ESSOP10, "2").x - pad(all.ESSOP10, "1").x).toBeCloseTo(1.0);
  expect(pad(all.TSSOP20, "20").y - pad(all.TSSOP20, "1").y).toBeCloseTo(5.74);
  expect(pad(all.TSSOP20, "1").x).toBeCloseTo(pad(all.TSSOP20, "20").x);
  expect(pad(all.TSSOP20, "2").x - pad(all.TSSOP20, "1").x).toBeCloseTo(0.65);
});

test("FXL0630 land: 8.4 over all, 3.7 gap, 3.5 wide", () => {
  const [a, b] = [
    padBox(pad(all.IND_FXL0630, "1")),
    padBox(pad(all.IND_FXL0630, "2")),
  ];
  expect(b.x1 - a.x0).toBeCloseTo(8.4);
  expect(b.x0 - a.x1).toBeCloseTo(3.7);
  expect(a.y1 - a.y0).toBeCloseTo(3.5);
});

test("SMA, PTC and AO3401A lands follow the manufacturers", () => {
  for (const def of [all.SMA_SS54, all.SMA_SS34]) {
    expect(Math.abs(pad(def, "1").x - pad(def, "2").x)).toBeCloseTo(3.93);
    expect(pad(def, "1")).toMatchObject({ w: 1.52, h: 1.68 });
  }
  // The two SMA parts have pin 1 on opposite ends (anode on SS54, cathode on SS34).
  expect(pad(all.SMA_SS54, "1").x).toBeGreaterThan(0);
  expect(pad(all.SMA_SS34, "1").x).toBeLessThan(0);
  const [a, b] = [padBox(pad(all.F1206, "1")), padBox(pad(all.F1206, "2"))];
  expect(b.x0 - a.x1).toBeCloseTo(1.8);
  expect(pad(all.F1206, "1")).toMatchObject({ w: 1.0, h: 1.8 });
  expect(
    pad(all.SOT23_AO3401A, "1").x - pad(all.SOT23_AO3401A, "3").x,
  ).toBeCloseTo(2.4);
});

test("J3: side B on top, side A directly below, key between contacts 11 and 12", () => {
  const def = all.PCIE_X1_STRADDLE;
  expect(def.pads).toHaveLength(36);
  for (let n = 1; n <= 18; n++) {
    const [b, a] = [pad(def, `B${n}`), pad(def, `A${n}`)];
    expect(b.layer).toBe("top");
    expect(a.layer).toBe("bottom");
    expect(a.x).toBeCloseTo(b.x);
    expect(b).toMatchObject({ w: 0.7, h: 3.6 });
  }
  expect(pad(def, "B2").x - pad(def, "B1").x).toBeCloseTo(1.0);
  expect(pad(def, "B12").x - pad(def, "B11").x).toBeCloseTo(3.0);
  // The key notch (1.9 wide) is centred between contacts 11 and 12.
  const keyCentre = (pad(def, "B11").x + pad(def, "B12").x) / 2;
  expect(padBox(pad(def, "B12")).x0 - (keyCentre + 0.95)).toBeCloseTo(0.2);
});

test("USB-C: A and B contacts mirror each other about the centre", () => {
  const def = all.USBC_TYPE_C_31_M_12;
  for (const [left, right] of [
    ["A1B12", "B1A12"],
    ["A4B9", "B4A9"],
    ["B8", "B5"],
    ["A5", "A8"],
    ["B7", "B6"],
    ["A6", "A7"],
  ] as const)
    expect(pad(def, left).x).toBeCloseTo(-pad(def, right).x);
});
