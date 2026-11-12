// The copper of the board as plain geometry, read from circuit.json: track
// segments, vias, pads, drilled holes, pours, parts and the outline. Every
// layout check works on this model, so the circuit.json details live here.
import type { Circuit } from "../tools/circuit";

export interface Point {
  x: number;
  y: number;
}

/** A thick line (a circle when a = b) or a filled polygon. */
export type Shape =
  | { kind: "capsule"; a: Point; b: Point; r: number }
  | { kind: "poly"; points: Point[] };

export interface Segment {
  net: string;
  layer: string;
  a: Point;
  b: Point;
  width: number;
}

export interface Via {
  net: string;
  x: number;
  y: number;
  outer: number;
  hole: number;
}

export interface Pad {
  net: string;
  /** Reference of the part, "" for a pad without one. */
  ref: string;
  /** Every name the pin answers to ("A4B9", "pin1", "1"). */
  pins: string[];
  /** One layer for a surface pad, all of them for a plated hole. */
  layers: string[];
  center: Point;
  shape: Shape;
  /** Narrow side of the copper. */
  minSide: number;
  hole?: Shape & { kind: "capsule" };
  /** Narrowest copper around the hole. */
  ring?: number;
}

/** A hole without plating. */
export interface Hole {
  ref: string;
  x: number;
  y: number;
  diameter: number;
}

export interface Pour {
  net: string;
  layer: string;
  outer: Point[];
  holes: Point[][];
}

export interface Part {
  ref: string;
  center: Point;
  /** Origin of the land pattern; the centre when circuit.json has none. */
  origin: Point;
  layer: string;
  /** Bounding box of the pads and the body, as tscircuit reports it. */
  box: Box;
  /** Courtyard size, long side first; undefined without a courtyard. */
  courtyard?: [number, number];
  pads: number;
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Copper {
  layers: number;
  thickness: number;
  outline: Point[];
  segments: Segment[];
  vias: Via[];
  pads: Pad[];
  holes: Hole[];
  pours: Pour[];
  parts: Map<string, Part>;
}

// --- Geometry ---------------------------------------------------------------

export const distance = (p: Point, q: Point): number =>
  Math.hypot(p.x - q.x, p.y - q.y);

export const pointToSegment = (p: Point, a: Point, b: Point): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const u =
    l2 === 0
      ? 0
      : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + u * dx), p.y - (a.y + u * dy));
};

const cross = (o: Point, p: Point, q: Point): number =>
  (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);

const segmentsCross = (a: Point, b: Point, c: Point, d: Point): boolean => {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
};

export const segmentToSegment = (
  a: Point,
  b: Point,
  c: Point,
  d: Point,
): number =>
  segmentsCross(a, b, c, d)
    ? 0
    : Math.min(
        pointToSegment(a, c, d),
        pointToSegment(b, c, d),
        pointToSegment(c, a, b),
        pointToSegment(d, a, b),
      );

export const insidePolygon = (p: Point, ring: Point[]): boolean => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i] as Point;
    const b = ring[j] as Point;
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < a.x + ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y)
    )
      inside = !inside;
  }
  return inside;
};

export const polygonArea = (ring: Point[]): number => {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i] as Point;
    const b = ring[j] as Point;
    sum += b.x * a.y - a.x * b.y;
  }
  return Math.abs(sum) / 2;
};

const edgesOf = (ring: Point[]): [Point, Point][] =>
  ring.map((p, i) => [p, ring[(i + 1) % ring.length] as Point]);

/** Distance from the edge of a shape to a closed line; inside is not looked at. */
export const shapeToRing = (s: Shape, ring: Point[]): number => {
  let best = Infinity;
  const mine: [Point, Point][] =
    s.kind === "capsule" ? [[s.a, s.b]] : edgesOf(s.points);
  for (const [c, d] of edgesOf(ring))
    for (const [a, b] of mine)
      best = Math.min(best, segmentToSegment(a, b, c, d));
  return Math.max(0, best - (s.kind === "capsule" ? s.r : 0));
};

const anchorOf = (s: Shape): Point =>
  s.kind === "capsule" ? s.a : (s.points[0] as Point);

/** Gap between two pieces of copper; 0 when they touch or overlap. */
export const gap = (s: Shape, t: Shape): number => {
  if (s.kind === "capsule" && t.kind === "capsule")
    return Math.max(0, segmentToSegment(s.a, s.b, t.a, t.b) - s.r - t.r);
  if (t.kind === "poly" && insidePolygon(anchorOf(s), t.points)) return 0;
  if (s.kind === "poly" && insidePolygon(anchorOf(t), s.points)) return 0;
  return t.kind === "poly"
    ? shapeToRing(s, t.points)
    : shapeToRing(t, (s as Shape & { kind: "poly" }).points);
};

/** True when the anchor of the shape lies in the filled part of the pour. */
export const insidePour = (p: Point, pour: Pour): boolean =>
  insidePolygon(p, pour.outer) && !pour.holes.some((h) => insidePolygon(p, h));

/** Gap between a shape and the copper of a pour; 0 when the shape is in it. */
export const gapToPour = (s: Shape, pour: Pour): number => {
  let best = shapeToRing(s, pour.outer);
  for (const h of pour.holes) best = Math.min(best, shapeToRing(s, h));
  return insidePour(anchorOf(s), pour) ? 0 : best;
};

export const boundsOf = (s: Shape, margin = 0): Box => {
  const pts = s.kind === "capsule" ? [s.a, s.b] : s.points;
  const r = (s.kind === "capsule" ? s.r : 0) + margin;
  return {
    x0: Math.min(...pts.map((p) => p.x)) - r,
    y0: Math.min(...pts.map((p) => p.y)) - r,
    x1: Math.max(...pts.map((p) => p.x)) + r,
    y1: Math.max(...pts.map((p) => p.y)) + r,
  };
};

export const boxesOverlap = (a: Box, b: Box): boolean =>
  a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;

export const circle = (x: number, y: number, diameter: number): Shape => ({
  kind: "capsule",
  a: { x, y },
  b: { x, y },
  r: diameter / 2,
});

export const segmentShape = (s: Segment): Shape => ({
  kind: "capsule",
  a: s.a,
  b: s.b,
  r: s.width / 2,
});

export const segmentLength = (s: Segment): number => distance(s.a, s.b);

const rotate = (p: Point, degrees: number): Point => {
  const a = (degrees * Math.PI) / 180;
  return {
    x: p.x * Math.cos(a) - p.y * Math.sin(a),
    y: p.x * Math.sin(a) + p.y * Math.cos(a),
  };
};

const rect = (
  x: number,
  y: number,
  w: number,
  h: number,
  degrees: number,
): Shape => ({
  kind: "poly",
  points: [
    { x: -w / 2, y: -h / 2 },
    { x: w / 2, y: -h / 2 },
    { x: w / 2, y: h / 2 },
    { x: -w / 2, y: h / 2 },
  ].map((p) => {
    const q = rotate(p, degrees);
    return { x: x + q.x, y: y + q.y };
  }),
});

const pill = (
  x: number,
  y: number,
  w: number,
  h: number,
  degrees: number,
): Shape & { kind: "capsule" } => {
  const half = Math.abs(w - h) / 2;
  const end = rotate(w >= h ? { x: half, y: 0 } : { x: 0, y: half }, degrees);
  return {
    kind: "capsule",
    a: { x: x - end.x, y: y - end.y },
    b: { x: x + end.x, y: y + end.y },
    r: Math.min(w, h) / 2,
  };
};

// --- Reading circuit.json ---------------------------------------------------

type Raw = Record<string, unknown>;

const num = (v: unknown, fallback = 0): number =>
  typeof v === "number" ? v : fallback;
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const points = (v: unknown): Point[] =>
  list(v).map((p) => ({ x: num((p as Raw).x), y: num((p as Raw).y) }));

const padShape = (e: Raw): Pick<Pad, "shape" | "minSide" | "hole" | "ring"> => {
  const x = num(e.x);
  const y = num(e.y);
  const turn = num(e.ccw_rotation);
  const shape = str(e.shape);
  if (e.type === "pcb_smtpad") {
    if (shape === "circle") {
      const d = num(e.radius) * 2;
      return { shape: circle(x, y, d), minSide: d };
    }
    if (shape === "polygon") {
      const pts = points(e.points);
      const b = boundsOf({ kind: "poly", points: pts });
      return {
        shape: { kind: "poly", points: pts },
        minSide: Math.min(b.x1 - b.x0, b.y1 - b.y0),
      };
    }
    const w = num(e.width);
    const h = num(e.height);
    if (shape === "rect" || shape === "rotated_rect")
      return { shape: rect(x, y, w, h, turn), minSide: Math.min(w, h) };
    if (shape === "pill" || shape === "rotated_pill")
      return { shape: pill(x, y, w, h, turn), minSide: Math.min(w, h) };
    throw new Error(`pad shape ${shape} is not handled`);
  }
  // Plated holes.
  if (shape === "circle") {
    const outer = num(e.outer_diameter);
    const hole = num(e.hole_diameter);
    return {
      shape: circle(x, y, outer),
      minSide: outer,
      hole: pill(x, y, hole, hole, 0),
      ring: (outer - hole) / 2,
    };
  }
  if (shape === "pill") {
    const [ow, oh] = [num(e.outer_width), num(e.outer_height)];
    const [hw, hh] = [num(e.hole_width), num(e.hole_height)];
    return {
      shape: pill(x, y, ow, oh, turn),
      minSide: Math.min(ow, oh),
      hole: pill(x, y, hw, hh, turn),
      ring: Math.min(ow - hw, oh - hh) / 2,
    };
  }
  if (
    shape === "circular_hole_with_rect_pad" ||
    shape === "pill_hole_with_rect_pad"
  ) {
    const [pw, ph] = [num(e.rect_pad_width), num(e.rect_pad_height)];
    const hw = num(e.hole_width, num(e.hole_diameter));
    const hh = num(e.hole_height, num(e.hole_diameter));
    return {
      shape: rect(x, y, pw, ph, num(e.rect_ccw_rotation)),
      minSide: Math.min(pw, ph),
      hole: pill(x, y, hw, hh, 0),
      ring: Math.min(pw - hw, ph - hh) / 2,
    };
  }
  throw new Error(`plated hole shape ${shape} is not handled`);
};

const cache = new WeakMap<Circuit, Copper>();

export const copperOf = (circuit: Circuit): Copper => {
  const cached = cache.get(circuit);
  if (cached) return cached;
  const raw = circuit as unknown as Raw[];
  const of = (type: string) => raw.filter((e) => e.type === type);
  const byId = (type: string, key: string) =>
    new Map(of(type).map((e) => [str(e[key]), e]));

  // Net names: a connectivity key maps to the name of its net, or stays as the key.
  const netNames = new Map<string, string>();
  const netIds = new Map<string, string>();
  for (const n of of("source_net")) {
    const key = str(n.subcircuit_connectivity_map_key);
    if (key && !netNames.has(key)) netNames.set(key, str(n.name));
    netIds.set(str(n.source_net_id), str(n.name));
  }
  const named = (key: unknown, fallback: string): string => {
    const k = str(key);
    return k ? (netNames.get(k) ?? k) : fallback;
  };

  const sourcePorts = byId("source_port", "source_port_id");
  const sourceParts = byId("source_component", "source_component_id");
  const sourceTraces = byId("source_trace", "source_trace_id");
  const pcbPorts = byId("pcb_port", "pcb_port_id");
  const pcbParts = byId("pcb_component", "pcb_component_id");
  const refOf = (pcbComponentId: unknown): string =>
    str(
      sourceParts.get(
        str(pcbParts.get(str(pcbComponentId))?.source_component_id),
      )?.name,
    );
  const portNet = (pcbPortId: unknown): string | undefined => {
    const port = sourcePorts.get(
      str(pcbPorts.get(str(pcbPortId))?.source_port_id),
    );
    const key = str(port?.subcircuit_connectivity_map_key);
    return key ? named(key, key) : undefined;
  };

  const board = of("pcb_board")[0] ?? {};
  const center = (board.center ?? { x: 0, y: 0 }) as Point;
  const outline =
    list(board.outline).length > 0
      ? points(board.outline)
      : (
          rect(
            center.x,
            center.y,
            num(board.width),
            num(board.height),
            0,
          ) as Shape & {
            kind: "poly";
          }
        ).points;

  const pads: Pad[] = [...of("pcb_smtpad"), ...of("pcb_plated_hole")].map(
    (e, i) => {
      const port = sourcePorts.get(
        str(pcbPorts.get(str(e.pcb_port_id))?.source_port_id),
      );
      return {
        // A pad that is wired to nothing is its own net.
        net: portNet(e.pcb_port_id) ?? `(pad ${i})`,
        ref: refOf(e.pcb_component_id),
        pins: [
          ...new Set([
            str(port?.name),
            ...list(port?.port_hints).map(str),
            ...list(e.port_hints).map(str),
          ]),
        ].filter(Boolean),
        layers: e.type === "pcb_smtpad" ? [str(e.layer)] : ["*"],
        center: { x: num(e.x), y: num(e.y) },
        ...padShape(e),
      };
    },
  );

  const segments: Segment[] = [];
  const routeVias: Via[] = [];
  for (const t of of("pcb_trace")) {
    const route = list(t.route) as Raw[];
    const ends = route.flatMap((p) => [p.start_pcb_port_id, p.end_pcb_port_id]);
    const net =
      named(
        sourceTraces.get(str(t.source_trace_id))
          ?.subcircuit_connectivity_map_key,
        "",
      ) ||
      netIds.get(str(t.connection_name)) ||
      ends.map(portNet).find(Boolean) ||
      `(trace ${str(t.pcb_trace_id)})`;
    for (let i = 0; i < route.length; i++) {
      const p = route[i] as Raw;
      if (p.route_type === "via") {
        routeVias.push({
          net,
          x: num(p.x),
          y: num(p.y),
          outer: num(p.via_diameter, NaN),
          hole: num(p.via_hole_diameter, NaN),
        });
        continue;
      }
      const q = route[i + 1];
      if (!q || q.route_type !== "wire" || q.layer !== p.layer) continue;
      const a = { x: num(p.x), y: num(p.y) };
      const b = { x: num(q.x), y: num(q.y) };
      segments.push({
        net,
        layer: str(p.layer),
        a,
        b,
        width: Math.min(num(p.width), num(q.width)),
      });
    }
  }

  const near = (v: { x: number; y: number }, w: { x: number; y: number }) =>
    distance(v, w) < 1e-3;
  const vias: Via[] = of("pcb_via").map((e, i) => {
    const at = { x: num(e.x), y: num(e.y) };
    return {
      net:
        named(e.subcircuit_connectivity_map_key, "") ||
        netIds.get(str(e.source_net_id)) ||
        routeVias.find((v) => near(v, at))?.net ||
        segments.find((s) => near(s.a, at) || near(s.b, at))?.net ||
        `(via ${i})`,
      ...at,
      outer: num(e.outer_diameter),
      hole: num(e.hole_diameter),
    };
  });
  // A via that only exists inside a route still gets drilled.
  for (const v of routeVias)
    if (
      !vias.some((w) => near(v, w)) &&
      !Number.isNaN(v.outer) &&
      !Number.isNaN(v.hole)
    )
      vias.push(v);

  const holes: Hole[] = of("pcb_hole").map((e) => ({
    ref: refOf(e.pcb_component_id),
    x: num(e.x),
    y: num(e.y),
    diameter: num(
      e.hole_diameter,
      Math.max(num(e.hole_width), num(e.hole_height)),
    ),
  }));

  const pours: Pour[] = of("pcb_copper_pour").flatMap((e, i): Pour[] => {
    const net =
      netIds.get(str(e.source_net_id)) ??
      named(e.subcircuit_connectivity_map_key, `(pour ${i})`);
    const layer = str(e.layer);
    if (e.shape === "brep") {
      const brep = (e.brep_shape ?? {}) as Raw;
      return [
        {
          net,
          layer,
          outer: points((brep.outer_ring as Raw | undefined)?.vertices),
          holes: list(brep.inner_rings).map((r) => points((r as Raw).vertices)),
        },
      ];
    }
    if (e.shape === "polygon")
      return [{ net, layer, outer: points(e.points), holes: [] }];
    if (e.shape === "rect") {
      const c = (e.center ?? { x: 0, y: 0 }) as Point;
      const r = rect(c.x, c.y, num(e.width), num(e.height), num(e.rotation));
      return [
        {
          net,
          layer,
          outer: (r as Shape & { kind: "poly" }).points,
          holes: [],
        },
      ];
    }
    throw new Error(`copper pour shape ${str(e.shape)} is not handled`);
  });

  const courtyards = new Map<string, [number, number]>();
  for (const c of of("pcb_courtyard_rect")) {
    const [w, h] = [num(c.width), num(c.height)];
    courtyards.set(str(c.pcb_component_id), [Math.max(w, h), Math.min(w, h)]);
  }
  const parts = new Map<string, Part>();
  for (const [id, e] of pcbParts) {
    const ref = refOf(id);
    if (!ref) continue;
    const c = (e.center ?? { x: 0, y: 0 }) as Point;
    const [w, h] = [num(e.width), num(e.height)];
    parts.set(ref, {
      ref,
      center: { x: c.x, y: c.y },
      origin: e.footprint_origin
        ? (points([e.footprint_origin])[0] as Point)
        : { x: c.x, y: c.y },
      layer: str(e.layer),
      box: {
        x0: c.x - w / 2,
        y0: c.y - h / 2,
        x1: c.x + w / 2,
        y1: c.y + h / 2,
      },
      courtyard: courtyards.get(id),
      pads: pads.filter((p) => p.ref === ref).length,
    });
  }

  const copper: Copper = {
    layers: num(board.num_layers, 2),
    thickness: num(board.thickness),
    outline,
    segments,
    vias,
    pads,
    holes,
    pours,
    parts,
  };
  cache.set(circuit, copper);
  return copper;
};

/** Pads of one pin, named "REF.PIN". */
export const padsOf = (copper: Copper, name: string): Pad[] => {
  const dot = name.indexOf(".");
  const ref = name.slice(0, dot);
  const pin = name.slice(dot + 1);
  return copper.pads.filter(
    (p) =>
      p.ref === ref && (p.pins.includes(pin) || p.pins.includes(`pin${pin}`)),
  );
};
