// Netlist equivalence with rev D, apart from the changes listed in
// REV_D_CHANGES.
//
// fixtures/rev-d-netlist.json is the netlist of the rev D KiCad schematic
// (branch rev-d, out/netlist.net: every part with its value and LCSC number,
// and every net as a list of REF.PAD). This compares it with what tscircuit
// built: the same parts, and exactly the same pads connected to each other.
// Net names are ignored; only connectivity counts.
import { CARD_USB_PART, CARD_USB_PINOUT } from "../lib/card-usb";
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

/**
 * One pad that is on another net than in rev D, on purpose. Net names are
 * rev D's, or one of REV_D_NEW_NETS. `from: null` is a pad of a part added
 * since rev D (REV_D_ADDED_PARTS); `to: null` leaves the pad unconnected.
 */
export interface Change {
  pad: string;
  from: string | null;
  to: string | null;
}

type Part = Fixture["components"][string];

const part = (
  value: string,
  footprint: string,
  lcsc: string,
  mpn: string,
): Part => ({ value, footprint, lcsc, mpn });

/**
 * Parts of rev D that are gone, every pad with them: the 2x5 header J4.
 * A net that only had pads of these parts goes too. The name J4 is used
 * again for one of the two JST PH sockets (REV_D_ADDED_PARTS).
 */
export const REV_D_REMOVED_PARTS = ["J4"];

const cardSocket = (): Part =>
  part(
    "Card USB (JST PH 4)",
    CARD_USB_PART.footprint,
    CARD_USB_PART.lcsc,
    CARD_USB_PART.mpn,
  );
const cap10u = (): Part =>
  part("10uF 25V", "C0805", "C15850", "CL21A106KAYNNNE");

/**
 * Parts added since rev D: the USB hub U8 with its crystal and capacitors,
 * the regulator U9 for the card's VBUS, and the two sockets J4 and J6 for the
 * card's two internal USB ports.
 */
export const REV_D_ADDED_PARTS: Record<string, Part> = {
  J4: cardSocket(),
  J6: cardSocket(),
  U8: part("CH334P", "QFN16_3X3", "C5373042", "CH334P"),
  Y1: part("12MHz", "XTAL3225", "C9002", "X322512MSB4SI"),
  C34: part("1uF 50V", "C0603", "C15849", "CL10A105KB8NNNC"),
  C35: part("100nF 50V", "C0603", "C14663", "CC0603KRX7R9BB104"),
  C36: cap10u(),
  U9: part("HT7550-1", "SOT89", "C16106", "HT7550-1"),
  // On VBUS1 with C1: the port may carry 10 uF at most.
  C37: part("1uF 50V", "C0603", "C15849", "CL10A105KB8NNNC"),
  C38: cap10u(),
};

/** Nets that rev D does not have. */
export const REV_D_NEW_NETS: string[] = [
  "USB1_DP",
  "USB1_DN",
  "USB2_DP",
  "USB2_DN",
  "HUB_XI",
  "HUB_XO",
  "V5_USB",
];

const pins = (ref: string, nets: Record<number, string | null>): Change[] =>
  Object.entries(nets).map(([pin, to]) => ({
    pad: `${ref}.${pin}`,
    from: null,
    to,
  }));

/** A socket for one of the card's ports, wired by lib/card-usb.ts. */
const socket = (ref: string, dp: string, dn: string): Change[] =>
  pins(ref, {
    [CARD_USB_PINOUT.VBUS]: "USBH_VBUS",
    [CARD_USB_PINOUT.DN]: dn,
    [CARD_USB_PINOUT.DP]: dp,
    [CARD_USB_PINOUT.GND]: "GND",
    // The two fitting nails of the socket hold it down and carry nothing.
    5: null,
    6: null,
  });

/**
 * The USB hub. The card has two internal USB ports (two devices), so J1 no
 * longer goes straight to the card: J1 -> U5 -> U8 (CH334P) upstream, port 1
 * -> J4, port 2 -> J6; ports 3 and 4, RESET# and PGANG stay open. V5 and
 * VDD33 of the hub are both on +3V3 (CH334 datasheet: a hub on a 3.3 V
 * supply). The card's VBUS comes from its own 5 V regulator U9, fed from
 * VBUS1 (the PC's port), through JP3, which used to come from the
 * microcontroller's +5V.
 */
const HUB_CHANGES: Change[] = [
  { pad: "JP3.1", from: "+5V", to: "V5_USB" },
  ...socket("J4", "USB1_DP", "USB1_DN"),
  ...socket("J6", "USB2_DP", "USB2_DN"),
  ...pins("U8", {
    1: "HUB_XO",
    2: "HUB_XI",
    3: null,
    4: null,
    5: null,
    6: null,
    7: "USB2_DN",
    8: "USB2_DP",
    9: "USB1_DN",
    10: "USB1_DP",
    11: "USB_DN",
    12: "USB_DP",
    13: null,
    14: null,
    15: "+3V3",
    16: "+3V3",
    17: "GND",
  }),
  ...pins("Y1", { 1: "HUB_XI", 2: "GND", 3: "HUB_XO", 4: "GND" }),
  ...pins("C34", { 1: "+3V3", 2: "GND" }),
  ...pins("C35", { 1: "+3V3", 2: "GND" }),
  ...pins("C36", { 1: "+3V3", 2: "GND" }),
  ...pins("U9", { 1: "GND", 2: "VBUS1", 3: "V5_USB" }),
  ...pins("C37", { 1: "VBUS1", 2: "GND" }),
  ...pins("C38", { 1: "V5_USB", 2: "GND" }),
];

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
  ...HUB_CHANGES,
];

/**
 * The fixture with the changes applied. Throws when a change does not fit
 * the fixture: a pad that is not where it says, a net that exists in neither
 * the fixture nor `newNets`, a new pad of a part that `added` lacks, or a
 * net left without pads.
 */
export const applyChanges = (
  fixture: Fixture,
  changes: Change[],
  added: Record<string, Part> = {},
  newNets: string[] = [],
  removed: string[] = [],
): Fixture => {
  const gone = (pad: string) => removed.includes(pad.split(".")[0] ?? "");
  for (const ref of removed)
    if (!fixture.components[ref])
      throw new Error(`${ref} is not a part of the reference`);
  const nets = Object.fromEntries(
    Object.entries(fixture.nets)
      .map(([name, pads]) => [name, pads.filter((q) => !gone(q))] as const)
      // A net of removed pads only goes with them.
      .filter(([name, pads]) => pads.length > 0 || !fixture.nets[name]?.length)
      .map(([name, pads]) => [name, [...pads]]),
  );
  const kept = Object.fromEntries(
    Object.entries(fixture.components).filter(
      ([ref]) => !removed.includes(ref),
    ),
  );
  for (const name of newNets) {
    if (nets[name])
      throw new Error(`${name} is already a net of the reference`);
    nets[name] = [];
  }
  const components = { ...kept, ...added };
  for (const { pad, from, to } of changes) {
    const ref = pad.split(".")[0] ?? "";
    if (from === null) {
      if (!added[ref]) throw new Error(`${pad}: ${ref} is not an added part`);
      if (Object.values(nets).some((n) => n.includes(pad)))
        throw new Error(`${pad} is already in the reference`);
    } else {
      const source = nets[from];
      if (!source?.includes(pad))
        throw new Error(`${pad} is not on ${from} in the reference`);
      nets[from] = source.filter((q) => q !== pad);
    }
    if (to === null) nets[`unconnected:${pad}`] = [pad];
    else {
      const target = nets[to];
      if (!target) throw new Error(`${to} is not a net of the reference`);
      target.push(pad);
    }
  }
  for (const [name, pads] of Object.entries(nets))
    if (pads.length === 0) throw new Error(`${name} is left without pads`);
  return { ...fixture, components, nets };
};

export const loadFixture = async (
  path = "fixtures/rev-d-netlist.json",
): Promise<Netlist> =>
  fixtureNetlist(
    applyChanges(
      (await Bun.file(path).json()) as Fixture,
      REV_D_CHANGES,
      REV_D_ADDED_PARTS,
      REV_D_NEW_NETS,
      REV_D_REMOVED_PARTS,
    ),
  );
