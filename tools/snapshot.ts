// Board pictures kept in the repository (__snapshots__): schematic, both
// copper layers together, top, bottom and a 3D view. A pull request that
// changes the board shows up as a picture diff.
//   bun run snapshot            compare with the committed pictures (CI)
//   bun run snapshot --update   rewrite them
export {};

const ENTRY = "index.circuit.tsx";
const update = Bun.argv.includes("--update");

const runs: string[][] = [["--3d"], ["--layer", "top"], ["--layer", "bottom"]];

for (const extra of runs) {
  const args = [
    "bunx",
    "tsci",
    "snapshot",
    ENTRY,
    "--disable-parts-engine",
    update ? "--update" : "--test",
    ...extra,
  ];
  const proc = Bun.spawn(args, { stdout: "inherit", stderr: "inherit" });
  if ((await proc.exited) !== 0) {
    console.error(
      "Pictures differ from __snapshots__. If the change is intended, run `bun run snapshot --update`.",
    );
    process.exit(1);
  }
}
