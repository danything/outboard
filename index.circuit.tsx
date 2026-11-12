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

const MountingHole = ({ index }: { index: 0 | 1 | 2 | 3 }) => {
  const p = mountingHoles[index];
  return (
    <hole
      name={`H${index + 1}`}
      diameter={MOUNTING_HOLE_DIAMETER}
      pcbX={p.x}
      pcbY={p.y}
    />
  );
};

// outboard rev D. The circuit is complete; parts are not placed or routed yet.
export default () => (
  <board
    outline={boardOutline()}
    thickness={BOARD_THICKNESS}
    layers={2}
    routingDisabled
  >
    <MountingHole index={0} />
    <MountingHole index={1} />
    <MountingHole index={2} />
    <MountingHole index={3} />
    <PdPortPc />
    <PdPortCharger />
    <InputMerge />
    <Buck3V3 />
    <Boost12V />
    <Switch12V />
    <Mcu />
    <UsbData />
    <Slot />
  </board>
);
