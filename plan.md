# Stress + Massage Implementation Plan

## 1. Data & Constants
- Add `STRESS_MAX = 10`, `MASSAGE_COST = 5`, `MASSAGE_STRESS_RELIEF = 2`, `MASSAGE_SHOP_PAYOUT = 10`
- Add `'massageParlor'` to SHOPS array
- Add `stress: 0` to each snail in `initGame()`
- Add `eliminated: {}` to state (tracks which snails are out mid-race)

## 2. Stress Logic
- `drugSnail()`: add +1 stress after drugging; check if stress >= STRESS_MAX → eliminate
- `massageSnail(playerIndex, snailColor)`: new function — manager only, costs $5, removes 2 stress (min 0), pays massage parlor shareholders $10/share
- End-of-race in `showRaceResults` area: top 3 get -1 stress, bottom 3 get +1 stress (clamp ≥ 0)

## 3. Elimination
- When stress >= 10: `eliminated[color] = true`, snail stops participating in rolls
- `moveSnails()`: skip eliminated snails
- `checkWin()`: don't count eliminated snails as winners
- `getRaceRanking()`: eliminated snails rank last
- Bets on eliminated snails: lost (pay $0)
- Shares on eliminated snails: kept (but no placement payout since ranked last)
- `resetForNextRace()`: clear eliminated flags, reset eliminated snails' stress to 0

## 4. UI Changes
- Rename "drug tab" to "manager tab" since it now has both drug + massage
- Show stress bar/number next to each snail in manager tab
- Add "Give Massage ($5)" button (same pattern as drug button)
- Massage button disabled if: no snail selected, snail stress is 0, can't afford, not manager
- Show stress indicators on the track (small number or bar)
- Grey out / mark eliminated snails on track
- Show elimination events in the log/status area

## 5. Race Reset
- `resetForNextRace()`: clear `eliminated`, reset eliminated snails' stress to 0 (others keep their stress)
