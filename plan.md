# PRD: AI Bot Players for Snail Betting (Local Hotseat Mode)

## 1. Overview

Add AI-controlled bot players to local hotseat mode so a single human can play a full strategic game without needing other people present. Bots should feel like plausible opponents — not omniscient optimizers, but players with recognizable styles and the occasional bad read.

---

## 2. Motivation

The game currently requires 2–4 humans sharing one device. This limits when and how often someone can play. Bots solve this by:

- Enabling solo play against 1–3 opponents with distinct personalities
- Letting players practice strategy before playing with friends
- Making the game immediately playable on first visit (no need to recruit players)

---

## 3. Design Principles

1. **No new files** — all bot logic lives inline in `index.html`, consistent with the existing no-build architecture.
2. **Bots use the same game state** — no separate data paths. Bot actions call the same functions humans use (`placeBet`, `buyShare`, `drugSnail`, etc.).
3. **Bots are visible, not hidden** — their actions appear in the activity feed and UI exactly as a human's would. The only difference is automatic input.
4. **Personality over perfection** — bots should have distinct, legible strategies rather than game-theoretically optimal play. Players should be able to learn each bot's tendencies.
5. **Minimal UI disruption** — the setup screen gains bot toggles; the game screen needs only a brief "thinking" pause before bot turns auto-resolve.

---

## 4. Bot Personality System

Each bot has a **personality archetype** that biases its decision weights. Four archetypes ship initially:

| Archetype | Style | Betting Bias | Share Bias | Drug/Stress Bias | Risk Tolerance |
|-----------|-------|-------------|------------|-----------------|----------------|
| **Gambler** | High-risk, high-reward | Prefers large bets on longshots (early high-multiplier bets) | Ignores shares mostly | Rarely drugs | High |
| **Mogul** | Portfolio builder | Conservative small bets | Aggressively buys shares for dividends/payouts | Drugs own snails for profit when holding Colombia shares | Medium |
| **Saboteur** | Chaos agent | Medium bets on leading snails | Buys shares to become manager | Drugs opponents' snails to raise stress toward elimination | High |
| **Analyst** | Calculated and balanced | Bets proportional to simulated win probability | Buys shares in top-2 probable winners | Only drugs when expected value is clearly positive | Low |

### 4.1 Decision Weight Model

Each turn, the bot scores every legal action using a weighted evaluation:

```
score(action) = Σ (weight_i × factor_i)
```

Factors include:
- **Expected coin value** of the action (bet EV using `simulateWinProbabilities()`, share payout EV, drug cost vs Colombia income)
- **Position control** — does this action give manager status or block an opponent?
- **Risk factor** — how volatile is the outcome? (personality scales this)
- **Stress awareness** — current stress of target snail, proximity to elimination
- **Game phase** — early race favors shares/bets, late race favors safe bets, late game favors coin-maximizing plays
- **Coin situation** — how many coins the bot has relative to opponents (desperation scaling)

The personality archetype provides a **weight vector** that amplifies or dampens each factor. A small random noise term (±10–15%) prevents bots from being fully deterministic.

### 4.2 Downtime Decisions

During downtime between races, bots evaluate:
- **Massage**: If managing a high-stress snail they hold shares in — weighted highly for Mogul/Analyst
- **Train**: If they hold shares in an underperforming snail — weighted for Gambler/Saboteur (risk-tolerant)
- **Buy shop share**: If a shop has been generating consistent income — weighted for Mogul
- **Sell share**: If holding shares in an eliminated or high-stress snail — weighted for Analyst
- **Pass**: Fallback if no action clears a minimum score threshold

### 4.3 Market Behavior

Bots can list shares for sale and buy from the market:
- **Listing**: Bot lists a share when its internal valuation drops below a sell threshold (e.g., snail eliminated, high stress, already lost a race)
- **Buying**: Bot buys a listing when the price is below its internal valuation of the asset
- **Pricing**: Sell price = internal valuation × personality multiplier (Gambler overprices, Analyst prices fairly, Mogul underprices for liquidity)

---

## 5. State Changes

### 5.1 Player Object Extension

```javascript
// Existing player shape, extended:
{
  name: "Mogul Bot",
  coins: 100,
  bets: [],
  shares: {},
  shopShares: {},
  // NEW fields:
  isBot: true,           // Flags this player as AI-controlled
  botArchetype: "mogul"  // One of: "gambler", "mogul", "saboteur", "analyst"
}
```

No other state shape changes. Bots are players — they just have two extra properties.

### 5.2 Constants

```javascript
const BOT_THINK_DELAY = 800;      // ms pause before bot acts (feels natural)
const BOT_ROLL_DELAY = 400;       // ms pause before bot rolls dice
const BOT_NOISE = 0.12;           // ±12% random noise on action scores
const BOT_ARCHETYPES = ['gambler', 'mogul', 'saboteur', 'analyst'];
const BOT_NAMES = {
  gambler:  ['Lucky', 'Dice', 'Jackpot', 'Bluff'],
  mogul:    ['Baron', 'Tycoon', 'Vault', 'Ledger'],
  saboteur: ['Chaos', 'Gremlin', 'Hex', 'Jinx'],
  analyst:  ['Calc', 'Sigma', 'Logic', 'Bayes']
};
```

---

## 6. Core Bot Logic

### 6.1 Turn Entry Point

```
function executeBotTurn(player):
  if not player.isBot → return (human plays normally)

  show "thinking" indicator on UI
  wait BOT_THINK_DELAY

  actions = enumerateLegalActions(player)
  scored = actions.map(a => { action: a, score: evaluateAction(a, player) })
  best = pickWeightedTop(scored)  // Top action, with noise applied

  executeAction(best)  // Calls existing game functions
  wait BOT_ROLL_DELAY
  doRoll()             // Triggers dice roll, movement, win check
```

### 6.2 Action Enumeration

`enumerateLegalActions(player)` returns all currently valid actions:

- **Bet on snail X for amount Y**: For each non-eliminated snail × each affordable wager amount (in WAGER_STEP increments from MIN_WAGER to max affordable). To keep the search space manageable, bots consider 3 wager levels: minimum (10), medium (30 or half of coins), and aggressive (60 or max affordable).
- **Buy share of snail X**: For each snail with shares remaining, if player can afford SHARE_COST.
- **Drug snail X**: For each snail the player manages (majority shareholder), if not already drugged, not eliminated, if player can afford DRUG_COST.
- **Buy shop share X**: For each shop, if player can afford SHARE_COST.
- **Skip**: Always available.

### 6.3 Action Evaluation

Each action type has an evaluation function that returns a raw score. The personality weight vector then scales specific components:

**Bet evaluation:**
```
winProb = simulateWinProbabilities()[snailColor]
ev = (winProb × wager × multiplier) - ((1 - winProb) × wager)
riskFactor = wager / player.coins  // How much of bankroll is at stake
score = ev × weights.betEV + riskFactor × weights.risk + multiplier × weights.longshot
```

**Share evaluation:**
```
winProb = simulateWinProbabilities()[snailColor]
expectedPayout = winProb × SHARE_PAYOUTS[1] + secondProb × SHARE_PAYOUTS[2] + thirdProb × SHARE_PAYOUTS[3]
managerBonus = (wouldBecomeManager ? weights.control × 15 : 0)
score = (expectedPayout - SHARE_COST) × weights.shareEV + managerBonus
```

**Drug evaluation:**
```
stressRisk = snail.stress / STRESS_MAX
colombiaIncome = player.shopShares.colombia × DRUG_SHOP_PAYOUT
positionGain = estimateMovementValue(snail)
score = (colombiaIncome + positionGain - DRUG_COST) × weights.drugEV - stressRisk × weights.stressAversion
```

**Skip evaluation:**
```
score = weights.passivity × (1 + conservatismByGamePhase())
// Higher in late game when leading, lower when behind
```

### 6.4 Personality Weight Vectors

```javascript
const BOT_WEIGHTS = {
  gambler:  { betEV: 1.0, risk: +0.5, longshot: 0.8, shareEV: 0.3, control: 0.2, drugEV: 0.3, stressAversion: 0.3, passivity: 0.1 },
  mogul:    { betEV: 0.6, risk: -0.3, longshot: 0.1, shareEV: 1.0, control: 0.9, drugEV: 0.8, stressAversion: 0.7, passivity: 0.3 },
  saboteur: { betEV: 0.7, risk: +0.3, longshot: 0.3, shareEV: 0.5, control: 1.0, drugEV: 1.0, stressAversion: 0.1, passivity: 0.1 },
  analyst:  { betEV: 1.0, risk: -0.4, longshot: 0.0, shareEV: 0.8, control: 0.5, drugEV: 0.5, stressAversion: 0.9, passivity: 0.4 }
};
```

---

## 7. UI Changes

### 7.1 Setup Screen

The player setup screen gains a **bot toggle** per player slot:

- Each player slot (2–4) shows a toggle: **Human / Bot**
- Player 1 is always human (cannot be toggled to bot)
- When toggled to Bot, the name input is replaced with an **archetype picker** (4 buttons or dropdown: Gambler / Mogul / Saboteur / Analyst)
- Bot name auto-populates from `BOT_NAMES[archetype]` (random pick, no duplicates)
- A small archetype description tooltip appears on hover/tap (e.g., "Gambler: Loves longshot bets and big risks")
- A "Quick Play" button pre-fills 3 bot opponents (random archetypes) for instant solo start

### 7.2 Game Screen — Bot Turn Indicator

When it's a bot's turn:

- The header shows the bot name + archetype badge (e.g., "Lucky (Gambler)")
- A brief "thinking..." animation plays (pulsing dots, CSS-only)
- The betting panel is **disabled/grayed** (no human interaction needed)
- After the bot acts, the activity feed shows what it did (same format as human actions)
- Dice roll plays the same animation as human rolls
- Turn auto-advances to next player after roll resolves

### 7.3 Downtime Screen — Bot Actions

- Bot downtime actions resolve automatically with a short delay
- Each bot's chosen action appears as a summary card (same as human actions post-submission)
- The "waiting for players" state only waits on human players; bots submit instantly (with staggered delays for readability)

### 7.4 Archetype Visual Identity

Each archetype gets a subtle color accent used in name badges and activity feed entries:

| Archetype | Accent Color | Badge |
|-----------|-------------|-------|
| Gambler | Gold (#D4A017) | dice icon |
| Mogul | Forest (#2E7D32) | coin icon |
| Saboteur | Crimson (#C62828) | fire icon |
| Analyst | Steel (#1565C0) | chart icon |

These are decorative only — they don't affect the snail colors or track display.

---

## 8. Implementation Plan

### Phase 1: State & Setup (Foundation)
1. Add `isBot` and `botArchetype` fields to player initialization in `initGame()`
2. Add bot-related constants (`BOT_THINK_DELAY`, `BOT_ARCHETYPES`, `BOT_NAMES`, `BOT_WEIGHTS`)
3. Modify setup screen HTML/CSS to add Human/Bot toggle per player slot
4. Add archetype picker UI (appears when Bot is selected)
5. Add "Quick Play" button for instant solo game with 3 random bots
6. Wire setup to pass bot config into `initGame()`

### Phase 2: Bot Decision Engine (Core Logic)
7. Implement `enumerateLegalActions(player)` — returns all valid actions for current game state
8. Implement evaluation functions for each action type (bet, share, drug, shop, skip)
9. Implement `evaluateAction(action, player)` — applies personality weights + noise
10. Implement `pickWeightedTop(scoredActions)` — selects best action with noise-based variance
11. Implement `executeBotTurn(player)` — orchestrates think delay → evaluate → execute → roll
12. Implement `executeBotDowntime(player)` — evaluates and submits downtime action
13. Implement bot market behavior (listing valuation, buy decisions, pricing)

### Phase 3: Turn Flow Integration
14. Modify `nextTurn()` to detect bot players and auto-trigger `executeBotTurn()`
15. Modify downtime flow to auto-submit bot actions with staggered delays
16. Modify `renderBettingPanel()` to show disabled state during bot turns
17. Add "thinking..." indicator to header during bot turns
18. Ensure activity feed correctly logs bot actions with archetype badges
19. Handle edge cases: all remaining players are bots (auto-play to completion), bot is only player left, etc.

### Phase 4: Polish & Feel
20. Add archetype color accents and icons to UI elements (name badges, feed entries)
21. Add archetype description tooltips on setup screen
22. Tune bot delays for game feel (not too fast to follow, not too slow to bore)
23. Add brief "bot chose X" summary toast/highlight so human can track what happened
24. Test each archetype against the others to verify distinct play patterns
25. Verify high score still works correctly in single-human-vs-bots games

---

## 9. Edge Cases & Rules

- **Player 1 is always human.** At least one human player is required.
- **Bots cannot interact with UI.** All bot actions go through game-state functions, never DOM events.
- **Bot turn speed** should be fast enough to not bore, slow enough to follow. The think delay (800ms) + roll animation (~600ms) means a bot turn takes ~1.4s.
- **If all humans are eliminated from coin contention** (e.g., deep in debt), the game still plays to completion — bots don't concede.
- **Bots use `simulateWinProbabilities()`** for decisions — the same Monte Carlo function available to human players in the info panel. This is intentionally fair: bots have no information advantage.
- **Save/restore**: If game state persistence is ever added, `isBot` and `botArchetype` serialize naturally as part of the player object.

---

## 10. What This PRD Does NOT Cover

- **Online async mode bots** — deferred to a future phase. The bot engine is pure-function and could be ported to `async-engine.js` later, but network timing, edge function execution, and multiplayer sync are separate concerns.
- **Difficulty levels** — the personality system provides variety, not difficulty scaling. A future iteration could add noise scaling (more noise = easier, less noise = harder).
- **Learning/adaptive bots** — bots don't adjust strategy based on prior games. Each game is independent.
- **Custom bot configuration** — players can't tune weight vectors. They pick an archetype and get that archetype's personality.

---

## 11. Success Criteria

- A player can start a solo game against 1–3 bots in under 5 seconds (Quick Play)
- Bot turns resolve in < 2 seconds with visible feedback
- Each archetype produces recognizably different play patterns over a 3-race game
- No game state bugs — bots never take illegal actions, overspend, or break turn flow
- Activity feed and race results are fully readable with bot players included
- Game feel is "playing against people" not "watching an algorithm"
