import { getAdminClient } from "./client.ts";
import { hashToken } from "./security.ts";

export async function listSeats(gameId: string) {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("seats")
    .select("*")
    .eq("game_id", gameId)
    .order("seat_index", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getGame(gameId: string) {
  const supabase = getAdminClient();
  const { data, error } = await supabase.from("games").select("*").eq("id", gameId).single();
  if (error) throw error;
  return data;
}

export async function getSessionFromHeader(request: Request) {
  const sessionToken = request.headers.get("x-snail-session");
  if (!sessionToken) {
    throw new Error("Missing session token.");
  }

  const supabase = getAdminClient();
  const tokenHash = await hashToken(sessionToken);
  const { data, error } = await supabase
    .from("sessions")
    .select("*, seats(*), games(*)")
    .eq("token_hash", tokenHash)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (error || !data) {
    throw new Error("Session not found.");
  }

  await supabase
    .from("sessions")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", data.id);

  return {
    sessionToken,
    session: data,
    seat: data.seats,
    game: data.games,
  };
}

export async function findSeatByInvite(gameId: string, seatToken: string) {
  const supabase = getAdminClient();
  const tokenHash = await hashToken(seatToken);
  const { data, error } = await supabase
    .from("seats")
    .select("*")
    .eq("game_id", gameId)
    .eq("invite_token_hash", tokenHash)
    .single();
  if (error) throw error;
  return data;
}

export async function findEventByClientAction(gameId: string, clientActionId: string) {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("game_id", gameId)
    .eq("client_action_id", clientActionId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createSession(gameId: string, seatId: string, tokenHash: string, expiresAt: string) {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("sessions")
    .insert({
      game_id: gameId,
      seat_id: seatId,
      token_hash: tokenHash,
      expires_at: expiresAt,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
