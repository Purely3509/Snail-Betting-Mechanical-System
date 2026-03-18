import {
  applyDowntimeAction,
  applyRaceAction,
  archiveGameState,
  buildGameView,
  createGameState,
  hostSkipSeat,
} from "../../../app/async-engine.js";
import { getAdminClient } from "./client.ts";
import { createOpaqueToken, hashToken, hoursFromNow } from "./security.ts";
import { findEventByClientAction, getGame, getSessionFromHeader, listSeats } from "./repository.ts";

const IDLE_TIMEOUT_HOURS = 24;
const SESSION_TIMEOUT_HOURS = 24 * 30;

function buildLobbyView(game: Record<string, unknown>, seats: Array<Record<string, unknown>>, seatIndex: number | null) {
  const seat = seatIndex === null ? null : seats.find((entry) => entry.seat_index === seatIndex);
  const claimedCount = seats.filter((seat) => seat.claimed_at).length;
  return {
    gameId: game.id,
    status: game.status,
    phase: game.phase,
    version: game.version,
    lobby: {
      claimedCount,
      totalSeats: seats.length,
      startable: claimedCount === seats.length,
      seats: seats.map((seat) => ({
        seatIndex: seat.seat_index,
        name: seat.name,
        claimed: !!seat.claimed_at,
        isHost: !!seat.is_host,
      })),
    },
    privateState: seatIndex === null ? null : { seatIndex, isHost: !!seat?.is_host },
  };
}

function nextIdleDeadline() {
  return hoursFromNow(IDLE_TIMEOUT_HOURS);
}

async function updateGameRow(gameId: string, expectedVersion: number, nextState: Record<string, unknown>) {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("games")
    .update({
      status: nextState.status,
      phase: nextState.phase,
      version: nextState.version,
      current_seat_index: nextState.phase === "race_turn" ? nextState.currentPlayerIndex : null,
      idle_deadline_at: nextState.status === "active" ? nextIdleDeadline() : null,
      snapshot: nextState,
    })
    .eq("id", gameId)
    .eq("version", expectedVersion)
    .select("*")
    .single();
  if (error) {
    if (error.code === "PGRST116") {
      throw new Error("STALE_VERSION");
    }
    throw error;
  }
  return data;
}

async function insertEvent(gameId: string, version: number, seatId: string | null, clientActionId: string, action: unknown, summary: unknown) {
  const supabase = getAdminClient();
  const { error } = await supabase.from("events").insert({
    game_id: gameId,
    version,
    seat_id: seatId,
    client_action_id: clientActionId,
    action,
    summary,
  });
  if (error) throw error;
}

export async function createGame(payload: Record<string, unknown>) {
  const supabase = getAdminClient();
  const playerCount = Number(payload.playerCount || 0);
  const hostName = String(payload.hostName || "").trim();
  if (!hostName || playerCount < 1 || playerCount > 4) {
    throw new Error("Invalid create_game payload.");
  }

  const { data: game, error: gameError } = await supabase
    .from("games")
    .insert({ status: "lobby", phase: "lobby", version: 0 })
    .select("*")
    .single();
  if (gameError) throw gameError;

  const inviteTokens: Array<{ seatIndex: number; seatToken: string }> = [];
  const seats = [];
  for (let seatIndex = 0; seatIndex < playerCount; seatIndex += 1) {
    const seatToken = createOpaqueToken();
    const inviteTokenHash = await hashToken(seatToken);
    const seatRow = {
      game_id: game.id,
      seat_index: seatIndex,
      is_host: seatIndex === 0,
      invite_token_hash: inviteTokenHash,
      claimed_at: seatIndex === 0 ? new Date().toISOString() : null,
      name: seatIndex === 0 ? hostName : null,
    };
    seats.push(seatRow);
    inviteTokens.push({ seatIndex, seatToken });
  }

  const { data: insertedSeats, error: seatsError } = await supabase.from("seats").insert(seats).select("*");
  if (seatsError) throw seatsError;

  const hostSeat = insertedSeats.find((seat) => seat.seat_index === 0);
  const sessionToken = createOpaqueToken();
  const sessionTokenHash = await hashToken(sessionToken);
  await supabase.from("sessions").insert({
    game_id: game.id,
    seat_id: hostSeat.id,
    token_hash: sessionTokenHash,
    expires_at: hoursFromNow(SESSION_TIMEOUT_HOURS),
  });

  return {
    gameId: game.id,
    sessionToken,
    seatIndex: 0,
    inviteTokens: inviteTokens.filter((token) => token.seatIndex !== 0),
    lobby: buildLobbyView(game, insertedSeats, 0),
  };
}

export async function claimSeat(payload: Record<string, unknown>) {
  const supabase = getAdminClient();
  const gameId = String(payload.gameId || "");
  const playerName = String(payload.playerName || "").trim();
  const seatToken = String(payload.seatToken || "");
  if (!gameId || !playerName || !seatToken) {
    throw new Error("Invalid claim_seat payload.");
  }

  const seatHash = await hashToken(seatToken);
  const { data: seat, error: seatError } = await supabase
    .from("seats")
    .select("*")
    .eq("game_id", gameId)
    .eq("invite_token_hash", seatHash)
    .single();
  if (seatError || !seat) throw new Error("Seat not found.");
  if (seat.claimed_at) throw new Error("Seat already claimed.");

  const { data: updatedSeat, error: updateSeatError } = await supabase
    .from("seats")
    .update({
      name: playerName,
      claimed_at: new Date().toISOString(),
    })
    .eq("id", seat.id)
    .is("claimed_at", null)
    .select("*")
    .single();
  if (updateSeatError || !updatedSeat) throw new Error("Seat claim conflict.");

  const sessionToken = createOpaqueToken();
  const sessionTokenHash = await hashToken(sessionToken);
  await supabase.from("sessions").insert({
    game_id: gameId,
    seat_id: updatedSeat.id,
    token_hash: sessionTokenHash,
    expires_at: hoursFromNow(SESSION_TIMEOUT_HOURS),
  });

  const game = await getGame(gameId);
  const seats = await listSeats(gameId);
  return {
    gameId,
    sessionToken,
    seatIndex: updatedSeat.seat_index,
    view: game.snapshot
      ? buildGameView(game.snapshot, updatedSeat.seat_index, {
          gameId,
          isHost: !!updatedSeat.is_host,
        })
      : buildLobbyView(game, seats, updatedSeat.seat_index),
  };
}

export async function resumeSession(request: Request) {
  const sessionContext = await getSessionFromHeader(request);
  const seats = await listSeats(sessionContext.game.id);
  if (sessionContext.game.snapshot) {
    return {
      gameId: sessionContext.game.id,
      seatIndex: sessionContext.seat.seat_index,
      view: buildGameView(sessionContext.game.snapshot, sessionContext.seat.seat_index, {
        gameId: sessionContext.game.id,
        isHost: !!sessionContext.seat.is_host,
      }),
    };
  }
  return {
    gameId: sessionContext.game.id,
    seatIndex: sessionContext.seat.seat_index,
    view: buildLobbyView(sessionContext.game, seats, sessionContext.seat.seat_index),
  };
}

export async function startGame(request: Request) {
  const sessionContext = await getSessionFromHeader(request);
  if (!sessionContext.seat.is_host) {
    throw new Error("Only the host can start the game.");
  }
  if (sessionContext.game.status !== "lobby") {
    throw new Error("Game is not in lobby.");
  }

  const seats = await listSeats(sessionContext.game.id);
  if (seats.some((seat) => !seat.claimed_at)) {
    throw new Error("All seats must be claimed before starting.");
  }

  const playerNames = seats.map((seat) => seat.name);
  const state = createGameState(playerNames);
  state.idleDeadlineAt = nextIdleDeadline();

  const updatedGame = await updateGameRow(sessionContext.game.id, sessionContext.game.version, state);
  return {
    view: buildGameView(updatedGame.snapshot, sessionContext.seat.seat_index, {
      gameId: sessionContext.game.id,
      isHost: !!sessionContext.seat.is_host,
    }),
  };
}

export async function getGameView(request: Request) {
  const sessionContext = await getSessionFromHeader(request);
  if (sessionContext.game.snapshot) {
    return {
      view: buildGameView(sessionContext.game.snapshot, sessionContext.seat.seat_index, {
        gameId: sessionContext.game.id,
        isHost: !!sessionContext.seat.is_host,
      }),
    };
  }
  const seats = await listSeats(sessionContext.game.id);
  return {
    view: buildLobbyView(sessionContext.game, seats, sessionContext.seat.seat_index),
  };
}

export async function submitAction(request: Request, payload: Record<string, unknown>) {
  const sessionContext = await getSessionFromHeader(request);
  const expectedVersion = Number(payload.expectedVersion);
  const clientActionId = String(payload.clientActionId || "");
  const intent = payload.intent as Record<string, unknown>;

  if (!clientActionId || !intent || Number.isNaN(expectedVersion)) {
    throw new Error("Invalid submit_action payload.");
  }
  if (sessionContext.game.status !== "active") {
    throw new Error("Game is not accepting actions.");
  }
  if (!sessionContext.game.snapshot) {
    throw new Error("Game has not started.");
  }
  if (sessionContext.game.version !== expectedVersion) {
    throw new Error("STALE_VERSION");
  }

  const priorEvent = await findEventByClientAction(sessionContext.game.id, clientActionId);
  if (priorEvent) {
    return {
      duplicate: true,
      summary: priorEvent.summary,
      view: buildGameView(sessionContext.game.snapshot, sessionContext.seat.seat_index, {
        gameId: sessionContext.game.id,
        isHost: !!sessionContext.seat.is_host,
      }),
    };
  }

  const currentState = sessionContext.game.snapshot;
  let applied;
  if (currentState.phase === "race_turn") {
    applied = applyRaceAction(currentState, sessionContext.seat.seat_index, intent);
  } else if (currentState.phase === "downtime_submit") {
    applied = applyDowntimeAction(currentState, sessionContext.seat.seat_index, intent, Math.random, { autoAdvance: true });
  } else {
    throw new Error("Game is not accepting actions.");
  }

  if (!applied.ok) {
    throw new Error(applied.error || "Action failed.");
  }

  applied.state.idleDeadlineAt = applied.state.status === "active" ? nextIdleDeadline() : null;
  const updatedGame = await updateGameRow(sessionContext.game.id, expectedVersion, applied.state);
  await insertEvent(sessionContext.game.id, updatedGame.version, sessionContext.seat.id, clientActionId, intent, applied.summary);

  return {
    summary: applied.summary,
    view: buildGameView(updatedGame.snapshot, sessionContext.seat.seat_index, {
      gameId: sessionContext.game.id,
      isHost: !!sessionContext.seat.is_host,
    }),
  };
}

export async function hostSkip(request: Request, payload: Record<string, unknown>) {
  const sessionContext = await getSessionFromHeader(request);
  if (!sessionContext.seat.is_host) {
    throw new Error("Only the host can skip seats.");
  }
  if (sessionContext.game.status !== "active") {
    throw new Error("Game is not accepting actions.");
  }
  if (!sessionContext.game.snapshot) {
    throw new Error("Game has not started.");
  }
  if (!sessionContext.game.idle_deadline_at || new Date(sessionContext.game.idle_deadline_at).getTime() > Date.now()) {
    throw new Error("Idle deadline has not elapsed.");
  }

  const targetSeatIndex = Number(payload.targetSeatIndex);
  const clientActionId = String(payload.clientActionId || "");
  if (Number.isNaN(targetSeatIndex) || !clientActionId) {
    throw new Error("Invalid host_skip_seat payload.");
  }

  const currentState = sessionContext.game.snapshot;
  const applied = hostSkipSeat(currentState, targetSeatIndex, { autoAdvance: true });
  if (!applied.ok) {
    throw new Error(applied.error || "Skip failed.");
  }

  applied.state.idleDeadlineAt = applied.state.status === "active" ? nextIdleDeadline() : null;
  const updatedGame = await updateGameRow(sessionContext.game.id, sessionContext.game.version, applied.state);
  await insertEvent(sessionContext.game.id, updatedGame.version, sessionContext.seat.id, clientActionId, { type: "host_skip", targetSeatIndex }, applied.summary);

  return {
    summary: applied.summary,
    view: buildGameView(updatedGame.snapshot, sessionContext.seat.seat_index, {
      gameId: sessionContext.game.id,
      isHost: !!sessionContext.seat.is_host,
    }),
  };
}

export async function archiveOrRematch(request: Request, payload: Record<string, unknown>) {
  const sessionContext = await getSessionFromHeader(request);
  if (!sessionContext.seat.is_host) {
    throw new Error("Only the host can manage lifecycle.");
  }

  const action = String(payload.action || "");
  const supabase = getAdminClient();

  if (action === "archive") {
    if (sessionContext.game.snapshot) {
      const archivedState = archiveGameState(sessionContext.game.snapshot);
      const data = await updateGameRow(sessionContext.game.id, sessionContext.game.version, archivedState);
      return {
        view: buildGameView(data.snapshot, sessionContext.seat.seat_index, {
          gameId: data.id,
          isHost: !!sessionContext.seat.is_host,
        }),
      };
    }

    const { data, error } = await supabase
      .from("games")
      .update({
        status: "archived",
        phase: "complete",
        idle_deadline_at: null,
        version: sessionContext.game.version + 1,
      })
      .eq("id", sessionContext.game.id)
      .eq("version", sessionContext.game.version)
      .select("*")
      .single();
    if (error) throw error;
    return {
      view: data.snapshot
        ? buildGameView(data.snapshot, sessionContext.seat.seat_index, {
            gameId: data.id,
            isHost: !!sessionContext.seat.is_host,
          })
        : null,
    };
  }

  if (action === "rematch") {
    const seats = await listSeats(sessionContext.game.id);
    return await createGame({
      playerCount: seats.length,
      hostName: seats.find((seat) => seat.is_host)?.name || sessionContext.seat.name,
    });
  }

  throw new Error("Unsupported lifecycle action.");
}
