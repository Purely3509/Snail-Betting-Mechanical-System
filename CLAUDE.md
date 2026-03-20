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
- High score persistence currently uses `localStorage` with key `snailBettingHighScore` for single-player mode
- If the game identity changes, update persisted storage keys deliberately to avoid mixing old and new save data
