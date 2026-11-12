// The netlist comparison has to notice every kind of difference.
import { expect, test } from "bun:test";
import {
  type Netlist,
  compareNetlists,
  fixtureNetlist,
  loadFixture,
} from "./netlist";

const reference: Netlist = {
  components: {
    R1: { lcsc: "C25804", mpn: "0603WAF1002T5E" },
    R2: { lcsc: "C25804", mpn: "0603WAF1002T5E" },
    TP1: { lcsc: "", mpn: "" },
  },
  nets: [["R1.1", "TP1.1"], ["R1.2", "R2.1"], ["R2.2"]],
};

const copy = (): Netlist => structuredClone(reference);

test("identical netlists have no differences", () => {
  expect(compareNetlists(reference, copy())).toEqual([]);
});

test("net order and pad order do not matter (after normalising)", () => {
  const other = fixtureNetlist({
    components: {
      R1: {
        value: "10k",
        footprint: "R0603",
        lcsc: "C25804",
        mpn: "0603WAF1002T5E",
      },
      R2: {
        value: "10k",
        footprint: "R0603",
        lcsc: "C25804",
        mpn: "0603WAF1002T5E",
      },
      TP1: { value: "TP", footprint: "TP", lcsc: "", mpn: "" },
      H1: { value: "M3", footprint: "HOLE", lcsc: "", mpn: "" },
    },
    nets: { b: ["R2.2"], a: ["R2.1", "R1.2"], named: ["TP1.1", "R1.1"] },
  });
  expect(compareNetlists(reference, other)).toEqual([]);
});

test("a pad moved to another net is reported", () => {
  const other = copy();
  other.nets = [["R1.1", "TP1.1"], ["R1.2"], ["R2.1", "R2.2"]];
  expect(compareNetlists(reference, other).length).toBeGreaterThan(0);
});

test("two nets shorted together are reported", () => {
  const other = copy();
  other.nets = [["R1.1", "R1.2", "R2.1", "TP1.1"], ["R2.2"]];
  expect(compareNetlists(reference, other).length).toBeGreaterThan(0);
});

test("an unconnected pad that got connected is reported", () => {
  const other = copy();
  other.nets = [
    ["R1.1", "R2.2", "TP1.1"],
    ["R1.2", "R2.1"],
  ];
  expect(compareNetlists(reference, other).length).toBeGreaterThan(0);
});

test("missing and extra parts and pads are reported", () => {
  const missing = copy();
  delete missing.components.R2;
  missing.nets = [["R1.1", "TP1.1"], ["R1.2"]];
  expect(compareNetlists(reference, missing)).toContain("R2 is missing");
  expect(compareNetlists(reference, missing)).toContain("pad R2.1 is missing");
  expect(compareNetlists(missing, reference)).toContain(
    "R2 is not in the reference",
  );
  expect(compareNetlists(missing, reference)).toContain(
    "pad R2.2 is not in the reference",
  );
});

test("a different part number is reported", () => {
  const other = copy();
  other.components.R1 = { lcsc: "C25803", mpn: "0603WAF1003T5E" };
  expect(compareNetlists(reference, other)).toHaveLength(1);
});

test("the rev D fixture has the expected size", async () => {
  const fixture = await loadFixture();
  // 115 parts in KiCad, 4 of them mounting holes.
  expect(Object.keys(fixture.components)).toHaveLength(111);
  // 56 nets and 42 pads left open.
  expect(fixture.nets.filter((n) => n.length > 1)).toHaveLength(56);
  expect(fixture.nets.filter((n) => n.length === 1)).toHaveLength(42);
});
