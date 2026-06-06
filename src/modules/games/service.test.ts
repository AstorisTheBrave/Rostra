import assert from "node:assert/strict";
import { test } from "node:test";
import { type Cell, checkTicTacToe, rpsOutcome } from "./service.ts";

test("checkTicTacToe detects a row win", () => {
	const board: Cell[] = ["X", "X", "X", null, "O", "O", null, null, null];
	assert.equal(checkTicTacToe(board), "X");
});

test("checkTicTacToe detects a diagonal win", () => {
	const board: Cell[] = ["O", "X", "X", null, "O", null, null, null, "O"];
	assert.equal(checkTicTacToe(board), "O");
});

test("checkTicTacToe reports draw and ongoing", () => {
	assert.equal(checkTicTacToe(["X", "O", "X", "X", "O", "O", "O", "X", "X"]), "draw");
	assert.equal(checkTicTacToe([null, null, null, null, null, null, null, null, null]), null);
});

test("rpsOutcome resolves all cases", () => {
	assert.equal(rpsOutcome("rock", "scissors"), "win");
	assert.equal(rpsOutcome("rock", "paper"), "lose");
	assert.equal(rpsOutcome("paper", "paper"), "draw");
});
