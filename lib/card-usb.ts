// Pin assignment of the card's internal USB ports (PLEX PX-MLT8PE, the two
// white 4-pin JST PH sockets marked USB1 and USB2), and so of J4 and J6.
//
// THIS IS NOT CONFIRMED. The values are the usual order of a 4-pin USB
// header (1 VBUS, 2 D-, 3 D+, 4 GND); the owner is checking the colours of
// the wires of the card's original cable. The cable between the card and this
// board is a stock JST PH 4-pin cable with both ends wired the same way
// (pin 1 to pin 1), so J4 and J6 use the card's own numbering.
//
// This table is the only place that says which pin is which: the parts
// (lib/parts.tsx), the circuit (lib/blocks.tsx), the copper
// (lib/routing/usb.tsx) and the netlist reference (tools/netlist.ts) all
// read it. To change the assignment, change the numbers here, run
// `bun run build && bun run check` and redraw the snapshots
// (docs/design.md, "内部 USB のコネクタ").
export const CARD_USB_PINOUT = {
  VBUS: 1,
  DN: 2,
  DP: 3,
  GND: 4,
} as const;

export type CardUsbSignal = keyof typeof CARD_USB_PINOUT;

/** The signal names in pad order (pad 1 first). */
export const CARD_USB_PIN_NAMES = (() => {
  const names = Object.entries(CARD_USB_PINOUT)
    .sort(([, a], [, b]) => a - b)
    .map(([name]) => name as CardUsbSignal);
  if (names.some((n, i) => CARD_USB_PINOUT[n] !== i + 1))
    throw new Error("CARD_USB_PINOUT must use the pins 1 to 4 once each");
  return names;
})();

/**
 * The socket on this board for each port (J4, J6): JST S4B-PH-SM4-K-TB, the
 * black version of S4B-PH-SM4-TB (same drawing; the plain one is out of
 * stock at LCSC). docs/parts.md compares it with the others.
 */
export const CARD_USB_PART = {
  footprint: "PH4_SIDE_ENTRY",
  lcsc: "C265332",
  mpn: "S4B-PH-SM4-K-TB(LF)(SN)",
} as const;
