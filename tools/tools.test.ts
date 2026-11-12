import { expect, test } from "bun:test";
import type { Circuit } from "./circuit";
import { assembledParts, bomCsv, cplCsv } from "./fab";
import { EDGE_EXCEPTIONS, FAB } from "../checks/rules";
import { SOT89 } from "../lib/footprints";
import { remaining } from "./kicad-drc";
import { filterZip, zipEntries } from "./zip";
import { addNetTies } from "./kicad-nettie";
import { originOf } from "./origin";

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
  // 0603 resistor pads, turned 90 degrees with the part: pad 1 below the origin.
  ...[0, 1, 2].flatMap((i) =>
    [-0.75, 0.75].map((dy, pad): Circuit[number] => ({
      type: "pcb_smtpad",
      pcb_smtpad_id: `pad${i}_${pad}`,
      pcb_component_id: `pc${i}`,
      shape: "rect",
      x: i,
      y: -i + dy,
      width: 0.864,
      height: 0.806,
      layer: "top",
      port_hints: [String(pad + 1)],
    })),
  ),
];

test("only parts with an LCSC number are assembled, sorted by designator", () => {
  expect(assembledParts(circuit).map((p) => p.designator)).toEqual([
    "R1",
    "R2",
  ]);
});

test("BOM groups parts by LCSC number and quotes the designator list", () => {
  expect(bomCsv(assembledParts(circuit))).toBe(
    'Comment,Designator,Footprint,LCSC Part #\nR1,"R1,R2",R0603,C25804\n',
  );
});

test("CPL has one row per part", () => {
  expect(cplCsv(assembledParts(circuit))).toBe(
    "Designator,Mid X,Mid Y,Layer,Rotation\nR1,1.000mm,-1.000mm,Top,90\nR2,0.000mm,0.000mm,Top,90\n",
  );
});

test("a part whose pads match no land pattern is an error", () => {
  const moved = circuit.map((e) =>
    e.type === "pcb_smtpad" &&
    e.shape === "rect" &&
    e.pcb_smtpad_id === "pad0_1"
      ? { ...e, y: e.y + 0.1 }
      : e,
  );
  expect(() => assembledParts(moved)).toThrow("R2");
});

test("the placement list gives the footprint origin, not the pad centre", () => {
  // SOT-89: the tab makes the pad bounding box lopsided by 0.4 mm.
  const def = SOT89;
  const pads = def.pads.map((p) => ({
    name: p.pin,
    x: 10 + p.x,
    y: 5 + p.y,
    layer: "top" as const,
    w: p.w,
    h: p.h,
  }));
  const xs = pads.flatMap((p) => [p.x - p.w / 2, p.x + p.w / 2]);
  const centre = (Math.min(...xs) + Math.max(...xs)) / 2;
  expect(Math.abs(centre - 10)).toBeGreaterThan(0.3);
  expect(originOf("U6", pads, 0)).toEqual({ x: 10, y: 5, footprint: "SOT89" });
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

test("closed jumpers become net ties in the KiCad board", () => {
  const pcb = [
    "(kicad_pcb",
    '  (footprint "a"',
    "    (attr smd dnp)",
    '    (property "Reference" "JP5")',
    "  )",
    '  (footprint "b"',
    "    (attr smd)",
    '    (property "Reference" "R1")',
    "  )",
    ")",
  ].join("\n");
  const out = addNetTies(pcb, new Map([["JP5", [["1", "2"]]]]));
  expect(out).toContain(
    '    (attr smd dnp)\n    (net_tie_pad_groups "1,2")\n    (property "Reference" "JP5")',
  );
  expect(out.match(/net_tie/g)?.length).toBe(1);
  expect(() => addNetTies(pcb, new Map([["JP9", [["1", "2"]]]]))).toThrow();
  // A footprint without an (attr) line cannot take the tie.
  expect(() =>
    addNetTies(
      pcb.replace("    (attr smd dnp)\n", ""),
      new Map([["JP5", [["1", "2"]]]]),
    ),
  ).toThrow();
});

test("KiCad DRC lets through only the unconnected items that wait for the microcontroller", () => {
  const unconnected = (a: string, b: string) => ({
    type: "unconnected_items",
    severity: "error",
    description: "Missing connection between items",
    items: [
      { description: a, pos: { x: 159.75, y: 137.9 } },
      { description: b, pos: { x: 199.65, y: 141.65 } },
    ],
  });
  // Two pieces of the bottom ground (Q4's emitter cut off): not the microcontroller's.
  const ground = unconnected(
    "Zone [GND] on B.Cu, priority 0",
    "Zone [GND] on B.Cu, priority 0",
  );
  const mcu = unconnected(
    "Pad 2 [GND] of C24 on F.Cu",
    "PTH pad 8 [GND] of J4",
  );
  expect(remaining({ unconnected_items: [ground, mcu] })).toEqual([ground]);
});

test("filterZip drops entries and keeps the rest readable", async () => {
  // A zip written by Bun's own deflate is not available; build one with two stored entries by hand.
  const enc = new TextEncoder();
  const files = [
    ["a.gbr", "G04 top*"],
    ["pick_and_place.csv", "x,y"],
  ] as const;
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of files) {
    const n = enc.encode(name);
    const data = enc.encode(text);
    const crc = Bun.hash.crc32(data);
    const local = new Uint8Array(30 + n.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, n.length, true);
    local.set(n, 30);
    local.set(data, 30 + n.length);
    const c = new Uint8Array(46 + n.length);
    const cv = new DataView(c.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, n.length, true);
    cv.setUint32(42, offset, true);
    c.set(n, 46);
    parts.push(local);
    central.push(c);
    offset += local.length;
  }
  const size = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, 2, true);
  ev.setUint16(10, 2, true);
  ev.setUint32(12, size, true);
  ev.setUint32(16, offset, true);
  const zip = new Uint8Array(offset + size + 22);
  let at = 0;
  for (const p of [...parts, ...central, end]) {
    zip.set(p, at);
    at += p.length;
  }
  const out = filterZip(zip, (name) => !name.endsWith(".csv"));
  expect(zipEntries(out).map((e) => e.name)).toEqual(["a.gbr"]);
  expect(zipEntries(zip).map((e) => e.name)).toEqual([
    "a.gbr",
    "pick_and_place.csv",
  ]);
});
