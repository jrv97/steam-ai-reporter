import { describe, expect, it } from "vitest";
import { dropIndex, heldIndex, type Reorder, reorder, type ReorderAction } from "./reorder";

type Letter = "a" | "b" | "c" | "d";

const ABCD: readonly Letter[] = ["a", "b", "c", "d"];
const IDLE: Reorder<Letter> = { mode: "idle", order: ABCD };

/** The state after picking `id` up from `order` and moving it there. */
function held(id: Letter, order: readonly Letter[] = ABCD): Reorder<Letter> {
  return { mode: "held", order, held: id, before: ABCD };
}

/** The state after each action in turn, from nothing held over a b c d. */
function run(...actions: readonly ReorderAction<Letter>[]): Reorder<Letter> {
  return actions.reduce(reorder, IDLE);
}

describe("reorder", () => {
  it.each<[string, readonly ReorderAction<Letter>[], Reorder<Letter>]>([
    ["picks a row up", [{ type: "pick", id: "b" }], held("b")],
    [
      "moves the held row",
      [{ type: "pick", id: "a" }, { type: "move", to: 2 }],
      held("a", ["b", "c", "a", "d"]),
    ],
    [
      "clamps a move past the ends",
      [{ type: "pick", id: "c" }, { type: "move", to: -4 }],
      held("c", ["c", "a", "b", "d"]),
    ],
    ["drops where the row is", [
      { type: "pick", id: "d" },
      { type: "move", to: 9 },
      { type: "move", to: 0 },
      { type: "drop" },
    ], { mode: "idle", order: ["d", "a", "b", "c"] }],
    ["puts the row back on cancel", [
      { type: "pick", id: "a" },
      { type: "move", to: 3 },
      { type: "cancel" },
    ], IDLE],
    ["moves nothing while nothing is held", [{ type: "move", to: 2 }], IDLE],
    ["picks up no second row", [{ type: "pick", id: "a" }, { type: "pick", id: "b" }], held("a")],
    ["picks up no row it does not list", [{ type: "load", order: ["a"] }, {
      type: "pick",
      id: "b",
    }], { mode: "idle", order: ["a"] }],
    ["loads a stored order while nothing is held", [{ type: "load", order: ["d", "c"] }], {
      mode: "idle",
      order: ["d", "c"],
    }],
    ["keeps a held row's order when a stored one loads", [
      { type: "pick", id: "b" },
      { type: "load", order: ["d", "c", "b", "a"] },
    ], held("b")],
  ])("%s", (_case, actions, expected) => {
    expect(run(...actions)).toStrictEqual(expected);
  });

  it("returns the same state for a move to where the row is", () => {
    const state = held("b");
    expect(reorder(state, { type: "move", to: 1 })).toBe(state);
  });
});

describe("heldIndex", () => {
  it.each<[Reorder<Letter>, number]>([[IDLE, -1], [held("c"), 2], [held("c", ["c"]), 0]])(
    "gives the held row's place, -1 for none",
    (state, index) => {
      expect(heldIndex(state)).toBe(index);
    },
  );
});

describe("dropIndex", () => {
  // Four rows 30px apart, their middles at 15, 45, 75 and 105
  const MIDDLES = [15, 45, 75, 105];

  it.each<[number, number, number]>([
    [0, 15, 0],
    [0, 46, 1],
    [0, 200, 3],
    [3, 105, 3],
    [3, 74, 2],
    [2, -20, 0],
  ])("puts row %i with its middle at %i in place %i", (from, middle, to) => {
    expect(dropIndex(MIDDLES, from, middle)).toBe(to);
  });
});
