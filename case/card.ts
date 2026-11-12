// The tuner card (PLEX PX-MLT8PE) as the case sees it: every number here is
// an estimate [EST] unless marked otherwise, read off a product photo of the
// card's component side at about 4.27 px/mm (the scale from the 120 mm
// bracket and the PCIe x1 contacts; contact 1 then lands 47.6 from the
// bracket face, against 47.54 from the CEM). Expect +-5 %.
//
// This is the one table to correct when the owner has measured the real
// card; docs/mechanical.md lists the same keys ("カードの推定の寸法") and
// case/case.test.ts keeps the two in step.
//
// Two references, both as on the card: "from the bracket" is measured from
// the outside face of the (removed) bracket, which is where the bracket was
// in lib/geometry.ts (BRACKET_FACE_X); "from the shoulder" is measured from
// the card's lower edge beside the contacts (CARD_EDGE_Y), up towards the
// card's top edge. Heights are from the card's component-side surface.
export const CARD = {
  /** Bracket face to the far end of the card's board. Photo 555 px = 130; the owner's first reading was 126. */
  length: 130,
  /** Shoulder to the top edge. Photo 387 px. */
  height: 90.5,

  /** The two holes that held the bracket (M3 assumed), [from the bracket, from the shoulder]. */
  screwTop: [8.2, 87.3],
  screwBottom: [6.9, 3.6],
  /** Size of the screws in those holes (M3 assumed; PCIe brackets also use 4-40). */
  screwDiameter: 3,

  // [CEM] R4.0 Fig 61 (Detail F) and Fig 37. The card's rear end is 1.89 from
  // the bracket (57.15 from datum X, the key, which is 59.04 from the
  // bracket). Both tabs reach 8.25 below the shoulder (4.50 above datum W).
  // The photo read 17, 8.7 and 35.1 to 42.9, 8.5.
  /** The board runs below the shoulder near the bracket: up to this far from the bracket (15.00 from the card's rear end) ... */
  tabEnd: 16.89,
  /** ... and this far below the shoulder. */
  tabDrop: 8.25,
  /** A second tab between the bracket and the contacts (23.80 to 15.80 from the key; a 3.65 slot with a full radius parts it from the contacts): from, to (from the bracket) and its drop. */
  tab2From: 35.24,
  tab2To: 43.24,
  tab2Drop: 8.25,

  /** F connectors: axis from the shoulder, the one near the contacts and the far one. */
  fNear: 24.5,
  fFar: 66.3,
  /** Axis above the card's component-side surface (not visible in the photo). */
  fAxisHeight: 5.5,
  /** Thread 3/8-32 UNEF (the F connector standard). */
  fThreadDiameter: 9.5,
  /** Thread standing out of the bracket face (photo 42 px = 9.8). */
  fThreadOut: 9.5,
  /** The body behind the bracket: ends this far from the bracket (photo: the four legs end at 11.9). */
  fBodyEnd: 12.5,
  /** Body width (across the card) and height above the card. */
  fBodyWidth: 11,
  fBodyHeight: 11,
  /** The nut on the thread outside the wall: 7/16 inch hex, across flats, and its thickness. */
  fNutFlats: 11.1,
  fNutThickness: 2.5,

  /** The card's two internal USB sockets (JST PH 4 pins, on the far end): centres from the shoulder. */
  usbNear: 23.5,
  usbFar: 62.3,
  /** Their housings: from the bracket (the far end is the board's end), width and height. */
  usbHousingFrom: 125.1,
  usbHousingWidth: 9.9,
  usbHousingHeight: 6,

  /** B-CAS reader (the grey metal frame on the far end): from, to (from the bracket) ... */
  readerFrom: 93.7,
  readerTo: 124.9,
  /** ... from, to (from the shoulder) and height. */
  readerLow: 20.6,
  readerHigh: 75.6,
  readerHeight: 3,
  /** Outer end of the inserted B-CAS card, from the bracket (the owner's estimate, about 4 cm; the photo gives 36). */
  bcasOuterEnd: 40,
  /** Underside of the B-CAS card above the card's surface (inside the reader's slot). */
  bcasLift: 1.6,

  /** Everything else on the component side, and on the solder side, as one slab each. */
  partsTop: 5,
  partsBottom: 2,
} as const;

/** ISO/IEC 7810 ID-1, the size of a B-CAS card. [DS] */
export const BCAS = { length: 85.6, width: 54, thickness: 0.76 } as const;
