// Every design check has to fail when its rule is broken. Each case below
// changes one value of the real design to a plausible wrong one.
import { expect, test } from "bun:test";
import { DESIGN_CHECKS, type Values, runDesignChecks } from "./design";

const k = 1e3;
const nF = 1e-9;
const uF = 1e-6;

/** The values of rev D. */
const design = (): Values => ({
  r: {
    R21: 100 * k,
    R22: 100 * k,
    R27: 15 * k,
    R34: 10 * k,
    R1: 6.8 * k,
    R4: 6.8 * k,
    R6: 47 * k,
    R7: 15 * k,
    R8: 100 * k,
    R9: 68 * k,
    R11: 100 * k,
    R12: 5.1 * k,
    R14: 100 * k,
    R15: 150 * k,
    R23: 100 * k,
    R24: 33 * k,
    R25: 100 * k,
    R26: 33 * k,
    R28: 1 * k,
    R29: 1 * k,
    R30: 1 * k,
    R31: 1 * k,
    R32: 100 * k,
    R33: 33 * k,
    R35: 10 * k,
    R36: 10 * k,
    R38: 1 * k,
    R39: 1 * k,
    R40: 1 * k,
    R41: 1 * k,
    R42: 1 * k,
  },
  c: {
    C37: 1 * uF,
    C1: 1 * uF,
    C3: 1 * uF,
    C4: 22 * uF,
    C5: 22 * uF,
    C6: 10 * uF,
    C8: 10 * uF,
    C9: 10 * uF,
    C10: 100 * nF,
    C16: 22 * uF,
    C17: 100 * nF,
    C31: 10 * uF,
    C12: 100 * nF,
    C13: 22 * uF,
    C14: 22 * uF,
    C15: 1 * uF,
    C20: 1 * uF,
    C27: 22 * uF,
    C28: 100 * nF,
    C32: 33 * nF,
  },
  cVolts: {
    C1: 50,
    C3: 50,
    C4: 25,
    C5: 25,
    C6: 25,
    C8: 25,
    C9: 25,
    C10: 50,
    C16: 25,
    C17: 50,
    C18: 25,
    C19: 25,
    C20: 50,
    C29: 25,
    C30: 50,
    C32: 50,
    C37: 50,
  },
});

test("the rev D values pass every check", () => {
  expect(runDesignChecks(design())).toEqual([]);
});

const broken: [
  check: keyof typeof DESIGN_CHECKS,
  table: keyof Values,
  ref: string,
  value: number,
][] = [
  ["buckOutput", "r", "R7", 10 * k],
  ["boostOutput", "r", "R12", 4.3 * k],
  ["buckSoftStart", "c", "C12", 1 * nF],
  ["buckEnable", "r", "R9", 33 * k],
  ["buckEnable", "r", "R9", 150 * k],
  ["buckEnableOverride", "r", "R38", 10 * k],
  ["buckEnableDelay", "c", "C15", 100 * nF],
  ["pdVoltage", "r", "R4", 24 * k],
  ["bleeders", "r", "R28", 100],
  ["bleeders", "r", "R29", 10 * k],
  ["switchGate", "r", "R15", 1000 * k],
  ["switchGate", "r", "R15", 10 * k],
  ["switchGateStep", "c", "C20", 100 * nF],
  ["overVoltage", "r", "R36", 1 * k],
  ["senseDividers", "r", "R33", 47 * k],
  ["capacitorRatings", "cVolts", "C29", 16],
  ["buckOutputCapacitance", "c", "C27", 10 * uF],
  ["vbusCapacitance", "c", "C3", 22 * uF],
  ["vbusCapacitance", "c", "C37", 10 * uF],
  ["capacitorRatings", "cVolts", "C37", 16],
  ["buckInputCapacitance", "c", "C8", 4.7 * uF],
  ["overVoltageWindow", "r", "R34", 100],
  ["overVoltageWindow", "r", "R35", 33 * k],
  ["overVoltageWindow", "r", "R15", 10 * k],
  ["ccSeries", "r", "R22", 1 * k],
  ["perstDelay", "c", "C31", 1 * uF],
];

test.each(broken)("%s fails with %s.%s = %d", (check, table, ref, value) => {
  const values = design();
  values[table][ref] = value;
  expect(runDesignChecks(values).map((f) => f.check)).toContain(check);
});

test("every check has a case that breaks it", () => {
  expect(new Set(broken.map(([check]) => check))).toEqual(
    new Set(Object.keys(DESIGN_CHECKS)),
  );
});

test("bleeders reports both ports, not only the first", () => {
  const values = design();
  values.r.R28 = 100;
  values.r.R30 = 100;
  const found = runDesignChecks(values).filter((f) => f.check === "bleeders");
  // A low top resistor overloads the bottom pair of its port.
  const text = found.map((f) => f.message).join(" ");
  expect(text).toContain("R29");
  expect(text).toContain("R31");
});

test("a missing part fails its own checks and leaves the others running", () => {
  const values = design();
  delete values.r.R7;
  const found = runDesignChecks(values);
  expect(found.map((f) => f.check)).toEqual(["buckOutput"]);
  expect(found[0]?.message).toContain("R7");
});
