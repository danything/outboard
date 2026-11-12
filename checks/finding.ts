// What a check returns. Kept apart from board.ts so that the check files and
// the list of all checks do not import each other in a circle.
import type { Circuit } from "../tools/circuit";

export interface Finding {
  check: string;
  message: string;
  /**
   * The check could not look because what it guards is not on the board yet
   * (a part, the routing). Reported, not a failure. Must be 0 once stage 4 is in.
   */
  skipped?: boolean;
  /**
   * The finding depends on routing that is still being put in block by block
   * (stage 4). Reported as open; a failure only with --strict.
   */
  layout?: boolean;
}

export type Check = (circuit: Circuit) => Finding[];

export const skip = (check: string, why: string): Finding[] => [
  { check, message: `skipped: ${why}`, skipped: true },
];
