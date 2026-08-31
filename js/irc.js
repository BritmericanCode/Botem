/* ════════════════════════════════════════
   TWITCH IRC CONNECTION + AUTO-RECONNECT
════════════════════════════════════════ */

/*
 * Runtime dependencies (defined in later-loaded files):
 *   addChat, setUI, setPanelIncomplete,
 *   setPanelComplete, logSys  → ui.js
 * All called only from WebSocket/timer callbacks that fire
 * after all scripts have loaded.
 */

/*
 * Outgoing message queue constants.
 *
 * Twitch rate limits (PRIVMSG only):
 *   Regular bots:   20 messages / 30 s
 *   Moderator bots: 100 messages / 30 s
 *
 * FIX: original was 1200 ms → 25 / 30 s — 25% over the non-mod limit.
 * 1700 ms → ≈ 17.6 / 30 s — safely under both limits with headroom
 * for Twitch's internal burst detection.
 */
const MSG_INTERVAL_MS = 1700;  // ≈ 17.6 / 30 s — under the 20 / 30 s non-mod limit
const MSG_QUEUE_MAX   = 100;   // hard cap — oldest entry dropped if exceeded
const MAX_MSG_LEN     = 500;   // Twitch silently drops messages longer than this

function toggleConnect() { ircWs ? doDisconnect() : doConnect(); }

function doConnect() {
  /*
   * FIX: optional chaining + empty-string fallback on all three inputs.
   * Previously these threw TypeError if any element was absent from the
   * DOM, crashing the entire connect flow with no user-visible error.
   */
  const user  = (g('inUser')?.value  || '').trim().toLowerCase();
  let   oauth = (g('inOauth')?.value || '').trim();
  const chan  = (g('inChan')?.value  || '').trim().toLowerCase().replace(/^#/, '');

  if (!user || !oauth || !chan) {
    logSys('Fill in username, token, and channel.', true); return;
  }
  if (!oauth.startsWith('oauth:')) oauth = 'oauth:' + oauth;

  savedOauth       = oauth;
  manualDisconnect = false;
  reconnectCount   = 0;
  botName  = user;
  channel  = chan;

  setUI('connecting');
  logSys(`Connecting to #${chan} as ${user}…`);
  connectSocket(user, oauth, chan);
}

function connectSocket(user, oauth, chan) {
  ircWs = new WebSocket('wss://irc-ws.chat.twitch.tv:443');

  ircWs.onopen = () => {
    ircWs.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
    ircWs.send(`PASS ${oauth}`);
    ircWs.send(`NICK ${user}`);
    ircWs.send(`JOIN #${chan}`);
  };

  ircWs.onmessage = ({ data }) => data.split('\r\n').filter(Boolean).forEach(parseLine);
  ircWs.onerror   = () => logSys('WebSocket error.', true);

  ircWs.onclose = () => {
    ircWs = null;
    setUI('off');
    setPanelIncomplete('connection');
    _msgQueueFlush();   // discard queued messages — they belong to the old session

    if (!manualDisconnect && savedOauth && reconnectCount < MAX_RECONNECT) {
      const delay = Math.min(3000 * Math.pow(2, reconnectCount), 30000);
      logSys(
        `Disconnected — reconnecting in ${Math.round(delay / 1000)}s… ` +
        `(${reconnectCount + 1}/${MAX_RECONNECT})`
      );
      reconnectTimer = setTimeout(() => {
        reconnectCount++;
        setUI('connecting');
        connectSocket(botName, savedOauth, channel);
      }, delay);
    } else if (!manualDisconnect && savedOauth) {
      /*
       * FIX: notify the streamer when all retry attempts are exhausted.
       * Previously the bot simply stopped — the streamer had no indication
       * it was offline unless they noticed the status badge change.
       */
      logSys(
        `✘ Could not reconnect after ${MAX_RECONNECT} attempts — ` +
        `check your connection and click Connect.`, true
      );
      setPanelIncomplete('connection', true);
    }
  };
}

function doDisconnect(quiet = false) {
  manualDisconnect = true; savedOauth = '';
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  _msgQueueFlush();   // discard pending messages before closing
  if (ircWs) { ircWs.onclose = null; ircWs.close(); ircWs = null; }
  setUI('off');
  setPanelIncomplete('connection');
  if (!quiet) logSys('Disconnected.');
}


/* ════════════════════════════════════════
   OUTGOING MESSAGE QUEUE

   Twitch allows ~20 messages per 30 s for
   regular bots (100/30 s with mod status).

   We drain at 1 message per MSG_INTERVAL_MS
   giving ≈17.6/30 s — safely under both
   limits with headroom for Twitch's internal
   burst detection.

   Messages are { chan, text } objects.
   The queue is flushed on socket close so
   stale messages never leak into a new
   connection.
════════════════════════════════════════ */

const _msgQueue = [];     // pending { chan, text } objects
let   _msgTimer = null;   // drain interval handle

function _msgQueueStart() {
  if (_msgTimer) return;
  _msgTimer = setInterval(_msgQueueDrain, MSG_INTERVAL_MS);
}

function _msgQueueDrain() {
  if (!ircWs || ircWs.readyState !== WebSocket.OPEN) return;
  const item = _msgQueue.shift();
  if (!item) {
    /* Queue empty — pause the interval to save resources */
    clearInterval(_msgTimer); _msgTimer = null;
    return;
  }
  /*
   * FIX: belt-and-suspenders newline sanitisation at drain time.
   * send() already strips newlines — this catches anything that bypassed
   * it (e.g. direct _msgQueue.push calls from plugin code).
   */
  const safeText = item.text.replace(/[\r\n]/g, ' ');
  ircWs.send(`PRIVMSG ${item.chan} :${safeText}`);
  addChat(botName, safeText, true);
}

function _msgQueueFlush() {
  _msgQueue.length = 0;
  if (_msgTimer) { clearInterval(_msgTimer); _msgTimer = null; }
}


/* ── Helpers ── */

function getReadyMessage() {
  const saved = localStorage.getItem('twitchbot_ready_msg');
  return saved === null ? '🤖 Bot is ready!' : saved;
}

function getExitMessage() {
  const saved = localStorage.getItem('twitchbot_exit_msg');
  return saved === null ? '🤖 Bot is going offline…' : saved;
}


// ── IRC parser ────────────────────────────────────

function parseLine(raw) {
  /*
   * FIX 1: use sendRaw() — the designated path for protocol-level sends,
   *         consistent with PASS / NICK / JOIN in onopen.
   * FIX 2: echo the server's own PING argument rather than hardcoding
   *         ':tmi.twitch.tv'.  RFC 1459 requires PONG to mirror PING's
   *         argument.  Currently identical in output but forwards-compatible
   *         if Twitch changes their PING format.
   *         raw = 'PING :tmi.twitch.tv'
   *         raw.slice(4) = ' :tmi.twitch.tv'
   *         sendRaw result: 'PONG :tmi.twitch.tv'  ✓
   */
  if (raw.startsWith('PING')) { sendRaw('PONG' + raw.slice(4)); return; }

  let line = raw; const tags = {};

  if (line.startsWith('@')) {
    const sp = line.indexOf(' ');
    line.slice(1, sp).split(';').forEach(pair => {
      const eq = pair.indexOf('=');
      tags[eq < 0 ? pair : pair.slice(0, eq)] = eq < 0 ? true : pair.slice(eq + 1);
    });
    line = line.slice(sp + 1);
  }

  let prefix = '';
  if (line.startsWith(':')) {
    const sp = line.indexOf(' '); prefix = line.slice(1, sp); line = line.slice(sp + 1);
  }

  const parts = line.split(' ');
  switch(parts[0]) {

    case '001':
      reconnectCount = 0;
      setUI('on');
      logSys(`✔ Connected to #${channel}`);
      {
        const msg = getReadyMessage();
        if (msg) setTimeout(() => send(`#${channel}`, msg), 500);
      }
      setPanelComplete('connection');
      {
        const p = g('panel-connection');
        if (p) p.classList.add('collapsed');
      }
      break;

    case 'NOTICE': {
      const txt = parts.slice(2).join(' ').replace(/^:/, '');
      if (txt.includes('Login authentication failed') ||
          txt.includes('Improperly formatted')) {
        logSys(`Auth error: ${txt}`, true);
        /*
         * FIX: removed redundant savedOauth = '' and setPanelIncomplete —
         * doDisconnect(true) already handles both of these internally.
         */
        doDisconnect(true);
      }
      break;
    }

    case 'PRIVMSG': {
      const chan  = parts[1];
      const text  = parts.slice(2).join(' ').slice(1);
      const nick  = prefix.split('!')[0].toLowerCase();
      const dname = tags['display-name'] || prefix.split('!')[0];
      /*
       * FIX: guard bot's own echoed messages from entering the command
       * handler.  Twitch echoes every PRIVMSG back to the sender — without
       * this guard, any response that begins with '!' would re-trigger the
       * command system, potentially creating a self-sustaining loop.
       */
      if (nick !== botName) {
        addChat(dname, text, false);

        /*
         * "first-msg" is Twitch's own IRC tag marking the very first
         * message a user has ever sent in THIS channel (same signal
         * that drives the "First time chatting" highlight in Twitch's
         * own chat UI). Only present because CAP REQ twitch.tv/tags
         * was requested in onopen.
         */
        if (tags['first-msg'] === '1') {
          BotPlugin.dispatchFirstChat(dname, nick, tags);
        }

        /*
         * handleCommand is async.  Its internal try/catch handles most
         * errors; this .catch() ensures nothing escapes as an uncaught
         * Promise rejection in edge cases.
         */
        handleCommand(dname, nick, text, chan, tags).catch(e =>
          console.error('handleCommand unhandled rejection:', e)
        );
      }
      break;
    }
  }
}


// ── Sending ───────────────────────────────────────

/**
 * Queue a message for rate-limited delivery.
 *
 * When the queue is at capacity the OLDEST message is dropped — recent
 * requests are always honoured and an old backlog never blocks new activity.
 */
function send(chan, text) {
  if (!ircWs || ircWs.readyState !== WebSocket.OPEN) return;

  /*
   * FIX: strip embedded newlines before queuing.
   * \r\n in message text terminates the PRIVMSG and starts a new raw IRC
   * line — anyone who controls the message text could inject arbitrary IRC
   * commands (JOIN, PART, MODE, etc.).
   */
  text = String(text).replace(/[\r\n]/g, ' ');

  /*
   * FIX: enforce Twitch's 500-character hard limit.
   * Messages over 500 characters are silently dropped by Twitch — long
   * responses, shoutout text, and paginated command lists would vanish
   * with no indication of why.
   */
  if (text.length > MAX_MSG_LEN) {
    logSys(`⚠ Message truncated to ${MAX_MSG_LEN} chars.`, true);
    text = text.slice(0, MAX_MSG_LEN);
  }

  /* Enforce hard cap — drop oldest if full */
  if (_msgQueue.length >= MSG_QUEUE_MAX) {
    _msgQueue.shift();
    logSys('⚠ Message queue full — oldest message dropped.', true);
  }

  _msgQueue.push({ chan, text });
  _msgQueueStart();
}

/**
 * Send a raw IRC line immediately, bypassing the queue.
 * Use ONLY for protocol-level messages (PASS, NICK, JOIN, PONG)
 * that must not be delayed by the rate limiter.
 */
function sendRaw(text) {
  if (!ircWs || ircWs.readyState !== WebSocket.OPEN) return;
  ircWs.send(text);
}

function sendChat() {
  const inp  = g('chatIn');
  const text = (inp?.value || '').trim();
  if (!text) return;
  /*
   * NOTE: this guard is intentionally here in addition to the check
   * inside send().  send() returns silently — this guard provides a
   * visible "Not connected" message to the user.
   */
  if (!ircWs || ircWs.readyState !== WebSocket.OPEN) {
    logSys('Not connected.', true); return;
  }
  send(`#${channel}`, text);
  if (inp) inp.value = '';
}


// ── Permission & cooldown helpers ─────────────────

function getUserLevel(tags) {
  /*
   * FIX: parse badges into a Set rather than using .includes() substring
   * matching on the raw tag string.
   *
   * The badges tag format is: 'broadcaster/1,subscriber/3072'
   * .includes('vip') would match any badge name containing 'vip' as a
   * substring — a future badge like 'sub-vip' would incorrectly elevate
   * that user's permission level to VIP.
   */
  const badges = new Set(
    (tags['badges'] || '').split(',').map(b => b.split('/')[0]).filter(Boolean)
  );
  if (badges.has('broadcaster'))                      return 'streamer';
  if (tags['mod'] === '1' || badges.has('moderator')) return 'moderator';
  if (badges.has('vip'))                              return 'vip';
  return 'everyone';
}

function canUse(ul, req) {
  return PERM_LEVELS.indexOf(ul) >= PERM_LEVELS.indexOf(req || 'everyone');
}

function isOnCooldown(key, nick) {
  const cmd = commands[key]; if (!cmd || !cmd.cooldown) return false;
  const ts  = cooldowns[key]?.[nick];
  return !!ts && (Date.now() - ts) < cmd.cooldown * 1000;
}

function stampCooldown(key, nick) {
  /* FIX: Object.create(null) — no prototype chain on per-user buckets */
  if (!cooldowns[key]) cooldowns[key] = Object.create(null);
  cooldowns[key][nick] = Date.now();
}