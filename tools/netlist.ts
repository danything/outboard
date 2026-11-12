// Netlist equivalence with rev D.
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

interface Fixture {
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

export const loadFixture = async (
  path = "fixtures/rev-d-netlist.json",
): Promise<Netlist> => fixtureNetlist((await Bun.file(path).json()) as Fixture);
