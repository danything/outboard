// Board pictures kept in the repository (__snapshots__): schematic, both
// copper layers together, top, bottom, the land patterns, and 3D views of the
// assembled board. A pull request that changes any of them shows up as a
// picture diff.
//   bun run snapshot            compare with the committed pictures (CI)
//   bun run snapshot --update   rewrite them
// The 3D views come from tools/render3d.ts (parts, card and bracket, framed
// on the board), not from tsci, whose 3D view leaves the board small in a corner;
// the pictures of the case (case*.snap.png) from case/render.ts.
import { mkdir, rm } from "node:fs/promises";
import { layout } from "../case/layout";
import { bodySolid, initCad } from "../case/model";
import { renderCase } from "../case/render";
import { renderAll } from "./render3d";

const update = Bun.argv.includes("--update");

const fail = (): never => {
  console.error(
    "Pictures differ from __snapshots__. If the change is intended (a board change, or a tscircuit update that redraws them), run `bun run snapshot --update`.",
  );
  process.exit(1);
};

const tsci = async (args: string[]): Promise<boolean> => {
  const proc = Bun.spawn(["bunx", "tsci", ...args], {
    stdout: "inherit",
    stderr: "inherit",
  });
  return (await proc.exited) === 0;
};

const runs: [entry: string, ...options: string[]][] = [
  ["index.circuit.tsx"],
  ["index.circuit.tsx", "--layer", "top"],
  ["index.circuit.tsx", "--layer", "bottom"],
  ["land-patterns.circuit.tsx", "--pcb-only", "--show-courtyards"],
  ["land-patterns.circuit.tsx", "--layer", "bottom"],
  ["placement.circuit.tsx", "--pcb-only", "--show-courtyards"],
];

for (const [entry, ...options] of runs) {
  const ok = await tsci([
    "snapshot",
    entry,
    "--disable-parts-engine",
    update ? "--update" : "--test",
    ...options,
  ]);
  if (!ok) fail();
}

// 3D: build the circuit afresh (the snapshot may run without a build), then
// render it and compare byte for byte. The renderer is software only and the
// container image is fixed, so the same circuit gives the same PNG.
const WORK = "dist/snapshot-3d";
await rm(WORK, { recursive: true, force: true });
await mkdir(WORK, { recursive: true });
const circuitJson = `${WORK}/circuit.json`;
const exported = await tsci([
  "export",
  "index.circuit.tsx",
  "-f",
  "circuit-json",
  // tsci resolves a relative output path against the folder of the input file.
  "-o",
  `${process.cwd()}/${circuitJson}`,
  "--disable-parts-engine",
]);
if (!exported) fail();

// The case with the board in it (case/render.ts), from the same circuit.
await initCad();
const plan = layout();
const caseFiles = await renderCase(
  circuitJson,
  plan,
  {
    tray: bodySolid(plan.tray),
    lid: bodySolid(plan.lid),
    hatch: bodySolid(plan.hatchBody),
  },
  WORK,
);

const pictures: [file: string, committed: string][] = [
  ...(await renderAll(circuitJson, WORK)).map((file): [string, string] => [
    file,
    `__snapshots__/index.circuit-${file.slice(WORK.length + 1, -".png".length)}.snap.png`,
  ]),
  ...caseFiles.map((file): [string, string] => [
    file,
    `__snapshots__/${file.slice(WORK.length + 1, -".png".length)}.snap.png`,
  ]),
];

let differ = false;
for (const [file, committed] of pictures) {
  const fresh = new Uint8Array(await Bun.file(file).arrayBuffer());
  const old = Bun.file(committed);
  const same =
    (await old.exists()) &&
    Buffer.compare(Buffer.from(await old.arrayBuffer()), Buffer.from(fresh)) ===
      0;
  if (same) continue;
  if (update) {
    await Bun.write(committed, fresh);
    console.log(`updated ${committed}`);
  } else {
    // Kept beside the committed one, so that CI's snapshot-diff artifact has both.
    await Bun.write(committed.replace(/\.snap\.png$/, ".actual.png"), fresh);
    console.error(`${committed} differs`);
    differ = true;
  }
}
if (differ) fail();
