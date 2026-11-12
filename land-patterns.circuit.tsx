// Every land pattern side by side, for looking at and for the snapshot.
// Not a board that gets made.
import { footprintOf } from "./lib/Footprint";
import * as footprints from "./lib/footprints";
import type { FootprintDef } from "./lib/footprints";

const COLUMNS = 6;
const CELL_X = 22;
const CELL_Y = 16;

const entries = Object.entries(footprints).filter(
  (entry): entry is [string, FootprintDef] =>
    typeof entry[1] === "object" && "courtyard" in entry[1],
);

// The straddle connector is wider than a cell; it gets the bottom row to itself.
const wide = entries.filter(([name]) => name === "PCIE_X1_STRADDLE");
const normal = entries.filter(([name]) => name !== "PCIE_X1_STRADDLE");
const rows = Math.ceil(normal.length / COLUMNS);

const cell = (i: number) => ({
  x: ((i % COLUMNS) - (COLUMNS - 1) / 2) * CELL_X,
  y: (rows / 2 - Math.floor(i / COLUMNS)) * CELL_Y,
});

const Sample = ({
  name,
  def,
  x,
  y,
}: {
  name: string;
  def: FootprintDef;
  x: number;
  y: number;
}) => (
  <>
    <chip
      name={name}
      footprint={footprintOf(def)}
      pcbX={x}
      pcbY={y}
      doNotPlace
    />
    <silkscreentext
      text={name}
      pcbX={x}
      pcbY={y - CELL_Y / 2 + 1}
      fontSize={0.8}
    />
  </>
);

export default () => (
  <board
    width={COLUMNS * CELL_X + 4}
    height={(rows + 1) * CELL_Y + 8}
    routingDisabled
  >
    {normal.map(([name, def], i) => (
      <Sample key={name} name={name} def={def} {...cell(i)} />
    ))}
    {wide.map(([name, def]) => (
      <Sample
        key={name}
        name={name}
        def={def}
        x={0}
        y={(rows / 2 - rows) * CELL_Y - 2}
      />
    ))}
  </board>
);
