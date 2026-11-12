import { expect, test } from "bun:test";
import * as fp from "../footprints";
import { at } from "../geometry";
import {
  BLOCKS,
  type BlockName,
  type BlockSpec,
  PLACEMENT,
  positionOf,
} from "../placement";
import { blockFrame, center, pad } from "./kit";

test("blockFrame puts every part where lib/placement.ts puts it", () => {
  for (const name of Object.keys(BLOCKS) as BlockName[]) {
    const spec: BlockSpec = BLOCKS[name];
    const frame = blockFrame(name);
    for (const [ref, part] of Object.entries(spec.parts)) {
      const p = frame(part.x, part.y);
      const c = center(ref);
      expect(Math.hypot(p.x - c.x, p.y - c.y)).toBeLessThan(2e-3);
    }
  }
});

test("pad gives the pad centre in design coordinates", () => {
  // J3 is not rotated: design y grows away from the card, footprint y grows up.
  const j3 = PLACEMENT.find((p) => p.ref === "J3");
  const b1 = fp.PCIE_X1_STRADDLE.pads.find((p) => p.pin === "B1");
  if (!j3 || !b1) throw new Error("J3.B1 is missing");
  expect(pad("J3", "B1")).toEqual({ x: j3.x + b1.x, y: j3.y - b1.y });
  // The same through tscircuit's coordinates.
  const origin = positionOf("J3");
  const viaTscircuit = at(pad("J3", "B1").x, pad("J3", "B1").y);
  expect(viaTscircuit.x - origin.pcbX).toBeCloseTo(b1.x, 6);
  expect(viaTscircuit.y - origin.pcbY).toBeCloseTo(b1.y, 6);
});

test("pad follows the rotation of the part", () => {
  for (const part of PLACEMENT) {
    const def: fp.FootprintDef = fp[part.footprint];
    const seen = new Map<string, number>();
    for (const p of def.pads) {
      const nth = seen.get(p.pin) ?? 0;
      seen.set(p.pin, nth + 1);
      const q = pad(part.ref, p.pin, nth);
      // Rotation keeps the distance from the part centre.
      expect(Math.hypot(q.x - part.x, q.y - part.y)).toBeCloseTo(
        Math.hypot(p.x, p.y),
        3,
      );
    }
  }
  // U3 is turned 270 degrees: pad 1 (west side of the footprint) ends up south-west.
  const u3 = center("U3");
  const p1 = pad("U3", 1);
  expect(p1.x).toBeLessThan(u3.x);
  expect(p1.y).toBeGreaterThan(u3.y);
});

test("an unknown part or pad is an error", () => {
  expect(() => pad("U99", 1)).toThrow();
  expect(() => pad("U3", 9)).toThrow();
});
