// The circuit of rev D, one component per block. Part numbers, values and
// connections are those of the rev D KiCad schematic; netlist.test.ts checks
// that the built circuit connects exactly the same pads.
// docs/design.md explains the values.
import { NC, type Net } from "./nets";
import {
  AO3401A,
  BZT52B12,
  C,
  CH224A,
  CH334P,
  CardUsbSocket,
  Crystal12M,
  CH32V003,
  D1N4148W,
  HT7550,
  Header2,
  L,
  LedRed,
  MMBT3904,
  MT3608B,
  N2N7002,
  PcieSlot,
  Ptc,
  PtcSmall,
  R,
  RBleed,
  SRV05,
  SS34,
  SS54,
  ClosedJumper,
  SolderJumper,
  TPS62933,
  TestPoint,
  UsbC,
} from "./parts";

/**
 * J1: the port to the PC. Carries USB data and asks for 9 V over PD.
 * The CC lines also go to the microcontroller through 100 k so the firmware
 * can tell what is plugged in.
 */
export const PdPortPc = () => (
  <>
    <UsbC
      name="J1"
      nets={{
        A1B12: "GND",
        B1A12: "GND",
        A4B9: "VBUS1",
        B4A9: "VBUS1",
        A5: "J1_CC1",
        B5: "J1_CC2",
        A6: "USB_DP",
        B6: "USB_DP",
        A7: "USB_DN",
        B7: "USB_DN",
        A8: NC,
        B8: NC,
        SH1: "SHIELD1",
        SH2: "SHIELD1",
        SH3: "SHIELD1",
        SH4: "SHIELD1",
      }}
    />
    {/* The shell goes to GND through 1 M and 100 nF, not directly. */}
    <R name="R3" value="1M" nets={["SHIELD1", "GND"]} />
    <C name="C2" value="100nF" nets={["SHIELD1", "GND"]} />
    {/* The IC treats its two CC pins alike; they are swapped so the traces do not cross. */}
    <CH224A
      name="U1"
      nets={{
        VHV: "VBUS1",
        VBUS: "VBUS1",
        SCL: "I2C1_SCL",
        SDA: "I2C1_SDA",
        DP: NC,
        DM: NC,
        CC2: "J1_CC1",
        CC1: "J1_CC2",
        CFG1: "CFG1_U1",
        PG: NC,
        EP: "GND",
      }}
    />
    <C name="C1" value="1uF" nets={["VBUS1", "GND"]} />
    {/* 6.8 k on CFG1 selects 9 V. */}
    <R name="R1" value="6.8k" nets={["CFG1_U1", "GND"]} />
    {/* Bleeder, 1 k in total: two in series, twice. */}
    <RBleed name="R28" nets={["VBUS1", "BLD1"]} />
    <RBleed name="R39" nets={["VBUS1", "BLD1"]} />
    <RBleed name="R29" nets={["BLD1", "GND"]} />
    <RBleed name="R40" nets={["BLD1", "GND"]} />
    <R name="R21" value="100k" nets={["J1_CC1", "CC1_SENSE"]} />
    <C name="C23" value="100nF" nets={["CC1_SENSE", "GND"]} />
    <R name="R22" value="100k" nets={["J1_CC2", "CC2_SENSE"]} />
    <C name="C24" value="100nF" nets={["CC2_SENSE", "GND"]} />
  </>
);

/** J2: the charger port. Power only; the data pins stay open. */
export const PdPortCharger = () => (
  <>
    <UsbC
      name="J2"
      nets={{
        A1B12: "GND",
        B1A12: "GND",
        A4B9: "VBUS2",
        B4A9: "VBUS2",
        A5: "J2_CC1",
        B5: "J2_CC2",
        A6: NC,
        B6: NC,
        A7: NC,
        B7: NC,
        A8: NC,
        B8: NC,
        SH1: "GND",
        SH2: "GND",
        SH3: "GND",
        SH4: "GND",
      }}
    />
    <CH224A
      name="U2"
      nets={{
        VHV: "VBUS2",
        VBUS: "VBUS2",
        SCL: "I2C2_SCL",
        SDA: "I2C2_SDA",
        DP: NC,
        DM: NC,
        CC2: "J2_CC1",
        CC1: "J2_CC2",
        CFG1: "CFG1_U2",
        PG: NC,
        EP: "GND",
      }}
    />
    <C name="C3" value="1uF" nets={["VBUS2", "GND"]} />
    <R name="R4" value="6.8k" nets={["CFG1_U2", "GND"]} />
    <RBleed name="R30" nets={["VBUS2", "BLD2"]} />
    <RBleed name="R41" nets={["VBUS2", "BLD2"]} />
    <RBleed name="R31" nets={["BLD2", "GND"]} />
    <RBleed name="R42" nets={["BLD2", "GND"]} />
  </>
);

/** The two ports are OR-ed into VIN by one Schottky each. */
export const InputMerge = () => (
  <>
    <SS54 name="D1" nets={{ A: "VBUS1", K: "VIN" }} />
    <SS54 name="D2" nets={{ A: "VBUS2", K: "VIN" }} />
    <C name="C4" value="22uF" nets={["VIN", "GND"]} />
    <C name="C5" value="22uF" nets={["VIN", "GND"]} />
    <C name="C6" value="10uF" nets={["VIN", "GND"]} />
    <TestPoint name="TP1" nets={{ pin1: "VIN" }} />
  </>
);

/**
 * VIN -> 3.3 V, 3 A. Enabled by VBUS1 through a divider, so it only runs
 * while the PC port has power; the microcontroller can pull EN low.
 */
export const Buck3V3 = () => (
  <>
    <TPS62933
      name="U3"
      nets={{
        RT: NC,
        EN: "EN_3V3",
        VIN: "VIN",
        GND: "GND",
        SW: "SW_3V3",
        BST: "BST_3V3",
        SS: "SS_3V3",
        FB: "FB_3V3",
      }}
    />
    <C name="C8" value="10uF" nets={["VIN", "GND"]} />
    <C name="C9" value="10uF" nets={["VIN", "GND"]} />
    <C name="C10" value="100nF" nets={["VIN", "GND"]} />
    <C name="C11" value="100nF" nets={["BST_3V3", "SW_3V3"]} />
    <C name="C12" value="100nF" nets={["SS_3V3", "GND"]} />
    <L name="L1" nets={["SW_3V3", "V3V3_BUCK"]} />
    <C name="C13" value="22uF" nets={["V3V3_BUCK", "GND"]} />
    <C name="C14" value="22uF" nets={["V3V3_BUCK", "GND"]} />
    {/* 0.8 V x (1 + 47k / 15k) = 3.31 V */}
    <R name="R6" value="47k" nets={["V3V3_BUCK", "FB_3V3"]} />
    <R name="R7" value="15k" nets={["FB_3V3", "GND"]} />
    {/* EN divider from VBUS1, clamped to +5 V by D5. */}
    <R name="R8" value="100k" nets={["VBUS1", "EN_3V3"]} />
    <R name="R9" value="68k" nets={["EN_3V3", "GND"]} />
    <C name="C15" value="1uF" nets={["EN_3V3", "GND"]} />
    <D1N4148W name="D5" nets={{ K: "V5", A: "EN_3V3" }} />
    <R name="R38" value="1k" nets={["EN_MCU", "EN_3V3"]} />
    {/* JP1 (header, for measuring current) and JP5 (closed solder jumper) are in parallel. */}
    <Header2 name="JP1" nets={{ pin1: "V3V3_BUCK", pin2: "V3V3" }} />
    <ClosedJumper name="JP5" nets={{ pin1: "V3V3_BUCK", pin2: "V3V3" }} />
    <C name="C27" value="22uF" nets={["V3V3", "GND"]} />
    <C name="C28" value="100nF" nets={["V3V3", "GND"]} />
    <TestPoint name="TP2" nets={{ pin1: "V3V3" }} />
    <R name="R10" value="1k" nets={["V3V3", "LED3_A"]} />
    <LedRed name="LED3" nets={{ A: "LED3_A", K: "GND" }} />
  </>
);

/** VIN -> 12 V, 0.5 A. Off until the microcontroller raises EN. */
export const Boost12V = () => (
  <>
    <MT3608B
      name="U4"
      nets={{
        SW: "SW_12V",
        GND: "GND",
        FB: "FB_12V",
        EN: "EN_12V",
        VIN: "VIN",
        NC: NC,
      }}
    />
    <C name="C16" value="22uF" nets={["VIN", "GND"]} />
    <C name="C17" value="100nF" nets={["VIN", "GND"]} />
    <L name="L2" nets={["VIN", "SW_12V"]} />
    <SS34 name="D4" nets={{ K: "V12_BOOST", A: "SW_12V" }} />
    <C name="C18" value="22uF" nets={["V12_BOOST", "GND"]} />
    <C name="C19" value="22uF" nets={["V12_BOOST", "GND"]} />
    {/* 0.6 V x (1 + 100k / 5.1k) = 12.36 V */}
    <R name="R11" value="100k" nets={["V12_BOOST", "FB_12V"]} />
    <R name="R12" value="5.1k" nets={["FB_12V", "GND"]} />
    <R name="R13" value="100k" nets={["EN_12V", "GND"]} />
  </>
);

/**
 * High-side switch for 12 V (a boost converter passes its input through even
 * when it is off), the PTC, and the over-voltage cut-off that keeps the
 * switch open when VIN is above about 13 V.
 */
export const Switch12V = () => (
  <>
    <AO3401A name="Q1" nets={{ G: "Q1_G", S: "V12_BOOST", D: "V12_SW" }} />
    <R name="R14" value="100k" nets={["Q1_G", "V12_BOOST"]} />
    <C name="C20" value="1uF" nets={["Q1_G", "V12_BOOST"]} />
    <C name="C32" value="33nF" nets={["Q1_G", "V12_SW"]} />
    <R name="R15" value="150k" nets={["Q1_G", "Q2_D"]} />
    {/* Q2 is driven by the microcontroller; Q3 only lets it pull while 3.3 V is up. */}
    <N2N7002 name="Q2" nets={{ G: "Q2_G", S: "Q2_S", D: "Q2_D" }} />
    <N2N7002 name="Q3" nets={{ G: "V3V3", S: "GND", D: "Q2_S" }} />
    <R name="R34" value="10k" nets={["SW12_ON", "Q2_G"]} />
    <R name="R16" value="100k" nets={["Q2_G", "GND"]} />
    {/* Over-voltage: Zener from VIN turns Q4 on, which holds Q2's gate low. */}
    <BZT52B12 name="D7" nets={{ K: "VIN", A: "OVP_Z" }} />
    <R name="R35" value="10k" nets={["OVP_Z", "OVP_B"]} />
    <R name="R36" value="10k" nets={["OVP_B", "GND"]} />
    <MMBT3904 name="Q4" nets={{ B: "OVP_B", E: "GND", C: "Q2_G" }} />
    <Ptc name="F1" nets={{ pin1: "V12_SW", pin2: "V12_F" }} />
    <Header2 name="JP2" nets={{ pin1: "V12_F", pin2: "V12" }} />
    <ClosedJumper name="JP6" nets={{ pin1: "V12_F", pin2: "V12" }} />
    <C name="C29" value="10uF" nets={["V12", "GND"]} />
    <C name="C30" value="100nF" nets={["V12", "GND"]} />
    {/* Pulls the output to 0 V after the switch opens. */}
    <R name="R18" value="10k" nets={["V12", "GND"]} />
    <TestPoint name="TP3" nets={{ pin1: "V12" }} />
  </>
);

const SenseDivider = ({
  top,
  bottom,
  cap,
  from,
  to,
}: {
  top: string;
  bottom: string;
  cap: string;
  from: Net;
  to: Net;
}) => (
  <>
    <R name={top} value="100k" nets={[from, to]} />
    <R name={bottom} value="33k" nets={[to, "GND"]} />
    <C name={cap} value="100nF" nets={[to, "GND"]} />
  </>
);

/** CH32V003 with its 5 V supply, the voltage sense dividers, PERST# and the status LED. */
export const Mcu = () => (
  <>
    <HT7550 name="U6" nets={{ GND: "GND", VIN: "VIN", VOUT: "V5" }} />
    <C name="C7" value="10uF" nets={["V5", "GND"]} />
    <C name="C21" value="100nF" nets={["V5", "GND"]} />
    <C name="C22" value="1uF" nets={["V5", "GND"]} />
    <TestPoint name="TP4" nets={{ pin1: "V5" }} />
    <TestPoint name="TP5" nets={{ pin1: "GND" }} />
    {/*
      Analog inputs that come from the ports are on the ADC pins of the port
      side (PC4 = A2, PD2 = A3, PD3 = A4); the lines to the converters are on
      the side of the VIN band. This differs from rev D (tools/netlist.ts).
    */}
    <CH32V003
      name="U7"
      nets={{
        PD4: "VIN_SENSE",
        PD5: "SW12_ON",
        PD6: "EN_MCU",
        PD7: NC,
        PA1: "EN_12V",
        PA2: "V12_SENSE",
        VSS: "GND",
        PD0: "LED_STAT",
        VDD: "V5",
        PC0: "SW1_IN",
        PC1: "I2C1_SDA",
        PC2: "I2C1_SCL",
        PC3: "PERST_MCU",
        PC4: "CC2_SENSE",
        PC5: "I2C2_SCL",
        PC6: "I2C2_SDA",
        PC7: NC,
        PD1: "SWIO",
        PD2: "CC1_SENSE",
        PD3: "VBUS1_SENSE",
      }}
    />
    <Header2 name="J5" nets={{ pin1: "SWIO", pin2: "GND" }} />
    <SenseDivider top="R23" bottom="R24" cap="C25" from="VIN" to="VIN_SENSE" />
    <SenseDivider
      top="R25"
      bottom="R26"
      cap="C26"
      from="VBUS1"
      to="VBUS1_SENSE"
    />
    <SenseDivider top="R32" bottom="R33" cap="C33" from="V12" to="V12_SENSE" />
    {/* Mode input: pulled up, an open solder jumper to GND. */}
    <R name="R19" value="10k" nets={["V5", "SW1_IN"]} />
    <SolderJumper name="JP7" nets={{ pin1: "SW1_IN", pin2: "GND" }} />
    <R name="R20" value="1k" nets={["LED_STAT", "LED5_A"]} />
    <LedRed name="LED5" nets={{ A: "LED5_A", K: "GND" }} />
    {/* PERST#: pulled up to 3.3 V, held low by the microcontroller, clamped to 3.3 V by D6. */}
    <R name="R37" value="1k" nets={["PERST_MCU", "PERST_N"]} />
    <R name="R27" value="15k" nets={["V3V3", "PERST_N"]} />
    <C name="C31" value="10uF" nets={["PERST_N", "GND"]} />
    <D1N4148W name="D6" nets={{ K: "V3V3", A: "PERST_N" }} />
  </>
);

/**
 * The card has two internal USB ports (two devices). J1 goes through the ESD
 * array U5 to the hub U8 (CH334P); its ports 1 and 2 go to the sockets J4
 * and J6, which take stock JST PH 4-pin cables to the card. The hub runs on
 * +3V3 (V5 and VDD33 both), which is only up while the PC's port has VBUS.
 * The card's VBUS has its own 5 V regulator U9, fed from VBUS1.
 */
export const UsbData = () => (
  <>
    <CardUsbSocket name="J4" dp="USB1_DP" dn="USB1_DN" />
    <CardUsbSocket name="J6" dp="USB2_DP" dn="USB2_DN" />
    <CH334P
      name="U8"
      nets={{
        XO: "HUB_XO",
        XI: "HUB_XI",
        DM4: NC,
        DP4: NC,
        DM3: NC,
        DP3: NC,
        DM2: "USB2_DN",
        DP2: "USB2_DP",
        DM1: "USB1_DN",
        DP1: "USB1_DP",
        DMU: "USB_DN",
        DPU: "USB_DP",
        // Internal pull-ups; the datasheet leaves RESET# open.
        RESET: NC,
        PGANG: NC,
        V5: "V3V3",
        VDD33: "V3V3",
        EP: "GND",
      }}
    />
    {/* The hub has the load capacitors of its crystal inside. */}
    <Crystal12M
      name="Y1"
      nets={{ X1: "HUB_XI", GND: "GND", X2: "HUB_XO", GND2: "GND" }}
    />
    {/* 1 uF right under the supply pins (C35), 100 nF further along the band. */}
    <C name="C34" value="100nF" nets={["V3V3", "GND"]} />
    <C name="C35" value="1uF" nets={["V3V3", "GND"]} />
    {/* Holds the hub's supply up when a device is plugged in. */}
    <C name="C36" value="10uF" nets={["V3V3", "GND"]} />
    <HT7550 name="U9" nets={{ GND: "GND", VIN: "VBUS1", VOUT: "V5_USB" }} />
    {/* 1 uF: with C1 the PC's port carries 2 uF (10 uF at most). */}
    <C name="C37" value="1uF" nets={["VBUS1", "GND"]} />
    <C name="C38" value="10uF" nets={["V5_USB", "GND"]} />
    {/* REF stays open: its TVS is a 6 V part and VBUS can be 9 V. */}
    <SRV05
      name="U5"
      nets={{
        IO1: "USB_DP",
        GND: "GND",
        IO2: "USB_DN",
        IO3: NC,
        REF: NC,
        IO4: NC,
      }}
    />
    <ClosedJumper name="JP3" nets={{ pin1: "V5_USB", pin2: "USBH_VBUS" }} />
    {/* Against a short on the cable: U9 has no current limit of its own. */}
    <PtcSmall name="F2" nets={{ pin1: "CARD_VBUS", pin2: "USBH_VBUS" }} />
  </>
);

/** PCIe x1 slot: power, ground and PERST# only. Every other contact is left open. */
export const Slot = () => (
  <>
    <PcieSlot
      name="J3"
      nets={{
        B1: "V12",
        B2: "V12",
        B3: "V12",
        A2: "V12",
        A3: "V12",
        B8: "V3V3",
        A9: "V3V3",
        A10: "V3V3",
        B10: "V3V3AUX",
        A11: "PERST_N",
        B4: "GND",
        B7: "GND",
        B13: "GND",
        B16: "GND",
        B18: "GND",
        A4: "GND",
        A12: "GND",
        A15: "GND",
        A18: "GND",
      }}
    />
    <ClosedJumper name="JP4" nets={{ pin1: "V3V3", pin2: "V3V3AUX" }} />
  </>
);
