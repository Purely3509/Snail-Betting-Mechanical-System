# Project Notes

## Current State
- Local hotseat mode still runs from [`index.html`](/C:/Users/User/Desktop/Snail%20Betting/index.html) and remains the playable baseline.
- Async multiplayer scaffolding has been added on top of that local mode.
- Shared game rules now live in [`app/async-engine.js`](/C:/Users/User/Desktop/Snail%20Betting/app/async-engine.js).
- Online browser integration now lives in [`app/online-api.js`](/C:/Users/User/Desktop/Snail%20Betting/app/online-api.js) and [`app/online-ui.js`](/C:/Users/User/Desktop/Snail%20Betting/app/online-ui.js).
- Supabase schema and Edge Function handlers now live under [`supabase/`](/C:/Users/User/Desktop/Snail%20Betting/supabase).

## What Was Implemented
- Extracted async-safe game engine logic for:
  - Race turns
  - Downtime submissions
  - Market listings and purchases
  - Training, stress, elimination, shop payouts
  - Public/private online game views
  - Host skip behavior
- Added Supabase migration for:
  - `games`
  - `seats`
  - `sessions`
  - `events`
- Added Supabase Edge Function entrypoints for:
  - `create_game`
  - `claim_seat`
  - `resume_session`
  - `start_game`
  - `get_game_view`
  - `submit_action`
  - `host_skip_seat`
  - `archive_or_rematch`
- Added an online setup flow in the browser:
  - Local vs online mode switch
  - Supabase URL / anon key inputs
  - Create game
  - Join by invite link
  - Resume saved session
  - Polling-based online state refresh

## Verification Done
- Engine tests pass via:
  - `node tests/engine.test.mjs`
- Syntax smoke checks passed for:
  - [`app/online-api.js`](/C:/Users/User/Desktop/Snail%20Betting/app/online-api.js)
  - [`app/online-ui.js`](/C:/Users/User/Desktop/Snail%20Betting/app/online-ui.js)

## Where We Left Off
- The code is implemented locally but not deployed.
- Supabase migration has not been applied yet.
- Supabase Edge Functions have not been deployed yet.
- No live end-to-end multiplayer session has been tested against a real Supabase project yet.
- The online UI is functional scaffolding, not a polished final UX.

## Next Steps
1. Create or choose the Supabase project for this game.
2. Apply [`supabase/migrations/20260317_async_multiplayer.sql`](/C:/Users/User/Desktop/Snail%20Betting/supabase/migrations/20260317_async_multiplayer.sql).
3. Deploy the Edge Functions in [`supabase/functions/`](/C:/Users/User/Desktop/Snail%20Betting/supabase/functions).
4. Open the app, switch to `Online Async`, and enter the Supabase URL + anon key.
5. Test a real multiplayer flow on two devices:
   - create lobby
   - join via invite link
   - start game
   - submit race turns
   - submit downtime actions
   - verify market conflict handling
   - verify host skip after timeout
6. Tighten the online UX after live testing reveals rough edges.

## Important Notes
- Local mode and online mode currently coexist; do not remove local mode unless explicitly requested.
- The repo now has a mixed architecture:
  - legacy inline app logic in [`index.html`](/C:/Users/User/Desktop/Snail%20Betting/index.html)
  - new shared/online modules in [`app/`](/C:/Users/User/Desktop/Snail%20Betting/app)
- If more multiplayer work is done, prefer moving additional logic out of [`index.html`](/C:/Users/User/Desktop/Snail%20Betting/index.html) into shared modules instead of duplicating rules again.
