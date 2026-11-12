// Each manufacturing check passes on a clean board and fails on one that
// breaks exactly its rule.
import { expect, test } from "bun:test";
import type { Circuit } from "../tools/circuit";
import {
  FAB_CHECKS,
  clearance,
  edgeClearance,
  holeSpacing,
  holeToCopper,
  mountingHoleKeepout,
  padRing,
  solderPaste,
  trackWidth,
  viaSize,
} from "./fab";
import { EDGE_EXCEPTIONS, FAB, type FabRules } from "./rules";
import { board, hole, net, part, pour, track, via } from "./testboard";

const good: Circuit = [
  board(),
  net("A"),
  net("B"),
  net("GND"),
  ...track("A", 0.3, [
    [-10, 0],
    [0, 0],
    [5, 5],
  ]),
  ...track("B", 0.3, [
    [-10, 1],
    [0, 1],
  ]),
  via("A", 5, 5),
  ...part("R1", -10.5, 0.5, [
    { pin: "1", net: "A", x: -10.5, y: 0, w: 1, h: 0.5 },
    { pin: "2", net: "B", x: -10.5, y: 1, w: 1, h: 0.5 },
  ]),
  ...part("J9", 10, -5, [
    { pin: "1", net: "B", x: 10, y: -5, w: 1.7, drill: 1.0 },
  ]),
  hole(15, 10),
  pour(
    "GND",
    "bottom",
    [-19.5, -14.5, 19.5, 14.5],
    [
      [4, 4, 6, 6],
      [8.8, -6.2, 11.2, -3.8],
      [13, 8, 17, 12],
    ],
  ),
];

const run = (checks: typeof FAB_CHECKS, circuit: Circuit) =>
  checks.flatMap((c) => c(circuit));

test("a clean board passes every manufacturing check", () => {
  expect(run(FAB_CHECKS, good)).toEqual([]);
});

test("the design limits are never looser than JLCPCB's", () => {
  for (const layers of [2, 4] as const)
    for (const [name, limit] of Object.entries(FAB[layers] as FabRules))
      expect([name, limit.design >= limit.jlc]).toEqual([name, true]);
  for (const min of Object.values(EDGE_EXCEPTIONS))
    expect(min).toBeGreaterThanOrEqual(FAB[2].edge.jlc);
});

test("trackWidth fails on a 0.1 mm track", () => {
  const bad = [
    ...good,
    ...track("A", 0.1, [
      [0, -8],
      [3, -8],
    ]),
  ];
  expect(trackWidth(bad)).toHaveLength(1);
});

test("viaSize fails on a small hole, a small via and a thin ring", () => {
  expect(viaSize([...good, via("A", 0, -8, 0.6, 0.2)])).toHaveLength(1);
  // 0.3 / 0.2 is what tscircuit's autorouter places by default.
  expect(viaSize([...good, via("A", 0, -8, 0.3, 0.2)])).toHaveLength(3);
  expect(viaSize([...good, via("A", 0, -8, 0.6, 0.4)])).toHaveLength(1);
});

test("padRing fails on a plated hole with a 0.1 mm ring", () => {
  const bad = [
    ...good,
    ...part("J8", 0, -8, [{ pin: "1", x: 0, y: -8, w: 1.2, drill: 1.0 }]),
  ];
  expect(padRing(bad)).toHaveLength(1);
});

test("clearance fails on track to track, track to pad, track to via", () => {
  const close = (y: number) =>
    track("B", 0.3, [
      [-8, y],
      [-2, y],
    ]);
  // 0.3 mm tracks 0.4 mm apart leave 0.1 mm.
  expect(clearance([...good, ...close(-0.4)])).toHaveLength(1);
  // The pad of J9 (B) against a track of A.
  expect(
    clearance([
      ...good,
      ...track("A", 0.3, [
        [8, -3.9],
        [12, -3.9],
      ]),
    ]),
  ).toHaveLength(1);
  expect(clearance([...good, via("GND", -3, 0.5)])).toHaveLength(2);
});

test("clearance looks only at copper on the same layer", () => {
  const under = track(
    "B",
    0.3,
    [
      [-8, 0],
      [-2, 0],
    ],
    "bottom",
  );
  expect(
    clearance([board(), net("A"), net("B"), ...good.slice(4, 8), ...under]),
  ).toEqual([]);
});

test("clearance fails on a track that crosses another net's pour", () => {
  const bad = [
    ...good,
    ...track(
      "A",
      0.3,
      [
        [0, -10],
        [3, -10],
      ],
      "bottom",
    ),
  ];
  expect(clearance(bad)).toHaveLength(1);
});

test("holeSpacing fails on two vias 0.3 mm apart", () => {
  expect(holeSpacing([...good, via("A", 5.6, 5)])).toHaveLength(1);
});

test("holeToCopper fails on a track next to a via hole of another net", () => {
  // Track edge 0.2 mm from the hole edge; the pad clearance alone would not catch a via without a ring.
  const bad = [
    ...good,
    ...track(
      "B",
      0.2,
      [
        [4, 5.45],
        [6, 5.45],
      ],
      "bottom",
    ),
  ];
  expect(holeToCopper(bad).length).toBeGreaterThan(0);
});

test("holeToCopper fails on any copper next to a hole without plating", () => {
  const bad = [
    ...good,
    ...track("A", 0.3, [
      [12, 8.2],
      [18, 8.2],
    ]),
  ];
  expect(holeToCopper(bad)).toHaveLength(1);
  // The pour's own cutout too tight.
  const tight = [
    ...good.slice(0, -1),
    pour(
      "GND",
      "bottom",
      [-19.5, -14.5, 19.5, 14.5],
      [[13.3, 8.3, 16.7, 11.7]],
    ),
  ];
  expect(holeToCopper(tight).length).toBeGreaterThan(0);
});

test("mountingHoleKeepout fails on a via under the screw head", () => {
  expect(mountingHoleKeepout([...good, via("GND", 17.5, 10)])).toHaveLength(1);
  expect(mountingHoleKeepout([...good, via("GND", 18.5, 10)])).toEqual([]);
});

test("edgeClearance fails near the edge and outside the board", () => {
  expect(
    edgeClearance([
      ...good,
      ...track("A", 0.3, [
        [19.7, 0],
        [19.7, 3],
      ]),
    ]),
  ).toHaveLength(1);
  expect(edgeClearance([...good, via("A", 25, 0)])).toHaveLength(1);
});

test("edgeClearance lets J3 come to 0.2 mm, nothing else", () => {
  const pad = (ref: string) =>
    part(ref, 19.3, 0, [{ pin: "B11", x: 19.3, y: 0, w: 1, h: 1 }]);
  expect(edgeClearance([...good, ...pad("J3")])).toEqual([]);
  expect(edgeClearance([...good, ...pad("J7")])).toHaveLength(1);
});

test("a wire that ends at a via inside a route is still a track", () => {
  const trace = track("A", 0.1, [
    [0, -8],
    [3, -8],
  ])
    .map((e) => e as unknown as Record<string, unknown>)
    .map((e) =>
      e.type === "pcb_trace"
        ? {
            ...e,
            route: [
              { route_type: "wire", x: 0, y: -8, width: 0.1, layer: "top" },
              {
                route_type: "via",
                x: 3,
                y: -8,
                from_layer: "top",
                to_layer: "bottom",
                via_diameter: 0.6,
                via_hole_diameter: 0.3,
              },
              { route_type: "wire", x: 6, y: -8, width: 0.1, layer: "bottom" },
            ],
          }
        : e,
    ) as unknown as Circuit;
  // Both stretches are 0.1 mm wide, and the via in the route is drilled.
  expect(trackWidth([...good.slice(0, 4), ...trace])).toHaveLength(2);
  expect(viaSize([board(), ...trace, via("A", 9, 9, 0.6, 0.3)])).toEqual([]);
  expect(holeSpacing([board(), ...trace, via("A", 3.6, -8)])).toHaveLength(1);
});

test("a closed jumper's bridge is not a short: the part ties its pins into one net", () => {
  const jumper = part("JP5", 0, 5, [
    { pin: "pin1", net: "V3V3_BUCK", x: -0.65, y: 5, w: 1, h: 1.5 },
    { pin: "pin2", net: "V3V3", x: 0.65, y: 5, w: 1, h: 1.5 },
    // The bridge, a pad of pin 1 over both.
    { pin: "pin1", net: "V3V3_BUCK", x: 0, y: 5, w: 0.5, h: 1 },
  ]);
  // A V3V3 track that lands on the V3V3_BUCK side of the jumper.
  const onPin1 = track("V3V3", 0.3, [
    [-0.65, 5],
    [-0.65, 9],
  ]);
  const nets = [board(), net("V3V3_BUCK"), net("V3V3"), ...onPin1];
  expect(clearance([...nets, ...jumper]).length).toBeGreaterThan(0);
  const ports = jumper.flatMap((e) =>
    e.type === "source_port" ? [e.source_port_id] : [],
  );
  const tied = jumper.map((e) =>
    e.type === "source_component"
      ? { ...e, internally_connected_source_port_ids: [ports] }
      : e,
  );
  expect(clearance([...nets, ...tied])).toEqual([]);
});

test("solderPaste fails on paste on the bottom or on J3", () => {
  const paste = (layer: string, ref: string) => [
    {
      type: "source_component",
      source_component_id: `s_${ref}`,
      name: ref,
    },
    {
      type: "pcb_component",
      pcb_component_id: `p_${ref}`,
      source_component_id: `s_${ref}`,
    },
    {
      type: "pcb_solder_paste",
      pcb_solder_paste_id: `paste_${ref}_${layer}`,
      pcb_component_id: `p_${ref}`,
      layer,
      shape: "rect",
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    },
  ];
  const check = (...parts: Record<string, unknown>[][]) =>
    solderPaste(parts.flat() as unknown as Circuit).map((f) => f.message);
  expect(check(paste("top", "R1"))).toEqual([]);
  expect(check(paste("bottom", "J1"))).toEqual([
    "paste on the bottom at J1: the board has no bottom stencil",
  ]);
  expect(check(paste("top", "J3"))).toEqual([
    "paste on J3, which is soldered by hand",
  ]);
});
