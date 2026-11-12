// Small hand-written circuit.json pieces for the tests of the checks.
import type { Circuit } from "../tools/circuit";

type Element = Circuit[number];
const el = (e: Record<string, unknown>): Element => e as unknown as Element;

let serial = 0;
const id = (prefix: string) => `${prefix}_${serial++}`;

export const board = (
  width = 40,
  height = 30,
  layers = 2,
  outline?: { x: number; y: number }[],
): Element =>
  el({
    type: "pcb_board",
    pcb_board_id: "pcb_board_0",
    center: { x: 0, y: 0 },
    width,
    height,
    thickness: 1.6,
    num_layers: layers,
    material: "fr4",
    ...(outline ? { outline } : {}),
  });

export const net = (name: string): Element =>
  el({
    type: "source_net",
    source_net_id: `net_${name}`,
    name,
    member_source_group_ids: [],
    subcircuit_connectivity_map_key: `key_${name}`,
  });

/** A track on one net; consecutive points are joined. */
export const track = (
  netName: string,
  width: number,
  pts: [number, number][],
  layer = "top",
): Element[] => {
  const trace = id("source_trace");
  return [
    el({
      type: "source_trace",
      source_trace_id: trace,
      connected_source_port_ids: [],
      connected_source_net_ids: [`net_${netName}`],
      subcircuit_connectivity_map_key: `key_${netName}`,
    }),
    el({
      type: "pcb_trace",
      pcb_trace_id: id("pcb_trace"),
      source_trace_id: trace,
      route: pts.map(([x, y]) => ({ route_type: "wire", x, y, width, layer })),
    }),
  ];
};

export const via = (
  netName: string,
  x: number,
  y: number,
  outer = 0.6,
  hole = 0.3,
): Element =>
  el({
    type: "pcb_via",
    pcb_via_id: id("pcb_via"),
    x,
    y,
    outer_diameter: outer,
    hole_diameter: hole,
    layers: ["top", "bottom"],
    subcircuit_connectivity_map_key: `key_${netName}`,
  });

export const hole = (x: number, y: number, diameter = 3.2): Element =>
  el({
    type: "pcb_hole",
    pcb_hole_id: id("pcb_hole"),
    hole_shape: "circle",
    hole_diameter: diameter,
    x,
    y,
  });

export interface PinSpec {
  pin: string;
  net?: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  layer?: string;
  /** Makes the pad a round plated hole with this drill. */
  drill?: number;
}

/** A part with its pads. Pin positions are absolute. */
export const part = (
  ref: string,
  x: number,
  y: number,
  pins: PinSpec[],
  extra: { layer?: string; courtyard?: [number, number] } = {},
): Element[] => {
  const source = id("source_component");
  const pcb = id("pcb_component");
  const xs = pins.flatMap((p) => [p.x - (p.w ?? 1) / 2, p.x + (p.w ?? 1) / 2]);
  const ys = pins.flatMap((p) => [p.y - (p.h ?? 1) / 2, p.y + (p.h ?? 1) / 2]);
  const out: Element[] = [
    el({
      type: "source_component",
      source_component_id: source,
      ftype: "simple_chip",
      name: ref,
    }),
    el({
      type: "pcb_component",
      pcb_component_id: pcb,
      source_component_id: source,
      center: { x, y },
      width: Math.max(...xs, x) - Math.min(...xs, x),
      height: Math.max(...ys, y) - Math.min(...ys, y),
      layer: extra.layer ?? "top",
      rotation: 0,
    }),
  ];
  if (extra.courtyard)
    out.push(
      el({
        type: "pcb_courtyard_rect",
        pcb_courtyard_rect_id: id("pcb_courtyard_rect"),
        pcb_component_id: pcb,
        center: { x, y },
        width: extra.courtyard[0],
        height: extra.courtyard[1],
        layer: "top",
      }),
    );
  for (const p of pins) {
    const sp = id("source_port");
    const pp = id("pcb_port");
    out.push(
      el({
        type: "source_port",
        source_port_id: sp,
        source_component_id: source,
        name: p.pin,
        port_hints: [p.pin],
        ...(p.net ? { subcircuit_connectivity_map_key: `key_${p.net}` } : {}),
      }),
      el({
        type: "pcb_port",
        pcb_port_id: pp,
        pcb_component_id: pcb,
        source_port_id: sp,
        x: p.x,
        y: p.y,
        layers: [p.layer ?? "top"],
      }),
      p.drill === undefined
        ? el({
            type: "pcb_smtpad",
            pcb_smtpad_id: id("pcb_smtpad"),
            pcb_component_id: pcb,
            pcb_port_id: pp,
            layer: p.layer ?? "top",
            shape: "rect",
            width: p.w ?? 1,
            height: p.h ?? 1,
            x: p.x,
            y: p.y,
          })
        : el({
            type: "pcb_plated_hole",
            pcb_plated_hole_id: id("pcb_plated_hole"),
            pcb_component_id: pcb,
            pcb_port_id: pp,
            shape: "circle",
            outer_diameter: p.w ?? 1,
            hole_diameter: p.drill,
            x: p.x,
            y: p.y,
            layers: ["top", "bottom"],
          }),
    );
  }
  return out;
};

/** A filled area; `cutouts` are closed rings inside it. */
export const pour = (
  netName: string,
  layer: string,
  box: [number, number, number, number],
  cutouts: [number, number, number, number][] = [],
): Element => {
  const ring = ([x0, y0, x1, y1]: [number, number, number, number]) => ({
    vertices: [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ],
  });
  return el({
    type: "pcb_copper_pour",
    pcb_copper_pour_id: id("pcb_copper_pour"),
    shape: "brep",
    layer,
    source_net_id: `net_${netName}`,
    brep_shape: { outer_ring: ring(box), inner_rings: cutouts.map(ring) },
  });
};
