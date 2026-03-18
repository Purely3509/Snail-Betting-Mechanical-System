# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

This repository is now the working copy for a new mechanical-system variant derived from Snail Betting.

The current codebase is still the original Snail Betting implementation: a web-based snail racing and betting game inspired by Camel Up. Players watch 6 colored snails race across a 12-space track and place bets on the winner. Earlier bets pay better odds based on the race state.

When making changes, treat the existing game as the baseline to evolve rather than the final product. New work should move the project toward the new mechanical system while keeping the app playable unless the task explicitly calls for a larger rewrite.

## Architecture

Single-file application: everything currently lives in `index.html` - HTML structure, CSS styles, and the vanilla JS game engine are all inline. There are no dependencies, no build step, and no framework.

**To run:** Open `index.html` in a browser. No server required.

**Three screens** are currently managed by toggling the `.active` class: setup (player count and names), game (track, betting, and dice), and game over (standings and high score).

**Game state** is currently stored in a single `state` object holding players, snails, current turn, round counter, and bets. Core game logic functions read and mutate this object directly.

**Rendering** uses direct DOM manipulation (`textContent`, `createElement`) and should continue to avoid unsafe insertion of user-controlled content.

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
