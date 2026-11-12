// The parts of the board as typed components. Each part type knows its land
// pattern, manufacturer part number and LCSC number, and names its pins, so a
// block only says which net each pin goes to. Every pin has to be listed:
// leaving one out, or naming a net that does not exist, is a type error.
// Pins left open on purpose are wired to NC.
import type { JSX } from "react";
import { footprintOf } from "./Footprint";
import { cadModelOf } from "./cad";
import { CARD_USB_PART, CARD_USB_PIN_NAMES } from "./card-usb";
import * as fp from "./footprints";
import type { FootprintDef } from "./footprints";
import { type Conn, NC, type Net } from "./nets";
import { positionOf } from "./placement";

interface PartInfo {
  footprint: FootprintDef;
  /**
   * Pins by name that the part draws its supply from (power) and that are
   * its ground. Given for the ICs, so that tscircuit knows their pins.
   */
  supply?: { power: string[]; ground: string[] };
  /** Manufacturer part number. */
  mpn?: string;
  /** LCSC number. Parts without one are not assembled. */
  lcsc?: string;
}

// Fitted parts also get their 3D model (lib/cad.ts); bare footprints have none.
const sourcing = (info: PartInfo) =>
  info.lcsc
    ? {
        manufacturerPartNumber: info.mpn,
        supplierPartNumbers: { jlcpcb: [info.lcsc] },
        cadModel: cadModelOf(info.footprint),
      }
    : { doNotPlace: true };

const Wire = ({
  part,
  port,
  net,
}: {
  part: string;
  port: string;
  net: Net;
}) => (
  <trace
    // "wire_" keeps the name apart from nets such as Q1_G (part Q1, port G).
    name={`wire_${part}_${port}`}
    from={`.${part} > .${port}`}
    to={`net.${net}`}
  />
);

const wires = (part: string, nets: Record<string, Conn>) =>
  Object.entries(nets).flatMap(([port, net]) =>
    net === null
      ? []
      : [<Wire key={`${part}_${port}`} part={part} port={port} net={net} />],
  );

// --- Passives -------------------------------------------------------------

interface TwoPinProps {
  name: string;
  /** Nets of pad 1 and pad 2. */
  nets: [Net, Net];
}

const RESISTORS = {
  "1k": { footprint: fp.R0603, lcsc: "C21190", mpn: "0603WAF1001T5E" },
  "5.1k": { footprint: fp.R0603, lcsc: "C23186", mpn: "0603WAF5101T5E" },
  "6.8k": { footprint: fp.R0603, lcsc: "C23212", mpn: "0603WAF6801T5E" },
  "10k": { footprint: fp.R0603, lcsc: "C25804", mpn: "0603WAF1002T5E" },
  "15k": { footprint: fp.R0603, lcsc: "C22809", mpn: "0603WAF1502T5E" },
  "33k": { footprint: fp.R0603, lcsc: "C4216", mpn: "0603WAF3302T5E" },
  "47k": { footprint: fp.R0603, lcsc: "C25819", mpn: "0603WAF4702T5E" },
  "68k": { footprint: fp.R0603, lcsc: "C23231", mpn: "0603WAF6802T5E" },
  "100k": { footprint: fp.R0603, lcsc: "C25803", mpn: "0603WAF1003T5E" },
  "150k": { footprint: fp.R0603, lcsc: "C22807", mpn: "0603WAF1503T5E" },
  "1M": { footprint: fp.R0603, lcsc: "C22935", mpn: "0603WAF1004T5E" },
} satisfies Record<string, PartInfo>;

/** 1 % 0603 resistor. */
export const R = ({
  name,
  value,
  nets,
}: TwoPinProps & { value: keyof typeof RESISTORS }) => {
  const info = RESISTORS[value];
  return (
    <>
      <resistor
        name={name}
        resistance={value}
        footprint={footprintOf(info.footprint)}
        {...sourcing(info)}
        {...positionOf(name)}
      />
      {wires(name, { pin1: nets[0], pin2: nets[1] })}
    </>
  );
};

const BLEEDER: PartInfo = {
  footprint: fp.R0805,
  lcsc: "C17513",
  mpn: "0805W8F1001T5E",
};

/** 1 k 0805 (125 mW) resistor of the VBUS bleeders. */
export const RBleed = ({ name, nets }: TwoPinProps) => (
  <>
    <resistor
      name={name}
      resistance="1k"
      footprint={footprintOf(BLEEDER.footprint)}
      {...sourcing(BLEEDER)}
      {...positionOf(name)}
    />
    {wires(name, { pin1: nets[0], pin2: nets[1] })}
  </>
);

const CAPACITORS = {
  "33nF": {
    footprint: fp.C0603,
    lcsc: "C21117",
    mpn: "CL10B333KB8NNNC",
    volts: 50,
  },
  "100nF": {
    footprint: fp.C0603,
    lcsc: "C14663",
    mpn: "CC0603KRX7R9BB104",
    volts: 50,
  },
  "1uF": {
    footprint: fp.C0603,
    lcsc: "C15849",
    mpn: "CL10A105KB8NNNC",
    volts: 50,
  },
  "10uF": {
    footprint: fp.C0805,
    lcsc: "C15850",
    mpn: "CL21A106KAYNNNE",
    volts: 25,
  },
  "22uF": {
    footprint: fp.C0805,
    lcsc: "C45783",
    mpn: "CL21A226MAQNNNE",
    volts: 25,
  },
} satisfies Record<string, PartInfo & { volts: number }>;

/** MLCC. */
export const C = ({
  name,
  value,
  nets,
}: TwoPinProps & { value: keyof typeof CAPACITORS }) => {
  const info = CAPACITORS[value];
  return (
    <>
      <capacitor
        name={name}
        capacitance={value}
        maxVoltageRating={info.volts}
        footprint={footprintOf(info.footprint)}
        {...sourcing(info)}
        {...positionOf(name)}
      />
      {wires(name, { pin1: nets[0], pin2: nets[1] })}
    </>
  );
};

const INDUCTOR: PartInfo = {
  footprint: fp.IND_FXL0630,
  lcsc: "C167220",
  mpn: "FXL0630-4R7-M",
};

/** 4.7 uH FXL0630. */
export const L = ({ name, nets }: TwoPinProps) => (
  <>
    <inductor
      name={name}
      inductance="4.7uH"
      footprint={footprintOf(INDUCTOR.footprint)}
      {...sourcing(INDUCTOR)}
      {...positionOf(name)}
    />
    {wires(name, { pin1: nets[0], pin2: nets[1] })}
  </>
);

// --- Everything else ------------------------------------------------------

type ChipProps = JSX.IntrinsicElements["chip"];

/** The <chip> of a part: land pattern, supply pins, sourcing and position. */
const Body = ({ info, ...props }: ChipProps & { info: PartInfo }) => (
  <chip
    {...props}
    footprint={footprintOf(info.footprint)}
    {...(info.supply && {
      pinAttributes: Object.fromEntries([
        ...info.supply.power.map((pin) => [pin, { requiresPower: true }]),
        ...info.supply.ground.map((pin) => [pin, { requiresGround: true }]),
      ]),
    })}
    {...sourcing(info)}
    {...positionOf(props.name)}
  />
);

type PinNets<Pins extends readonly string[]> = { [K in Pins[number]]: Conn };

/**
 * A part whose pads are numbered 1..n. `pins[i]` is the name of pad i + 1.
 */
const numbered =
  <const Pins extends readonly string[]>(info: PartInfo, pins: Pins) =>
  ({ name, nets }: { name: string; nets: PinNets<Pins> }) => (
    <>
      <Body
        info={info}
        name={name}
        pinLabels={Object.fromEntries(
          pins.flatMap((label, i) =>
            label === `pin${i + 1}` ? [] : [[`pin${i + 1}`, label]],
          ),
        )}
      />
      {wires(name, nets)}
    </>
  );

/** Pad names of a land pattern, in footprint order. */
const padsOf = (def: FootprintDef): string[] => [
  ...def.pads.map((p) => p.pin),
  ...(def.platedHoles ?? []).map((h) => h.pin),
];

/**
 * pinLabels that give pin1..pinN the names in `labels` (pad i + 1 first).
 * schPinArrangement only resolves pin numbers and pinLabels, not the pad
 * names of a hand-made footprint (tscircuit 0.0.3161), so named pads (A5)
 * have to be named this way to be placed.
 */
const labelsOf = (labels: readonly (string | string[])[]) =>
  Object.fromEntries(labels.map((label, i) => [`pin${i + 1}`, label]));

/**
 * A connector, drawn in the schematic as one column of pins (like KiCad's
 * Conn_01xNN) instead of an IC box with pins on two sides. `labels[i]` is
 * the name of pad i + 1. The pins are drawn in the order the block lists them
 * in `nets`; pads it does not list are not drawn (they stay in the footprint
 * and the netlist, unconnected).
 *
 * Not `standard="jst_ph"` for the PH sockets: tscircuit 0.0.3161 draws pin 1
 * at the bottom with it. KiCad's export gives a <connector> the refdes as its
 * Value (no MPN); the BOM and CPL come from circuit.json and are not affected.
 */
const connectorPart =
  <const Labels extends readonly string[]>(
    info: PartInfo,
    labels: Labels,
    offBoard = false,
  ) =>
  ({ name, nets }: { name: string; nets: Partial<PinNets<Labels>> }) => (
    <>
      <connector
        name={name}
        footprint={footprintOf(info.footprint)}
        pinLabels={labelsOf(labels)}
        schPinArrangement={{
          leftSide: { direction: "top-to-bottom", pins: Object.keys(nets) },
        }}
        {...sourcing(info)}
        {...positionOf(name)}
        allowOffBoard={offBoard}
      />
      {wires(name, nets as Record<string, Conn>)}
    </>
  );

/**
 * USB-C receptacle. Pads have names (A5, B12). `usbC` maps them to the pin
 * names tscircuit's usb_c standard knows (CC1, SHELL1); each pin carries
 * both names, so blocks keep using the pad names.
 */
const usbCPart =
  <const Pads extends readonly string[]>(
    info: PartInfo,
    _pads: Pads,
    usbC: Record<Pads[number], string>,
  ) =>
  ({ name, nets }: { name: string; nets: PinNets<Pads> }) => (
    <>
      <connector
        name={name}
        // With an explicit footprint the standard only changes the schematic:
        // a USB-C symbol in the box, signals on the right, shell at the bottom.
        standard="usb_c"
        footprint={footprintOf(info.footprint)}
        pinLabels={labelsOf(
          padsOf(info.footprint).map((pad) => [
            pad,
            usbC[pad as Pads[number]] ?? pad,
          ]),
        )}
        {...sourcing(info)}
        {...positionOf(name)}
        // The receptacle overhangs the board edge on purpose.
        allowOffBoard
      />
      {wires(name, nets)}
    </>
  );

/** USB PD sink controller. Pin 11 is the exposed pad. */
export const CH224A = numbered(
  {
    footprint: fp.ESSOP10,
    lcsc: "C42459160",
    mpn: "CH224A",
    supply: { power: ["VHV"], ground: ["EP"] },
  },
  ["VHV", "SCL", "SDA", "DP", "DM", "CC2", "CC1", "VBUS", "CFG1", "PG", "EP"],
);

/** 3 A buck converter. */
export const TPS62933 = numbered(
  {
    footprint: fp.SOT583,
    lcsc: "C3200405",
    mpn: "TPS62933DRLR",
    supply: { power: ["VIN"], ground: ["GND"] },
  },
  ["RT", "EN", "VIN", "GND", "SW", "BST", "SS", "FB"],
);

/** Boost converter. */
export const MT3608B = numbered(
  {
    footprint: fp.SOT23_6_MT3608B,
    lcsc: "C19189893",
    mpn: "MT3608B",
    supply: { power: ["VIN"], ground: ["GND"] },
  },
  ["SW", "GND", "FB", "EN", "VIN", "NC"],
);

/** ESD array for the USB data lines. */
export const SRV05 = numbered(
  {
    footprint: fp.SOT23_6_SRV05,
    lcsc: "C85364",
    mpn: "SRV05-4-P-T7",
    supply: { power: [], ground: ["GND"] },
  },
  ["IO1", "GND", "IO2", "IO3", "REF", "IO4"],
);

/** USB 2.0 hub, four ports (two used). Pin 17 is the exposed pad. */
export const CH334P = numbered(
  {
    footprint: fp.QFN16_3X3,
    lcsc: "C5373042",
    mpn: "CH334P",
    supply: { power: ["V5", "VDD33"], ground: ["EP"] },
  },
  [
    "XO",
    "XI",
    "DM4",
    "DP4",
    "DM3",
    "DP3",
    "DM2",
    "DP2",
    "DM1",
    "DP1",
    "DMU",
    "DPU",
    "RESET",
    "PGANG",
    "V5",
    "VDD33",
    "EP",
  ],
);

/** 12 MHz crystal of the hub. Pins 2 and 4 are the lid (ground). */
export const Crystal12M = numbered(
  // 12 pF load: the hub has about 16 pF on each pin inside (in series
  // about 8 pF, plus the board's stray capacitance).
  { footprint: fp.XTAL3225, lcsc: "C70565", mpn: "X322512MOB4SI" },
  ["X1", "GND", "X2", "GND2"],
);

/** 5 V LDO (the microcontroller's, and the card's USB VBUS). */
export const HT7550 = numbered(
  {
    footprint: fp.SOT89,
    lcsc: "C16106",
    mpn: "HT7550-1",
    supply: { power: ["VIN"], ground: ["GND"] },
  },
  ["GND", "VIN", "VOUT"],
);

/** Microcontroller, TSSOP-20. */
export const CH32V003 = numbered(
  {
    footprint: fp.TSSOP20,
    lcsc: "C5187096",
    mpn: "CH32V003F4P6",
    supply: { power: ["VDD"], ground: ["VSS"] },
  },
  [
    "PD4",
    "PD5",
    "PD6",
    "PD7",
    "PA1",
    "PA2",
    "VSS",
    "PD0",
    "VDD",
    "PC0",
    "PC1",
    "PC2",
    "PC3",
    "PC4",
    "PC5",
    "PC6",
    "PC7",
    "PD1",
    "PD2",
    "PD3",
  ],
);

/** P-channel MOSFET of the 12 V output switch. */
export const AO3401A = numbered(
  { footprint: fp.SOT23_AO3401A, lcsc: "C15127", mpn: "AO3401A" },
  ["G", "S", "D"],
);

/** N-channel MOSFET. */
export const N2N7002 = numbered(
  { footprint: fp.SOT23, lcsc: "C8545", mpn: "2N7002" },
  ["G", "S", "D"],
);

/** NPN transistor. */
export const MMBT3904 = numbered(
  { footprint: fp.SOT23, lcsc: "C20526", mpn: "MMBT3904" },
  ["B", "E", "C"],
);

/** 5 A Schottky. Pad 1 is the anode. */
export const SS54 = numbered(
  { footprint: fp.SMA_SS54, lcsc: "C22452", mpn: "SS54" },
  ["A", "K"],
);

/** 3 A Schottky. Pad 1 is the cathode. */
export const SS34 = numbered(
  { footprint: fp.SMA_SS34, lcsc: "C8678", mpn: "SS34" },
  ["K", "A"],
);

/** Switching diode. Pad 1 is the cathode. */
export const D1N4148W = numbered(
  { footprint: fp.SOD123F, lcsc: "C81598", mpn: "1N4148W" },
  ["K", "A"],
);

/** 12 V 2 % Zener. Pad 1 is the cathode. */
export const BZT52B12 = numbered(
  { footprint: fp.SOD123, lcsc: "C22395569", mpn: "BZT52B12" },
  ["K", "A"],
);

/** Red 0603 LED. Pad 1 is the anode. */
export const LedRed = numbered(
  { footprint: fp.LED0603, lcsc: "C2286", mpn: "KT-0603R" },
  ["A", "K"],
);

/** Resettable fuse, 1.1 A hold. */
export const Ptc = numbered(
  { footprint: fp.F1206, lcsc: "C7542961", mpn: "1206L110/16NR" },
  ["pin1", "pin2"],
);

/** Resettable fuse, 0.1 A hold, 0.3 A trip, 24 V (the card's USB VBUS). */
export const PtcSmall = numbered(
  { footprint: fp.F0603, lcsc: "C70048", mpn: "SMD0603-010-24V" },
  ["pin1", "pin2"],
);

/** USB-C receptacle. SH1..SH4 are the shell legs (pads 1..4 of the KiCad footprint). */
export const UsbC = usbCPart(
  { footprint: fp.USBC_TYPE_C_31_M_12, lcsc: "C165948", mpn: "TYPE-C-31-M-12" },
  [
    "A1B12",
    "A4B9",
    "B8",
    "A5",
    "B7",
    "A6",
    "A7",
    "B6",
    "A8",
    "B5",
    "B4A9",
    "B1A12",
    "SH1",
    "SH2",
    "SH3",
    "SH4",
  ],
  {
    A1B12: "GND1",
    B1A12: "GND2",
    A4B9: "VBUS1",
    B4A9: "VBUS2",
    A5: "CC1",
    B5: "CC2",
    A6: "DP1",
    B6: "DP2",
    A7: "DM1",
    B7: "DM2",
    A8: "SBU1",
    B8: "SBU2",
    SH1: "SHELL1",
    SH2: "SHELL2",
    SH3: "SHELL3",
    SH4: "SHELL4",
  },
);

type PciePad = `${"A" | "B"}${number}`;

/** PCIe x1 slot, straddle mount. Only the pads that are wired are listed; the rest stay open. */
export const PcieSlot = ({
  name,
  nets,
}: {
  name: string;
  nets: Partial<Record<PciePad, Net>>;
}) => {
  const info: PartInfo = {
    footprint: fp.PCIE_X1_STRADDLE,
    lcsc: "C21263091",
    mpn: "X1613WS-36D-9TV01",
  };
  // The slot straddles the board edge.
  const Part = connectorPart(info, padsOf(info.footprint), true);
  return <Part name={name} nets={nets} />;
};

/**
 * Socket for one of the card's internal USB cables (JST PH, 4 pins). Which
 * pad carries what comes from lib/card-usb.ts; the two fitting nails (pads 5
 * and 6) are left open.
 */
const PhSocket = connectorPart(
  {
    footprint: fp[CARD_USB_PART.footprint],
    lcsc: CARD_USB_PART.lcsc,
    mpn: CARD_USB_PART.mpn,
  },
  [...CARD_USB_PIN_NAMES, "MP1", "MP2"] as const,
);

export const CardUsbSocket = ({
  name,
  dp,
  dn,
}: {
  name: string;
  dp: Net;
  dn: Net;
}) => {
  const nets: Record<(typeof CARD_USB_PIN_NAMES)[number], Net> = {
    VBUS: "CARD_VBUS",
    DN: dn,
    DP: dp,
    GND: "GND",
  };
  // One column in pad order (pad 1 at the top), then the fitting nails.
  return (
    <PhSocket
      name={name}
      nets={{
        ...Object.fromEntries(CARD_USB_PIN_NAMES.map((s) => [s, nets[s]])),
        MP1: NC,
        MP2: NC,
      }}
    />
  );
};

/** 1x2 header, holes only (not assembled). */
export const Header2 = numbered({ footprint: fp.HEADER_1X2 }, ["pin1", "pin2"]);

/** Solder jumper, copper only. */
export const SolderJumper = numbered({ footprint: fp.SOLDER_JUMPER }, [
  "pin1",
  "pin2",
]);

/**
 * Solder jumper that is closed as made: a copper bridge joins the pads, and
 * the two pins are one net for tscircuit, KiCad and the checks. Cutting the
 * bridge opens it; nothing needs soldering.
 */
export const ClosedJumper = ({
  name,
  nets,
}: {
  name: string;
  /** The net on each side, as in rev D. Both become the net of pin 1. */
  nets: { pin1: Net; pin2: Net };
}) => (
  <>
    <chip
      name={name}
      footprint={footprintOf(fp.SOLDER_JUMPER_CLOSED)}
      internallyConnectedPins={fp.SOLDER_JUMPER_CLOSED.tiedPins?.map((g) =>
        g.map((pin) => `pin${pin}`),
      )}
      doNotPlace
      {...positionOf(name)}
    />
    {wires(name, nets)}
  </>
);

/** Test point, copper only. */
export const TestPoint = numbered({ footprint: fp.TESTPOINT_1V5 }, ["pin1"]);
