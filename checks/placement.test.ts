// tscircuit's placement checks, run from checks/: quiet on a clean board,
// and they do report (a part off the board).
import { expect, test } from "bun:test";
import { RUNS, tscircuitPlacement } from "./placement";
import { board, part } from "./testboard";

test("tscircuitPlacement passes a part on the board", () => {
  expect(
    tscircuitPlacement([
      board(),
      ...part("R1", 0, 0, [{ pin: "1", x: 0, y: 0 }], { courtyard: [2, 2] }),
    ]),
  ).toEqual([]);
});

test("tscircuitPlacement reports a part off the board", () => {
  const found = tscircuitPlacement([
    board(),
    ...part("R1", 100, 0, [{ pin: "1", x: 100, y: 0 }], { courtyard: [2, 2] }),
  ]);
  expect(found.some((f) => f.message.startsWith("componentsOutOfBoard"))).toBe(
    true,
  );
});

test("every check taken from @tscircuit/checks is there", () => {
  // It comes with tscircuit; an update that drops or renames one shows here.
  const missing = RUNS.filter(([, run]) => typeof run !== "function").map(
    ([name]) => name,
  );
  expect(missing).toEqual([]);
  expect(RUNS.length).toBe(13);
});
