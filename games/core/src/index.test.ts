import assert from "node:assert/strict";
import { test } from "node:test";
import { completedSession, waitingSession } from "./fixtures.ts";
import { isGameResult, isGameSession } from "./index.ts";

test("game fixtures are pure valid session and result contracts", () => {
	assert.equal(isGameSession(waitingSession), true);
	assert.equal(isGameSession(completedSession), true);
	assert.equal(isGameResult(completedSession.result), true);
	assert.equal(isGameSession({ ...waitingSession, players: [] }), false);
});
