/* ════════════════════════════════════════
   CONFIG HELPERS
════════════════════════════════════════ */
function cfg(k, def)  { try { return localStorage.getItem(k) || def; } catch(_) { return def; } }
function cfgSet(k, v) { try { localStorage.setItem(k, v); }             catch(_) {} }
function g(id)        { return document.getElementById(id); }


/* ════════════════════════════════════════
   BROADCAST CHANNEL  (same-origin fallback)
════════════════════════════════════════ */
const bc = new BroadcastChannel('twitchbot-obs-v1');
bc.onmessage = ({ data }) => { markConnected('BC'); dispatch(data); };


/* ════════════════════════════════════════
   OBS WEBSOCKET  (primary relay)
════════════════════════════════════════ */
let obsWs = null, obsReconnectTimer = null;

function obsAutoConnect() {
  if (obsWs && (obsWs.readyState === WebSocket.OPEN ||
                obsWs.readyState === WebSocket.CONNECTING)) return;

  const params   = new URLSearchParams(location.search);
  const host     = params.get('wsHost') || '127.0.0.1';
  const port     = params.get('wsPort') || cfg('twitchbot_obs_port', '4455');
  const password = cfg('twitchbot_obs_password', '');

  const el = g('connStatus');
  if (el) {
    el.textContent = `⬤ Connecting to ${host}:${port}…`;
    el.classList.remove('fade', 'gone');
  }

  try { obsWs = new WebSocket(`ws://${host}:${port}`); }
  catch(e) { scheduleReconnect(); return; }

  obsWs.onmessage = async ({ data }) => {
    let msg; try { msg = JSON.parse(data); } catch(_) { return; }

    if (msg.op === 0) {
      const id = { rpcVersion: 1, eventSubscriptions: 1 };
      if (msg.d.authentication) {
        if (!password) { obsWs.close(); return; }
        id.authentication = await obsCalcAuth(password, msg.d.authentication);
      }
      obsWs.send(JSON.stringify({ op: 1, d: id }));

    } else if (msg.op === 2) {
      markConnected(`OBS WS @ ${host}`);

    } else if (msg.op === 5 && msg.d?.eventType === 'CustomEvent') {
      markConnected(`OBS WS @ ${host}`);
      dispatch(msg.d.eventData);
    }
  };

  obsWs.onclose = () => {
    obsWs     = null;
    connected = false;
    scheduleReconnect();
  };

  obsWs.onerror = () => {
    obsWs = null;
    scheduleReconnect();
  };
}

function scheduleReconnect() {
  if (obsReconnectTimer) return;
  obsReconnectTimer = setTimeout(() => {
    obsReconnectTimer = null;
    obsAutoConnect();
  }, 5000);
}

async function obsCalcAuth(password, { challenge, salt }) {
  const sha = async s => {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return btoa(String.fromCharCode(...new Uint8Array(b)));
  };
  return sha(await sha(password + salt) + challenge);
}

let connected = false;
function markConnected(via) {
  if (connected) return;
  connected = true;
  const el = g('connStatus'); if (!el) return;
  el.textContent = `⬤ Connected (${via})`;
  el.style.color = '#1db954';
  setTimeout(() => {
    el.classList.add('fade');
    setTimeout(() => el.classList.add('gone'), 1300);
  }, 3000);
}


/* ════════════════════════════════════════
   OVERLAY PLUGIN REGISTRY
════════════════════════════════════════ */
window.OverlayPlugin = {
  _registry: new Map(),
  _enabled: new Map(),

  register(id, config) {
    this._registry.set(id, config);
    if (!this._enabled.has(id)) this._enabled.set(id, true);
    if (typeof config.init === 'function') {
      try { config.init(); }
      catch(e) { console.error(`OverlayPlugin "${id}" init error:`, e); }
    }
  },

  isEnabled(id) {
    return this._enabled.get(id) !== false;
  },

  setEnabled(id, enabled) {
    const wasEnabled = this.isEnabled(id);
    this._enabled.set(id, !!enabled);

    if (wasEnabled === !!enabled) return;

    const config = this._registry.get(id);
    if (!config) return;

    try {
      if (!enabled && typeof config.onDisable === 'function') {
        config.onDisable();
      } else if (enabled && typeof config.onEnable === 'function') {
        config.onEnable();
      }
    } catch(e) {
      console.error(`OverlayPlugin "${id}" onDisable/onEnable error:`, e);
    }
  },

  dispatch(msg) {
    for (const [id, config] of this._registry) {
      if (!this.isEnabled(id))                 continue;
      if (!config.handles?.includes(msg.type)) continue;
      try { config.onMessage(msg); }
      catch(e) { console.error(`OverlayPlugin "${id}" onMessage error:`, e); }
    }
  }
};


/* ════════════════════════════════════════
   POSITION EDITOR

   Generic drag-to-position system for any overlay plugin that
   declares a `positioning` block when it registers:

     OverlayPlugin.register('someplugin', {
       ...
       positioning: {
         el:         () => document.getElementById('someElement'),
         storageKey: 'twitchbot_pos_someplugin',
         default:    { xPct: 3, yPct: 3 }
       }
     });

   Position is stored as { xPct, yPct } — the element's top-left
   corner as a percentage of the viewport. Using percentages (rather
   than fixed pixels) means saved positions remain correct regardless
   of the OBS canvas or browser source resolution.

   Only one element can be in active drag-edit mode at a time —
   start() always stops any previous session first.
════════════════════════════════════════ */
(function() {
  const style = document.createElement('style');
  style.textContent = `
    .position-editing {
      outline: 3px dashed #9147ff !important;
      outline-offset: 4px;
    }
  `;
  document.head.appendChild(style);
})();

const PositionEditor = {
  _active:     null,
  _dragOffset: { x: 0, y: 0 },
  _elSize:     { w: 0, h: 0 },

  _posCfg(id) {
    return OverlayPlugin._registry.get(id)?.positioning || null;
  },

  start(id) {
    this.stop();

    const posCfg = this._posCfg(id);
    if (!posCfg) return;

    const el = posCfg.el();
    if (!el) return;

    this._active = { id, el, storageKey: posCfg.storageKey };

    el.style.pointerEvents = 'auto';
    el.style.cursor        = 'move';
    el.classList.add('position-editing');

    el.addEventListener('pointerdown', this._onPointerDown);
  },

  stop() {
    if (!this._active) return;
    const { el } = this._active;

    el.style.pointerEvents = '';
    el.style.cursor        = '';
    el.classList.remove('position-editing');
    el.removeEventListener('pointerdown', this._onPointerDown);
    document.removeEventListener('pointermove', this._onPointerMove);
    document.removeEventListener('pointerup',   this._onPointerUp);

    this._active = null;
  },

  _onPointerDown(e) {
    const active = PositionEditor._active;
    if (!active) return;

    const rect = active.el.getBoundingClientRect();
    PositionEditor._dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    PositionEditor._elSize     = { w: rect.width, h: rect.height };

    active.el.style.transform = 'none';
    active.el.setPointerCapture?.(e.pointerId);

    document.addEventListener('pointermove', PositionEditor._onPointerMove);
    document.addEventListener('pointerup',   PositionEditor._onPointerUp);
  },

  _onPointerMove(e) {
    const active = PositionEditor._active;
    if (!active) return;

    const { x: offX, y: offY } = PositionEditor._dragOffset;
    const { w, h }              = PositionEditor._elSize;

    let left = e.clientX - offX;
    let top  = e.clientY - offY;

    left = Math.max(0, Math.min(left, window.innerWidth  - w));
    top  = Math.max(0, Math.min(top,  window.innerHeight - h));

    active.el.style.left   = `${left}px`;
    active.el.style.top    = `${top}px`;
    active.el.style.right  = 'auto';
    active.el.style.bottom = 'auto';
  },

  _onPointerUp() {
    const active = PositionEditor._active;
    if (!active) return;

    document.removeEventListener('pointermove', PositionEditor._onPointerMove);
    document.removeEventListener('pointerup',   PositionEditor._onPointerUp);

    const rect = active.el.getBoundingClientRect();
    const xPct = (rect.left / window.innerWidth)  * 100;
    const yPct = (rect.top  / window.innerHeight) * 100;

    PositionEditor._savePosition(active.id, xPct, yPct);
  },

  _savePosition(id, xPct, yPct) {
    const posCfg = this._posCfg(id);
    if (!posCfg) return;
    try {
      localStorage.setItem(posCfg.storageKey, JSON.stringify({ xPct, yPct }));
    } catch(_) {}
    this.applyStoredPosition(id);
  },

  getPosition(id) {
    const posCfg = this._posCfg(id);
    if (!posCfg) return null;
    try {
      const raw = localStorage.getItem(posCfg.storageKey);
      if (raw) return JSON.parse(raw);
    } catch(_) {}
    return posCfg.default || { xPct: 3, yPct: 3 };
  },

  applyStoredPosition(id) {
    const posCfg = this._posCfg(id);
    if (!posCfg) return;

    const el = posCfg.el();
    if (!el) return;

    const pos = this.getPosition(id);
    el.style.left      = `${pos.xPct}%`;
    el.style.top       = `${pos.yPct}%`;
    el.style.right     = 'auto';
    el.style.bottom    = 'auto';
    el.style.transform = 'none';
  },

  nudge(id, dxPct, dyPct) {
    const pos = this.getPosition(id);
    if (!pos) return;
    const nx = Math.max(0, Math.min(100, pos.xPct + dxPct));
    const ny = Math.max(0, Math.min(100, pos.yPct + dyPct));
    this._savePosition(id, nx, ny);
  },

  reset(id) {
    const posCfg = this._posCfg(id);
    if (!posCfg) return;
    const def = posCfg.default || { xPct: 3, yPct: 3 };
    this._savePosition(id, def.xPct, def.yPct);
  }
};


/* ════════════════════════════════════════
   DUPLICATE MESSAGE SUPPRESSION
════════════════════════════════════════ */
const _recentDispatches = new Map();
const DEDUPE_WINDOW_MS  = 400;

function _fingerprint(msg) {
  switch (msg.type) {
    case 'plugin-toggle':
      return `plugin-toggle:${msg.id}:${msg.enabled}`;
    case 'position-nudge':
      return `position-nudge:${msg.id}:${msg.dx}:${msg.dy}:${Date.now()}`;
    case 'timer-state':
    case 'deathcount-update':
    case 'chatoverlay-settings':
      return `${msg.type}:${JSON.stringify(msg.state || msg.settings || '')}`;
    case 'chatoverlay-message':
      return `${msg.type}:${msg.name}:${msg.text}:${msg.isBot}`;
    case 'intro-play':
      return `intro-play:${msg.nick}`;
    case 'sound-play':
      return `sound-play:${msg.name}`;
    case 'video-show':
      return `video-show:${msg.name}`;
    default:
      return msg.type;
  }
}

function _isDuplicateDispatch(msg) {
  const fp  = _fingerprint(msg);
  const now = Date.now();

  const last = _recentDispatches.get(fp);
  _recentDispatches.set(fp, now);

  if (_recentDispatches.size > 200) {
    for (const [key, ts] of _recentDispatches) {
      if (now - ts > DEDUPE_WINDOW_MS) _recentDispatches.delete(key);
    }
  }

  return !!last && (now - last) < DEDUPE_WINDOW_MS;
}


/* ════════════════════════════════════════
   CORE DISPATCHER
════════════════════════════════════════ */
function dispatch(msg) {
  if (_isDuplicateDispatch(msg)) return;

  switch (msg.type) {
    case 'alert-show':  showAlert(msg.content); break;
    case 'alert-hide':  hideAlert();            break;
    case 'video-show':  showClip(msg);          break;
    case 'video-hide':  hideClip();             break;
    case 'sound-play':  handleSoundPlay(msg);   break;
    case 'iframe-show': showIframe(msg);        break;
    case 'iframe-hide': hideIframe();           break;
    case 'plugin-toggle':
      OverlayPlugin.setEnabled(msg.id, msg.enabled);
      break;
    case 'position-edit-start':
      PositionEditor.start(msg.id);
      break;
    case 'position-edit-stop':
      PositionEditor.stop();
      break;
    case 'position-nudge':
      PositionEditor.nudge(msg.id, msg.dx, msg.dy);
      break;
    case 'position-reset':
      PositionEditor.reset(msg.id);
      break;
    case 'ping':
      bc.postMessage({ type: 'pong' });
      break;
    case 'pong':
      break;
  }

  OverlayPlugin.dispatch(msg);
}


/* ════════════════════════════════════════
   VIDEO CLIPS
════════════════════════════════════════ */
let _clipHideTimer = null;

function showClip(msg) {
  clearTimeout(_clipHideTimer); _clipHideTimer = null;

  const wrap = g('clipWrap'), vid = g('clipVideo'), src = g('clipVideoSrc');
  if (!wrap || !vid || !src) return;

  src.src  = 'videos/' + encodeURIComponent(msg.name);
  src.type = videoMime(msg.name);
  vid.loop = !!msg.loop;

  vid.onerror = () => console.warn(`Clip video failed to load: ${src.src}`);

  vid.load();
  wrap.hidden = false;

  vid.play().catch(e => console.warn('Clip video autoplay blocked:', e));

  vid.onended = () => { if (!msg.loop) wrap.hidden = true; };

  if (msg.duration > 0) {
    _clipHideTimer = setTimeout(() => {
      wrap.hidden = true;
      vid.pause();
      _clipHideTimer = null;
    }, msg.duration * 1000);
  }
}

function hideClip() {
  clearTimeout(_clipHideTimer); _clipHideTimer = null;
  const wrap = g('clipWrap'), vid = g('clipVideo');
  if (vid)  vid.pause();
  if (wrap) wrap.hidden = true;
}

function videoMime(name) {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
  return {
    '.mp4' : 'video/mp4',
    '.webm': 'video/webm',
    '.mov' : 'video/quicktime',
    '.mkv' : 'video/x-matroska'
  }[ext] || 'video/mp4';
}


/* ════════════════════════════════════════
   TWITCH CLIP IFRAME EMBED
════════════════════════════════════════ */
let _iframeHideTimer = null;

function showIframe(msg) {
  clearTimeout(_iframeHideTimer); _iframeHideTimer = null;

  const wrap   = g('iframeWrap');
  const iframe = g('clipIframe');
  if (!wrap || !iframe) return;

  iframe.src  = msg.src || 'about:blank';
  wrap.hidden = false;

  if (msg.duration > 0) {
    _iframeHideTimer = setTimeout(hideIframe, msg.duration * 1000);
  }
}

function hideIframe() {
  clearTimeout(_iframeHideTimer); _iframeHideTimer = null;
  const wrap   = g('iframeWrap');
  const iframe = g('clipIframe');
  if (iframe) iframe.src = 'about:blank';
  if (wrap)   wrap.hidden = true;
}


/* ════════════════════════════════════════
   ALERTS / IMAGES / GIFS
════════════════════════════════════════ */
let _alertHideTimer = null;

function showAlert(c) {
  clearTimeout(_alertHideTimer); _alertHideTimer = null;

  const img  = g('alertImg');
  const vid  = g('alertVideo');
  const txt  = g('alertText');
  const wrap = g('alertWrap');

  if (img)  img.hidden  = true;
  if (vid)  { vid.pause(); vid.hidden = true; }
  if (txt)  txt.hidden  = true;
  if (wrap) wrap.hidden = true;

  if ((c.type === 'image' || c.type === 'gif') && c.url) {
    if (img) {
      img.src    = c.url;
      img.alt    = c.text || 'Stream alert';
      img.hidden = false;
    }
  } else if (c.type === 'video' && c.url) {
    const src = g('alertVideoSrc');
    if (vid && src) {
      src.src  = c.url;
      src.type = c.mime || videoMime(c.url) || 'video/mp4';
      vid.onerror = () => console.warn(`Alert video failed to load: ${src.src}`);
      vid.load();
      vid.hidden = false;
      vid.play().catch(e => console.warn('Alert video autoplay blocked:', e));
    }
  }

  if (c.text && txt) { txt.textContent = c.text; txt.hidden = false; }
  if (wrap) wrap.hidden = false;

  if (c.duration > 0) {
    _alertHideTimer = setTimeout(hideAlert, c.duration * 1000);
  }
}

function hideAlert() {
  clearTimeout(_alertHideTimer); _alertHideTimer = null;
  const img  = g('alertImg');
  const vid  = g('alertVideo');
  const txt  = g('alertText');
  const wrap = g('alertWrap');
  if (img)  img.hidden  = true;
  if (vid)  { vid.pause(); vid.hidden = true; }
  if (txt)  txt.hidden  = true;
  if (wrap) wrap.hidden = true;
}


/* ════════════════════════════════════════
   SOUNDS
════════════════════════════════════════ */
let audioCtx = null;

const decoded           = new Map();
const DECODED_CACHE_MAX = 40;

function getCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

async function handleSoundPlay(msg) {
  if (msg.arrayBuffer) {
    await playSoundBuffer(msg.name, msg.arrayBuffer);
  } else {
    await playLocalSound(msg.name);
  }
}

async function playLocalSound(name) {
  try {
    const resp = await fetch('sounds/' + encodeURIComponent(name));
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    await playSoundBuffer(name, await resp.arrayBuffer());
  } catch(e) {
    console.warn('playLocalSound failed:', e);
    const el = new Audio('sounds/' + encodeURIComponent(name));
    try { await el.play(); } catch(_) {}
  }
}

async function playSoundBuffer(name, buf) {
  try {
    const ctx = getCtx();

    if (!decoded.has(name)) {
      const p = ctx.decodeAudioData(buf.slice(0));
      decoded.set(name, p);

      if (decoded.size > DECODED_CACHE_MAX) {
        decoded.delete(decoded.keys().next().value);
      }

      p.catch(() => decoded.delete(name));
    }

    const buffer = await decoded.get(name);

    const volRaw = parseFloat(
      localStorage.getItem('twitchbot_sounds_volume') || '100'
    );
    const vol = Math.max(0, Math.min(1, volRaw / 100));

    const gain      = ctx.createGain();
    gain.gain.value = vol;
    gain.connect(ctx.destination);

    const source  = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    source.start(0);

  } catch(e) {
    console.warn('playSoundBuffer error:', e);
  }
}


/* ════════════════════════════════════════
   OVERLAY PLUGIN LOADER
════════════════════════════════════════ */
async function loadOverlayPlugins() {
  const list = window.ENABLED_PLUGINS;
  if (!Array.isArray(list) || list.length === 0) return;

  for (const name of list) {
    let enabled = true;
    try {
      const raw = localStorage.getItem('twitchbot_plugin_enabled_' + name);
      enabled = raw === null ? true : raw === 'true';
    } catch(_) {}

    if (!enabled) continue;

    await new Promise(resolve => {
      const s   = document.createElement('script');
      s.src     = `plugins/${name}/${name}.overlay.js`;
      s.onload  = resolve;
      s.onerror = resolve;
      document.head.appendChild(s);
    });
  }
}


/* ════════════════════════════════════════
   INIT
════════════════════════════════════════ */
(async function init() {

  await loadOverlayPlugins();

  obsAutoConnect();

  ['click', 'keydown', 'touchstart'].forEach(ev =>
    document.addEventListener(ev, () => getCtx(), { once: true, passive: true })
  );

}());