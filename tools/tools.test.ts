import { expect, test } from "bun:test";
import type { Circuit } from "./circuit";
import { assembledParts, bomCsv, cplCsv } from "./fab";
import { EDGE_EXCEPTIONS, FAB } from "../checks/rules";
import { remaining } from "./kicad-drc";

const circuit: Circuit = [
  {
    type: "source_component",
    source_component_id: "sc1",
    ftype: "simple_resistor",
    name: "R2",
    resistance: 10000,
    supplier_part_numbers: { jlcpcb: ["C25804"] },
  },
  {
    type: "source_component",
    source_component_id: "sc2",
    ftype: "simple_resistor",
    name: "R1",
    resistance: 10000,
    supplier_part_numbers: { jlcpcb: ["C25804"] },
  },
  // No LCSC number: a bare footprint that is not assembled.
  {
    type: "source_component",
    source_component_id: "sc3",
    ftype: "simple_resistor",
    name: "R3",
    resistance: 1,
  },
  ...["sc1", "sc2", "sc3"].map((id, i): Circuit[number] => ({
    type: "pcb_component",
    pcb_component_id: `pc${i}`,
    source_component_id: id,
    center: { x: i, y: -i },
    layer: "top",
    rotation: 90,
    width: 1,
    height: 1,
    obstructs_within_bounds: true,
  })),
];

test("only parts with an LCSC number are assembled, sorted by designator", () => {
  expect(assembledParts(circuit).map((p) => p.designator)).toEqual([
    "R1",
    "R2",
  ]);
});

test("BOM groups parts by LCSC number and quotes the designator list", () => {
  expect(bomCsv(assembledParts(circuit))).toBe(
    'Comment,Designator,Footprint,LCSC Part #\nR1,"R1,R2",simple_resistor,C25804\n',
  );
});

test("CPL has one row per part", () => {
  expect(cplCsv(assembledParts(circuit))).toBe(
    "Designator,Mid X,Mid Y,Layer,Rotation\nR1,1.000mm,-1.000mm,Top,90\nR2,0.000mm,0.000mm,Top,90\n",
  );
});

test("KiCad DRC drops only the listed export noise", () => {
  const left = remaining({
    violations: [
      {
        type: "lib_footprint_issues",
        severity: "warning",
        description: "library 'tscircuit' missing",
      },
      {
        type: "hole_clearance",
        severity: "error",
        description: "Hole clearance violation",
      },
      {
        type: "copper_edge_clearance",
        severity: "error",
        description: "Board edge clearance violation",
        items: [
          { description: "Segment on Edge.Cuts" },
          { description: "Pad 21 [<no net>] of J3 on F.Cu" },
        ],
      },
      {
        type: "copper_edge_clearance",
        severity: "error",
        description: "Board edge clearance violation",
        items: [
          { description: "Segment on Edge.Cuts" },
          { description: "Pad 1 [GND] of C3 on F.Cu" },
        ],
      },
    ],
  });
  // The J3 pads are let through by a rule in outboard.kicad_dru, not by an exclusion here.
  expect(left.map((v) => v.type)).toEqual([
    "hole_clearance",
    "copper_edge_clearance",
    "copper_edge_clearance",
  ]);
});

test("the KiCad rules carry the numbers of checks/rules.ts", async () => {
  const dru = await Bun.file(
    new URL("./outboard.kicad_dru", import.meta.url),
  ).text();
  const found = Object.fromEntries(
    [...dru.matchAll(/\(rule "([^"]+)"[\s\S]*?(?=\n\(rule|$)/g)].map((m) => [
      m[1],
      Object.fromEntries(
        [
          ...(m[0] ?? "").matchAll(/\(constraint (\w+) \(min ([\d.]+)mm\)\)/g),
        ].map((c) => [c[1], Number(c[2])]),
      ),
    ]),
  );
  const r = FAB[2];
  expect(found).toEqual({
    "track width": { track_width: r.traceWidth.design },
    via: {
      hole_size: r.viaHole.design,
      via_diameter: r.viaDiameter.design,
      annular_width: r.viaRing.design,
    },
    clearance: { clearance: r.clearance.design },
    "hole to hole": { hole_to_hole: r.holeToHole.design },
    "hole to copper": { hole_clearance: r.holeToCopper.design },
    edge: { edge_clearance: r.edge.design },
    "edge at J3": { edge_clearance: EDGE_EXCEPTIONS.J3 },
  });
});
