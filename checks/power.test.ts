// The power checks pass on copper that carries the current and fail on thin
// tracks, missing vias, small copper and hot neighbours.
import { expect, test } from "bun:test";
import type { Circuit } from "../tools/circuit";
import { copperOf, padsOf } from "./copper";
import {
  POWER_CHECKS,
  boostLoop,
  diodeCopper,
  fuseDistance,
  narrowest,
  netWidth,
  powerPaths,
  ruleTargets,
  viaCount,
} from "./power";
import { board, net, part, pour, track, via } from "./testboard";

type Track = [number, [number, number][]];

/** D1 cathode at (0, 0), C9 pin 1 at (10, 0), joined by the given VIN tracks. */
const vin = (tracks: Track[], extra: Circuit = []): Circuit => [
  board(),
  net("VIN"),
  net("VBUS1"),
  net("GND"),
  ...part("D1", -1.5, 0, [
    { pin: "A", net: "VBUS1", x: -3, y: 0 },
    { pin: "K", net: "VIN", x: 0, y: 0 },
  ]),
  ...part("C9", 10, 1, [
    { pin: "pin1", net: "VIN", x: 10, y: 0 },
    { pin: "pin2", net: "GND", x: 10, y: 2 },
  ]),
  ...tracks.flatMap(([w, pts]) => track("VIN", w, pts)),
  ...extra,
];

const width = (circuit: Circuit) => {
  const b = copperOf(circuit);
  return narrowest(b, "VIN", padsOf(b, "D1.K"), padsOf(b, "C9.1"), 1.5);
};

const about = (findings: { message: string }[], text: string) =>
  findings.filter((f) => f.message.includes(text));

test("a 1.5 mm track all the way is 1.5 mm at its narrowest", () => {
  expect(
    width(
      vin([
        [
          1.5,
          [
            [0, 0],
            [10, 0],
          ],
        ],
      ]),
    ),
  ).toBe(1.5);
  expect(
    width(
      vin([
        [
          1.5,
          [
            [0, 0],
            [5, 3],
            [10, 0],
          ],
        ],
      ]),
    ),
  ).toBe(1.5);
});

test("a thin stretch in the middle is found", () => {
  const thin: Track[] = [
    [
      1.5,
      [
        [0, 0],
        [4, 3],
      ],
    ],
    [
      0.2,
      [
        [4, 3],
        [6, 3],
      ],
    ],
    [
      1.5,
      [
        [6, 3],
        [10, 0],
      ],
    ],
  ];
  expect(width(vin(thin))).toBe(0.2);
  expect(
    about(powerPaths(vin(thin)), "D1.K to C9.1 narrows to 0.2"),
  ).toHaveLength(1);
});

test("the wider of two parallel routes counts", () => {
  expect(
    width(
      vin([
        [
          0.2,
          [
            [0, 0],
            [5, -4],
            [10, 0],
          ],
        ],
        [
          1.5,
          [
            [0, 0],
            [5, 4],
            [10, 0],
          ],
        ],
      ]),
    ),
  ).toBe(1.5);
});

test("a neck next to the pad may be as narrow as the pad, not narrower", () => {
  const neck = (w: number): Track[] => [
    [
      w,
      [
        [0, 0],
        [1.5, 0],
      ],
    ],
    [
      1.5,
      [
        [1.5, 0],
        [5, 4],
        [10, 0],
      ],
    ],
  ];
  // The pads are 1 mm wide.
  expect(width(vin(neck(1.0)))).toBe(1.5);
  expect(width(vin(neck(0.5)))).toBe(0.5);
});

test("a neck longer than 2.6 mm is a narrow spot", () => {
  expect(
    width(
      vin([
        [
          1.0,
          [
            [0, 0],
            [4, 0],
          ],
        ],
        [
          1.5,
          [
            [4, 0],
            [10, 0],
          ],
        ],
      ]),
    ),
  ).toBe(1.0);
});

test("a pour joins the pads without a narrow spot", () => {
  expect(width(vin([], [pour("VIN", "top", [-1, -1, 11, 1])]))).toBe(Infinity);
});

test("pads with no copper between them are reported", () => {
  // A track of another net keeps the board from counting as not routed.
  const open = vin(
    [],
    track("GND", 0.5, [
      [10, 2],
      [12, 2],
    ]),
  );
  expect(width(open)).toBeUndefined();
  expect(about(powerPaths(open), "no copper joins D1.K and C9.1")).toHaveLength(
    1,
  );
});

test("a small via is a narrow spot, a 0.8 mm via is not", () => {
  const through = (outer: number) =>
    vin(
      [
        [
          1.5,
          [
            [0, 0],
            [4, 3],
          ],
        ],
      ],
      [
        via("VIN", 4, 3, outer, 0.3),
        ...track(
          "VIN",
          1.5,
          [
            [4, 3],
            [10, 0],
          ],
          "bottom",
        ),
        via("VIN", 10, 0, 0.8, 0.4),
      ],
    );
  expect(width(through(0.6))).toBe(0.6);
  expect(width(through(0.8))).toBe(1.5);
});

test("netWidth fails on a thin GND track, not on one inside a GND pour", () => {
  const thin = vin(
    [],
    track("GND", 0.15, [
      [10, 2],
      [14, 2],
    ]),
  );
  expect(netWidth(thin)).toHaveLength(1);
  expect(netWidth([...thin, pour("GND", "top", [9, 1, 15, 3])])).toEqual([]);
  expect(
    netWidth(
      vin(
        [],
        track("GND", 0.3, [
          [10, 2],
          [14, 2],
        ]),
      ),
    ),
  ).toEqual([]);
});

test("netWidth lets a track be as narrow as the pad it lands on", () => {
  const fine: Circuit = [
    board(),
    net("GND"),
    ...part("U9", 0, 0, [
      { pin: "4", net: "GND", x: 0, y: 0, w: 0.25, h: 0.8 },
    ]),
    ...track("GND", 0.25, [
      [0, 0],
      [0, 2],
    ]),
  ];
  expect(netWidth(fine)).toEqual([]);
});

const u3 = (vias: number): Circuit => [
  board(),
  net("GND"),
  ...part("U3", 0, 0, [{ pin: "GND", net: "GND", x: 0, y: 0, w: 0.3, h: 0.7 }]),
  pour("GND", "bottom", [-10, -10, 10, 10]),
  ...Array.from({ length: vias }, (_, i) => via("GND", 1 + i, 1)),
];

test("viaCount fails with three GND vias at U3, passes with four", () => {
  expect(about(viaCount(u3(3)), "U3.GND: 3 GND vias")).toHaveLength(1);
  expect(about(viaCount(u3(4)), "U3.GND")).toEqual([]);
});

test("viaCount does not count vias that are too far or of another net", () => {
  const far = [...u3(3), via("GND", 6, 0), net("VIN"), via("VIN", -1, 0)];
  expect(about(viaCount(far), "U3.GND: 3 GND vias")).toHaveLength(1);
});

const diodes = (side: number): Circuit => [
  board(60, 60),
  net("VBUS1"),
  net("VBUS2"),
  net("VIN"),
  ...part("D1", 0, 0, [
    { pin: "A", net: "VBUS1", x: 0, y: 0 },
    { pin: "K", net: "VIN", x: 2, y: 0 },
  ]),
  ...part("D2", 0, 20, [{ pin: "A", net: "VBUS2", x: 0, y: 20 }]),
  pour("VBUS1", "top", [-side, -side / 2, 0, side / 2]),
  pour("VBUS2", "top", [-13, 14, 0, 26]),
  pour("VIN", "top", [1, -10, 21, 10], [[5, -5, 10, 0]]),
];

test("diodeCopper fails when the anode copper is under 150 mm2", () => {
  expect(diodeCopper(diodes(13))).toEqual([]);
  expect(diodeCopper(diodes(12))).toHaveLength(1);
});

test("diodeCopper counts copper on the bottom only when a via joins it", () => {
  // 12 x 12 on top is 144 mm2; a 4 x 4 pour on the bottom brings it to 160.
  const bottom = pour("VBUS1", "bottom", [-10, -2, -6, 2]);
  expect(diodeCopper([...diodes(12), bottom])).toHaveLength(1);
  expect(diodeCopper([...diodes(12), bottom, via("VBUS1", -8, 0)])).toEqual([]);
});

const fuse = (x: number): Circuit => [
  board(),
  net("A"),
  ...track("A", 0.3, [
    [0, 10],
    [5, 10],
  ]),
  ...["F1", "Q1", "D4", "L2"].flatMap((ref, i) =>
    part(ref, i === 0 ? 0 : x, i * 2, [
      { pin: "1", x: i === 0 ? 0 : x, y: i * 2 },
    ]),
  ),
];

test("fuseDistance fails when a hot part is within 8 mm of F1", () => {
  expect(fuseDistance(fuse(9))).toEqual([]);
  expect(fuseDistance(fuse(7))).toHaveLength(1);
});

const boost = (capX: number): Circuit => [
  board(),
  net("V12_BOOST"),
  net("GND"),
  ...part("D4", 0, 0, [{ pin: "K", net: "V12_BOOST", x: 0, y: 0 }]),
  ...part("C18", capX, 1, [
    { pin: "pin1", net: "V12_BOOST", x: capX, y: 0 },
    { pin: "pin2", net: "GND", x: capX, y: 2 },
  ]),
  ...part("U4", 0, 3, [{ pin: "GND", net: "GND", x: capX - 3, y: 3 }]),
  ...track("V12_BOOST", 1, [
    [0, 0],
    [capX, 0],
  ]),
];

test("boostLoop fails when C18 is far from D4", () => {
  expect(boostLoop(boost(3))).toEqual([]);
  expect(boostLoop(boost(6))).toHaveLength(1);
});

test("every power check is skipped, not failed, on a board without routing", () => {
  const bare: Circuit = [board()];
  const findings = POWER_CHECKS.flatMap((c) => c(bare));
  expect(findings).toHaveLength(POWER_CHECKS.length);
  expect(findings.every((f) => f.skipped)).toBe(true);
});

test("a check whose parts are all absent is skipped; one absent pad among present ones fails", () => {
  const routed: Circuit = [
    board(),
    net("A"),
    ...track("A", 0.3, [
      [0, 0],
      [5, 0],
    ]),
  ];
  expect(viaCount(routed).every((f) => f.skipped)).toBe(true);
  expect(about(viaCount(u3(4)), "U4.GND is not on the board")).toHaveLength(1);
});

test("ruleTargets fails when a pad the rules name is missing or on another net", () => {
  const moved: Circuit = [
    board(),
    net("VIN"),
    net("GND"),
    ...part("C9", 0, 0, [
      { pin: "pin1", net: "GND", x: 0, y: 0 },
      { pin: "pin2", net: "GND", x: 0, y: 2 },
    ]),
  ];
  const findings = ruleTargets(moved);
  expect(about(findings, "C9.1 is on GND, the rules expect VIN")).toHaveLength(
    1,
  );
  expect(about(findings, "C9.2")).toEqual([]);
  expect(about(findings, "U3.GND is not on the board")).toHaveLength(1);
});

test("a part missing from a group that is otherwise there is a failure, not a skip", () => {
  const findings = boostLoop([
    board(),
    net("V12_BOOST"),
    ...part("D4", 0, 0, [{ pin: "K", net: "V12_BOOST", x: 0, y: 0 }]),
    ...track("V12_BOOST", 1, [
      [0, 0],
      [3, 0],
    ]),
  ]);
  expect(findings.some((f) => f.skipped)).toBe(false);
  expect(about(findings, "C18.1 is not on the board")).toHaveLength(1);
});

test("diodeCopper stops at the pads of other parts", () => {
  // 12 x 12 next to D1 (144 mm2), and a 10 x 10 area that only a resistor's pad touches.
  const beyond = [
    ...part("R1", -15, 0, [
      { pin: "1", net: "VBUS1", x: -15, y: 0, w: 0.6, h: 0.6 },
    ]),
    pour("VBUS1", "top", [-30, -5, -15.2, 5]),
    ...track("VBUS1", 0.4, [
      [-14.6, 0],
      [-11, 0],
    ]),
  ];
  expect(diodeCopper([...diodes(12), ...beyond])).toHaveLength(1);
});
