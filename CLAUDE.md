# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This repository is now the working copy for a new mechanical-system variant derived from Snail Betting.

The current codebase is still the original Snail Betting implementation: a web-based snail racing and betting game inspired by Camel Up. Players watch 6 colored snails race across a 12-space track and place bets on the winner. Earlier bets pay better odds based on the race state.

When making changes, treat the existing game as the baseline to evolve rather than the final product. New work should move the project toward the new mechanical system while keeping the app playable unless the task explicitly calls for a larger rewrite.

## Architecture

There are **two parallel implementations** of the game that share no code:

### Local Hotseat Mode (`index.html`)
Single-file application: HTML, CSS, and vanilla JS game engine are all inline. No dependencies, no build step, no framework. Game state is a single mutable `state` object; functions mutate it directly.

**To run:** Open `index.html` in a browser. No server required.

#### AI Bot System (local mode only)
The game supports AI bot opponents in local hotseat mode. All bot logic lives inline in `index.html` — no new files. The system has four layers:

- **Constants & Setup** (~lines 1015–1036): `BOT_ARCHETYPES`, `BOT_NAMES`, `BOT_ARCHETYPE_META`, `BOT_WEIGHTS` (personality weight vectors), `BOT_THINK_DELAY`, `BOT_NOISE`. Players are initialized via `initGame()` with `{ name, isBot, botArchetype }` config objects.
- **Decision Engine** (Phase 2): `enumerateLegalActions()` lists all valid actions; `evaluateAction()` scores them using personality weights, Monte Carlo win probabilities (`simulateWinProbabilities()`), game phase, and coin position; `pickWeightedTop()` selects from top-3 with noise. Separate `enumerateDowntimeActions()` / `evaluateDowntimeAction()` / `executeBotDowntime()` handle between-race decisions.
- **Turn Flow Integration** (Phase 3): `checkAndRunBotTurn()` is called after `nextTurn()`, game start, and race start. Bot downtime auto-submits with staggered delays. Human UI is disabled during bot turns via `isCurrentPlayerBot()` guards.
- **Four personality archetypes**: Gambler (high-risk bets), Mogul (portfolio/shares), Saboteur (control/chaos), Analyst (calculated EV). Each has a weight vector that biases action scoring.

Bots call the exact same game functions as humans (`placeBet`, `buyShare`, `drugSnail`, etc.) — no separate code paths. The PRD for the bot system is in `plan.md`.

### Online Async Mode (`app/`)
ES module architecture across four files:
- `app/async-engine.js` — Pure-function game engine (takes state, returns new state). Also runs server-side in Supabase edge functions.
- `app/online-ui.js` — Full UI layer with its own CSS (injected, `og-` prefixed classes), rendering, and screen management.
- `app/online-api.js` — Networking layer (Supabase edge function calls, session tokens, polling).
- `app/online-view-state.js` — Version-based view reconciliation for async responses.

**Rendering** in both modes uses direct DOM manipulation (`textContent`, `createElement`) and should continue to avoid unsafe insertion of user-controlled content.

## Dual-Mode Sync Rule

**When changing any game mechanic, rule, constant, balance value, UI component, or visual feature, the change MUST be applied to BOTH modes unless the feature is inherently mode-specific** (e.g., networking, polling, invite links, resign/concede are online-only; high score is local-only).

Specifically:
- **Game rules and constants** are duplicated in `index.html` (global vars/functions) and `app/async-engine.js` (ES module exports). Any rule change must update both.
- **Rendering and CSS** are duplicated in `index.html` (inline) and `app/online-ui.js` (injected styles with `og-` prefix). Any visual change must update both.
- After making a change to one mode, always check whether the equivalent logic exists in the other mode and update it too.
- If adding a new feature to one mode, note in the commit message or PR description whether it was also added to the other mode, and if not, why not.

## Development Guidance

- Preserve the no-build, no-dependency setup unless the task clearly justifies a structural change.
- Keep the app mobile-first and playable in a normal browser by opening `index.html` directly.
- If introducing the new mechanical system incrementally, prefer small, testable changes to game state shape, turn flow, scoring, and rendering.
- If the mechanics diverge enough that "snail betting" is no longer an accurate name, update UI copy, storage keys, and documentation together rather than leaving mixed terminology.
- Document any new rules close to the code that enforces them. The mechanics are the product, so unclear logic is a maintenance problem.

## Key Constraints

- Must work on iOS Safari (mobile-first, touch targets >= 44px, `100dvh` viewport)
- All user input must be sanitized - never use `innerHTML` with untrusted content
- High score persistence uses `localStorage` with key `snailBettingHighScore` — triggers for solo human play (including human-vs-bots games)
- If the game identity changes, update persisted storage keys deliberately to avoid mixing old and new save data
- Bot logic is local-mode only (`index.html`). The PRD notes it could be ported to `async-engine.js` in the future but that is not yet done.
- Never use `innerHTML` in bot display code — use `textContent` and `createElement` for all bot UI (thinking indicators, action toasts, badges)
