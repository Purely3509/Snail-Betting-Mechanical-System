export const SNAILS = [
  { color: "red", label: "R", css: "#e74c3c" },
  { color: "blue", label: "B", css: "#3498db" },
  { color: "green", label: "G", css: "#2ecc71" },
  { color: "yellow", label: "Y", css: "#f1c40f" },
  { color: "purple", label: "P", css: "#9b59b6" },
  { color: "orange", label: "O", css: "#e67e22" },
];

export const SHOPS = ["colombia", "massageParlor", "gym"];

export const SHOP_NAMES = {
  colombia: "Colombia",
  massageParlor: "Massage Parlor",
  gym: "Gym",
};

export const DEFAULTS = {
  trackLength: 10,
  startingCoins: 100,
  minWager: 10,
  wagerStep: 10,
  shareCost: 10,
  maxSharesPerSnail: 5,
  totalRaces: 3,
  debtFloor: -100,
  drugCost: 5,
  drugShopPayout: 5,
  massageCost: 5,
  massageStressRelief: 2,
  massageShopPayout: 10,
  stressMax: 10,
  sharePayouts: { 1: 30, 2: 20, 3: 10 },
  trainCost: 5,
  gymShopPayout: 5,
  recentSummaryLimit: 20,
};

export function createGameState(playerNames, options = {}) {
  const config = { ...DEFAULTS, ...options };
  const players = playerNames.map((name, index) => {
    const shopShares = {};
    SHOPS.forEach((shop) => {
      shopShares[shop] = 0;
    });
    return {
      id: index,
      name,
      coins: config.startingCoins,
      bets: [],
      shares: {},
      shopShares,
    };
  });

  const state = {
    status: "active",
    phase: "race_turn",
    config,
    players,
    snails: SNAILS.map((snail) => ({
      color: snail.color,
      label: snail.label,
      css: snail.css,
      position: 0,
      stress: 0,
    })),
    snailShares: {},
    drugged: {},
    eliminated: {},
    trainingBonus: {},
    downtimeEliminated: {},
    currentPlayerIndex: 0,
    round: 1,
    raceNumber: 1,
    lastRoll: null,
    raceResults: [],
    marketListings: [],
    nextListingId: 1,
    downtimeActions: {},
    downtimeSubmitted: {},
    resigned: {},
    recentSummaries: [],
    version: 0,
    idleDeadlineAt: null,
    finalRanking: null,
  };

  SNAILS.forEach((snail) => {
    state.snailShares[snail.color] = 0;
    state.drugged[snail.color] = false;
    state.eliminated[snail.color] = false;
    state.trainingBonus[snail.color] = 0;
    state.downtimeEliminated[snail.color] = false;
  });

  players.forEach((_, index) => {
    state.downtimeActions[index] = null;
    state.downtimeSubmitted[index] = false;
    state.resigned[index] = false;
  });

  return state;
}

export function cloneGameState(state) {
  return structuredClone(state);
}

export function calculateMultiplier(state) {
  const lead = Math.max(...state.snails.map((snail) => snail.position));
  if (lead <= 2) return 5;
  if (lead <= 5) return 3;
  if (lead <= 7) return 2;
  return 1.5;
}

export function canAfford(state, player, cost) {
  return player.coins - cost >= state.config.debtFloor;
}

export function getMajorityShareholder(state, snailColor) {
  let maxShares = 0;
  let managerIndex = null;
  let tied = false;

  state.players.forEach((player, index) => {
    const count = player.shares[snailColor] || 0;
    if (count > maxShares) {
      maxShares = count;
      managerIndex = index;
      tied = false;
    } else if (count === maxShares && count > 0) {
      tied = true;
    }
  });

  if (maxShares === 0 || tied) {
    return null;
  }

  return managerIndex;
}

export function getManagedSnails(state, playerIndex) {
  return SNAILS.filter((snail) => getMajorityShareholder(state, snail.color) === playerIndex).map((snail) => snail.color);
}

function getSnail(state, snailColor) {
  return state.snails.find((snail) => snail.color === snailColor);
}

function getSnailIndex(snailColor) {
  return SNAILS.findIndex((snail) => snail.color === snailColor);
}

function dieRoll(rng = Math.random) {
  return Math.floor(rng() * SNAILS.length);
}

function rollDice(rng = Math.random) {
  return [dieRoll(rng), dieRoll(rng)];
}

function pushSummary(state, summary) {
  state.recentSummaries.unshift(summary);
  if (state.recentSummaries.length > state.config.recentSummaryLimit) {
    state.recentSummaries.length = state.config.recentSummaryLimit;
  }
}

function nextTurn(state) {
  const startIndex = state.currentPlayerIndex;
  const playerCount = state.players.length;
  let next = (startIndex + 1) % playerCount;
  let attempts = 0;
  while (state.resigned[next] && attempts < playerCount) {
    next = (next + 1) % playerCount;
    attempts += 1;
  }
  if (next <= startIndex) {
    state.round += 1;
  }
  state.currentPlayerIndex = next;
}

function advancePastResigned(state) {
  const playerCount = state.players.length;
  let attempts = 0;
  while (state.resigned[state.currentPlayerIndex] && attempts < playerCount) {
    state.currentPlayerIndex = (state.currentPlayerIndex + 1) % playerCount;
    attempts += 1;
  }
}

function moveSnails(state, dice) {
  const moveCounts = {};
  dice.forEach((index) => {
    moveCounts[index] = (moveCounts[index] || 0) + 1;
  });

  Object.keys(moveCounts).forEach((indexText) => {
    const index = Number(indexText);
    const snail = state.snails[index];
    if (state.eliminated[snail.color]) {
      return;
    }

    let spaces = moveCounts[index] + (state.trainingBonus[snail.color] || 0);
    if (state.drugged[snail.color]) {
      spaces *= 2;
    }

    snail.position = Math.min(snail.position + spaces, state.config.trackLength);
  });

  SNAILS.forEach((snail) => {
    state.drugged[snail.color] = false;
  });
}

function getRaceRanking(state) {
  return state.snails.slice().sort((left, right) => {
    const leftEliminated = state.eliminated[left.color] ? 1 : 0;
    const rightEliminated = state.eliminated[right.color] ? 1 : 0;
    if (leftEliminated !== rightEliminated) {
      return leftEliminated - rightEliminated;
    }
    if (right.position !== left.position) {
      return right.position - left.position;
    }
    return getSnailIndex(left.color) - getSnailIndex(right.color);
  });
}

function getWinner(state) {
  const finished = state.snails.filter((snail) => snail.position >= state.config.trackLength && !state.eliminated[snail.color]);
  if (finished.length === 0) {
    return null;
  }
  return getRaceRanking(state)[0];
}

function resolveBets(state, winningColor) {
  const betLog = [];
  state.players.forEach((player) => {
    player.bets.forEach((bet) => {
      if (bet.snailColor === winningColor) {
        const payout = Math.floor(bet.amount * bet.multiplier);
        player.coins += payout;
        betLog.push({
          playerName: player.name,
          snailColor: winningColor,
          amount: bet.amount,
          multiplier: bet.multiplier,
          payout,
        });
      }
    });
  });
  return betLog;
}

function resolveShares(state, ranking) {
  const shareLog = [];
  for (let place = 1; place <= 3; place += 1) {
    const snailColor = ranking[place - 1].color;
    const payout = state.config.sharePayouts[place];
    state.players.forEach((player) => {
      const count = player.shares[snailColor] || 0;
      if (count > 0) {
        const total = count * payout;
        player.coins += total;
        shareLog.push({
          playerName: player.name,
          snailColor,
          count,
          payout,
          total,
          place,
        });
      }
    });
  }
  return shareLog;
}

function adjustRaceStress(state, ranking) {
  ranking.forEach((snail, index) => {
    if (state.eliminated[snail.color]) {
      return;
    }
    if (index < 3) {
      snail.stress = Math.max(0, snail.stress - 1);
    } else {
      snail.stress += 1;
    }
  });
}

function serviceDebt(state) {
  const debtLog = [];
  state.players.forEach((player) => {
    if (player.coins < 0) {
      const fee = Math.ceil(Math.abs(player.coins) / 2);
      player.coins -= fee;
      debtLog.push({
        playerName: player.name,
        fee,
        newBalance: player.coins,
      });
    }
  });
  return debtLog;
}

function listShareForSale(state, playerIndex, assetType, assetKey, price) {
  const player = state.players[playerIndex];
  if (!Number.isFinite(price) || price < 1) {
    return false;
  }

  if (assetType === "snail") {
    if ((player.shares[assetKey] || 0) < 1) {
      return false;
    }
    player.shares[assetKey] -= 1;
    state.snailShares[assetKey] = Math.max(0, (state.snailShares[assetKey] || 0) - 1);
  } else if (assetType === "shop") {
    if ((player.shopShares[assetKey] || 0) < 1) {
      return false;
    }
    player.shopShares[assetKey] -= 1;
  } else {
    return false;
  }

  state.marketListings.push({
    id: state.nextListingId,
    sellerId: playerIndex,
    assetType,
    assetKey,
    price,
  });
  state.nextListingId += 1;
  return true;
}

function buyListing(state, buyerIndex, listingId) {
  const listingIndex = state.marketListings.findIndex((listing) => listing.id === listingId);
  if (listingIndex === -1) {
    return { ok: false, reason: "listing_not_found" };
  }

  const listing = state.marketListings[listingIndex];
  if (listing.sellerId === buyerIndex) {
    return { ok: false, reason: "self_purchase" };
  }

  const buyer = state.players[buyerIndex];
  if (!canAfford(state, buyer, listing.price)) {
    return { ok: false, reason: "insufficient_funds" };
  }

  buyer.coins -= listing.price;
  state.players[listing.sellerId].coins += listing.price;

  if (listing.assetType === "snail") {
    buyer.shares[listing.assetKey] = (buyer.shares[listing.assetKey] || 0) + 1;
    state.snailShares[listing.assetKey] = (state.snailShares[listing.assetKey] || 0) + 1;
  } else if (listing.assetType === "shop") {
    buyer.shopShares[listing.assetKey] = (buyer.shopShares[listing.assetKey] || 0) + 1;
  }

  state.marketListings.splice(listingIndex, 1);
  return { ok: true, listing };
}

function buySnailShare(state, playerIndex, snailColor) {
  const player = state.players[playerIndex];
  if (!canAfford(state, player, state.config.shareCost)) {
    return false;
  }
  const totalForSnail = state.snailShares[snailColor] || 0;
  if (totalForSnail >= state.config.maxSharesPerSnail) {
    return false;
  }
  player.coins -= state.config.shareCost;
  player.shares[snailColor] = (player.shares[snailColor] || 0) + 1;
  state.snailShares[snailColor] = totalForSnail + 1;
  return true;
}

function buyShopShare(state, playerIndex, shopKey) {
  const player = state.players[playerIndex];
  if (!canAfford(state, player, state.config.shareCost)) {
    return false;
  }
  player.coins -= state.config.shareCost;
  player.shopShares[shopKey] = (player.shopShares[shopKey] || 0) + 1;
  return true;
}

function placeBet(state, playerIndex, snailColor, amount) {
  const player = state.players[playerIndex];
  if (amount < state.config.minWager || !canAfford(state, player, amount)) {
    return false;
  }
  player.coins -= amount;
  player.bets.push({
    snailColor,
    amount,
    multiplier: calculateMultiplier(state),
  });
  return true;
}

function drugSnail(state, playerIndex, snailColor) {
  const managerIndex = getMajorityShareholder(state, snailColor);
  const player = state.players[playerIndex];
  if (managerIndex === null || managerIndex !== playerIndex) {
    return false;
  }
  if (state.drugged[snailColor] || state.eliminated[snailColor]) {
    return false;
  }
  if (!canAfford(state, player, state.config.drugCost)) {
    return false;
  }

  player.coins -= state.config.drugCost;
  state.drugged[snailColor] = true;
  const snail = getSnail(state, snailColor);
  snail.stress += 1;

  if (snail.stress >= state.config.stressMax) {
    state.eliminated[snailColor] = true;
    state.drugged[snailColor] = false;
  }

  state.players.forEach((candidate) => {
    const shares = candidate.shopShares.colombia || 0;
    if (shares > 0) {
      candidate.coins += state.config.drugShopPayout * shares;
    }
  });

  return true;
}

function massageSnail(state, playerIndex, snailColor) {
  const managerIndex = getMajorityShareholder(state, snailColor);
  const player = state.players[playerIndex];
  const snail = getSnail(state, snailColor);
  if (managerIndex === null || managerIndex !== playerIndex) {
    return false;
  }
  if (!snail || snail.stress <= 0) {
    return false;
  }
  if (!canAfford(state, player, state.config.massageCost)) {
    return false;
  }

  player.coins -= state.config.massageCost;
  snail.stress = Math.max(0, snail.stress - state.config.massageStressRelief);
  state.players.forEach((candidate) => {
    const shares = candidate.shopShares.massageParlor || 0;
    if (shares > 0) {
      candidate.coins += state.config.massageShopPayout * shares;
    }
  });
  return true;
}

function trainSnail(state, playerIndex, snailColor, rng = Math.random) {
  const player = state.players[playerIndex];
  if ((player.shares[snailColor] || 0) < 1 || state.eliminated[snailColor]) {
    return { success: false };
  }
  if (!canAfford(state, player, state.config.trainCost)) {
    return { success: false };
  }

  player.coins -= state.config.trainCost;
  const roll = dieRoll(rng);
  const rolledColor = SNAILS[roll].color;
  const trained = rolledColor === snailColor;
  if (trained) {
    state.trainingBonus[snailColor] = (state.trainingBonus[snailColor] || 0) + 1;
  }

  const snail = getSnail(state, snailColor);
  snail.stress += 1;

  let broken = false;
  if (snail.stress >= state.config.stressMax) {
    state.eliminated[snailColor] = true;
    state.downtimeEliminated[snailColor] = true;
    broken = true;
  }

  state.players.forEach((candidate) => {
    const shares = candidate.shopShares.gym || 0;
    if (shares > 0) {
      candidate.coins += state.config.gymShopPayout * shares;
    }
  });

  return { success: true, rolledColor, trained, broken };
}

function summarizeAsset(listing) {
  if (listing.assetType === "snail") {
    return `${capitalize(listing.assetKey)} snail share`;
  }
  return `${SHOP_NAMES[listing.assetKey]} share`;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function makeRaceSummary(state, actorIndex, actionType, detail, dice) {
  return {
    kind: "race_turn",
    raceNumber: state.raceNumber,
    round: state.round,
    actorIndex,
    actorName: state.players[actorIndex].name,
    actionType,
    detail,
    dice,
    timestamp: new Date().toISOString(),
  };
}

function makeDowntimeSummary(state, actorIndex, actionType, detail) {
  return {
    kind: "downtime_submit",
    raceNumber: state.raceNumber,
    actorIndex,
    actorName: state.players[actorIndex].name,
    actionType,
    detail,
    timestamp: new Date().toISOString(),
  };
}

function initializeDowntime(state) {
  state.phase = "downtime_submit";
  state.players.forEach((_, index) => {
    if (state.resigned[index]) {
      state.downtimeActions[index] = { type: "resign", summary: "Resigned" };
      state.downtimeSubmitted[index] = true;
    } else {
      state.downtimeActions[index] = null;
      state.downtimeSubmitted[index] = false;
    }
  });
}

function startNextRaceInternal(state) {
  state.snails.forEach((snail) => {
    snail.position = 0;
    if (state.eliminated[snail.color]) {
      if (state.downtimeEliminated[snail.color]) {
        snail.stress = 0;
      } else {
        snail.stress = 0;
        state.eliminated[snail.color] = false;
      }
    }
  });

  state.players.forEach((player) => {
    player.bets = [];
  });

  SNAILS.forEach((snail) => {
    state.drugged[snail.color] = false;
    if (state.eliminated[snail.color] && !state.downtimeEliminated[snail.color]) {
      state.eliminated[snail.color] = false;
    }
    state.downtimeEliminated[snail.color] = false;
  });

  state.raceNumber += 1;
  state.round = 1;
  state.currentPlayerIndex = 0;
  state.phase = "race_turn";
  state.lastRoll = null;
  state.players.forEach((_, index) => {
    if (state.resigned[index]) {
      state.downtimeActions[index] = { type: "resign", summary: "Resigned" };
      state.downtimeSubmitted[index] = true;
    } else {
      state.downtimeActions[index] = null;
      state.downtimeSubmitted[index] = false;
    }
  });
  advancePastResigned(state);
}

function allDowntimeSubmitted(state) {
  return state.players.every((_, index) => state.downtimeSubmitted[index] || state.resigned[index]);
}

function areCurrentDowntimeActionsRevealed(state) {
  return state.phase !== "downtime_submit" || allDowntimeSubmitted(state);
}

function getVisibleDowntimeActions(state, seatIndex) {
  if (areCurrentDowntimeActionsRevealed(state)) {
    return structuredClone(state.downtimeActions);
  }

  const visible = {};
  state.players.forEach((_, index) => {
    visible[index] = index === seatIndex ? structuredClone(state.downtimeActions[index]) : null;
  });
  return visible;
}

function getVisibleRecentSummaries(state, seatIndex) {
  return structuredClone(state.recentSummaries.filter((summary) => {
    if (
      summary.kind === "downtime_submit" &&
      summary.raceNumber === state.raceNumber &&
      !areCurrentDowntimeActionsRevealed(state)
    ) {
      return summary.actorIndex === seatIndex;
    }
    return true;
  }));
}

function raceActionInvalid(message) {
  return { ok: false, error: message };
}

export function applyRaceAction(state, actorIndex, intent, rng = Math.random) {
  if (state.status !== "active" || state.phase !== "race_turn") {
    return raceActionInvalid("Game is not accepting race actions.");
  }
  if (actorIndex !== state.currentPlayerIndex) {
    return raceActionInvalid("It is not this player's turn.");
  }

  const nextState = cloneGameState(state);
  const detail = {};
  let valid = false;

  if (intent.type === "bet") {
    valid = placeBet(nextState, actorIndex, intent.snailColor, intent.amount);
    detail.snailColor = intent.snailColor;
    detail.amount = intent.amount;
    detail.multiplier = calculateMultiplier(state);
  } else if (intent.type === "buy_snail_share") {
    valid = buySnailShare(nextState, actorIndex, intent.snailColor);
    detail.snailColor = intent.snailColor;
    detail.cost = nextState.config.shareCost;
  } else if (intent.type === "drug") {
    valid = drugSnail(nextState, actorIndex, intent.snailColor);
    detail.snailColor = intent.snailColor;
    detail.cost = nextState.config.drugCost;
  } else if (intent.type === "market_buy") {
    const purchase = buyListing(nextState, actorIndex, intent.listingId);
    valid = purchase.ok;
    detail.listingId = intent.listingId;
    detail.asset = purchase.listing ? summarizeAsset(purchase.listing) : null;
    detail.price = purchase.listing ? purchase.listing.price : null;
  } else if (intent.type === "market_list") {
    valid = listShareForSale(nextState, actorIndex, intent.assetType, intent.assetKey, intent.price);
    detail.assetType = intent.assetType;
    detail.assetKey = intent.assetKey;
    detail.price = intent.price;
  } else if (intent.type === "buy_shop_share") {
    valid = buyShopShare(nextState, actorIndex, intent.shopKey);
    detail.shopKey = intent.shopKey;
    detail.cost = nextState.config.shareCost;
  } else if (intent.type === "skip_roll") {
    valid = true;
  } else {
    return raceActionInvalid("Unsupported race action.");
  }

  if (!valid) {
    return raceActionInvalid("Race action could not be applied.");
  }

  const dice = rollDice(rng);
  moveSnails(nextState, dice);
  nextState.lastRoll = dice;
  const summary = makeRaceSummary(nextState, actorIndex, intent.type, detail, dice);

  const winner = getWinner(nextState);
  if (winner) {
    const ranking = getRaceRanking(nextState);
    const betLog = resolveBets(nextState, winner.color);
    const shareLog = resolveShares(nextState, ranking);
    adjustRaceStress(nextState, ranking);
    const debtLog = serviceDebt(nextState);

    nextState.raceResults.push({
      raceNumber: nextState.raceNumber,
      ranking: ranking.map((snail) => ({
        color: snail.color,
        position: snail.position,
        eliminated: nextState.eliminated[snail.color],
      })),
      betLog,
      shareLog,
      debtLog,
    });

    summary.raceComplete = {
      raceNumber: nextState.raceNumber,
      winnerColor: winner.color,
      ranking: ranking.map((snail) => ({
        color: snail.color,
        position: snail.position,
        eliminated: nextState.eliminated[snail.color],
      })),
      betLog,
      shareLog,
      debtLog,
    };

    if (nextState.raceNumber >= nextState.config.totalRaces) {
      nextState.status = "complete";
      nextState.phase = "complete";
      nextState.finalRanking = nextState.players
        .map((player, index) => ({
          index,
          name: player.name,
          coins: player.coins,
        }))
        .sort((left, right) => right.coins - left.coins);
      summary.gameComplete = true;
    } else {
      initializeDowntime(nextState);
    }
  } else {
    nextTurn(nextState);
  }

  nextState.version += 1;
  pushSummary(nextState, summary);
  return { ok: true, state: nextState, summary };
}

export function applyDowntimeAction(state, actorIndex, intent, rng = Math.random, options = {}) {
  const autoAdvance = options.autoAdvance !== false;
  if (state.status !== "active" || state.phase !== "downtime_submit") {
    return { ok: false, error: "Game is not accepting downtime submissions." };
  }
  if (state.downtimeSubmitted[actorIndex]) {
    return { ok: false, error: "This player already submitted downtime." };
  }

  const nextState = cloneGameState(state);
  const detail = {};
  let valid = false;
  let summaryText = "Passed";

  if (intent.type === "massage") {
    valid = massageSnail(nextState, actorIndex, intent.snailColor);
    summaryText = `Massaged ${capitalize(intent.snailColor)} (-$${nextState.config.massageCost}, -${nextState.config.massageStressRelief} stress)`;
    detail.snailColor = intent.snailColor;
  } else if (intent.type === "train") {
    const result = trainSnail(nextState, actorIndex, intent.snailColor, rng);
    valid = result.success;
    if (valid) {
      summaryText = `Trained ${capitalize(intent.snailColor)} (-$${nextState.config.trainCost}). Rolled ${capitalize(result.rolledColor)}.`;
      if (result.trained) {
        summaryText += " Training succeeded.";
      } else {
        summaryText += " Training failed.";
      }
      if (result.broken) {
        summaryText += " Snail broke down from stress.";
      }
      detail.result = result;
      detail.snailColor = intent.snailColor;
    }
  } else if (intent.type === "buy_shop_share") {
    valid = buyShopShare(nextState, actorIndex, intent.shopKey);
    summaryText = `Bought ${SHOP_NAMES[intent.shopKey]} share (-$${nextState.config.shareCost})`;
    detail.shopKey = intent.shopKey;
  } else if (intent.type === "market_buy") {
    const purchase = buyListing(nextState, actorIndex, intent.listingId);
    valid = purchase.ok;
    if (valid) {
      summaryText = `Bought ${summarizeAsset(purchase.listing)} for $${purchase.listing.price}`;
      detail.listingId = intent.listingId;
      detail.asset = summarizeAsset(purchase.listing);
    }
  } else if (intent.type === "market_list") {
    valid = listShareForSale(nextState, actorIndex, intent.assetType, intent.assetKey, intent.price);
    summaryText = `Listed ${intent.assetType === "snail" ? capitalize(intent.assetKey) : SHOP_NAMES[intent.assetKey]} for $${intent.price}`;
    detail.assetType = intent.assetType;
    detail.assetKey = intent.assetKey;
    detail.price = intent.price;
  } else if (intent.type === "pass") {
    valid = true;
  } else {
    return { ok: false, error: "Unsupported downtime action." };
  }

  if (!valid) {
    return { ok: false, error: "Downtime action could not be applied." };
  }

  nextState.downtimeActions[actorIndex] = {
    type: intent.type,
    summary: summaryText,
  };
  nextState.downtimeSubmitted[actorIndex] = true;

  const summary = makeDowntimeSummary(nextState, actorIndex, intent.type, {
    summary: summaryText,
    ...detail,
  });

  if (allDowntimeSubmitted(nextState)) {
    summary.downtimeComplete = true;
    if (autoAdvance) {
      startNextRaceInternal(nextState);
      summary.nextRaceStarted = {
        raceNumber: nextState.raceNumber,
      };
    }
  }

  nextState.version += 1;
  pushSummary(nextState, summary);
  return { ok: true, state: nextState, summary };
}

export function startNextRace(state) {
  if (state.phase !== "downtime_submit") {
    return { ok: false, error: "Game is not in downtime." };
  }
  if (!allDowntimeSubmitted(state)) {
    return { ok: false, error: "Not all players have submitted downtime." };
  }
  const nextState = cloneGameState(state);
  startNextRaceInternal(nextState);
  nextState.version += 1;
  const summary = {
    kind: "system",
    actionType: "start_next_race",
    raceNumber: nextState.raceNumber,
    timestamp: new Date().toISOString(),
  };
  pushSummary(nextState, summary);
  return { ok: true, state: nextState, summary };
}

export function archiveGameState(state) {
  const nextState = cloneGameState(state);
  nextState.status = "archived";
  nextState.phase = "complete";
  nextState.idleDeadlineAt = null;
  nextState.version += 1;
  return nextState;
}

export function hostSkipSeat(state, seatIndex, options = {}) {
  if (state.phase === "race_turn") {
    return applyRaceAction(state, seatIndex, { type: "skip_roll" }, options.rng || Math.random);
  }
  if (state.phase === "downtime_submit") {
    return applyDowntimeAction(state, seatIndex, { type: "pass" }, options.rng || Math.random, {
      autoAdvance: options.autoAdvance !== false,
    });
  }
  return { ok: false, error: "Game cannot skip seats in the current phase." };
}

export function applyResign(state, actorIndex) {
  if (state.status !== "active") {
    return { ok: false, error: "Game is not active." };
  }
  if (state.resigned[actorIndex]) {
    return { ok: false, error: "Already resigned." };
  }

  const nextState = cloneGameState(state);
  nextState.resigned[actorIndex] = true;

  // Return any market listings by this player
  nextState.marketListings = nextState.marketListings.filter((listing) => {
    if (listing.sellerId === actorIndex) {
      if (listing.assetType === "snail") {
        nextState.players[actorIndex].shares[listing.assetKey] = (nextState.players[actorIndex].shares[listing.assetKey] || 0) + 1;
        nextState.snailShares[listing.assetKey] = (nextState.snailShares[listing.assetKey] || 0) + 1;
      } else if (listing.assetType === "shop") {
        nextState.players[actorIndex].shopShares[listing.assetKey] = (nextState.players[actorIndex].shopShares[listing.assetKey] || 0) + 1;
      }
      return false;
    }
    return true;
  });

  const summary = {
    kind: "system",
    actionType: "resign",
    actorIndex,
    actorName: nextState.players[actorIndex].name,
    timestamp: new Date().toISOString(),
  };

  const activePlayers = nextState.players.filter((_, i) => !nextState.resigned[i]);
  if (activePlayers.length <= 1) {
    nextState.status = "complete";
    nextState.phase = "complete";
    nextState.finalRanking = nextState.players
      .map((player, index) => ({
        index,
        name: player.name,
        coins: player.coins,
        resigned: !!nextState.resigned[index],
      }))
      .sort((a, b) => {
        if (a.resigned !== b.resigned) return a.resigned ? 1 : -1;
        return b.coins - a.coins;
      });
    summary.gameComplete = true;
  } else {
    if (nextState.phase === "race_turn" && nextState.currentPlayerIndex === actorIndex) {
      advancePastResigned(nextState);
    }
    if (nextState.phase === "downtime_submit" && !nextState.downtimeSubmitted[actorIndex]) {
      nextState.downtimeSubmitted[actorIndex] = true;
      nextState.downtimeActions[actorIndex] = { type: "resign", summary: "Resigned" };
      if (allDowntimeSubmitted(nextState)) {
        summary.downtimeComplete = true;
        startNextRaceInternal(nextState);
        summary.nextRaceStarted = { raceNumber: nextState.raceNumber };
      }
    }
  }

  nextState.version += 1;
  pushSummary(nextState, summary);
  return { ok: true, state: nextState, summary };
}

export function getAllowedActions(state, seatIndex) {
  if (state.status !== "active") {
    return [];
  }
  if (state.resigned[seatIndex]) {
    return [];
  }

  if (state.phase === "race_turn") {
    if (seatIndex !== state.currentPlayerIndex) {
      return ["resign"];
    }
    return ["bet", "buy_snail_share", "buy_shop_share", "drug", "market_buy", "market_list", "skip_roll", "resign"];
  }

  if (state.phase === "downtime_submit") {
    if (state.downtimeSubmitted[seatIndex]) {
      return [];
    }
    return ["massage", "train", "buy_shop_share", "market_buy", "market_list", "pass", "resign"];
  }

  return [];
}

export function getStandings(state) {
  return state.players
    .map((player, index) => ({
      index,
      name: player.name,
      coins: player.coins,
      resigned: !!state.resigned[index],
    }))
    .sort((left, right) => {
      if (left.resigned !== right.resigned) return left.resigned ? 1 : -1;
      return right.coins - left.coins;
    });
}

export function getProfitProjection(state) {
  const ranking = getRaceRanking(state);
  const placements = {};
  ranking.slice(0, 3).forEach((snail, index) => {
    placements[snail.color] = index + 1;
  });

  return SNAILS.map((snail) => {
    const entries = [];
    state.players.forEach((player, index) => {
      let projected = 0;
      const shareCount = player.shares[snail.color] || 0;
      const place = placements[snail.color];
      if (shareCount > 0 && place && state.config.sharePayouts[place]) {
        projected += shareCount * state.config.sharePayouts[place];
      }

      player.bets.forEach((bet) => {
        if (bet.snailColor === snail.color) {
          projected += Math.floor(bet.amount * bet.multiplier);
        }
      });

      if (projected > 0) {
        entries.push({
          seatIndex: index,
          playerName: player.name,
          projected,
          shareCount,
        });
      }
    });

    return {
      snailColor: snail.color,
      entries,
    };
  });
}

export function getManagerMap(state) {
  const map = {};
  SNAILS.forEach((snail) => {
    const managerIndex = getMajorityShareholder(state, snail.color);
    map[snail.color] = managerIndex === null ? null : {
      seatIndex: managerIndex,
      playerName: state.players[managerIndex].name,
    };
  });
  return map;
}

export function buildGameView(state, seatIndex, session = {}) {
  const currentPlayer = state.players[seatIndex] || null;
  return {
    gameId: session.gameId || null,
    status: state.status,
    phase: state.phase,
    raceNumber: state.raceNumber,
    round: state.round,
    currentSeatId: state.phase === "race_turn" ? state.currentPlayerIndex : null,
    version: state.version,
    idleDeadlineAt: state.idleDeadlineAt,
    publicState: {
      snails: state.snails.map((snail) => ({
        color: snail.color,
        label: snail.label,
        css: snail.css,
        position: snail.position,
        stress: snail.stress,
        eliminated: !!state.eliminated[snail.color],
        trainingBonus: state.trainingBonus[snail.color] || 0,
        drugged: !!state.drugged[snail.color],
      })),
      players: state.players.map((player, index) => ({
        seatIndex: index,
        name: player.name,
        coins: player.coins,
        shares: structuredClone(player.shares),
        shopShares: structuredClone(player.shopShares),
      })),
      standings: getStandings(state),
      managerMap: getManagerMap(state),
      marketListings: state.marketListings.map((listing) => ({
        ...listing,
        sellerName: state.players[listing.sellerId].name,
      })),
      profitProjection: getProfitProjection(state),
      recentSummaries: getVisibleRecentSummaries(state, seatIndex),
      resigned: structuredClone(state.resigned),
      downtimeSubmitted: structuredClone(state.downtimeSubmitted),
      downtimeActions: getVisibleDowntimeActions(state, seatIndex),
      lastRoll: structuredClone(state.lastRoll),
      raceResults: structuredClone(state.raceResults),
      finalRanking: structuredClone(state.finalRanking),
    },
    privateState: currentPlayer
      ? {
          seatIndex,
          seatName: currentPlayer.name,
          coins: currentPlayer.coins,
          bets: structuredClone(currentPlayer.bets),
          shares: structuredClone(currentPlayer.shares),
          shopShares: structuredClone(currentPlayer.shopShares),
          downtimeSubmitted: !!state.downtimeSubmitted[seatIndex],
          downtimeAction: structuredClone(state.downtimeActions[seatIndex]),
          allowedActions: getAllowedActions(state, seatIndex),
          session,
        }
      : null,
  };
}
