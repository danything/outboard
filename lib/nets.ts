// Every net of the board. A part can only be wired to one of these names, so
// a mistyped net is a type error instead of a new, floating net.
//
// tscircuit net names cannot start with "+" or a digit or contain "#", so the
// rev D names are spelled out: +3V3 -> V3V3, +12V -> V12, 12V_SENSE ->
// V12_SENSE, PERST# -> PERST_N. The netlist check ignores names and compares
// connectivity only.
export const NETS = [
  "GND",
  // Power
  "VBUS1",
  "VBUS2",
  "VIN",
  "V3V3_BUCK",
  "V3V3",
  "V3V3AUX",
  "V5",
  "V12_BOOST",
  "V12_SW",
  "V12_F",
  "V12",
  "USBH_VBUS",
  // USB-C ports
  "J1_CC1",
  "J1_CC2",
  "J2_CC1",
  "J2_CC2",
  "CFG1_U1",
  "CFG1_U2",
  "BLD1",
  "BLD2",
  "SHIELD1",
  "USB_DP",
  "USB_DN",
  // Buck
  "SW_3V3",
  "BST_3V3",
  "SS_3V3",
  "FB_3V3",
  "EN_3V3",
  // Boost and the 12 V switch
  "SW_12V",
  "FB_12V",
  "EN_12V",
  "Q1_G",
  "Q2_G",
  "Q2_D",
  "Q2_S",
  "OVP_Z",
  "OVP_B",
  // Microcontroller
  "I2C1_SCL",
  "I2C1_SDA",
  "I2C2_SCL",
  "I2C2_SDA",
  "VIN_SENSE",
  "VBUS1_SENSE",
  "CC1_SENSE",
  "CC2_SENSE",
  "V12_SENSE",
  "EN_MCU",
  "PERST_MCU",
  "PERST_N",
  "SW12_ON",
  "SW1_IN",
  "SWIO",
  "LED_STAT",
  "LED3_A",
  "LED5_A",
] as const;

export type Net = (typeof NETS)[number];

/** Marks a pin that is left unconnected on purpose. */
export const NC = null;
export type Conn = Net | typeof NC;
