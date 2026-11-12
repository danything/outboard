import {
  Boost12V,
  Buck3V3,
  InputMerge,
  Mcu,
  PdPortCharger,
  PdPortPc,
  Slot,
  Switch12V,
  UsbData,
} from "./lib/blocks";
import {
  BOARD_THICKNESS,
  MOUNTING_HOLE_DIAMETER,
  boardOutline,
  mountingHoles,
} from "./lib/geometry";
import { Routing } from "./lib/routing";

const MountingHole = ({
  index,
  x,
  y,
}: {
  index: number;
  x: number;
  y: number;
}) => (
  <hole
    name={`H${index + 1}`}
    diameter={MOUNTING_HOLE_DIAMETER}
    pcbX={x}
    pcbY={y}
  />
);

// outboard rev D. The copper is in lib/routing, block by block (docs/routing.md).
export default () => (
  <board
    outline={boardOutline()}
    thickness={BOARD_THICKNESS}
    layers={2}
    routingDisabled
  >
    {mountingHoles.map((p, i) => (
      <MountingHole key={`H${i + 1}`} index={i} x={p.x} y={p.y} />
    ))}
    <PdPortPc />
    <PdPortCharger />
    <InputMerge />
    <Buck3V3 />
    <Boost12V />
    <Switch12V />
    <Mcu />
    <UsbData />
    <Slot />
    <Routing />
  </board>
);
