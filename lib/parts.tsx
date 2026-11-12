// The parts of the board as typed components. Each part type knows its land
// pattern, manufacturer part number and LCSC number, and names its pins, so a
// block only says which net each pin goes to. Every pin has to be listed:
// leaving one out, or naming a net that does not exist, is a type error.
// Pins left open on purpose are wired to NC.
import { footprintOf } from "./Footprint";
import * as fp from "./footprints";
import type { FootprintDef } from "./footprints";
import type { Conn, Net } from "./nets";
import { positionOf } from "./placement";

interface PartInfo {
  footprint: FootprintDef;
  /** Manufacturer part number. */
  mpn?: string;
  /** LCSC number. Parts without one are not assembled. */
  lcsc?: string;
}

const sourcing = (info: PartInfo) =>
  info.lcsc
    ? {
        manufacturerPartNumber: info.mpn,
        supplierPartNumbers: { jlcpcb: [info.lcsc] },
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
    name={`${part}_${port}`}
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

type PinNets<Pins extends readonly string[]> = { [K in Pins[number]]: Conn };

/**
 * A part whose pads are numbered 1..n. `pins[i]` is the name of pad i + 1.
 */
const numbered =
  <const Pins extends readonly string[]>(info: PartInfo, pins: Pins) =>
  ({ name, nets }: { name: string; nets: PinNets<Pins> }) => (
    <>
      <chip
        name={name}
        footprint={footprintOf(info.footprint)}
        pinLabels={Object.fromEntries(
          pins.flatMap((label, i) =>
            label === `pin${i + 1}` ? [] : [[`pin${i + 1}`, label]],
          ),
        )}
        {...sourcing(info)}
        {...positionOf(name)}
      />
      {wires(name, nets)}
    </>
  );

/**
 * A part whose pads have names (A5, B12) rather than numbers. `pads` lists
 * them; pads named by a number n are reached as `pin${n}`.
 */
const named =
  <const Pads extends readonly string[]>(info: PartInfo, _pads: Pads) =>
  ({ name, nets }: { name: string; nets: PinNets<Pads> }) => (
    <>
      <chip
        name={name}
        footprint={footprintOf(info.footprint)}
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
  { footprint: fp.ESSOP10, lcsc: "C42459160", mpn: "CH224A" },
  ["VHV", "SCL", "SDA", "DP", "DM", "CC2", "CC1", "VBUS", "CFG1", "PG", "EP"],
);

/** 3 A buck converter. */
export const TPS62933 = numbered(
  { footprint: fp.SOT583, lcsc: "C3200405", mpn: "TPS62933DRLR" },
  ["RT", "EN", "VIN", "GND", "SW", "BST", "SS", "FB"],
);

/** Boost converter. */
export const MT3608B = numbered(
  { footprint: fp.SOT23_6_MT3608B, lcsc: "C19189893", mpn: "MT3608B" },
  ["SW", "GND", "FB", "EN", "VIN", "NC"],
);

/** ESD array for the USB data lines. */
export const SRV05 = numbered(
  { footprint: fp.SOT23_6_SRV05, lcsc: "C85364", mpn: "SRV05-4-P-T7" },
  ["IO1", "GND", "IO2", "IO3", "REF", "IO4"],
);

/** 5 V LDO for the microcontroller. */
export const HT7550 = numbered(
  { footprint: fp.SOT89, lcsc: "C16106", mpn: "HT7550-1" },
  ["GND", "VIN", "VOUT"],
);

/** Microcontroller, TSSOP-20. */
export const CH32V003 = numbered(
  { footprint: fp.TSSOP20, lcsc: "C5187096", mpn: "CH32V003F4P6" },
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

/** USB-C receptacle. SH1..SH4 are the shell legs (pads 1..4 of the KiCad footprint). */
export const UsbC = named(
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
  return (
    <>
      <chip
        name={name}
        footprint={footprintOf(info.footprint)}
        {...sourcing(info)}
        {...positionOf(name)}
        // The slot straddles the board edge.
        allowOffBoard
      />
      {wires(name, nets as Record<string, Conn>)}
    </>
  );
};

/** Right-angle 2x5 header for the card's internal USB cable. */
export const UsbHeader = numbered(
  {
    footprint: fp.HEADER_2X5_RIGHT_ANGLE,
    lcsc: "C492433",
    mpn: "PZ254R-12-10P",
  },
  ["VBUS", "VBUS2", "DN", "D2N", "DP", "D2P", "GND", "GND2", "KEY", "NC"],
);

/** 1x2 header, holes only (not assembled). */
export const Header2 = numbered({ footprint: fp.HEADER_1X2 }, ["pin1", "pin2"]);

/** Solder jumper, copper only. */
export const SolderJumper = numbered({ footprint: fp.SOLDER_JUMPER }, [
  "pin1",
  "pin2",
]);

/** Test point, copper only. */
export const TestPoint = numbered({ footprint: fp.TESTPOINT_1V5 }, ["pin1"]);
