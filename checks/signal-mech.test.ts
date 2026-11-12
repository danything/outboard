// Signal and mechanical checks: each passes on a board that keeps its rule
// and fails on one that breaks it.
import { expect, test } from "bun:test";
import * as footprints from "../lib/footprints";
import { at } from "../lib/geometry";
import type { Circuit } from "../tools/circuit";
import { copperOf } from "./copper";
import {
  connectorFacing,
  connectorPosition,
  keepOut,
  landPatternsOf,
  partHeight,
  noConnectorWarnings,
  partsOnTop,
} from "./mechanical";
import { HEIGHT_FALLBACK } from "./rules";
import { bottomTotal, bottomUnder, underShell, usbPair } from "./signal";
import { board, net, part, track, via } from "./testboard";

const about = (findings: { message: string }[], text: string) =>
  findings.filter((f) => f.message.includes(text));

// J1 at the left, J4 at the right; D+ on y = 0, D- on y = 1.
const usb = (dnDetour: number, extra: Circuit = []): Circuit => [
  board(),
  net("USB_DP"),
  net("USB_DN"),
  net("GND"),
  ...part("J1", -10, 0.5, [
    { pin: "A6", net: "USB_DP", x: -10, y: 0, w: 0.3, h: 0.3 },
    { pin: "A7", net: "USB_DN", x: -10, y: 1, w: 0.3, h: 0.3 },
  ]),
  ...part("J4", 10, 0.5, [
    { pin: "DP", net: "USB_DP", x: 10, y: 0, w: 0.3, h: 0.3 },
    { pin: "DN", net: "USB_DN", x: 10, y: 1, w: 0.3, h: 0.3 },
  ]),
  ...track("USB_DP", 0.2, [
    [-10, 0],
    [10, 0],
  ]),
  ...track("USB_DN", 0.2, [
    [-10, 1],
    [0, 1],
    [0, 1 + dnDetour],
    [1, 1 + dnDetour],
    [1, 1],
    [10, 1],
  ]),
  ...extra,
];

test("usbPair passes with 0.4 mm of difference and fails with 1 mm", () => {
  expect(usbPair(usb(0.2))).toEqual([]);
  expect(about(usbPair(usb(0.5)), "1.00 mm apart")).toHaveLength(1);
});

test("usbPair fails when the pair runs on the bottom for long", () => {
  const under = track(
    "USB_DP",
    0.2,
    [
      [-5, 3],
      [0, 3],
    ],
    "bottom",
  );
  expect(about(usbPair(usb(0, under)), "on the bottom")).toHaveLength(1);
});

test("usbPair fails when a line is not routed", () => {
  const open = usb(0).filter(
    (e) => !(e.type === "pcb_trace" && JSON.stringify(e).includes('"y":1,')),
  );
  expect(
    about(usbPair(open), "USB_DN: no copper joins J1 and J4"),
  ).toHaveLength(1);
});

// Shell legs at the corners of a 6 x 8 box around the origin.
const shell = (extra: Circuit): Circuit => [
  board(),
  net("J1_CC1"),
  net("GND"),
  ...part("J1", 0, 0, [
    { pin: "SH1", x: -3, y: -4, drill: 0.6 },
    { pin: "SH2", x: -3, y: 4, drill: 0.6 },
    { pin: "SH3", x: 3, y: -4, drill: 0.6 },
    { pin: "SH4", x: 3, y: 4, drill: 0.6 },
    { pin: "A5", net: "J1_CC1", x: 4.5, y: 0, w: 1, h: 0.3 },
  ]),
  ...extra,
];

test("underShell passes with CC leaving away from the shell", () => {
  expect(
    about(
      underShell(
        shell(
          track("J1_CC1", 0.2, [
            [4.5, 0],
            [9, 0],
          ]),
        ),
      ),
      "J1_",
    ),
  ).toEqual([]);
});

test("underShell fails on a CC track or any via under the shell", () => {
  expect(
    about(
      underShell(
        shell(
          track("J1_CC1", 0.2, [
            [4.5, 0],
            [1, 0],
          ]),
        ),
      ),
      "runs under the shell of J1",
    ),
  ).toHaveLength(1);
  const withVia = shell([
    ...track("GND", 0.3, [
      [8, 8],
      [9, 8],
    ]),
    via("GND", 0, 2),
  ]);
  expect(about(underShell(withVia), "is under the shell of J1")).toHaveLength(
    1,
  );
});

const buck = (extra: Circuit): Circuit => [
  board(),
  net("A"),
  net("FB_12V"),
  net("USB_DP"),
  ...part("U3", 0, 0, [{ pin: "1", x: 0, y: 0 }]),
  ...part("L1", 5, 0, [{ pin: "1", x: 5, y: 0 }]),
  ...track("USB_DP", 0.2, [
    [-15, 10],
    [15, 10],
  ]),
  ...extra,
];

test("bottomUnder fails on a bottom track under the buck, the USB pair, or of a feedback net", () => {
  const clean = buck(
    track(
      "A",
      0.3,
      [
        [-10, -8],
        [10, -8],
      ],
      "bottom",
    ),
  );
  expect(about(bottomUnder(clean), "track")).toEqual([]);
  expect(
    about(
      bottomUnder(
        buck(
          track(
            "A",
            0.3,
            [
              [2, -5],
              [2, 5],
            ],
            "bottom",
          ),
        ),
      ),
      "under the buck",
    ),
  ).toHaveLength(1);
  expect(
    about(
      bottomUnder(
        buck(
          track(
            "A",
            0.3,
            [
              [8, 8],
              [8, 12],
            ],
            "bottom",
          ),
        ),
      ),
      "under the USB pair",
    ),
  ).toHaveLength(1);
  expect(
    about(
      bottomUnder(
        buck(
          track(
            "FB_12V",
            0.3,
            [
              [-10, -8],
              [10, -8],
            ],
            "bottom",
          ),
        ),
      ),
      "stays on top",
    ),
  ).toHaveLength(1);
  // The same track on top is fine.
  expect(
    about(
      bottomUnder(
        buck(
          track("A", 0.3, [
            [2, -5],
            [2, 5],
          ]),
        ),
      ),
      "track",
    ),
  ).toEqual([]);
});

test("bottomTotal fails over 500 mm of bottom track", () => {
  const zigzag = (n: number): [number, number][] =>
    Array.from({ length: n + 1 }, (_, i) => [i % 2 ? 15 : -15, -10 + i * 0.5]);
  const run = (n: number) =>
    bottomTotal([board(), net("A"), ...track("A", 0.2, zigzag(n), "bottom")]);
  expect(run(16)).toEqual([]);
  expect(run(17)).toHaveLength(1);
});

// A part built from a real land pattern, so that it is recognised.
const real = (ref: string, name: keyof typeof footprints, layer = "top") => {
  const def = footprints[name] as footprints.FootprintDef;
  const c = def.courtyard;
  return part(
    ref,
    0,
    0,
    [
      ...def.pads.map((p, i) => ({
        pin: `${p.pin}_${i}`,
        x: p.x,
        y: p.y,
        w: p.w,
        h: p.h,
      })),
      ...(def.platedHoles ?? []).map((p, i) => ({
        pin: `h${p.pin}_${i}`,
        x: p.x,
        y: p.y,
        w: p.padW,
        drill: p.holeW,
      })),
    ],
    { layer, courtyard: [c.x1 - c.x0, c.y1 - c.y0] },
  );
};

test("every land pattern is recognised and has a height", () => {
  for (const [name, def] of Object.entries(footprints)) {
    if (typeof def !== "object" || def === null || !("courtyard" in def))
      continue;
    const b = copperOf([
      board(),
      ...real("X1", name as keyof typeof footprints),
    ]);
    const names = landPatternsOf(b.parts.get("X1") as never);
    expect([name, names.includes(name)]).toEqual([name, true]);
    for (const n of names) {
      const h =
        (footprints as unknown as Record<string, footprints.FootprintDef>)[n]
          ?.height ?? HEIGHT_FALLBACK[n];
      expect([n, typeof h]).toEqual([n, "number"]);
    }
  }
});

test("partHeight passes on known parts and fails on an unknown one", () => {
  expect(
    partHeight([
      board(),
      ...real("C1", "C0603"),
      ...real("J4", "HEADER_2X5_RIGHT_ANGLE"),
    ]),
  ).toEqual([]);
  const unknown = [
    board(),
    ...part("X9", 0, 0, [{ pin: "1", x: 0, y: 0 }], { courtyard: [9, 9] }),
  ];
  expect(about(partHeight(unknown), "no land pattern")).toHaveLength(1);
});

test("partsOnTop fails on a part on the bottom", () => {
  expect(partsOnTop([board(), ...real("C1", "C0603")])).toEqual([]);
  expect(partsOnTop([board(), ...real("C1", "C0603", "bottom")])).toHaveLength(
    1,
  );
});

const placed = (ref: string, x: number, y: number): Circuit => {
  const p = at(x, y);
  return part(ref, p.x, p.y, [{ pin: "1", x: p.x, y: p.y }]);
};
const routed: Circuit = [
  board(200, 200),
  net("A"),
  ...track("A", 0.3, [
    [50, -50],
    [51, -50],
  ]),
];

test("keepOut fails in the bracket step, at the tongue and under the ears of J3", () => {
  expect(
    keepOut([...routed, ...placed("C1", 20, 20), ...placed("J3", 40, 3)]),
  ).toEqual([]);
  expect(keepOut([...routed, ...placed("C1", 1.2, 5)])).toHaveLength(1);
  // Hanging over the rear edge next to the tongue.
  expect(keepOut([...routed, ...placed("J1", 0, 13)])).toHaveLength(1);
  expect(keepOut([...routed, ...placed("J1", 0, 16)])).toEqual([]);
  expect(keepOut([...routed, ...placed("C1", 70, 4)])).toHaveLength(1);
});

const connectors = (x: number, y2: number, pinX: number): Circuit => [
  board(200, 200),
  ...placed("J1", x, 20),
  ...placed("J2", 4.08, y2),
  ...part("J3", at(56, 3).x, at(56, 3).y, [
    { pin: "B1", x: at(pinX, 3).x, y: at(pinX, 3).y },
  ]),
];

test("connectorPosition fails when a USB-C or the slot is off", () => {
  expect(connectorPosition(connectors(4.08, 36.2, 46.55))).toEqual([]);
  expect(connectorPosition(connectors(4.5, 36.2, 46.55))).toHaveLength(1);
  expect(connectorPosition(connectors(4.08, 30, 46.55))).toHaveLength(1);
  expect(connectorPosition(connectors(4.08, 36.2, 47))).toHaveLength(1);
});

test("bottomUnder lets only the listed crossing pass under the USB pair", () => {
  // The USB pair at design y 20 (circuit.json y -20), CC1 under it.
  const pair = (cc: [number, number][]): Circuit => [
    board(60, 60),
    net("USB_DP"),
    net("J1_CC1"),
    ...track("USB_DP", 0.2, [
      [5, -20],
      [15, -20],
    ]),
    ...track("J1_CC1", 0.2, cc, "bottom"),
  ];
  const under = (c: Circuit) => about(bottomUnder(c), "under the USB pair");
  expect(
    under(
      pair([
        [10.5, -18.2],
        [10.5, -22.35],
      ]),
    ),
  ).toEqual([]);
  // Elsewhere, or longer than allowed, it is a finding again.
  expect(
    under(
      pair([
        [12, -18.2],
        [12, -22.35],
      ]),
    ),
  ).toHaveLength(1);
  expect(
    under(
      pair([
        [10.5, -17],
        [10.5, -22.35],
      ]),
    ),
  ).toHaveLength(1);
});

const turned = (circuit: Circuit, rotation: number): Circuit =>
  circuit.map((e) =>
    e.type === "pcb_component" ? ({ ...e, rotation } as typeof e) : e,
  );

test("connectorFacing passes a connector facing the bracket or the card", () => {
  // J4's plug comes from -y; turned half round, it comes from the card (+y).
  expect(
    connectorFacing([
      board(),
      ...turned(real("J4", "HEADER_2X5_RIGHT_ANGLE"), 180),
    ]),
  ).toEqual([]);
  // The USB-C mouth faces -y; a quarter turn clockwise points it at the bracket (x-).
  expect(
    connectorFacing([
      board(),
      ...turned(real("J1", "USBC_TYPE_C_31_M_12"), 270),
    ]),
  ).toEqual([]);
  expect(connectorFacing([board(), ...real("J3", "PCIE_X1_STRADDLE")])).toEqual(
    [],
  );
});

test("connectorFacing fails a connector facing elsewhere", () => {
  expect(
    connectorFacing([board(), ...real("J4", "HEADER_2X5_RIGHT_ANGLE")]),
  ).toHaveLength(1);
  expect(
    connectorFacing([
      board(),
      ...turned(real("J1", "USBC_TYPE_C_31_M_12"), 90),
    ]),
  ).toHaveLength(1);
});

test("noConnectorWarnings fails on tscircuit's connector warning", () => {
  expect(noConnectorWarnings([board()])).toEqual([]);
  const warning = {
    type: "pcb_connector_not_in_accessible_orientation_warning",
    message: "J4 is facing y+ but should face y-",
  } as unknown as Circuit[number];
  expect(noConnectorWarnings([board(), warning])).toHaveLength(1);
});
