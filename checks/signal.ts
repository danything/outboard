// Signals: the USB pair, the CC lines at the USB-C shells, and what may run
// on the bottom layer. The numbers are in rules.ts.
import type { Check } from "./finding";
import {
  type Box,
  type Copper,
  type Pad,
  type Shape,
  boundsOf,
  circle,
  gap,
  padsOf,
  segmentLength,
  segmentShape,
} from "./copper";
import { layoutCheck, routeLength } from "./power";
import {
  BOTTOM_TRACK,
  EPSILON,
  NO_BOTTOM_UNDER,
  SHELL_PINS,
  TOP_ONLY_NETS,
  USB_BOTTOM_MARGIN,
  USB_C_SHELLS,
  USB_PAIR,
} from "./rules";

const at = (p: { x: number; y: number }) =>
  `(${p.x.toFixed(2)}, ${p.y.toFixed(2)})`;

const boxShape = (b: Box): Shape => ({
  kind: "poly",
  points: [
    { x: b.x0, y: b.y0 },
    { x: b.x1, y: b.y0 },
    { x: b.x1, y: b.y1 },
    { x: b.x0, y: b.y1 },
  ],
});

const union = (boxes: Box[]): Box => ({
  x0: Math.min(...boxes.map((b) => b.x0)),
  y0: Math.min(...boxes.map((b) => b.y0)),
  x1: Math.max(...boxes.map((b) => b.x1)),
  y1: Math.max(...boxes.map((b) => b.y1)),
});

export const usbPair = layoutCheck("usbPair", (b) => {
  const ends = [0, 1].map((i) => ({
    net: USB_PAIR.nets[i as 0 | 1],
    from: USB_PAIR.from[i as 0 | 1].flatMap((n) => padsOf(b, n)),
    to: padsOf(b, USB_PAIR.to[i as 0 | 1]),
  }));
  if (ends.every((e) => e.from.length === 0 && e.to.length === 0))
    return { skip: "J1 and J4 are not on the board" };
  const out: string[] = [];
  const lengths = ends.map((e) => {
    const l = routeLength(b, e.net, e.from, e.to);
    if (l === undefined) out.push(`${e.net}: no copper joins J1 and J4`);
    return l;
  });
  const [dp, dn] = lengths;
  if (dp !== undefined && dn !== undefined) {
    const d = Math.abs(dp - dn);
    if (d > USB_PAIR.maxDifference + EPSILON)
      out.push(
        `D+ is ${dp.toFixed(2)} mm and D- is ${dn.toFixed(2)} mm: ${d.toFixed(2)} mm apart, maximum ${USB_PAIR.maxDifference}`,
      );
  }
  const bottom = b.segments
    .filter(
      (s) => s.layer === "bottom" && USB_PAIR.nets.some((n) => n === s.net),
    )
    .reduce((sum, s) => sum + segmentLength(s), 0);
  if (bottom > USB_PAIR.maxBottom + EPSILON)
    out.push(
      `the USB pair runs ${bottom.toFixed(1)} mm on the bottom, maximum ${USB_PAIR.maxBottom}`,
    );
  return out;
});

/** The metal shell of a USB-C receptacle: between its legs. */
const shellOf = (b: Copper, part: string): Box | undefined => {
  const legs: Pad[] = SHELL_PINS.flatMap((pin) => padsOf(b, `${part}.${pin}`));
  return legs.length < 2
    ? undefined
    : union(legs.map((p) => boundsOf(p.shape)));
};

export const underShell = layoutCheck("underShell", (b) => {
  const out: string[] = [];
  const absent: string[] = [];
  for (const { part, nets } of USB_C_SHELLS) {
    const box = shellOf(b, part);
    if (!box) {
      absent.push(part);
      continue;
    }
    const shell = boxShape(box);
    for (const s of b.segments)
      if (nets.includes(s.net) && gap(segmentShape(s), shell) <= EPSILON)
        out.push(
          `${s.net} track at ${at(s.a)} runs under the shell of ${part}`,
        );
    for (const v of b.vias)
      if (gap(circle(v.x, v.y, v.outer), shell) <= EPSILON)
        out.push(`${v.net} via at ${at(v)} is under the shell of ${part}`);
  }
  if (absent.length === USB_C_SHELLS.length)
    return { skip: `not on the board: ${absent.join(", ")}` };
  return [
    ...absent.map(
      (p) => `${p} has no shell legs named ${SHELL_PINS.join("/")}`,
    ),
    ...out,
  ];
});

export const bottomUnder = layoutCheck("bottomUnder", (b) => {
  const out: string[] = [];
  const bottom = b.segments.filter((s) => s.layer === "bottom");
  let groups = 0;
  for (const [name, refs] of Object.entries(NO_BOTTOM_UNDER)) {
    const boxes = refs.flatMap((r) => {
      const p = b.parts.get(r);
      return p ? [p.box] : [];
    });
    if (boxes.length === 0) continue;
    groups++;
    for (const r of refs)
      if (!b.parts.has(r)) out.push(`${r} (${name}) is not on the board`);
    const area = boxShape(union(boxes));
    for (const s of bottom)
      if (gap(segmentShape(s), area) <= EPSILON)
        out.push(
          `${s.net} track at ${at(s.a)} runs on the bottom under the ${name}`,
        );
  }
  const usb = b.segments.filter(
    (s) => s.layer !== "bottom" && USB_PAIR.nets.some((n) => n === s.net),
  );
  for (const s of bottom) {
    if (USB_PAIR.nets.some((n) => n === s.net)) continue;
    if (
      usb.some(
        (u) =>
          gap(segmentShape(s), segmentShape(u)) < USB_BOTTOM_MARGIN - EPSILON,
      )
    )
      out.push(
        `${s.net} track at ${at(s.a)} runs on the bottom under the USB pair`,
      );
  }
  for (const s of bottom)
    if (TOP_ONLY_NETS.includes(s.net))
      out.push(
        `${s.net} track at ${at(s.a)} is on the bottom; it stays on top`,
      );
  return groups === 0 && out.length === 0
    ? { skip: "the buck and boost parts are not on the board" }
    : out;
});

export const bottomTotal = layoutCheck("bottomTotal", (b) => {
  const total = b.segments
    .filter((s) => s.layer === "bottom")
    .reduce((sum, s) => sum + segmentLength(s), 0);
  return total > BOTTOM_TRACK.limit
    ? [
        `${total.toFixed(0)} mm of track on the bottom, limit ${BOTTOM_TRACK.limit} (aim: ${BOTTOM_TRACK.target})`,
      ]
    : [];
});

export const SIGNAL_CHECKS: Check[] = [
  usbPair,
  underShell,
  bottomUnder,
  bottomTotal,
];
