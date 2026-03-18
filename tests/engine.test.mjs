import test from "node:test";
import assert from "node:assert/strict";

import {
  applyDowntimeAction,
  applyRaceAction,
  archiveGameState,
  buildGameView,
  createGameState,
  hostSkipSeat,
  startNextRace,
} from "../app/async-engine.js";

function sequenceRng(values) {
  let index = 0;
  return () => {
    const value = values[index] ?? values[values.length - 1] ?? 0;
    index += 1;
    return value;
  };
}

test("race bet action deducts coins, rolls dice, and advances the turn", () => {
  const state = createGameState(["A", "B"]);
  const result = applyRaceAction(
    state,
    0,
    { type: "bet", snailColor: "red", amount: 10 },
    sequenceRng([0.0, 0.2]),
  );

  assert.equal(result.ok, true);
  assert.equal(result.state.players[0].coins, 90);
  assert.equal(result.state.players[0].bets.length, 1);
  assert.deepEqual(result.state.lastRoll, [0, 1]);
  assert.equal(result.state.currentPlayerIndex, 1);
  assert.equal(result.summary.kind, "race_turn");
});

test("drugging can eliminate a snail and pays colombia shareholders", () => {
  const state = createGameState(["Manager", "Investor"]);
  state.players[0].shares.red = 2;
  state.players[1].shopShares.colombia = 1;
  state.snailShares.red = 2;
  state.snails.find((snail) => snail.color === "red").stress = state.config.stressMax - 1;

  const result = applyRaceAction(
    state,
    0,
    { type: "drug", snailColor: "red" },
    sequenceRng([0.4, 0.6]),
  );

  assert.equal(result.ok, true);
  assert.equal(result.state.eliminated.red, true);
  assert.equal(result.state.drugged.red, false);
  assert.equal(result.state.players[0].coins, 95);
  assert.equal(result.state.players[1].coins, 105);
});

test("downtime training adds bonus and can break a snail from stress", () => {
  const state = createGameState(["Trainer", "Other"]);
  state.phase = "downtime_submit";
  state.players[0].shares.blue = 1;
  state.snailShares.blue = 1;
  state.snails.find((snail) => snail.color === "blue").stress = state.config.stressMax - 1;

  const result = applyDowntimeAction(
    state,
    0,
    { type: "train", snailColor: "blue" },
    sequenceRng([1 / 6]),
    { autoAdvance: false },
  );

  assert.equal(result.ok, true);
  assert.equal(result.state.trainingBonus.blue, 1);
  assert.equal(result.state.eliminated.blue, true);
  assert.equal(result.state.downtimeEliminated.blue, true);
  assert.equal(result.state.downtimeSubmitted[0], true);
});

test("downtime can complete without auto-advance and then start the next race manually", () => {
  let state = createGameState(["A", "B"]);
  state.phase = "downtime_submit";
  state.players[0].bets.push({ snailColor: "red", amount: 10, multiplier: 5 });
  state.players[0].shares.red = 1;
  state.snailShares.red = 1;
  state.eliminated.red = true;
  state.snails.find((snail) => snail.color === "red").stress = 10;

  state = applyDowntimeAction(state, 0, { type: "pass" }, Math.random, { autoAdvance: false }).state;
  const done = applyDowntimeAction(state, 1, { type: "pass" }, Math.random, { autoAdvance: false });

  assert.equal(done.ok, true);
  assert.equal(done.state.phase, "downtime_submit");
  assert.equal(done.summary.downtimeComplete, true);

  const nextRace = startNextRace(done.state);
  assert.equal(nextRace.ok, true);
  assert.equal(nextRace.state.phase, "race_turn");
  assert.equal(nextRace.state.raceNumber, 2);
  assert.equal(nextRace.state.players[0].bets.length, 0);
  assert.equal(nextRace.state.players[0].shares.red, 1);
  assert.equal(nextRace.state.eliminated.red, false);
});

test("market listing transfers ownership and first-writer-wins via versioned state", () => {
  let state = createGameState(["Seller", "Buyer"]);
  state.players[0].shares.orange = 1;
  state.snailShares.orange = 1;

  const listed = applyRaceAction(
    state,
    0,
    { type: "market_list", assetType: "snail", assetKey: "orange", price: 13 },
    sequenceRng([0.1, 0.2]),
  );

  assert.equal(listed.ok, true);
  assert.equal(listed.state.marketListings.length, 1);

  const bought = applyRaceAction(
    listed.state,
    1,
    { type: "market_buy", listingId: listed.state.marketListings[0].id },
    sequenceRng([0.3, 0.4]),
  );

  assert.equal(bought.ok, true);
  assert.equal(bought.state.players[1].shares.orange, 1);
  assert.equal(bought.state.marketListings.length, 0);
  assert.equal(bought.state.players[0].coins > state.players[0].coins, true);
});

test("host skip uses skip roll in race phase and pass in downtime", () => {
  const raceState = createGameState(["A", "B"]);
  const skippedRace = hostSkipSeat(raceState, 0, { rng: sequenceRng([0.0, 0.0]) });
  assert.equal(skippedRace.ok, true);
  assert.equal(skippedRace.state.currentPlayerIndex, 1);

  const downtimeState = createGameState(["A", "B"]);
  downtimeState.phase = "downtime_submit";
  const skippedDowntime = hostSkipSeat(downtimeState, 1, { autoAdvance: false });
  assert.equal(skippedDowntime.ok, true);
  assert.equal(skippedDowntime.state.downtimeSubmitted[1], true);
});

test("game view exposes public ownership but keeps bets private", () => {
  const state = createGameState(["A", "B"]);
  state.players[0].bets.push({ snailColor: "red", amount: 10, multiplier: 5 });
  state.players[0].shares.red = 2;
  state.players[1].shopShares.gym = 1;

  const view = buildGameView(state, 1, { gameId: "game-1" });

  assert.equal(view.gameId, "game-1");
  assert.equal(view.publicState.players[0].shares.red, 2);
  assert.equal(view.publicState.players[1].shopShares.gym, 1);
  assert.equal(view.privateState.seatIndex, 1);
  assert.deepEqual(view.privateState.bets, []);
  assert.equal(view.publicState.players[0].bets, undefined);
});

test("current downtime submissions stay hidden from other seats until reveal", () => {
  const state = createGameState(["A", "B", "C"]);
  state.phase = "downtime_submit";

  const submitted = applyDowntimeAction(
    state,
    0,
    { type: "pass" },
    Math.random,
    { autoAdvance: false },
  ).state;

  const viewer = buildGameView(submitted, 1, { gameId: "game-2" });
  assert.equal(viewer.publicState.downtimeSubmitted[0], true);
  assert.equal(viewer.publicState.downtimeActions[0], null);
  assert.equal(
    viewer.publicState.recentSummaries.some((summary) => summary.kind === "downtime_submit" && summary.actorIndex === 0),
    false,
  );
  assert.deepEqual(viewer.privateState.downtimeAction, null);

  const submitter = buildGameView(submitted, 0, { gameId: "game-2" });
  assert.equal(submitter.privateState.downtimeSubmitted, true);
  assert.equal(submitter.privateState.downtimeAction.summary, "Passed");
  assert.equal(submitter.publicState.downtimeActions[0].summary, "Passed");
});

test("archived game state blocks future actions", () => {
  const state = createGameState(["A", "B"]);
  const archived = archiveGameState(state);

  assert.equal(archived.status, "archived");
  assert.equal(archived.phase, "complete");
  assert.equal(archived.idleDeadlineAt, null);
  assert.equal(archived.version, 1);

  const result = applyRaceAction(archived, 0, { type: "skip_roll" });
  assert.equal(result.ok, false);
  assert.equal(result.error, "Game is not accepting race actions.");
});
