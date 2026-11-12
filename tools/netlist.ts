// Netlist equivalence with rev D, apart from the changes listed in
// REV_D_CHANGES.
//
// fixtures/rev-d-netlist.json is the netlist of the rev D KiCad schematic
// (branch rev-d, out/netlist.net: every part with its value and LCSC number,
// and every net as a list of REF.PAD). This compares it with what tscircuit
// built: the same parts, and exactly the same pads connected to each other.
// Net names are ignored; only connectivity counts.
import { type Circuit, elementsOf } from "./circuit";

export interface Netlist {
  /** REF -> what is fitted there. */
  components: Record<string, { lcsc: string; mpn: string; value?: string }>;
  /** Groups of connected pads, each pad as REF.PAD. A pad alone is unconnected. */
  nets: string[][];
}

export interface Fixture {
  components: Record<
    string,
    { value: string; footprint: string; lcsc: string; mpn: string }
  >;
  nets: Record<string, string[]>;
}

/**
 * Pads that are named differently here than in the KiCad footprint.
 * The USB-C shell legs are pads 1..4 in KiCad; tscircuit would merge a pad
 * called "1" with the first of the named pads, so they are SH1..SH4 here.
 */
const PAD_NAMES: Record<string, Record<string, string>> = {
  J1: { SH1: "1", SH2: "2", SH3: "3", SH4: "4" },
  J2: { SH1: "1", SH2: "2", SH3: "3", SH4: "4" },
};

/** Mounting holes are KiCad parts without pads; here they are plain holes. */
const isMountingHole = (ref: string): boolean => /^H\d+$/.test(ref);

const byNatural = (a: string, b: string): number =>
  a.localeCompare(b, "en", { numeric: true });

const normalise = (nets: string[][]): string[][] =>
  nets
    .map((n) => [...new Set(n)].sort(byNatural))
    .sort((a, b) => byNatural(a[0] ?? "", b[0] ?? ""));

export const fixtureNetlist = (fixture: Fixture): Netlist => ({
  components: Object.fromEntries(
    Object.entries(fixture.components)
      .filter(([ref]) => !isMountingHole(ref))
      .map(([ref, c]) => [
        ref,
        { lcsc: c.lcsc, mpn: c.lcsc ? c.mpn : "", value: c.value },
      ]),
  ),
  nets: normalise(Object.values(fixture.nets)),
});

export const builtNetlist = (circuit: Circuit): Netlist => {
  const sources = new Map(
    elementsOf(circuit, "source_component").map((s) => [
      s.source_component_id,
      s,
    ]),
  );
  const refOfPcbComponent = new Map(
    elementsOf(circuit, "pcb_component").map((p) => [
      p.pcb_component_id,
      sources.get(p.source_component_id)?.name,
    ]),
  );
  const sourcePortOfPcbPort = new Map(
    elementsOf(circuit, "pcb_port").map((p) => [
      p.pcb_port_id,
      p.source_port_id,
    ]),
  );
  const netKeyOfSourcePort = new Map(
    elementsOf(circuit, "source_port").map((p) => [
      p.source_port_id,
      p.subcircuit_connectivity_map_key,
    ]),
  );

  const groups = new Map<string, string[]>();
  const pads = [
    ...elementsOf(circuit, "pcb_smtpad"),
    ...elementsOf(circuit, "pcb_plated_hole"),
  ];
  for (const pad of pads) {
    const ref = pad.pcb_component_id
      ? refOfPcbComponent.get(pad.pcb_component_id)
      : undefined;
    const name = pad.port_hints?.find((h) => !h.startsWith("unnamed_"));
    if (!ref || !name)
      throw new Error(`pad without a part or a name: ${JSON.stringify(pad)}`);
    const node = `${ref}.${PAD_NAMES[ref]?.[name] ?? name}`;
    const sourcePort = pad.pcb_port_id
      ? sourcePortOfPcbPort.get(pad.pcb_port_id)
      : undefined;
    const netKey = sourcePort ? netKeyOfSourcePort.get(sourcePort) : undefined;
    // An unconnected pad is a net of its own.
    const key = netKey ?? `unconnected:${node}`;
    groups.set(key, [...(groups.get(key) ?? []), node]);
  }

  return {
    components: Object.fromEntries(
      [...sources.values()].map((s) => [
        s.name,
        {
          lcsc: s.supplier_part_numbers?.jlcpcb?.[0] ?? "",
          mpn: s.manufacturer_part_number ?? "",
        },
      ]),
    ),
    nets: normalise([...groups.values()]),
  };
};

/** Differences between two netlists, as sentences. Empty when they are equivalent. */
export const compareNetlists = (
  expected: Netlist,
  actual: Netlist,
): string[] => {
  const problems: string[] = [];

  for (const [ref, want] of Object.entries(expected.components)) {
    const got = actual.components[ref];
    if (!got) problems.push(`${ref} is missing`);
    else if (got.lcsc !== want.lcsc || got.mpn !== want.mpn)
      problems.push(
        `${ref} is ${got.mpn || "(no MPN)"} ${got.lcsc || "(not fitted)"}, expected ${want.mpn} ${want.lcsc}`,
      );
  }
  for (const ref of Object.keys(actual.components))
    if (!expected.components[ref])
      problems.push(`${ref} is not in the reference`);

  const netOf = (nets: string[][]): Map<string, string> =>
    new Map(
      nets.flatMap((net) => net.map((pad) => [pad, net.join(" ")] as const)),
    );
  const [want, got] = [netOf(expected.nets), netOf(actual.nets)];
  const reported = new Set<string>();
  for (const [pad, net] of want) {
    const other = got.get(pad);
    if (other === undefined) problems.push(`pad ${pad} is missing`);
    else if (other !== net && !reported.has(net)) {
      reported.add(net);
      problems.push(
        `net differs at ${pad}: expected [${net}], built [${other}]`,
      );
    }
  }
  for (const pad of got.keys())
    if (!want.has(pad)) problems.push(`pad ${pad} is not in the reference`);
  return problems;
};

/** One pad that is on another net than in rev D, on purpose. Net names are rev D's. */
export interface Change {
  pad: string;
  from: string;
  to: string;
}

/**
 * Every intended difference from the rev D schematic. The fixture stays what
 * KiCad wrote; fixture + this table is what the board has to be.
 *
 * U7: in rev D the sense inputs were all on pins 1 to 6 and the lines to the
 * converters on pins 13 to 20, each on the far side of the package from where
 * it goes. The three sense lines that come from the ports move to the ADC
 * pins of the port side (PC4 = A2, PD2 = A3, PD3 = A4), the three lines to
 * the converters take their places, and PERST# moves from PC4 to PC3.
 */
export const REV_D_CHANGES: Change[] = [
  { pad: "U7.2", from: "VBUS1_SENSE", to: "SW12_ON" },
  { pad: "U7.3", from: "CC1_SENSE", to: "EN_MCU" },
  { pad: "U7.5", from: "CC2_SENSE", to: "EN_12V" },
  { pad: "U7.13", from: "EN_MCU", to: "PERST_MCU" },
  { pad: "U7.14", from: "PERST_MCU", to: "CC2_SENSE" },
  { pad: "U7.19", from: "EN_12V", to: "CC1_SENSE" },
  { pad: "U7.20", from: "SW12_ON", to: "VBUS1_SENSE" },
];

/** The fixture with the changes applied. Throws when a change does not fit the fixture. */
export const applyChanges = (fixture: Fixture, changes: Change[]): Fixture => {
  const nets = Object.fromEntries(
    Object.entries(fixture.nets).map(([name, pads]) => [name, [...pads]]),
  );
  for (const { pad, from, to } of changes) {
    const source = nets[from];
    const target = nets[to];
    if (!source?.includes(pad))
      throw new Error(`${pad} is not on ${from} in the reference`);
    if (!target) throw new Error(`${to} is not a net of the reference`);
    nets[from] = source.filter((q) => q !== pad);
    target.push(pad);
  }
  for (const [name, pads] of Object.entries(nets))
    if (pads.length === 0) throw new Error(`${name} is left without pads`);
  return { ...fixture, nets };
};

export const loadFixture = async (
  path = "fixtures/rev-d-netlist.json",
): Promise<Netlist> =>
  fixtureNetlist(
    applyChanges((await Bun.file(path).json()) as Fixture, REV_D_CHANGES),
  );
