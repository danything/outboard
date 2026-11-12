// The netlist comparison has to notice every kind of difference.
import { expect, test } from "bun:test";
import {
  type Netlist,
  REV_D_ADDED_PARTS,
  REV_D_CHANGES,
  applyChanges,
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

test("the reference (rev D and the changes) has the expected size", async () => {
  const fixture = await loadFixture();
  // 115 parts in KiCad, 4 of them mounting holes; the 2x5 header J4 gone,
  // the hub and its parts, two sockets (J4 again, J6) and the fuse F2 added.
  expect(Object.keys(fixture.components)).toHaveLength(111 - 1 + 11);
  // 56 nets of rev D and 8 new ones; 42 open pads, less the 4 of the
  // header, plus 6 of the hub and the 4 fitting nails of the sockets.
  expect(fixture.nets.filter((n) => n.length > 1)).toHaveLength(56 + 8);
  expect(fixture.nets.filter((n) => n.length === 1)).toHaveLength(
    42 - 4 + 6 + 4,
  );
});

const small = {
  components: {},
  nets: { A: ["R1.1", "U1.1"], B: ["R2.1", "U1.2"], C: ["U1.3"] },
};

test("a change moves one pad from a net to another", () => {
  const changed = applyChanges(small, [
    { pad: "U1.1", from: "A", to: "B" },
    { pad: "U1.2", from: "B", to: "A" },
  ]);
  expect(changed.nets.A).toEqual(["R1.1", "U1.2"]);
  expect(changed.nets.B).toEqual(["R2.1", "U1.1"]);
  expect(small.nets.A).toEqual(["R1.1", "U1.1"]);
});

test("a change that does not fit the reference is an error", () => {
  expect(() =>
    applyChanges(small, [{ pad: "U1.1", from: "B", to: "A" }]),
  ).toThrow();
  expect(() =>
    applyChanges(small, [{ pad: "U1.1", from: "A", to: "X" }]),
  ).toThrow();
  expect(() =>
    applyChanges(small, [{ pad: "U1.3", from: "C", to: "A" }]),
  ).toThrow();
});

test("the pins of U7 only swap between existing nets", () => {
  const u7 = REV_D_CHANGES.filter((c) => c.pad.startsWith("U7."));
  expect(u7).toHaveLength(7);
  const count = (key: "from" | "to") => u7.map((c) => c[key]).sort();
  expect(count("from")).toEqual(count("to"));
});

test("new pads belong to added parts, and every pad of an added part is listed", () => {
  for (const c of REV_D_CHANGES.filter((c) => c.from === null))
    expect(REV_D_ADDED_PARTS[c.pad.split(".")[0] ?? ""]).toBeDefined();
  const listed = new Set(REV_D_CHANGES.map((c) => c.pad.split(".")[0]));
  for (const ref of Object.keys(REV_D_ADDED_PARTS))
    expect(listed.has(ref)).toBe(true);
});

test("an added part and a new net extend the reference", () => {
  const changed = applyChanges(
    small,
    [
      { pad: "R1.1", from: "A", to: "N" },
      { pad: "R9.1", from: null, to: "N" },
      { pad: "R9.2", from: null, to: null },
    ],
    { R9: { value: "1k", footprint: "R0603", lcsc: "C21190", mpn: "x" } },
    ["N"],
  );
  expect(changed.nets.N).toEqual(["R1.1", "R9.1"]);
  expect(changed.nets["unconnected:R9.2"]).toEqual(["R9.2"]);
  expect(changed.components.R9).toBeDefined();
  // A new pad of a part that was not added, and a net that nobody declared.
  expect(() =>
    applyChanges(small, [{ pad: "R9.1", from: null, to: "A" }]),
  ).toThrow();
  expect(() =>
    applyChanges(small, [{ pad: "U1.1", from: "A", to: "N" }]),
  ).toThrow();
});

test("a removed part takes its pads, and the nets that were only its own", () => {
  const fixture = {
    components: {
      J9: { value: "", footprint: "", lcsc: "C1", mpn: "X" },
      R1: { value: "", footprint: "", lcsc: "C2", mpn: "Y" },
    },
    nets: { A: ["J9.1", "R1.1"], B: ["J9.2"], C: ["R1.2"] },
  };
  const changed = applyChanges(fixture, [], {}, [], ["J9"]);
  expect(Object.keys(changed.components)).toEqual(["R1"]);
  expect(changed.nets).toEqual({ A: ["R1.1"], C: ["R1.2"] });
  expect(() => applyChanges(fixture, [], {}, [], ["J8"])).toThrow();
});
