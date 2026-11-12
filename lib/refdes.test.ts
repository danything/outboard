// Reference designators on the bottom silkscreen.
import { expect, test } from "bun:test";
import { PLACEMENT } from "./placement";
import { REFDES_HEIGHT, REFDES_STROKE, refdesPlaces } from "./refdes";

const places = refdesPlaces();
const byRef = new Map(PLACEMENT.map((p) => [p.ref, p]));

test("every part has its reference printed once", () => {
  expect(places.map((p) => p.ref).sort()).toEqual(
    PLACEMENT.map((p) => p.ref).sort(),
  );
});

test("text is at least JLCPCB's minimum (1.0 mm high, 0.15 mm stroke)", () => {
  expect(REFDES_HEIGHT).toBeGreaterThanOrEqual(1.0);
  expect(REFDES_STROKE).toBeGreaterThanOrEqual(0.15);
});

test("each label stays close to its part, the jumpers and test points right under it", () => {
  for (const { ref, at } of places) {
    const part = byRef.get(ref);
    if (!part) throw new Error(ref);
    const d = Math.hypot(at.x - part.x, at.y - part.y);
    expect(d).toBeLessThanOrEqual(/^(JP[4-7]|TP)/.test(ref) ? 0.5 : 4);
  }
});
