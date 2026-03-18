import test from "node:test";
import assert from "node:assert/strict";

import { selectOnlineView } from "../app/online-view-state.js";

test("newer versions replace older views", () => {
  const current = {
    view: { version: 2, phase: "race_turn" },
    requestId: 5,
  };

  const selected = selectOnlineView(current, { version: 3, phase: "downtime_submit" }, 4);
  assert.equal(selected.view.version, 3);
  assert.equal(selected.requestId, 4);
});

test("older versions cannot overwrite fresher state", () => {
  const current = {
    view: { version: 4, phase: "race_turn" },
    requestId: 8,
  };

  const selected = selectOnlineView(current, { version: 3, phase: "race_turn" }, 9);
  assert.equal(selected.view.version, 4);
  assert.equal(selected.requestId, 8);
});

test("equal-version views use request ordering", () => {
  const current = {
    view: { version: 0, lobby: { claimedCount: 1 } },
    requestId: 3,
  };

  const selected = selectOnlineView(current, { version: 0, lobby: { claimedCount: 2 } }, 4);
  assert.equal(selected.view.lobby.claimedCount, 2);
  assert.equal(selected.requestId, 4);
});
