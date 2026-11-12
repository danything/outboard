import { BOARD_THICKNESS, MOUNTING_HOLE_DIAMETER, boardOutline, mountingHoles } from "./lib/geometry"

// outboard rev D. Stage 0: outline and mounting holes only.
export default () => (
  <board outline={boardOutline()} thickness={BOARD_THICKNESS} layers={2} routingDisabled>
    {mountingHoles.map((p, i) => (
      <hole key={`H${i + 1}`} name={`H${i + 1}`} diameter={MOUNTING_HOLE_DIAMETER} pcbX={p.x} pcbY={p.y} />
    ))}
  </board>
)
