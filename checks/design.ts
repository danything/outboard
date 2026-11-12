// Checks on the values of the circuit: what the dividers set, what the parts
// are rated for. They guard the intent of the design, so that changing a
// resistor to a neighbouring value fails here rather than on the bench.
// The connections themselves are covered by the netlist comparison with rev D
// (tools/netlist.ts), which is why parts are addressed by reference here.
// docs/design.md has the reasoning behind each number.
import { type Circuit, elementsOf } from "../tools/circuit";
import type { Finding } from "./board";

export interface Values {
  /** Ohms, by reference. */
  r: Record<string, number>;
  /** Farads, by reference. */
  c: Record<string, number>;
  /** Rated volts of each capacitor, by reference. */
  cVolts: Record<string, number>;
}

export const valuesOf = (circuit: Circuit): Values => {
  const values: Values = { r: {}, c: {}, cVolts: {} };
  for (const s of elementsOf(circuit, "source_component")) {
    if (s.ftype === "simple_resistor") values.r[s.name] = s.resistance;
    if (s.ftype === "simple_capacitor") {
      values.c[s.name] = s.capacitance;
      if (s.max_voltage_rating !== undefined)
        values.cVolts[s.name] = s.max_voltage_rating;
    }
  }
  return values;
};

const need = (table: Record<string, number>, ref: string): number => {
  const v = table[ref];
  if (v === undefined) throw new Error(`${ref} is not in the circuit`);
  return v;
};

const within = (value: number, low: number, high: number): boolean =>
  value >= low && value <= high;

/** A check returns nothing when the intent holds, or one sentence per broken rule. */
type DesignCheck = (v: Values) => string | string[] | undefined;

/** Name -> check. A check returns a sentence when the design intent is broken. */
export const DESIGN_CHECKS: Record<string, DesignCheck> = {
  // TPS62933: Vout = 0.8 V x (1 + R6 / R7). PCIe allows +-9 %; the design keeps 3 %.
  buckOutput: (v) => {
    const out = 0.8 * (1 + need(v.r, "R6") / need(v.r, "R7"));
    return within(out, 3.3 * 0.97, 3.3 * 1.03)
      ? undefined
      : `3.3 V rail would be ${out.toFixed(3)} V`;
  },
  // MT3608B: Vout = 0.6 V x (1 + R11 / R12). PCIe allows +-8 %.
  boostOutput: (v) => {
    const out = 0.6 * (1 + need(v.r, "R11") / need(v.r, "R12"));
    return within(out, 12 * 0.92, 12 * 1.08)
      ? undefined
      : `12 V rail would be ${out.toFixed(2)} V`;
  },
  // TPS62933 soft start: t = Css x 0.8 V / 5.5 uA. Slow enough for the PD source, fast enough to finish.
  buckSoftStart: (v) => {
    const ms = ((need(v.c, "C12") * 0.8) / 5.5e-6) * 1e3;
    return within(ms, 1, 50)
      ? undefined
      : `soft start would take ${ms.toFixed(1)} ms`;
  },
  // EN of the buck comes from VBUS1 through R8 / R9. It must be on at 4.0 V
  // (EN threshold at most 1.28 V) and stay below the recommended 5.5 V up to 12 V.
  buckEnable: (v) => {
    const ratio = need(v.r, "R9") / (need(v.r, "R8") + need(v.r, "R9"));
    const onAt = 1.28 / ratio;
    const at12 = 12 * ratio;
    if (onAt > 4.0)
      return `buck would need VBUS1 = ${onAt.toFixed(2)} V to turn on`;
    if (at12 > 5.5)
      return `EN would be ${at12.toFixed(2)} V with VBUS1 at 12 V`;
    return undefined;
  },
  // With the microcontroller pulling EN low through R38, EN must be well under
  // the off threshold (1.1 V minimum) even with 20 V on VBUS1.
  buckEnableOverride: (v) => {
    const low = (20 * need(v.r, "R38")) / (need(v.r, "R8") + need(v.r, "R38"));
    return low < 0.55
      ? undefined
      : `EN held low would still be ${low.toFixed(2)} V`;
  },
  // The buck must not turn on in the first 20 ms after plugging in (EN reaches 1.1 V).
  buckEnableDelay: (v) => {
    const [r8, r9] = [need(v.r, "R8"), need(v.r, "R9")];
    const tau = ((r8 * r9) / (r8 + r9)) * need(v.c, "C15");
    const final = (5 * r9) / (r8 + r9);
    const ms = -tau * Math.log(1 - 1.1 / final) * 1e3;
    return ms >= 20
      ? undefined
      : `EN would reach its threshold after ${ms.toFixed(1)} ms`;
  },
  // CH224A: 6.8 k on CFG1 asks for 9 V.
  pdVoltage: (v) =>
    need(v.r, "R1") === 6800 && need(v.r, "R4") === 6800
      ? undefined
      : "CFG1 resistors do not select 9 V",
  // VBUS bleeders: two 1 k in series, twice in parallel = 1 k. Each must stay
  // within 125 mW even at 21 V (the top of a 20 V PD contract).
  bleeders: (v) => {
    const out: string[] = [];
    for (const [a, b, c, d] of [
      ["R28", "R39", "R29", "R40"],
      ["R30", "R41", "R31", "R42"],
    ] as const) {
      const par = (x: number, y: number) => (x * y) / (x + y);
      const [top, bottom] = [
        par(need(v.r, a), need(v.r, b)),
        par(need(v.r, c), need(v.r, d)),
      ];
      const total = top + bottom;
      if (total > 1000)
        out.push(`bleeder ${a}.. is ${total} ohm, more than 1 k`);
      for (const [ref, share] of [
        [a, top],
        [b, top],
        [c, bottom],
        [d, bottom],
      ] as const) {
        const volts = (21 * share) / total;
        const mw = (volts ** 2 / need(v.r, ref)) * 1e3;
        if (mw > 125)
          out.push(`${ref} would dissipate ${mw.toFixed(0)} mW at 21 V`);
      }
    }
    return out;
  },
  // Q1 (AO3401A, Vgs max +-12 V): on, Vgs = -V x R14 / (R14 + R15). It must be
  // at least 4.5 V at the nominal boost output and at most 12 V even if 20 V
  // passes straight through the boost converter.
  switchGate: (v) => {
    const ratio = need(v.r, "R14") / (need(v.r, "R14") + need(v.r, "R15"));
    const boost = 0.6 * (1 + need(v.r, "R11") / need(v.r, "R12"));
    if (boost * ratio < 4.5)
      return `Q1 would only get ${(boost * ratio).toFixed(1)} V of gate drive`;
    if (20 * ratio > 12)
      return `Q1 gate would see ${(20 * ratio).toFixed(1)} V with 20 V in`;
    return undefined;
  },
  // Plugging in: C32 (drain-gate) and C20 (gate-source) divide the step. The
  // gate must stay under 0.5 V (minimum threshold) for a 9 V source.
  switchGateStep: (v) => {
    const step =
      (8.6 * need(v.c, "C32")) / (need(v.c, "C32") + need(v.c, "C20"));
    return step < 0.5
      ? undefined
      : `plug-in step would put ${step.toFixed(2)} V on Q1's gate`;
  },
  // Over-voltage cut-off: D7 (12 V +-2 %) -> R35 -> base of Q4, R36 base to
  // GND. It trips at Vz + Vbe x (1 + R35 / R36). The Zener alone keeps it from
  // tripping at 9.5 V (the most a 9 V contract gives); the divider must not
  // push the trip point past 15 V.
  overVoltage: (v) => {
    const gain = 1 + need(v.r, "R35") / need(v.r, "R36");
    const highest = 12 * 1.02 + 0.7 * gain;
    if (highest > 15)
      return `over-voltage cut-off might not trip until ${highest.toFixed(1)} V`;
    return undefined;
  },
  // ADC dividers are all 100 k / 33 k; the firmware assumes one ratio.
  senseDividers: (v) => {
    for (const [top, bottom] of [
      ["R23", "R24"],
      ["R25", "R26"],
      ["R32", "R33"],
    ] as const)
      if (need(v.r, top) !== 100e3 || need(v.r, bottom) !== 33e3)
        return `${top}/${bottom} is not 100 k / 33 k`;
    return undefined;
  },
  // Anything that can see a 20 V source needs 25 V capacitors or better.
  capacitorRatings: (v) => {
    const exposed = [
      "C1",
      "C3",
      "C4",
      "C5",
      "C6",
      "C8",
      "C9",
      "C10",
      "C16",
      "C17",
      "C18",
      "C19",
      "C20",
      "C29",
      "C30",
      "C32",
    ];
    const weak = exposed.filter((ref) => need(v.cVolts, ref) < 25);
    return weak.length === 0
      ? undefined
      : `${weak.join(", ")} rated under 25 V on a rail that can see 20 V`;
  },
  // The buck needs 15 uF effective at least; the design has 66 uF nominal on the output.
  buckOutputCapacitance: (v) => {
    const total = ["C13", "C14", "C27", "C28"].reduce(
      (sum, ref) => sum + need(v.c, ref),
      0,
    );
    return total >= 60e-6
      ? undefined
      : `only ${(total * 1e6).toFixed(0)} uF on the 3.3 V output`;
  },
  // CH224A: 1 to 10 uF from each VBUS to GND (USB allows 10 uF at the port).
  vbusCapacitance: (v) => {
    for (const ref of ["C1", "C3"])
      if (!within(need(v.c, ref), 1e-6, 10e-6))
        return `${ref} puts ${(need(v.c, ref) * 1e6).toFixed(1)} uF on VBUS`;
    return undefined;
  },
  // The buck wants 10 uF on its input. Its own capacitors must give 20 uF
  // nominal, as ceramics lose about half under a 9 V bias (an estimate).
  buckInputCapacitance: (v) => {
    const total = ["C8", "C9", "C10"].reduce(
      (sum, ref) => sum + need(v.c, ref),
      0,
    );
    return total >= 20e-6
      ? undefined
      : `only ${(total * 1e6).toFixed(1)} uF at the buck input`;
  },
  // Over-voltage cut-off: fully off below 14 V with a transistor gain of 30,
  // and base current to spare at 15 V. (The low end is set by the Zener alone.)
  overVoltageWindow: (v) => {
    const [rs, rbe] = [need(v.r, "R35"), need(v.r, "R36")];
    const gain = 1 + rs / rbe;
    const collector = 4.5 / need(v.r, "R34");
    const off = 12 * 1.02 + 0.7 * gain + (collector / 30) * rs;
    const base15 = (15 - 12.94) / rs - 0.7 / rbe;
    if (off >= 14)
      return `over-voltage cut-off is only sure at ${off.toFixed(1)} V`;
    if (30 * base15 <= collector)
      return "over-voltage cut-off has too little base current at 15 V";
    // Q1's gate just below the cut-off stays within 80 % of its 12 V rating.
    const vgs =
      (off * need(v.r, "R14")) / (need(v.r, "R14") + need(v.r, "R15"));
    return vgs < 9.6
      ? undefined
      : `Q1 gate would see ${vgs.toFixed(1)} V just below the cut-off`;
  },
  // CC can touch VBUS; the series resistors keep the ADC pin under 4 mA at 15 V across them.
  ccSeries: (v) => {
    for (const ref of ["R21", "R22"])
      if (15 / need(v.r, ref) >= 4e-3)
        return `${ref} would let ${((15 / need(v.r, ref)) * 1e3).toFixed(1)} mA into the ADC pin`;
    return undefined;
  },
  // PERST# rises to 2.0 V no sooner than 100 ms after 3.3 V (PCIe T_PVPERL).
  perstDelay: (v) => {
    const ms =
      -need(v.r, "R27") * need(v.c, "C31") * Math.log(1 - 2.0 / 3.3) * 1e3;
    return ms >= 100
      ? undefined
      : `PERST# would rise after ${ms.toFixed(0)} ms`;
  },
};

/** Every broken rule. A check that needs a part the circuit lacks fails on its own, not the whole run. */
export const runDesignChecks = (values: Values): Finding[] =>
  Object.entries(DESIGN_CHECKS).flatMap(([check, run]) => {
    let result: string | string[] | undefined;
    try {
      result = run(values);
    } catch (e) {
      result = e instanceof Error ? e.message : String(e);
    }
    const messages = result === undefined ? [] : [result].flat();
    return messages.map((message) => ({ check, message }));
  });
