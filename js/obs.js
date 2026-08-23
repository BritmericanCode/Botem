/* ════════════════════════════════════════
   OBS WEBSOCKET + LAN IP + OVERLAY URL
════════════════════════════════════════ */

/*
 * Runtime dependencies on later-loaded files:
 *   setPanelIncomplete, setPanelComplete, logSys → ui.js
 *   saveField → persistence.js
 * All are called only from user-triggered or event-driven paths,
 * never at parse time, so they will always be defined when needed.
 */

/*
 * FIX: generation counter prevents a stale onclose/onerror handler
 * from nulling a newly created obsWs when the user clicks Connect
 * again before the previous socket has fully closed.
 *
 * Timeline without this fix:
 *   1. First connect fails  → onerror fires
 *   2. User clicks Connect  → obsWs = new WebSocket(...)  (generation 2)
 *   3. Old socket's onclose → obsWs = null  ← kills the new connection
 */
let _obsGeneration = 0;

async function obsConnect() {
  const port     = (g('obsPort')?.value     || '4455').trim();
  const password = (g('obsPassword')?.value || '').trim();

  /*
   * NOTE: port and password are stored in localStorage in plaintext.
   * For a local-only bot tool this is acceptable, but these values
   * should never be transmitted outside the local network.
   */
  try { localStorage.setItem('twitchbot_obs_port',     port);     } catch(_) {}
  try { localStorage.setItem('twitchbot_obs_password', password); } catch(_) {}

  if (obsWs) { try { obsWs.close(); } catch(_) {} obsWs = null; }
  obsReady = false;
  setObsStatus('connecting', 'Connecting…');

  /* Capture generation for this specific connection attempt */
  const gen = ++_obsGeneration;

  try { obsWs = new WebSocket(`ws://127.0.0.1:${port}`); }
  catch(e) { setObsStatus('error', '✘ Could not open socket.'); return; }

  obsWs.onmessage = async ({ data }) => {
    let msg; try { msg = JSON.parse(data); } catch(_) { return; }

    if (msg.op === 0) {
      const id = { rpcVersion: 1, eventSubscriptions: 0 };
      if (msg.d.authentication) {
        if (!password) {
          setObsStatus('error', '✘ Password required — enter it and reconnect.');
          setPanelIncomplete('obs', true);
          obsWs.close(); return;
        }
        id.authentication = await obsCalcAuth(password, msg.d.authentication);
      }
      obsWs.send(JSON.stringify({ op: 1, d: id }));

    } else if (msg.op === 2) {
      obsReady = true;
      setObsStatus('ok', '✔ Connected — overlay will now receive updates');

      /* Push current timer state to the freshly connected overlay */
      if (window.TimerPlugin) TimerPlugin._sync();

      setPanelComplete('obs');
      const p = g('panel-obs');
      if (p) p.classList.add('collapsed');
    }
  };

  obsWs.onclose = () => {
    /* FIX: stale handler check — ignore if a newer connection has started */
    if (gen !== _obsGeneration) return;
    if (obsReady) setObsStatus('', 'Disconnected from OBS WebSocket');
    obsReady = false; obsWs = null;
    setPanelIncomplete('obs');
  };

  /*
   * FIX: onerror now explicitly resets state and uses the generation guard.
   * The original relied on onclose always firing after onerror — this is
   * Chromium behaviour, not guaranteed by spec.  Being explicit here
   * prevents the bot getting permanently stuck if onclose does not fire.
   */
  obsWs.onerror = () => {
    if (gen !== _obsGeneration) return;
    setObsStatus('error', '✘ Cannot connect — is OBS running with obs-websocket enabled?');
    obsReady = false; obsWs = null;
    setPanelIncomplete('obs');
  };
}

/* NOTE: identical copy exists in overlay.js — keep both in sync. */
async function obsCalcAuth(password, { challenge, salt }) {
  const sha = async s => {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return btoa(String.fromCharCode(...new Uint8Array(b)));
  };
  return sha(await sha(password + salt) + challenge);
}

function obsEvent(data) {
  if (!obsReady || !obsWs || obsWs.readyState !== WebSocket.OPEN) return;
  obsWs.send(JSON.stringify({
    op: 6,
    d: {
      requestType: 'BroadcastCustomEvent',
      /*
       * FIX: crypto.randomUUID() replaces Math.random().toString(36).
       * Math.random() can produce the same value on consecutive calls —
       * randomUUID() is unambiguously unique per session.
       */
      requestId:   crypto.randomUUID(),
      requestData: { eventData: data }
    }
  }));
}

function sendToOverlay(data) {
  try { bc.postMessage(data); } catch(_) {}
  obsEvent(data);
}

function setObsStatus(state, text) {
  const el = g('obsWsStatus'); if (!el) return;
  el.textContent = text;
  el.style.color = state === 'ok'         ? '#1db954'
                 : state === 'error'      ? '#e05555'
                 : state === 'connecting' ? '#9147ff'
                 : '#737380';
}


// ── LAN IP detection ──────────────────────────────

async function detectLanIP() {
  return new Promise(resolve => {
    let pc;
    /*
     * FIX: 'done' guard prevents resolve() being called multiple times.
     * Previously: the null-candidate event could fire after pc.close()
     * in some Chromium versions, and the setTimeout / createOffer .catch()
     * could race with the candidate handler — resolve was called 2–3 times
     * per invocation (silently harmless but semantically wrong).
     */
    let done = false;
    const finish = val => {
      if (done) return;
      done = true;
      try { pc?.close(); } catch(_) {}
      resolve(val);
    };

    try {
      pc = new RTCPeerConnection({ iceServers: [] });
      pc.createDataChannel('x');
      pc.onicecandidate = ({ candidate: c }) => {
        if (!c) { finish(''); return; }
        /*
         * IPv4 only — IPv6 link-local candidates are intentionally skipped.
         * On IPv6-primary machines detection will time out and return ''.
         * The user can enter their IP manually in that case.
         */
        const m = c.candidate.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
        if (m) {
          const ip = m[1];
          if (!ip.startsWith('127.') && !ip.startsWith('169.254.')) finish(ip);
        }
      };
      pc.createOffer()
        .then(o => pc.setLocalDescription(o))
        .catch(() => finish(''));
      setTimeout(() => finish(''), 3000);
    } catch(_) {
      /*
       * FIX: if createDataChannel or createOffer throws, finish() ensures
       * pc is closed before resolving — the original left pc open and leaked
       * the RTCPeerConnection.
       */
      finish('');
    }
  });
}

/*
 * FIX: event is now passed explicitly from bot.html:
 *   onclick="detectAndFillIP(event)"
 * The original used implicit window.event which is deprecated and
 * not guaranteed in future OBS CEF versions.
 * If called without an argument (e.g. from code) the button state
 * is simply not managed — the detection still runs correctly.
 */
async function detectAndFillIP(e) {
  const btn = e?.currentTarget;
  if (btn) { btn.textContent = '…'; btn.disabled = true; }

  const ip = await detectLanIP();

  if (btn) { btn.textContent = 'Auto-detect'; btn.disabled = false; }

  /* FIX: null check before dereferencing — original threw TypeError if missing */
  const el = g('obsLanIP');
  if (ip && el) {
    el.value = ip;
    saveField('twitchbot_lan_ip', ip);
    updateOverlayUrl();
    logSys(`LAN IP detected: ${ip}`);
  } else if (!ip) {
    logSys('Could not auto-detect — enter IP manually.', true);
  }
}

function updateOverlayUrl() {
  const ip   = (g('obsLanIP')?.value || '').trim();
  const port = (g('obsPort')?.value  || '4455').trim();
  /*
   * FIX: new URL() replaces the regex approach.
   * new URL('overlay.html', location.href) correctly resolves the sibling
   * path regardless of query strings, hashes, or trailing slashes in
   * location.href — no regex edge cases to worry about.
   */
  const base = new URL('overlay.html', location.href).href;
  const url  = ip
    ? `${base}?wsHost=${encodeURIComponent(ip)}&wsPort=${encodeURIComponent(port)}`
    : '';
  const field = g('overlayUrlField');
  if (field) field.value = url || '← enter your LAN IP above first';
}

function copyOverlayUrl() {
  const url = g('overlayUrlField')?.value || '';
  if (!url || url.startsWith('←')) { logSys('Enter your LAN IP above first.', true); return; }
  navigator.clipboard.writeText(url)
    .then(() => logSys('Overlay URL copied ✔ — paste into OBS browser source.'))
    .catch(() => logSys('Copy failed — select the field and press Ctrl+C.', true));
}

function copyBotPath() {
  navigator.clipboard.writeText(location.href)
    .then(() => logSys('Path copied ✔ — paste into OBS Custom Browser Dock URL.'))
    .catch(() => {
      const inp = g('botPathInput');
      if (inp) { inp.select(); inp.setSelectionRange(0, 9999); }
    });
}