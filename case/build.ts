// The printed case: `bun run case` writes dist/case/ with
//   tray.stl / tray.step     the bottom with three walls (terminal wall and the two long ones)
//   lid.stl / lid.step       the top with the far end wall
//   hatch.stl / hatch.step   the B-CAS hatch in the lid
//   case*.png                pictures (when dist/index/circuit.json is there: run `bun run build` first)
// Options (docs/mechanical.md, "ケース"):
//   --latch magnet|snap      how the hatch stays shut (default magnet)
//   --fastener insert|nut    M3 heat-set inserts or nuts in pockets (default insert)
//   --wall <mm>              side walls, floor and top (default 2)
import { mkdir } from "node:fs/promises";
import { CIRCUIT_JSON } from "../tools/circuit";
import { type CaseOptions, DEFAULT_OPTIONS, layout } from "./layout";
import { bodySolid, initCad, measureVolume } from "./model";
import { renderCase } from "./render";

export const OUT = "dist/case";

const option = (name: string): string | undefined => {
  const i = Bun.argv.indexOf(`--${name}`);
  return i < 0 ? undefined : Bun.argv[i + 1];
};

const choice = <T extends string>(
  name: string,
  allowed: readonly T[],
  fallback: T,
): T => {
  const v = option(name);
  if (v === undefined) return fallback;
  if (!(allowed as readonly string[]).includes(v))
    throw new Error(`--${name} ${v}: use one of ${allowed.join(", ")}`);
  return v as T;
};

const options: CaseOptions = {
  latch: choice("latch", ["magnet", "snap"] as const, DEFAULT_OPTIONS.latch),
  fastener: choice(
    "fastener",
    ["insert", "nut"] as const,
    DEFAULT_OPTIONS.fastener,
  ),
  wall: Number(option("wall") ?? DEFAULT_OPTIONS.wall),
};

await initCad();
const plan = layout(options);
const solids = {
  tray: bodySolid(plan.tray),
  lid: bodySolid(plan.lid),
  hatch: bodySolid(plan.hatchBody),
};
await mkdir(OUT, { recursive: true });
for (const [name, shape] of Object.entries(solids)) {
  await Bun.write(
    `${OUT}/${name}.stl`,
    shape.blobSTL({ tolerance: 0.02, angularTolerance: 0.1, binary: true }),
  );
  await Bun.write(`${OUT}/${name}.step`, shape.blobSTEP());
  const b = shape.boundingBox;
  const size = b.bounds[1].map((v, i) =>
    (v - (b.bounds[0][i] ?? 0)).toFixed(1),
  );
  console.log(
    `${OUT}/${name}.stl, .step: ${size.join(" x ")} mm, ${(measureVolume(shape) / 1000).toFixed(1)} cm3`,
  );
}
const { inside } = plan;
console.log(
  `inside ${(inside.x1 - inside.x0).toFixed(1)} x ${(inside.y1 - inside.y0).toFixed(1)} x ${(inside.z1 - inside.z0).toFixed(1)} mm` +
    ` (${options.latch}, ${options.fastener}, wall ${options.wall})`,
);

if (await Bun.file(CIRCUIT_JSON).exists())
  for (const file of await renderCase(CIRCUIT_JSON, plan, solids, OUT))
    console.log(file);
else
  console.log(
    `no ${CIRCUIT_JSON}: run \`bun run build\` first for the pictures`,
  );
