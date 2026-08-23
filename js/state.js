/* ════════════════════════════════════════
   GLOBAL STATE
════════════════════════════════════════ */

// ── Owned by irc.js ──────────────────────────────
/*
 * FIX: renamed from 'socket' to 'ircWs'.
 * Two WebSocket connections exist in this scope (IRC and OBS).
 * Having one clearly named 'obsWs' and the other 'socket' was
 * asymmetric and made accidental cross-assignment too easy.
 * Every file that referenced 'socket' is updated in its own fix.
 */
let ircWs            = null;
let botName          = '';
let channel          = '';
/*
 * NOTE: savedOauth is a plain global — any loaded plugin script
 * can read window.savedOauth.  Never log or transmit this value.
 * A future hardening pass should wrap it in a closure with a
 * getter-only accessor.
 */
let savedOauth       = '';
let reconnectTimer   = null;
let reconnectCount   = 0;
let manualDisconnect = false;
// FIX: explicit constant — was a magic literal '5' buried in irc.js logic.
const MAX_RECONNECT  = 5;

// ── Owned by commands.js ─────────────────────────
/*
 * FIX: Object.create(null) — eliminates the prototype chain.
 * Plain {} inherits Object.prototype; a command named 'constructor'
 * or 'hasOwnProperty' would shadow built-in properties and
 * produce unpredictable behaviour on lookup.
 */
const commands  = Object.create(null);
const cooldowns = Object.create(null);

// ── Chat command list cooldown ────────────────────
// NOTE: this timestamp is intentionally shared across
// !commands, !sounds, and !clips (all "list" commands).
let lastCmdList = 0;
const LIST_CD   = 30_000;

// ── Permission levels ─────────────────────────────
/*
 * FIX: Object.freeze — PERM_LEVELS is used for ordered index comparisons
 * in canUse().  A mutation (push, sort, splice) from any plugin would
 * silently corrupt every permission check for the rest of the session.
 */
const PERM_LEVELS = Object.freeze(['everyone', 'vip', 'moderator', 'streamer']);

// ── File handles ──────────────────────────────────
let fileHandle = null;
let editingKey = null;

// ── Owned by obs.js ───────────────────────────────
let obsWs    = null;
let obsReady = false;

/*
 * FIX: BroadcastChannel construction guarded by availability check.
 * Constructing unconditionally at parse time throws a ReferenceError
 * if the API is unavailable, which would prevent every subsequent
 * script from loading.  The fallback is a silent no-op object so
 * callers need no guards of their own.
 */
const bc = (typeof BroadcastChannel !== 'undefined')
  ? new BroadcastChannel('twitchbot-obs-v1')
  : {
      postMessage()        {},
      addEventListener()   {},
      removeEventListener(){},
      onmessage: null
    };