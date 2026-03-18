import { DEFAULTS, SHOPS, SHOP_NAMES, SNAILS } from "./async-engine.js";
import {
  AsyncOnlineApi,
  loadOnlineConfig,
  loadOnlineSession,
  saveOnlineConfig,
  saveOnlineSession,
} from "./online-api.js";
import { selectOnlineView } from "./online-view-state.js";

const POLL_INTERVAL_MS = 5000;
const DEFAULT_ONLINE_CONFIG = {
  supabaseUrl: "https://imxcadcfwgnebgtzopoa.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlteGNhZGNmd2duZWJndHpvcG9hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NjM1MzgsImV4cCI6MjA4OTQzOTUzOH0.zWcAfZuZ4xD4XGv2nz6Vf-nTpR6548CtaCYYk55_2sE",
};

const SNAIL_CSS = {};
SNAILS.forEach((s) => { SNAIL_CSS[s.color] = s.css; });

const onlineState = {
  mode: "local",
  config: loadOnlineConfig(),
  session: loadOnlineSession(),
  api: null,
  view: null,
  inviteTokens: [],
  lastError: "",
  syncStatus: "idle",
  pollTimer: null,
  requestCounter: 0,
  appliedRequestId: -1,
  actionDrafts: {},
  activeTab: "actions",
};

const joinParams = new URLSearchParams(window.location.search);
const pendingJoin = joinParams.get("game") && joinParams.get("seat_token")
  ? {
      gameId: joinParams.get("game"),
      seatToken: joinParams.get("seat_token"),
    }
  : null;
const inviteConfig = {
  supabaseUrl: joinParams.get("supabase_url") || "",
  anonKey: joinParams.get("anon_key") || "",
};

function mergeOnlineConfig(config = {}) {
  return {
    supabaseUrl: config.supabaseUrl || DEFAULT_ONLINE_CONFIG.supabaseUrl,
    anonKey: config.anonKey || DEFAULT_ONLINE_CONFIG.anonKey,
  };
}

document.addEventListener("DOMContentLoaded", () => {
  injectOnlineStyles();
  mountSetupEnhancements();
  mountOnlineScreen();
  hydrateStoredSession();
  renderMode();
});

/* ═══════════════════════════════════════════
   STYLES
   ═══════════════════════════════════════════ */

function injectOnlineStyles() {
  const style = document.createElement("style");
  style.textContent = `
    /* ── Mode Switch (setup screen) ── */
    .mode-switch {
      display: flex;
      gap: 10px;
      margin-bottom: 16px;
      width: 100%;
    }
    .mode-switch button {
      flex: 1;
      min-height: 44px;
      border: 2px solid var(--accent);
      background: var(--bg);
      color: var(--text);
      border-radius: 8px;
      font-weight: 700;
      font-size: 0.95rem;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }
    .mode-switch button.active {
      background: var(--accent);
      border-color: #3a86ff;
    }

    /* ── Setup Panel ── */
    .online-panel {
      width: 100%;
      background: var(--panel);
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 12px;
    }
    .online-panel label {
      display: block;
      font-weight: 600;
      font-size: 0.85rem;
      margin-bottom: 2px;
      opacity: 0.85;
    }
    .online-panel input,
    .online-panel textarea {
      width: 100%;
      min-height: 44px;
      border-radius: 8px;
      border: 1px solid #334;
      background: var(--bg);
      color: var(--text);
      padding: 10px 12px;
      margin-bottom: 10px;
      font-size: 0.95rem;
    }
    .online-setup-actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 4px;
    }
    .online-setup-actions button {
      width: 100%;
      min-height: 48px;
      border: none;
      border-radius: 10px;
      font-size: 1rem;
      font-weight: 700;
      cursor: pointer;
      color: #fff;
      transition: opacity 0.15s;
    }
    .online-setup-actions button:active { opacity: 0.85; }
    .online-setup-actions .btn-create { background: #3a86ff; }
    .online-setup-actions .btn-join { background: #2ecc71; }
    .online-setup-actions .btn-resume { background: #555; }
    .online-setup-status {
      margin-top: 8px;
      font-size: 0.9rem;
    }
    .online-setup-status.error { color: #ff9b9b; }
    .online-setup-status.success { color: #7ee787; }

    /* ── Online Game Screen ── */
    #online-screen {
      display: none;
      flex-direction: column;
      align-items: center;
      padding: 10px;
      max-width: 500px;
      margin: 0 auto;
      min-height: 100dvh;
    }
    #online-screen.active { display: flex; }

    /* ── Game Header ── */
    .og-header {
      width: 100%;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      background: var(--panel);
      border-radius: 10px;
      margin-bottom: 8px;
      flex-wrap: wrap;
      gap: 4px;
    }
    .og-header .og-title { font-weight: 700; font-size: 1rem; }
    .og-header .og-info { font-size: 0.85rem; opacity: 0.85; }

    /* ── Sync Indicator ── */
    .og-sync {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 0.75rem;
      opacity: 0.7;
    }
    .og-sync-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #555;
    }
    .og-sync-dot.synced { background: #2ecc71; }
    .og-sync-dot.syncing { background: #f1c40f; animation: ogPulse 0.8s infinite; }
    .og-sync-dot.error { background: #e74c3c; }
    @keyframes ogPulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }

    /* ── Error Banner ── */
    .og-error {
      width: 100%;
      background: rgba(231, 76, 60, 0.15);
      border: 1px solid rgba(231, 76, 60, 0.3);
      border-radius: 8px;
      padding: 8px 12px;
      margin-bottom: 8px;
      font-size: 0.85rem;
      color: #ff9b9b;
      display: none;
    }
    .og-error.visible { display: block; }

    /* ── Track (visual snail board) ── */
    .og-track-container {
      width: 100%;
      background: var(--panel);
      border-radius: 10px;
      padding: 10px;
      margin-bottom: 8px;
      overflow-x: auto;
    }
    .og-track {
      display: grid;
      grid-template-columns: 30px repeat(${DEFAULTS.trackLength}, 1fr) 30px;
      grid-template-rows: repeat(6, 36px);
      gap: 2px;
      min-width: 320px;
    }
    .og-lane-label {
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 0.75rem;
      border-radius: 4px;
    }
    .og-track-cell {
      background: rgba(255,255,255,0.04);
      border-radius: 3px;
      position: relative;
    }
    .og-finish-cell {
      background: rgba(255,255,255,0.1);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.6rem;
      font-weight: 700;
      color: rgba(255,255,255,0.4);
    }
    .og-snail {
      position: absolute;
      inset: 2px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.1rem;
      z-index: 2;
    }

    /* ── Snail Stats Row ── */
    .og-snail-stats {
      width: 100%;
      display: flex;
      gap: 6px;
      margin-bottom: 8px;
      overflow-x: auto;
      padding-bottom: 2px;
    }
    .og-snail-stat {
      flex: 1;
      min-width: 70px;
      background: var(--panel);
      border-radius: 8px;
      padding: 6px 8px;
      text-align: center;
      font-size: 0.75rem;
      border-left: 3px solid transparent;
    }
    .og-snail-stat .og-stat-icon { font-size: 1rem; }
    .og-snail-stat .og-stat-label {
      font-weight: 700;
      text-transform: uppercase;
      font-size: 0.6rem;
      opacity: 0.6;
      margin-top: 2px;
    }
    .og-snail-stat .og-stat-row {
      display: flex;
      justify-content: space-between;
      font-size: 0.7rem;
      margin-top: 2px;
      opacity: 0.85;
    }
    .og-snail-stat.eliminated { opacity: 0.35; }

    /* ── Info Panel (standings + your position) ── */
    .og-info-panel {
      width: 100%;
      background: var(--panel);
      border-radius: 10px;
      padding: 10px 12px;
      margin-bottom: 8px;
      font-size: 0.85rem;
    }
    .og-section-label {
      font-weight: 700;
      font-size: 0.8rem;
      opacity: 0.7;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .og-standings-row {
      display: flex;
      justify-content: space-between;
      padding: 2px 0;
    }
    .og-standings-row.current { font-weight: 700; }
    .og-standings-row .og-coin { color: #f1c40f; font-weight: 700; }
    .og-standings-row .og-coin.negative { color: #e74c3c; }

    /* ── Bet / Share Tags ── */
    .og-tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 6px;
      margin: 2px;
      font-size: 0.8rem;
      font-weight: 600;
      color: #fff;
    }
    .og-tag .og-tag-detail {
      opacity: 0.85;
      font-size: 0.75rem;
      font-weight: 400;
    }

    /* ── Action Tabs ── */
    .og-tabs {
      display: flex;
      gap: 6px;
      margin-bottom: 8px;
      width: 100%;
      flex-wrap: wrap;
    }
    .og-tabs button {
      flex: 1;
      padding: 8px;
      border: 2px solid var(--accent);
      background: var(--bg);
      color: var(--text);
      border-radius: 8px;
      cursor: pointer;
      font-size: 0.82rem;
      font-weight: 600;
      min-height: 44px;
      min-width: 70px;
      transition: background 0.15s, border-color 0.15s;
    }
    .og-tabs button.active {
      background: var(--accent);
      border-color: #3a86ff;
    }

    /* ── Action Panel ── */
    .og-action-panel {
      width: 100%;
      background: var(--panel);
      border-radius: 10px;
      padding: 12px;
      margin-bottom: 8px;
    }
    .og-waiting-msg {
      text-align: center;
      padding: 16px 8px;
      font-size: 0.95rem;
      opacity: 0.7;
    }
    .og-action-group {
      margin-bottom: 12px;
    }
    .og-action-group:last-child { margin-bottom: 0; }
    .og-action-label {
      font-weight: 700;
      font-size: 0.82rem;
      margin-bottom: 6px;
    }

    /* ── Snail Picker (colored buttons) ── */
    .og-snail-picker {
      display: flex;
      gap: 6px;
      justify-content: center;
      flex-wrap: wrap;
      margin-bottom: 8px;
    }
    .og-snail-pick-btn {
      width: 48px;
      height: 44px;
      border: 3px solid transparent;
      border-radius: 10px;
      cursor: pointer;
      font-size: 1.1rem;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-weight: 700;
    }
    .og-snail-pick-btn.selected {
      border-color: #fff;
      box-shadow: 0 0 10px rgba(255,255,255,0.4);
    }
    .og-snail-pick-btn:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }

    /* ── Wager Row ── */
    .og-wager-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      margin-bottom: 10px;
    }
    .og-wager-btn {
      width: 44px;
      height: 44px;
      border-radius: 8px;
      border: 1px solid #555;
      background: var(--bg);
      color: var(--text);
      font-size: 1.3rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .og-wager-amount {
      font-size: 1.3rem;
      font-weight: 700;
      min-width: 60px;
      text-align: center;
    }

    /* ── Action Buttons ── */
    .og-action-btns {
      display: flex;
      gap: 8px;
    }
    .og-action-btns button {
      flex: 1;
      padding: 12px;
      border: none;
      border-radius: 10px;
      font-size: 0.95rem;
      font-weight: 700;
      cursor: pointer;
      min-height: 48px;
      color: #fff;
      transition: opacity 0.15s;
    }
    .og-action-btns button:active { opacity: 0.85; }
    .og-action-btns button:disabled { background: #555; opacity: 0.6; cursor: default; }
    .og-btn-bet { background: #2ecc71; }
    .og-btn-share { background: #3498db; }
    .og-btn-drug { background: #e74c3c; }
    .og-btn-market { background: #9b59b6; }
    .og-btn-skip { background: #555; }
    .og-btn-train { background: #e67e22; }
    .og-btn-massage { background: #3498db; }
    .og-btn-shop { background: #9b59b6; }

    /* ── Select (styled) ── */
    #online-screen select {
      width: 100%;
      min-height: 44px;
      border-radius: 8px;
      border: 1px solid #334;
      background: var(--bg);
      color: var(--text);
      padding: 10px 12px;
      margin-bottom: 8px;
      font-size: 0.9rem;
    }
    #online-screen input[type="number"] {
      width: 100%;
      min-height: 44px;
      border-radius: 8px;
      border: 1px solid #334;
      background: var(--bg);
      color: var(--text);
      padding: 10px 12px;
      margin-bottom: 8px;
      font-size: 0.9rem;
    }

    /* ── Market Panel ── */
    .og-market-listing {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .og-market-listing:last-child { border-bottom: none; }
    .og-market-info { font-size: 0.85rem; }
    .og-market-price { font-weight: 700; color: #f1c40f; }

    /* ── Profit Projection ── */
    .og-profit-snail {
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
    }
    .og-profit-snail:last-child { border-bottom: none; }
    .og-profit-header {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 700;
      margin-bottom: 4px;
      font-size: 0.85rem;
    }
    .og-profit-header .og-color-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      display: inline-block;
    }
    .og-profit-detail {
      padding-left: 20px;
      opacity: 0.85;
      font-size: 0.78rem;
      line-height: 1.6;
    }

    /* ── Activity Feed ── */
    .og-feed-item {
      padding: 6px 0;
      font-size: 0.82rem;
      border-bottom: 1px solid rgba(255,255,255,0.04);
      line-height: 1.4;
    }
    .og-feed-item:last-child { border-bottom: none; }
    .og-feed-actor { font-weight: 700; }
    .og-feed-dice {
      display: inline-flex;
      gap: 4px;
      margin-left: 4px;
    }
    .og-feed-die {
      width: 18px;
      height: 18px;
      border-radius: 4px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 0.6rem;
      font-weight: 700;
      color: #fff;
      vertical-align: middle;
    }
    .og-feed-winner {
      color: #f1c40f;
      font-weight: 700;
    }

    /* ── Lobby ── */
    .og-lobby {
      width: 100%;
    }
    .og-lobby-seat {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      background: rgba(255,255,255,0.04);
      border-radius: 10px;
      margin-bottom: 6px;
    }
    .og-lobby-seat .og-seat-icon {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: var(--accent);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 0.85rem;
    }
    .og-lobby-seat .og-seat-icon.claimed { background: #2ecc71; }
    .og-lobby-seat .og-seat-name { font-weight: 600; }
    .og-lobby-seat .og-seat-badge {
      font-size: 0.7rem;
      opacity: 0.6;
      margin-left: auto;
    }
    .og-invite-row {
      display: flex;
      gap: 6px;
      margin-bottom: 8px;
    }
    .og-invite-row input {
      flex: 1;
      min-height: 40px;
      border-radius: 8px;
      border: 1px solid #334;
      background: var(--bg);
      color: var(--text);
      padding: 6px 10px;
      font-size: 0.75rem;
    }
    .og-invite-row button {
      min-height: 40px;
      padding: 6px 14px;
      border: none;
      border-radius: 8px;
      background: #3a86ff;
      color: #fff;
      font-weight: 700;
      font-size: 0.8rem;
      cursor: pointer;
      white-space: nowrap;
    }

    /* ── Back Button ── */
    .og-back-btn {
      width: 100%;
      min-height: 44px;
      border: 2px solid #555;
      background: transparent;
      color: var(--text);
      border-radius: 10px;
      font-weight: 600;
      font-size: 0.9rem;
      cursor: pointer;
      margin-top: 4px;
      margin-bottom: 20px;
    }

    /* ── Downtime action buttons ── */
    .og-downtime-btn {
      width: 100%;
      padding: 12px;
      border: 2px solid var(--accent);
      background: var(--bg);
      color: var(--text);
      border-radius: 10px;
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      min-height: 48px;
      text-align: left;
      margin-bottom: 6px;
    }
    .og-downtime-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  `;
  document.head.appendChild(style);
}

/* ═══════════════════════════════════════════
   SETUP SCREEN ENHANCEMENTS
   ═══════════════════════════════════════════ */

function mountSetupEnhancements() {
  const setupScreen = document.getElementById("setup-screen");
  const localSection = setupScreen.querySelector(".setup-section");
  const startButton = document.getElementById("start-btn");

  const modeSwitch = document.createElement("div");
  modeSwitch.className = "mode-switch";
  modeSwitch.innerHTML = `
    <button type="button" data-mode="local" class="active">Local Hotseat</button>
    <button type="button" data-mode="online">Online Async</button>
  `;
  setupScreen.insertBefore(modeSwitch, localSection);

  const onlinePanel = document.createElement("div");
  onlinePanel.id = "online-setup-panel";
  onlinePanel.className = "online-panel";
  onlinePanel.style.display = "none";
  onlinePanel.innerHTML = `
    <label>Your Name</label>
    <input id="online-player-name" type="text" maxlength="20" placeholder="Enter your name">
    <details style="margin-bottom:10px;opacity:0.7;font-size:0.8rem">
      <summary style="cursor:pointer;font-weight:600">Server Settings</summary>
      <label style="margin-top:8px">Supabase URL</label>
      <input id="online-supabase-url" type="text" placeholder="https://your-project.supabase.co">
      <label>Anon Key</label>
      <textarea id="online-anon-key" rows="2" placeholder="Paste anon key"></textarea>
    </details>
    <div class="online-setup-actions">
      <button type="button" id="online-create-btn" class="btn-create">Create Online Game</button>
      <button type="button" id="online-join-btn" class="btn-join">Join From Invite</button>
      <button type="button" id="online-resume-btn" class="btn-resume">Resume Saved Session</button>
    </div>
    <div id="online-setup-status" class="online-setup-status"></div>
  `;
  setupScreen.insertBefore(onlinePanel, startButton);

  modeSwitch.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      onlineState.mode = button.dataset.mode;
      renderMode();
    });
  });

  const mergedConfig = mergeOnlineConfig(onlineState.config);
  document.getElementById("online-supabase-url").value = mergedConfig.supabaseUrl;
  document.getElementById("online-anon-key").value = mergedConfig.anonKey;
  document.getElementById("online-player-name").value = onlineState.session?.playerName || "";
  if (pendingJoin) {
    document.getElementById("online-join-btn").textContent = "Join Invite";
    setSetupStatus("Invite detected. Enter your name and tap Join Invite.", false);
  }

  document.getElementById("online-create-btn").addEventListener("click", createOnlineGame);
  document.getElementById("online-join-btn").addEventListener("click", joinOnlineGame);
  document.getElementById("online-resume-btn").addEventListener("click", resumeOnlineSession);
}

function mountOnlineScreen() {
  const onlineScreen = document.createElement("div");
  onlineScreen.id = "online-screen";
  onlineScreen.innerHTML = `
    <div class="og-header" id="og-header"></div>
    <div class="og-error" id="og-error"></div>
    <div id="og-lobby"></div>
    <div id="og-track-wrap"></div>
    <div id="og-snail-stats-wrap"></div>
    <div id="og-info-wrap"></div>
    <div id="og-tabs-wrap"></div>
    <div id="og-tab-content"></div>
    <button type="button" class="og-back-btn" id="og-back-btn">Back To Setup</button>
  `;
  document.body.appendChild(onlineScreen);
  document.getElementById("og-back-btn").addEventListener("click", () => {
    stopPolling();
    renderSetupScreen();
  });
}

/* ═══════════════════════════════════════════
   HYDRATION + MODE
   ═══════════════════════════════════════════ */

function hydrateStoredSession() {
  if (inviteConfig.supabaseUrl && inviteConfig.anonKey) {
    onlineState.config = mergeOnlineConfig({
      supabaseUrl: inviteConfig.supabaseUrl,
      anonKey: inviteConfig.anonKey,
    });
    saveOnlineConfig(onlineState.config);
    const urlInput = document.getElementById("online-supabase-url");
    const keyInput = document.getElementById("online-anon-key");
    if (urlInput && keyInput) {
      urlInput.value = onlineState.config.supabaseUrl;
      keyInput.value = onlineState.config.anonKey;
    }
  }

  if (pendingJoin) {
    onlineState.mode = "online";
    return;
  }

  if (onlineState.session?.sessionToken) {
    onlineState.mode = "online";
  }
}

function renderMode() {
  const modeButtons = document.querySelectorAll(".mode-switch button");
  const onlinePanel = document.getElementById("online-setup-panel");
  const localSection = document.querySelector("#setup-screen .setup-section");
  const startButton = document.getElementById("start-btn");

  modeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === onlineState.mode);
  });

  const showOnline = onlineState.mode === "online";
  onlinePanel.style.display = showOnline ? "" : "none";
  localSection.style.display = showOnline ? "none" : "";
  startButton.style.display = showOnline ? "none" : "";
}

/* ═══════════════════════════════════════════
   CONFIG / STATE HELPERS
   ═══════════════════════════════════════════ */

function readOnlineConfig() {
  const config = mergeOnlineConfig({
    supabaseUrl: document.getElementById("online-supabase-url").value.trim(),
    anonKey: document.getElementById("online-anon-key").value.trim(),
  });
  saveOnlineConfig(config);
  onlineState.config = config;
  document.getElementById("online-supabase-url").value = config.supabaseUrl;
  document.getElementById("online-anon-key").value = config.anonKey;
  return config;
}

function getSelectedPlayerCount() {
  const selected = document.querySelector("#player-count-btns button.selected");
  return selected ? Number(selected.dataset.count) : 2;
}

function setSetupStatus(message, isError = true) {
  const element = document.getElementById("online-setup-status");
  element.className = "online-setup-status " + (isError ? "error" : "success");
  element.textContent = message;
}

function setRuntimeError(message) {
  onlineState.lastError = message;
  const element = document.getElementById("og-error");
  if (message) {
    element.textContent = message;
    element.classList.add("visible");
  } else {
    element.textContent = "";
    element.classList.remove("visible");
  }
}

function nextRequestId() {
  onlineState.requestCounter += 1;
  return onlineState.requestCounter;
}

function getDraft(draftKey) {
  return onlineState.actionDrafts[draftKey] || {};
}

function updateDraft(draftKey, patch) {
  onlineState.actionDrafts[draftKey] = {
    ...getDraft(draftKey),
    ...patch,
  };
}

function clearActionDrafts() {
  onlineState.actionDrafts = {};
}

function commitView(view, requestId) {
  const selected = selectOnlineView({
    view: onlineState.view,
    requestId: onlineState.appliedRequestId,
  }, view, requestId);
  onlineState.view = selected?.view || null;
  onlineState.appliedRequestId = selected?.requestId ?? -1;
}

function buildApi(sessionToken = null) {
  const config = readOnlineConfig();
  onlineState.api = new AsyncOnlineApi({
    supabaseUrl: config.supabaseUrl,
    anonKey: config.anonKey,
    sessionToken,
  });
  return onlineState.api;
}

function snailCss(color) {
  return SNAIL_CSS[color] || "#888";
}

/* ═══════════════════════════════════════════
   API ACTIONS
   ═══════════════════════════════════════════ */

async function createOnlineGame() {
  try {
    setSetupStatus("", true);
    const hostName = document.getElementById("online-player-name").value.trim();
    const api = buildApi();
    const requestId = nextRequestId();
    const response = await api.createGame({
      playerCount: getSelectedPlayerCount(),
      hostName,
    });

    onlineState.session = {
      gameId: response.gameId,
      sessionToken: response.sessionToken,
      seatIndex: response.seatIndex,
      playerName: hostName,
      isHost: true,
    };
    saveOnlineSession(onlineState.session);
    onlineState.api = api.withSession(response.sessionToken);
    onlineState.inviteTokens = response.inviteTokens || [];
    commitView(response.lobby, requestId);
    renderOnlineScreen();
    startPolling();
  } catch (error) {
    setSetupStatus(error.message || "Unable to create game.");
  }
}

async function joinOnlineGame() {
  if (!pendingJoin) {
    setSetupStatus("Open an invite link with ?game=...&seat_token=... to join.");
    return;
  }

  try {
    setSetupStatus("", true);
    const playerName = document.getElementById("online-player-name").value.trim();
    const api = buildApi();
    const requestId = nextRequestId();
    const response = await api.claimSeat({
      gameId: pendingJoin.gameId,
      seatToken: pendingJoin.seatToken,
      playerName,
    });
    onlineState.session = {
      gameId: response.gameId,
      sessionToken: response.sessionToken,
      seatIndex: response.seatIndex,
      playerName,
      isHost: false,
    };
    saveOnlineSession(onlineState.session);
    onlineState.api = api.withSession(response.sessionToken);
    commitView(response.view, requestId);
    renderOnlineScreen();
    startPolling();
  } catch (error) {
    setSetupStatus(error.message || "Unable to join game.");
  }
}

async function resumeOnlineSession() {
  try {
    setSetupStatus("", true);
    const storedSession = onlineState.session || loadOnlineSession();
    if (!storedSession?.sessionToken) {
      throw new Error("No saved online session found.");
    }

    onlineState.session = storedSession;
    const api = buildApi(storedSession.sessionToken);
    const requestId = nextRequestId();
    const response = await api.resumeSession();
    commitView(response.view, requestId);
    renderOnlineScreen();
    startPolling();
  } catch (error) {
    setSetupStatus(error.message || "Unable to resume session.");
  }
}

/* ═══════════════════════════════════════════
   POLLING
   ═══════════════════════════════════════════ */

function startPolling() {
  stopPolling();
  onlineState.pollTimer = window.setInterval(async () => {
    if (!onlineState.api) {
      return;
    }
    try {
      onlineState.syncStatus = "syncing";
      const requestId = nextRequestId();
      const response = await onlineState.api.getGameView();
      commitView(response.view, requestId);
      onlineState.syncStatus = "synced";
      renderOnlineScreen();
    } catch (error) {
      onlineState.syncStatus = "error";
      setRuntimeError(error.message || "Sync failed.");
    }
  }, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (onlineState.pollTimer) {
    window.clearInterval(onlineState.pollTimer);
    onlineState.pollTimer = null;
  }
}

/* ═══════════════════════════════════════════
   SCREEN MANAGEMENT
   ═══════════════════════════════════════════ */

function renderSetupScreen() {
  onlineState.view = null;
  onlineState.appliedRequestId = -1;
  clearActionDrafts();
  document.getElementById("online-screen").classList.remove("active");
  if (window.showScreen) {
    window.showScreen("setup-screen");
  } else {
    document.getElementById("setup-screen").classList.add("active");
  }
  renderMode();
}

function showOnlineScreen() {
  ["setup-screen", "game-screen", "race-results-screen", "downtime-screen", "gameover-screen"].forEach((screenId) => {
    const screen = document.getElementById(screenId);
    if (screen) {
      screen.classList.remove("active");
    }
  });
  document.getElementById("online-screen").classList.add("active");
}

/* ═══════════════════════════════════════════
   MAIN RENDER
   ═══════════════════════════════════════════ */

function renderOnlineScreen() {
  if (!onlineState.view) {
    return;
  }

  showOnlineScreen();
  setRuntimeError(onlineState.lastError);
  renderHeader();

  if (onlineState.view.phase === "lobby") {
    renderLobby();
    document.getElementById("og-track-wrap").textContent = "";
    document.getElementById("og-snail-stats-wrap").textContent = "";
    document.getElementById("og-info-wrap").textContent = "";
    document.getElementById("og-tabs-wrap").textContent = "";
    document.getElementById("og-tab-content").textContent = "";
    return;
  }

  document.getElementById("og-lobby").textContent = "";
  renderTrack();
  renderSnailStats();
  renderInfoPanel();
  renderTabs();
  renderTabContent();
}

/* ═══════════════════════════════════════════
   HEADER
   ═══════════════════════════════════════════ */

function renderHeader() {
  const header = document.getElementById("og-header");
  header.textContent = "";
  const view = onlineState.view;

  const title = document.createElement("span");
  title.className = "og-title";
  title.textContent = "Snail Betting";
  header.appendChild(title);

  if (view.phase !== "lobby") {
    const raceInfo = document.createElement("span");
    raceInfo.className = "og-info";
    const phaseLabel = view.phase === "race_turn" ? "Racing"
      : view.phase === "downtime_submit" ? "Downtime"
      : view.phase === "complete" ? "Complete"
      : view.phase;
    raceInfo.textContent = view.raceNumber ? `Race ${view.raceNumber} \u2022 ${phaseLabel}` : phaseLabel;
    header.appendChild(raceInfo);

    if (view.phase === "race_turn" && view.currentSeatId !== null && view.publicState?.players?.[view.currentSeatId]) {
      const turnInfo = document.createElement("span");
      turnInfo.className = "og-info";
      const isYourTurn = view.currentSeatId === onlineState.session?.seatIndex;
      turnInfo.textContent = isYourTurn ? "Your Turn!" : `${view.publicState.players[view.currentSeatId].name}'s Turn`;
      if (isYourTurn) {
        turnInfo.style.color = "#2ecc71";
        turnInfo.style.fontWeight = "700";
      }
      header.appendChild(turnInfo);
    }
  }

  const sync = document.createElement("span");
  sync.className = "og-sync";
  const dot = document.createElement("span");
  dot.className = "og-sync-dot " + onlineState.syncStatus;
  sync.appendChild(dot);
  sync.appendChild(document.createTextNode(onlineState.syncStatus === "synced" ? "Live" : onlineState.syncStatus === "syncing" ? "Syncing" : onlineState.syncStatus === "error" ? "Offline" : ""));
  header.appendChild(sync);
}

/* ═══════════════════════════════════════════
   LOBBY
   ═══════════════════════════════════════════ */

function renderLobby() {
  const lobby = document.getElementById("og-lobby");
  lobby.textContent = "";
  lobby.className = "og-lobby";

  const titlePanel = document.createElement("div");
  titlePanel.className = "og-info-panel";
  titlePanel.style.textAlign = "center";
  titlePanel.style.marginBottom = "12px";

  const h2 = document.createElement("h1");
  h2.textContent = "Waiting for Players";
  h2.style.marginBottom = "4px";
  titlePanel.appendChild(h2);

  const gameId = document.createElement("div");
  gameId.style.fontSize = "0.8rem";
  gameId.style.opacity = "0.6";
  gameId.textContent = `Game ${onlineState.session?.gameId || ""}`;
  titlePanel.appendChild(gameId);
  lobby.appendChild(titlePanel);

  const seatPanel = document.createElement("div");
  seatPanel.className = "og-info-panel";
  const seatLabel = document.createElement("div");
  seatLabel.className = "og-section-label";
  seatLabel.textContent = "Seats";
  seatPanel.appendChild(seatLabel);

  (onlineState.view.lobby?.seats || []).forEach((seat) => {
    const row = document.createElement("div");
    row.className = "og-lobby-seat";

    const icon = document.createElement("div");
    icon.className = "og-seat-icon" + (seat.claimed ? " claimed" : "");
    icon.textContent = seat.claimed ? seat.name.charAt(0).toUpperCase() : "?";
    row.appendChild(icon);

    const name = document.createElement("span");
    name.className = "og-seat-name";
    name.textContent = seat.claimed ? seat.name : "Waiting...";
    row.appendChild(name);

    if (seat.isHost) {
      const badge = document.createElement("span");
      badge.className = "og-seat-badge";
      badge.textContent = "HOST";
      row.appendChild(badge);
    }

    seatPanel.appendChild(row);
  });
  lobby.appendChild(seatPanel);

  if (onlineState.inviteTokens.length > 0) {
    const invitePanel = document.createElement("div");
    invitePanel.className = "og-info-panel";
    const inviteLabel = document.createElement("div");
    inviteLabel.className = "og-section-label";
    inviteLabel.textContent = "Invite Links";
    invitePanel.appendChild(inviteLabel);

    onlineState.inviteTokens.forEach((invite) => {
      const row = document.createElement("div");
      row.className = "og-invite-row";
      const input = document.createElement("input");
      input.readOnly = true;
      const params = new URLSearchParams({
        game: onlineState.session.gameId,
        seat_token: invite.seatToken,
        supabase_url: onlineState.config.supabaseUrl || "",
        anon_key: onlineState.config.anonKey || "",
      });
      input.value = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
      row.appendChild(input);

      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.textContent = "Copy";
      copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(input.value).then(() => {
          copyBtn.textContent = "Copied!";
          setTimeout(() => { copyBtn.textContent = "Copy"; }, 1500);
        });
      });
      row.appendChild(copyBtn);

      invitePanel.appendChild(row);
    });
    lobby.appendChild(invitePanel);
  }

  const isHost = !!onlineState.session?.isHost;
  const canStart = isHost && onlineState.view.lobby?.startable;
  if (isHost) {
    const startButton = document.createElement("button");
    startButton.className = "btn-primary";
    startButton.textContent = canStart ? "Start Game!" : "Waiting for all players...";
    startButton.disabled = !canStart;
    startButton.style.width = "100%";
    startButton.addEventListener("click", async () => {
      try {
        const requestId = nextRequestId();
        const response = await onlineState.api.startGame();
        commitView(response.view, requestId);
        renderOnlineScreen();
      } catch (error) {
        setRuntimeError(error.message || "Unable to start game.");
      }
    });
    lobby.appendChild(startButton);
  }
}

/* ═══════════════════════════════════════════
   TRACK (visual grid like local game)
   ═══════════════════════════════════════════ */

function renderTrack() {
  const wrap = document.getElementById("og-track-wrap");
  wrap.textContent = "";

  const container = document.createElement("div");
  container.className = "og-track-container";

  const track = document.createElement("div");
  track.className = "og-track";

  const trackLen = DEFAULTS.trackLength;
  const snails = onlineState.view.publicState.snails;

  snails.forEach((snail, row) => {
    const label = document.createElement("div");
    label.className = "og-lane-label";
    label.style.color = snailCss(snail.color);
    label.textContent = snail.color.charAt(0).toUpperCase();
    track.appendChild(label);

    for (let col = 1; col <= trackLen; col++) {
      const cell = document.createElement("div");
      cell.className = "og-track-cell";
      if (snail.position === col) {
        const marker = document.createElement("div");
        marker.className = "og-snail";
        marker.style.background = snailCss(snail.color);
        marker.textContent = snail.eliminated ? "\u274C" : "\uD83D\uDC0C";
        cell.appendChild(marker);
      }
      track.appendChild(cell);
    }

    const finish = document.createElement("div");
    finish.className = "og-finish-cell";
    finish.textContent = "\uD83C\uDFC1";
    track.appendChild(finish);
  });

  container.appendChild(track);
  wrap.appendChild(container);
}

/* ═══════════════════════════════════════════
   SNAIL STATS (compact row of colored cards)
   ═══════════════════════════════════════════ */

function renderSnailStats() {
  const wrap = document.getElementById("og-snail-stats-wrap");
  wrap.textContent = "";

  const row = document.createElement("div");
  row.className = "og-snail-stats";

  onlineState.view.publicState.snails.forEach((snail) => {
    const card = document.createElement("div");
    card.className = "og-snail-stat" + (snail.eliminated ? " eliminated" : "");
    card.style.borderLeftColor = snailCss(snail.color);

    const icon = document.createElement("div");
    icon.className = "og-stat-icon";
    icon.textContent = snail.eliminated ? "\u274C" : "\uD83D\uDC0C";
    card.appendChild(icon);

    const stressRow = document.createElement("div");
    stressRow.className = "og-stat-row";
    stressRow.innerHTML = "";
    const stressLabel = document.createTextNode("Stress");
    const stressVal = document.createElement("span");
    stressVal.textContent = `${snail.stress}/${DEFAULTS.stressMax}`;
    if (snail.stress >= 7) stressVal.style.color = "#e74c3c";
    else if (snail.stress >= 4) stressVal.style.color = "#f1c40f";
    stressRow.appendChild(stressLabel);
    stressRow.appendChild(stressVal);
    card.appendChild(stressRow);

    if (snail.trainingBonus > 0) {
      const bonusRow = document.createElement("div");
      bonusRow.className = "og-stat-row";
      const bonusLabel = document.createTextNode("Bonus");
      const bonusVal = document.createElement("span");
      bonusVal.textContent = `+${snail.trainingBonus}`;
      bonusVal.style.color = "#2ecc71";
      bonusRow.appendChild(bonusLabel);
      bonusRow.appendChild(bonusVal);
      card.appendChild(bonusRow);
    }

    if (snail.drugged) {
      const drugRow = document.createElement("div");
      drugRow.className = "og-stat-row";
      drugRow.style.color = "#e74c3c";
      drugRow.textContent = "BOOSTED";
      card.appendChild(drugRow);
    }

    row.appendChild(card);
  });

  wrap.appendChild(row);
}

/* ═══════════════════════════════════════════
   INFO PANEL (standings + your bets/shares)
   ═══════════════════════════════════════════ */

function renderInfoPanel() {
  const wrap = document.getElementById("og-info-wrap");
  wrap.textContent = "";

  const panel = document.createElement("div");
  panel.className = "og-info-panel";

  // Standings
  const standingsLabel = document.createElement("div");
  standingsLabel.className = "og-section-label";
  standingsLabel.textContent = "Standings";
  panel.appendChild(standingsLabel);

  onlineState.view.publicState.standings.forEach((row) => {
    const el = document.createElement("div");
    el.className = "og-standings-row" + (row.seatIndex === onlineState.session?.seatIndex ? " current" : "");

    const name = document.createElement("span");
    name.textContent = row.name;
    el.appendChild(name);

    const coins = document.createElement("span");
    coins.className = "og-coin" + (row.coins < 0 ? " negative" : "");
    coins.textContent = `$${row.coins}`;
    el.appendChild(coins);

    panel.appendChild(el);
  });

  // Your Position
  const privateState = onlineState.view.privateState;
  if (privateState) {
    const divider = document.createElement("div");
    divider.style.borderTop = "1px solid rgba(255,255,255,0.08)";
    divider.style.margin = "8px 0";
    panel.appendChild(divider);

    const yourLabel = document.createElement("div");
    yourLabel.className = "og-section-label";
    yourLabel.textContent = "Your Portfolio";
    panel.appendChild(yourLabel);

    // Bets
    if (privateState.bets.length > 0) {
      const betsDiv = document.createElement("div");
      betsDiv.style.marginBottom = "6px";
      const betsLabel = document.createElement("span");
      betsLabel.style.fontSize = "0.78rem";
      betsLabel.style.opacity = "0.7";
      betsLabel.textContent = "Bets: ";
      betsDiv.appendChild(betsLabel);
      privateState.bets.forEach((bet) => {
        const tag = document.createElement("span");
        tag.className = "og-tag";
        tag.style.background = snailCss(bet.snailColor);
        tag.textContent = `$${bet.amount}`;
        const detail = document.createElement("span");
        detail.className = "og-tag-detail";
        detail.textContent = ` @${bet.multiplier}x`;
        tag.appendChild(detail);
        betsDiv.appendChild(tag);
      });
      panel.appendChild(betsDiv);
    }

    // Snail shares
    const shareEntries = Object.entries(privateState.shares).filter(([, c]) => c > 0);
    if (shareEntries.length > 0) {
      const sharesDiv = document.createElement("div");
      sharesDiv.style.marginBottom = "6px";
      const sharesLabel = document.createElement("span");
      sharesLabel.style.fontSize = "0.78rem";
      sharesLabel.style.opacity = "0.7";
      sharesLabel.textContent = "Shares: ";
      sharesDiv.appendChild(sharesLabel);
      shareEntries.forEach(([color, count]) => {
        const tag = document.createElement("span");
        tag.className = "og-tag";
        tag.style.background = snailCss(color);
        tag.textContent = `${color} x${count}`;
        sharesDiv.appendChild(tag);
      });
      panel.appendChild(sharesDiv);
    }

    // Shop shares
    const shopEntries = Object.entries(privateState.shopShares).filter(([, c]) => c > 0);
    if (shopEntries.length > 0) {
      const shopDiv = document.createElement("div");
      const shopLabel = document.createElement("span");
      shopLabel.style.fontSize = "0.78rem";
      shopLabel.style.opacity = "0.7";
      shopLabel.textContent = "Shop shares: ";
      shopDiv.appendChild(shopLabel);
      shopEntries.forEach(([key, count]) => {
        const tag = document.createElement("span");
        tag.className = "og-tag";
        tag.style.background = "#9b59b6";
        tag.textContent = `${SHOP_NAMES[key]} x${count}`;
        shopDiv.appendChild(tag);
      });
      panel.appendChild(shopDiv);
    }
  }

  wrap.appendChild(panel);
}

/* ═══════════════════════════════════════════
   TABS (Actions / Market / Activity)
   ═══════════════════════════════════════════ */

function renderTabs() {
  const wrap = document.getElementById("og-tabs-wrap");
  wrap.textContent = "";

  const tabs = document.createElement("div");
  tabs.className = "og-tabs";

  const tabDefs = [
    { id: "actions", label: "Actions" },
    { id: "market", label: "Market" },
    { id: "activity", label: "Activity" },
  ];

  tabDefs.forEach((tab) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = tab.label;
    btn.classList.toggle("active", onlineState.activeTab === tab.id);
    btn.addEventListener("click", () => {
      onlineState.activeTab = tab.id;
      renderTabs();
      renderTabContent();
    });
    tabs.appendChild(btn);
  });

  wrap.appendChild(tabs);
}

function renderTabContent() {
  const wrap = document.getElementById("og-tab-content");
  wrap.textContent = "";

  if (onlineState.activeTab === "actions") {
    renderActionPanel(wrap);
  } else if (onlineState.activeTab === "market") {
    renderMarketPanel(wrap);
  } else if (onlineState.activeTab === "activity") {
    renderActivityFeed(wrap);
  }
}

/* ═══════════════════════════════════════════
   ACTION PANEL
   ═══════════════════════════════════════════ */

function renderActionPanel(container) {
  const panel = document.createElement("div");
  panel.className = "og-action-panel";

  const privateState = onlineState.view.privateState;
  const allowed = privateState?.allowedActions || [];

  if (onlineState.view.phase === "complete") {
    const done = document.createElement("div");
    done.className = "og-waiting-msg";
    done.textContent = onlineState.view.status === "archived" ? "Game archived." : "Game complete!";
    panel.appendChild(done);
  } else if (allowed.length === 0) {
    const waiting = document.createElement("div");
    waiting.className = "og-waiting-msg";
    if (onlineState.view.phase === "race_turn") {
      const currentPlayer = onlineState.view.publicState?.players?.[onlineState.view.currentSeatId];
      waiting.textContent = currentPlayer ? `Waiting for ${currentPlayer.name}...` : "Waiting for the active player...";
    } else {
      waiting.textContent = "Waiting for other players to submit...";
    }
    panel.appendChild(waiting);
  } else if (onlineState.view.phase === "race_turn") {
    renderRaceActions(panel);
  } else if (onlineState.view.phase === "downtime_submit") {
    renderDowntimeActions(panel);
  }

  // Host skip
  if (onlineState.session?.isHost && onlineState.view.idleDeadlineAt && new Date(onlineState.view.idleDeadlineAt).getTime() <= Date.now()) {
    const hostGroup = document.createElement("div");
    hostGroup.className = "og-action-group";
    hostGroup.style.borderTop = "1px solid rgba(255,255,255,0.1)";
    hostGroup.style.paddingTop = "10px";
    hostGroup.style.marginTop = "10px";

    const label = document.createElement("div");
    label.className = "og-action-label";
    label.style.color = "#e74c3c";
    label.textContent = "Host: Skip Stalled Seat";
    hostGroup.appendChild(label);

    const select = document.createElement("select");
    if (onlineState.view.phase === "race_turn") {
      const option = document.createElement("option");
      option.value = String(onlineState.view.currentSeatId);
      option.textContent = onlineState.view.publicState.players[onlineState.view.currentSeatId].name;
      select.appendChild(option);
    } else {
      onlineState.view.publicState.players.forEach((player) => {
        if (!onlineState.view.publicState.downtimeSubmitted[player.seatIndex]) {
          const option = document.createElement("option");
          option.value = String(player.seatIndex);
          option.textContent = player.name;
          select.appendChild(option);
        }
      });
    }
    const draftKey = "host-skip";
    const hostDraft = getDraft(draftKey);
    if (hostDraft.value && Array.from(select.options).some((o) => o.value === hostDraft.value)) {
      select.value = hostDraft.value;
    }
    select.addEventListener("change", () => updateDraft(draftKey, { value: select.value }));
    hostGroup.appendChild(select);

    const btns = document.createElement("div");
    btns.className = "og-action-btns";
    const skipBtn = document.createElement("button");
    skipBtn.className = "og-btn-drug";
    skipBtn.textContent = "Skip Seat";
    skipBtn.addEventListener("click", async () => {
      try {
        const requestId = nextRequestId();
        const response = await onlineState.api.hostSkipSeat(Number(select.value));
        commitView(response.view, requestId);
        renderOnlineScreen();
      } catch (error) {
        setRuntimeError(error.message || "Unable to skip seat.");
      }
    });
    btns.appendChild(skipBtn);
    hostGroup.appendChild(btns);
    panel.appendChild(hostGroup);
  }

  container.appendChild(panel);
}

/* ═══════════════════════════════════════════
   RACE ACTIONS (visual snail picker + buttons)
   ═══════════════════════════════════════════ */

function renderRaceActions(container) {
  // Bet action
  const betGroup = document.createElement("div");
  betGroup.className = "og-action-group";

  const betLabel = document.createElement("div");
  betLabel.className = "og-action-label";
  betLabel.textContent = "Place a Bet";
  betGroup.appendChild(betLabel);

  const betDraft = getDraft("race-bet");
  const betPicker = createSnailPicker("race-bet", betDraft.value);
  betGroup.appendChild(betPicker);

  const wagerRow = document.createElement("div");
  wagerRow.className = "og-wager-row";
  let wagerAmount = Number(betDraft.extraValue) || DEFAULTS.minWager;

  const minusBtn = document.createElement("button");
  minusBtn.className = "og-wager-btn";
  minusBtn.textContent = "\u2212";
  const wagerDisplay = document.createElement("span");
  wagerDisplay.className = "og-wager-amount";
  wagerDisplay.textContent = `$${wagerAmount}`;
  const plusBtn = document.createElement("button");
  plusBtn.className = "og-wager-btn";
  plusBtn.textContent = "+";

  const updateWager = (delta) => {
    wagerAmount = Math.max(DEFAULTS.minWager, wagerAmount + delta);
    wagerDisplay.textContent = `$${wagerAmount}`;
    updateDraft("race-bet", { extraValue: String(wagerAmount) });
  };
  minusBtn.addEventListener("click", () => updateWager(-DEFAULTS.wagerStep));
  plusBtn.addEventListener("click", () => updateWager(DEFAULTS.wagerStep));

  wagerRow.appendChild(minusBtn);
  wagerRow.appendChild(wagerDisplay);
  wagerRow.appendChild(plusBtn);
  betGroup.appendChild(wagerRow);

  const betBtns = document.createElement("div");
  betBtns.className = "og-action-btns";
  const betBtn = document.createElement("button");
  betBtn.className = "og-btn-bet";
  betBtn.textContent = "Place Bet";
  betBtn.addEventListener("click", () => {
    const snailColor = getDraft("race-bet").value || SNAILS[0].color;
    submitIntent({ type: "bet", snailColor, amount: wagerAmount });
  });
  betBtns.appendChild(betBtn);
  betGroup.appendChild(betBtns);
  container.appendChild(betGroup);

  // Buy share
  const shareGroup = document.createElement("div");
  shareGroup.className = "og-action-group";
  const shareLabel = document.createElement("div");
  shareLabel.className = "og-action-label";
  shareLabel.textContent = `Buy Snail Share ($${DEFAULTS.shareCost})`;
  shareGroup.appendChild(shareLabel);
  const shareDraft = getDraft("race-buy-share");
  shareGroup.appendChild(createSnailPicker("race-buy-share", shareDraft.value));
  const shareBtns = document.createElement("div");
  shareBtns.className = "og-action-btns";
  const shareBtn = document.createElement("button");
  shareBtn.className = "og-btn-share";
  shareBtn.textContent = "Buy Share";
  shareBtn.addEventListener("click", () => {
    const snailColor = getDraft("race-buy-share").value || SNAILS[0].color;
    submitIntent({ type: "buy_snail_share", snailColor });
  });
  shareBtns.appendChild(shareBtn);
  shareGroup.appendChild(shareBtns);
  container.appendChild(shareGroup);

  // Drug (stimulate)
  const managedSnails = SNAILS.filter((snail) => onlineState.view.publicState.managerMap[snail.color]?.seatIndex === onlineState.view.privateState.seatIndex);
  if (managedSnails.length > 0) {
    const drugGroup = document.createElement("div");
    drugGroup.className = "og-action-group";
    const drugLabel = document.createElement("div");
    drugLabel.className = "og-action-label";
    drugLabel.textContent = `Stimulate Managed Snail ($${DEFAULTS.drugCost})`;
    drugGroup.appendChild(drugLabel);
    const drugDraft = getDraft("race-drug");
    drugGroup.appendChild(createSnailPicker("race-drug", drugDraft.value, managedSnails));
    const drugBtns = document.createElement("div");
    drugBtns.className = "og-action-btns";
    const drugBtn = document.createElement("button");
    drugBtn.className = "og-btn-drug";
    drugBtn.textContent = "Stimulate";
    drugBtn.addEventListener("click", () => {
      const snailColor = getDraft("race-drug").value;
      if (snailColor) submitIntent({ type: "drug", snailColor });
    });
    drugBtns.appendChild(drugBtn);
    drugGroup.appendChild(drugBtns);
    container.appendChild(drugGroup);
  }

  // Market actions (select-based, less common)
  renderMarketActions(container);

  // Skip & Roll
  const skipBtns = document.createElement("div");
  skipBtns.className = "og-action-btns";
  skipBtns.style.marginTop = "8px";
  const skipBtn = document.createElement("button");
  skipBtn.className = "og-btn-skip";
  skipBtn.textContent = "Skip & Roll";
  skipBtn.addEventListener("click", () => submitIntent({ type: "skip_roll" }));
  skipBtns.appendChild(skipBtn);
  container.appendChild(skipBtns);
}

/* ═══════════════════════════════════════════
   DOWNTIME ACTIONS
   ═══════════════════════════════════════════ */

function renderDowntimeActions(container) {
  const label = document.createElement("div");
  label.className = "og-action-label";
  label.textContent = "Between Races";
  label.style.marginBottom = "8px";
  container.appendChild(label);

  // Massage
  const managed = SNAILS.filter((snail) => {
    const manager = onlineState.view.publicState.managerMap[snail.color];
    const publicSnail = onlineState.view.publicState.snails.find((entry) => entry.color === snail.color);
    return manager?.seatIndex === onlineState.view.privateState.seatIndex && publicSnail && publicSnail.stress > 0;
  });
  if (managed.length > 0) {
    const massageGroup = document.createElement("div");
    massageGroup.className = "og-action-group";
    const massageLabel = document.createElement("div");
    massageLabel.className = "og-action-label";
    massageLabel.textContent = `Massage ($${DEFAULTS.massageCost}, -${DEFAULTS.massageStressRelief} stress)`;
    massageGroup.appendChild(massageLabel);
    massageGroup.appendChild(createSnailPicker("downtime-massage", getDraft("downtime-massage").value, managed));
    const mBtns = document.createElement("div");
    mBtns.className = "og-action-btns";
    const mBtn = document.createElement("button");
    mBtn.className = "og-btn-massage";
    mBtn.textContent = "Massage";
    mBtn.addEventListener("click", () => {
      const snailColor = getDraft("downtime-massage").value;
      if (snailColor) submitIntent({ type: "massage", snailColor });
    });
    mBtns.appendChild(mBtn);
    massageGroup.appendChild(mBtns);
    container.appendChild(massageGroup);
  }

  // Train
  const trainable = SNAILS.filter((snail) => (onlineState.view.privateState.shares[snail.color] || 0) > 0);
  if (trainable.length > 0) {
    const trainGroup = document.createElement("div");
    trainGroup.className = "og-action-group";
    const trainLabel = document.createElement("div");
    trainLabel.className = "og-action-label";
    trainLabel.textContent = `Train ($${DEFAULTS.trainCost})`;
    trainGroup.appendChild(trainLabel);
    trainGroup.appendChild(createSnailPicker("downtime-train", getDraft("downtime-train").value, trainable));
    const tBtns = document.createElement("div");
    tBtns.className = "og-action-btns";
    const tBtn = document.createElement("button");
    tBtn.className = "og-btn-train";
    tBtn.textContent = "Train";
    tBtn.addEventListener("click", () => {
      const snailColor = getDraft("downtime-train").value;
      if (snailColor) submitIntent({ type: "train", snailColor });
    });
    tBtns.appendChild(tBtn);
    trainGroup.appendChild(tBtns);
    container.appendChild(trainGroup);
  }

  // Buy shop share
  const shopGroup = document.createElement("div");
  shopGroup.className = "og-action-group";
  const shopLabel = document.createElement("div");
  shopLabel.className = "og-action-label";
  shopLabel.textContent = "Buy Shop Share";
  shopGroup.appendChild(shopLabel);

  const shopSelect = document.createElement("select");
  SHOPS.forEach((shop) => {
    const opt = document.createElement("option");
    opt.value = shop;
    opt.textContent = SHOP_NAMES[shop];
    shopSelect.appendChild(opt);
  });
  const shopDraft = getDraft("downtime-buy-shop-share");
  if (shopDraft.value) shopSelect.value = shopDraft.value;
  shopSelect.addEventListener("change", () => updateDraft("downtime-buy-shop-share", { value: shopSelect.value }));
  shopGroup.appendChild(shopSelect);

  const sBtns = document.createElement("div");
  sBtns.className = "og-action-btns";
  const sBtn = document.createElement("button");
  sBtn.className = "og-btn-shop";
  sBtn.textContent = "Buy Shop Share";
  sBtn.addEventListener("click", () => {
    submitIntent({ type: "buy_shop_share", shopKey: shopSelect.value || SHOPS[0] });
  });
  sBtns.appendChild(sBtn);
  shopGroup.appendChild(sBtns);
  container.appendChild(shopGroup);

  // Market actions
  renderMarketActions(container);

  // Pass
  const passBtns = document.createElement("div");
  passBtns.className = "og-action-btns";
  passBtns.style.marginTop = "8px";
  const passBtn = document.createElement("button");
  passBtn.className = "og-btn-skip";
  passBtn.textContent = "Submit Pass";
  passBtn.addEventListener("click", () => submitIntent({ type: "pass" }));
  passBtns.appendChild(passBtn);
  container.appendChild(passBtns);
}

/* ═══════════════════════════════════════════
   MARKET ACTIONS (shared by race + downtime)
   ═══════════════════════════════════════════ */

function renderMarketActions(container) {
  const draftPrefix = onlineState.view.phase === "race_turn" ? "race" : "downtime";

  // Buy listing
  const buyListings = onlineState.view.publicState.marketListings
    .filter((listing) => listing.sellerId !== onlineState.view.privateState.seatIndex);

  if (buyListings.length > 0) {
    const buyGroup = document.createElement("div");
    buyGroup.className = "og-action-group";
    const buyLabel = document.createElement("div");
    buyLabel.className = "og-action-label";
    buyLabel.textContent = "Buy Market Listing";
    buyGroup.appendChild(buyLabel);

    const buySelect = document.createElement("select");
    buyListings.forEach((listing) => {
      const opt = document.createElement("option");
      opt.value = String(listing.id);
      opt.textContent = `${listing.assetType === "snail" ? listing.assetKey : SHOP_NAMES[listing.assetKey]} ($${listing.price}) from ${listing.sellerName}`;
      buySelect.appendChild(opt);
    });
    const buyDraft = getDraft(`${draftPrefix}-market-buy`);
    if (buyDraft.value) buySelect.value = buyDraft.value;
    buySelect.addEventListener("change", () => updateDraft(`${draftPrefix}-market-buy`, { value: buySelect.value }));
    buyGroup.appendChild(buySelect);

    const bBtns = document.createElement("div");
    bBtns.className = "og-action-btns";
    const bBtn = document.createElement("button");
    bBtn.className = "og-btn-market";
    bBtn.textContent = "Buy Listing";
    bBtn.addEventListener("click", () => {
      submitIntent({ type: "market_buy", listingId: Number(buySelect.value) });
    });
    bBtns.appendChild(bBtn);
    buyGroup.appendChild(bBtns);
    container.appendChild(buyGroup);
  }

  // List asset
  const listOptions = [];
  Object.entries(onlineState.view.privateState.shares).forEach(([color, count]) => {
    if (count > 0) listOptions.push({ value: `snail:${color}`, label: `${color} snail share (${count})` });
  });
  Object.entries(onlineState.view.privateState.shopShares).forEach(([key, count]) => {
    if (count > 0) listOptions.push({ value: `shop:${key}`, label: `${SHOP_NAMES[key]} share (${count})` });
  });

  if (listOptions.length > 0) {
    const listGroup = document.createElement("div");
    listGroup.className = "og-action-group";
    const listLabel = document.createElement("div");
    listLabel.className = "og-action-label";
    listLabel.textContent = "List Asset on Market";
    listGroup.appendChild(listLabel);

    const listSelect = document.createElement("select");
    listOptions.forEach((opt) => {
      const el = document.createElement("option");
      el.value = opt.value;
      el.textContent = opt.label;
      listSelect.appendChild(el);
    });
    const listDraft = getDraft(`${draftPrefix}-market-list`);
    if (listDraft.value) listSelect.value = listDraft.value;
    listSelect.addEventListener("change", () => updateDraft(`${draftPrefix}-market-list`, { value: listSelect.value }));
    listGroup.appendChild(listSelect);

    const priceLabel = document.createElement("div");
    priceLabel.className = "og-action-label";
    priceLabel.textContent = "Price";
    priceLabel.style.marginTop = "6px";
    listGroup.appendChild(priceLabel);

    const priceInput = document.createElement("input");
    priceInput.type = "number";
    priceInput.value = listDraft.extraValue || "10";
    priceInput.addEventListener("input", () => updateDraft(`${draftPrefix}-market-list`, { extraValue: priceInput.value }));
    listGroup.appendChild(priceInput);

    const lBtns = document.createElement("div");
    lBtns.className = "og-action-btns";
    const lBtn = document.createElement("button");
    lBtn.className = "og-btn-market";
    lBtn.textContent = "List Asset";
    lBtn.addEventListener("click", () => {
      const [assetType, assetKey] = listSelect.value.split(":");
      submitIntent({ type: "market_list", assetType, assetKey, price: Number(priceInput.value) });
    });
    lBtns.appendChild(lBtn);
    listGroup.appendChild(lBtns);
    container.appendChild(listGroup);
  }
}

/* ═══════════════════════════════════════════
   SNAIL PICKER (colored button row)
   ═══════════════════════════════════════════ */

function createSnailPicker(draftKey, currentValue, snailSubset = null) {
  const picker = document.createElement("div");
  picker.className = "og-snail-picker";
  const available = snailSubset || SNAILS;

  available.forEach((snail) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "og-snail-pick-btn" + (currentValue === snail.color ? " selected" : "");
    btn.style.background = snailCss(snail.color);
    btn.textContent = snail.label;
    btn.addEventListener("click", () => {
      updateDraft(draftKey, { value: snail.color });
      picker.querySelectorAll(".og-snail-pick-btn").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
    });
    picker.appendChild(btn);
  });

  // Auto-select first if none selected
  if (!currentValue && available.length > 0) {
    updateDraft(draftKey, { value: available[0].color });
    picker.querySelector(".og-snail-pick-btn")?.classList.add("selected");
  }

  return picker;
}

/* ═══════════════════════════════════════════
   MARKET PANEL (tab)
   ═══════════════════════════════════════════ */

function renderMarketPanel(container) {
  const panel = document.createElement("div");
  panel.className = "og-info-panel";

  // Market Listings
  const listingsLabel = document.createElement("div");
  listingsLabel.className = "og-section-label";
  listingsLabel.textContent = "Active Listings";
  panel.appendChild(listingsLabel);

  if (onlineState.view.publicState.marketListings.length === 0) {
    const empty = document.createElement("div");
    empty.style.opacity = "0.5";
    empty.style.fontSize = "0.85rem";
    empty.style.padding = "8px 0";
    empty.textContent = "No listings on the market.";
    panel.appendChild(empty);
  } else {
    onlineState.view.publicState.marketListings.forEach((listing) => {
      const row = document.createElement("div");
      row.className = "og-market-listing";

      const info = document.createElement("div");
      info.className = "og-market-info";
      const assetName = listing.assetType === "snail" ? listing.assetKey : SHOP_NAMES[listing.assetKey];
      const tag = document.createElement("span");
      tag.className = "og-tag";
      tag.style.background = listing.assetType === "snail" ? snailCss(listing.assetKey) : "#9b59b6";
      tag.textContent = assetName;
      info.appendChild(tag);
      const seller = document.createTextNode(` from ${listing.sellerName}`);
      info.appendChild(seller);
      row.appendChild(info);

      const price = document.createElement("span");
      price.className = "og-market-price";
      price.textContent = `$${listing.price}`;
      row.appendChild(price);

      panel.appendChild(row);
    });
  }

  // Profit Projection
  const profitLabel = document.createElement("div");
  profitLabel.className = "og-section-label";
  profitLabel.style.marginTop = "12px";
  profitLabel.textContent = "Who Profits (if race ended now)";
  panel.appendChild(profitLabel);

  onlineState.view.publicState.profitProjection.forEach((projection) => {
    const section = document.createElement("div");
    section.className = "og-profit-snail";

    const header = document.createElement("div");
    header.className = "og-profit-header";
    const dot = document.createElement("span");
    dot.className = "og-color-dot";
    dot.style.background = snailCss(projection.snailColor);
    header.appendChild(dot);
    header.appendChild(document.createTextNode(projection.snailColor));
    section.appendChild(header);

    const detail = document.createElement("div");
    detail.className = "og-profit-detail";
    if (projection.entries.length === 0) {
      detail.textContent = "No one profits";
      detail.style.opacity = "0.5";
    } else {
      detail.textContent = projection.entries.map((e) => `${e.playerName} +$${e.projected}`).join(", ");
    }
    section.appendChild(detail);
    panel.appendChild(section);
  });

  container.appendChild(panel);
}

/* ═══════════════════════════════════════════
   ACTIVITY FEED (tab)
   ═══════════════════════════════════════════ */

function renderActivityFeed(container) {
  const panel = document.createElement("div");
  panel.className = "og-info-panel";

  const label = document.createElement("div");
  label.className = "og-section-label";
  label.textContent = "Recent Activity";
  panel.appendChild(label);

  const summaries = onlineState.view.publicState.recentSummaries;
  if (summaries.length === 0) {
    const empty = document.createElement("div");
    empty.style.opacity = "0.5";
    empty.style.fontSize = "0.85rem";
    empty.style.padding = "8px 0";
    empty.textContent = "No actions yet.";
    panel.appendChild(empty);
  } else {
    summaries.forEach((summary) => {
      const item = document.createElement("div");
      item.className = "og-feed-item";
      renderSummaryItem(item, summary);
      panel.appendChild(item);
    });
  }

  container.appendChild(panel);
}

function renderSummaryItem(element, summary) {
  if (summary.actorName) {
    const actor = document.createElement("span");
    actor.className = "og-feed-actor";
    actor.textContent = summary.actorName;
    element.appendChild(actor);
    element.appendChild(document.createTextNode(" "));
  }

  if (summary.kind === "race_turn") {
    const action = summary.actionType.replaceAll("_", " ");
    element.appendChild(document.createTextNode(action));

    if (Array.isArray(summary.dice) && summary.dice.length > 0) {
      element.appendChild(document.createTextNode(" \u2014 rolled "));
      const diceWrap = document.createElement("span");
      diceWrap.className = "og-feed-dice";
      summary.dice.forEach((index) => {
        const die = document.createElement("span");
        die.className = "og-feed-die";
        die.style.background = SNAILS[index] ? SNAILS[index].css : "#888";
        die.textContent = SNAILS[index] ? SNAILS[index].label : "?";
        diceWrap.appendChild(die);
      });
      element.appendChild(diceWrap);
    }

    if (summary.raceComplete) {
      element.appendChild(document.createTextNode(" "));
      const winner = document.createElement("span");
      winner.className = "og-feed-winner";
      winner.textContent = `\uD83C\uDFC6 ${summary.raceComplete.winnerColor} wins!`;
      element.appendChild(winner);
    }
  } else if (summary.kind === "downtime_submit") {
    element.appendChild(document.createTextNode(summary.detail?.summary || summary.actionType));
  } else {
    element.appendChild(document.createTextNode(summary.actionType || "system update"));
  }
}

/* ═══════════════════════════════════════════
   SUBMIT INTENT
   ═══════════════════════════════════════════ */

async function submitIntent(intent) {
  try {
    setRuntimeError("");
    onlineState.syncStatus = "syncing";
    const requestId = nextRequestId();
    const response = await onlineState.api.submitAction(onlineState.view.version, intent);
    clearActionDrafts();
    commitView(response.view, requestId);
    onlineState.syncStatus = "synced";
    renderOnlineScreen();
  } catch (error) {
    if (error.status === 409) {
      try {
        const requestId = nextRequestId();
        const refreshed = await onlineState.api.getGameView();
        commitView(refreshed.view, requestId);
        renderOnlineScreen();
      } catch {
        // Ignore the secondary refresh failure and surface the original conflict.
      }
    }
    onlineState.syncStatus = "error";
    setRuntimeError(error.message || "Action failed.");
  }
}
