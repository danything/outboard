// Board pictures kept in the repository (__snapshots__): schematic, both
// copper layers together, top, bottom and a 3D view of the board, and the
// land patterns. A pull request that changes any of them shows up as a
// picture diff.
//   bun run snapshot            compare with the committed pictures (CI)
//   bun run snapshot --update   rewrite them
export {};

const update = Bun.argv.includes("--update");

const runs: [entry: string, ...options: string[]][] = [
  ["index.circuit.tsx", "--3d"],
  ["index.circuit.tsx", "--layer", "top"],
  ["index.circuit.tsx", "--layer", "bottom"],
  ["footprints.circuit.tsx", "--pcb-only", "--show-courtyards"],
  ["footprints.circuit.tsx", "--layer", "bottom"],
];

for (const [entry, ...options] of runs) {
  const args = [
    "bunx",
    "tsci",
    "snapshot",
    entry,
    "--disable-parts-engine",
    update ? "--update" : "--test",
    ...options,
  ];
  const proc = Bun.spawn(args, { stdout: "inherit", stderr: "inherit" });
  if ((await proc.exited) !== 0) {
    console.error(
      "Pictures differ from __snapshots__. If the change is intended, run `bun run snapshot --update`.",
    );
    process.exit(1);
  }
}
