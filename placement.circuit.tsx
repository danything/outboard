// The floorplan on its own: every land pattern at its place from
// lib/placement.ts, with the block regions and the things around the board
// (bracket, card, plugs) drawn as notes. Nothing is connected. This is for
// looking at and for the snapshot; index.circuit.tsx is the board that gets made.
import type { ComponentProps } from "react";
import { footprintOf } from "./lib/Footprint";
import * as footprints from "./lib/footprints";
import {
  BOARD_THICKNESS,
  MOUNTING_HOLE_DIAMETER,
  type Point,
  at,
  boardOutline,
  mountingHoles,
  referenceShapes,
} from "./lib/geometry";
import {
  BLOCKS,
  type BlockName,
  HANDOFFS,
  PLACEMENT,
  positionOf,
} from "./lib/placement";

const closed = (points: Point[]) =>
  [...points, points[0]].flatMap((q) => (q ? [at(q.x, q.y)] : []));

// The note elements do not take a `key`; components do.
const Hole = (props: ComponentProps<"hole">) => <hole {...props} />;
const NoteRect = (props: ComponentProps<"pcbnoterect">) => (
  <pcbnoterect {...props} />
);
const NoteText = (props: ComponentProps<"pcbnotetext">) => (
  <pcbnotetext {...props} />
);
const NotePath = (props: ComponentProps<"pcbnotepath">) => (
  <pcbnotepath {...props} />
);

const REFERENCE_COLOR = "#8a8a8a";
const BLOCK_COLORS: Record<BlockName, string> = {
  pdPc: "#d98200",
  pdCharger: "#d98200",
  usb: "#2a9d8f",
  input: "#d62828",
  mcu: "#3a86ff",
  slot: "#6a4c93",
  boost: "#e76f51",
  switch12: "#bc6c25",
  buck: "#2b9348",
};

export default () => (
  <board
    outline={boardOutline()}
    thickness={BOARD_THICKNESS}
    layers={2}
    routingDisabled
  >
    {mountingHoles.map((q, i) => (
      <Hole
        key={`H${i + 1}`}
        name={`H${i + 1}`}
        diameter={MOUNTING_HOLE_DIAMETER}
        pcbX={q.x}
        pcbY={q.y}
      />
    ))}
    {PLACEMENT.map((part) => (
      <chip
        key={part.ref}
        name={part.ref}
        footprint={footprintOf(footprints[part.footprint])}
        {...positionOf(part.ref)}
        doNotPlace
        allowOffBoard
      />
    ))}
    {(Object.keys(BLOCKS) as BlockName[]).flatMap((name) =>
      BLOCKS[name].region.map((r, i) => (
        <NoteRect
          key={`${name}${i}`}
          pcbX={(r.x0 + r.x1) / 2}
          pcbY={-(r.y0 + r.y1) / 2}
          width={r.x1 - r.x0}
          height={r.y1 - r.y0}
          strokeWidth={0.12}
          color={BLOCK_COLORS[name]}
        />
      )),
    )}
    {(Object.keys(BLOCKS) as BlockName[]).map((name) => {
      const r = BLOCKS[name].region[0];
      return r ? (
        <NoteText
          key={name}
          text={name}
          pcbX={r.x0 + 0.4}
          pcbY={-(r.y0 + 0.9)}
          anchorAlignment="top_left"
          fontSize={0.9}
          color={BLOCK_COLORS[name]}
        />
      ) : null;
    })}
    {HANDOFFS.map((hand, i) => (
      <NoteRect
        key={`handoff${i}`}
        pcbX={hand.x}
        pcbY={-hand.y}
        width={0.5}
        height={0.5}
        strokeWidth={0.1}
        isFilled
        color={hand.layer === "top" ? "#111111" : "#3a86ff"}
      />
    ))}
    {referenceShapes().map((shape, i) => (
      <NotePath
        key={`reference${i}`}
        route={closed(shape.points)}
        strokeWidth={0.15}
        color={REFERENCE_COLOR}
      />
    ))}
    {referenceShapes().map((shape, i) => {
      const first = shape.points[0];
      return first ? (
        <NoteText
          key={`label${i}`}
          text={shape.label}
          pcbX={first.x + 0.4}
          pcbY={-(first.y + 1.2)}
          anchorAlignment="top_left"
          fontSize={0.8}
          color={REFERENCE_COLOR}
        />
      ) : null;
    })}
  </board>
);
