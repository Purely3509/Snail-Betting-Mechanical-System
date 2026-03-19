const CONFIG_KEY = "snailBettingOnlineConfig";
const SESSION_KEY = "snailBettingOnlineSession";

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

export function loadOnlineConfig() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}");
  } catch {
    return {};
  }
}

export function saveOnlineConfig(config) {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch { /* storage unavailable */ }
}

export function loadOnlineSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

export function saveOnlineSession(session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch { /* storage unavailable */ }
}

export function clearOnlineSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch { /* storage unavailable */ }
}

const ONBOARDING_KEY = "snailBettingOnboardingSeen";

export function hasSeenOnboarding() {
  try { return localStorage.getItem(ONBOARDING_KEY) === "1"; } catch { return false; }
}

export function markOnboardingSeen() {
  try { localStorage.setItem(ONBOARDING_KEY, "1"); } catch { /* storage unavailable */ }
}

export class AsyncOnlineApi {
  constructor(config) {
    this.supabaseUrl = trimTrailingSlash(config.supabaseUrl || "");
    this.anonKey = config.anonKey || "";
    this.sessionToken = config.sessionToken || null;
  }

  withSession(sessionToken) {
    return new AsyncOnlineApi({
      supabaseUrl: this.supabaseUrl,
      anonKey: this.anonKey,
      sessionToken,
    });
  }

  async invoke(functionName, payload = {}) {
    if (!this.supabaseUrl || !this.anonKey) {
      throw new Error("Supabase URL and anon key are required.");
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(`${this.supabaseUrl}/functions/v1/${functionName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: this.anonKey,
          Authorization: `Bearer ${this.anonKey}`,
          ...(this.sessionToken ? { "x-snail-session": this.sessionToken } : {}),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(data.error || `Request failed (${response.status})`);
        error.status = response.status;
        error.payload = data;
        throw error;
      }
      return data;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  createGame(payload) {
    return this.invoke("create_game", payload);
  }

  claimSeat(payload) {
    return this.invoke("claim_seat", payload);
  }

  resumeSession() {
    return this.invoke("resume_session", {});
  }

  startGame() {
    return this.invoke("start_game", {});
  }

  getGameView() {
    return this.invoke("get_game_view", {});
  }

  submitAction(expectedVersion, intent) {
    return this.invoke("submit_action", {
      expectedVersion,
      clientActionId: crypto.randomUUID(),
      intent,
    });
  }

  hostSkipSeat(targetSeatIndex) {
    return this.invoke("host_skip_seat", {
      targetSeatIndex,
      clientActionId: crypto.randomUUID(),
    });
  }

  archiveOrRematch(action) {
    return this.invoke("archive_or_rematch", { action });
  }
}
