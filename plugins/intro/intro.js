/* ════════════════════════════════════════
   INTRO BOT PLUGIN  v1.4

   Viewers earn a personal intro sound via
   Channel Points. It plays automatically
   when they first chat each stream.

   Audio files are saved to:
     plugins/intro/intros/<username>.<ext>

   The overlay loads them from that path
   via fetch() — no folder picker needed.

   Setup:
   1. Create a Channel Points reward on
      Twitch with "Require viewer to enter
      text" enabled
   2. Click Auto-detect then have someone
      redeem the reward
   3. Viewers paste a direct audio URL or
      Vocaroo link when redeeming

   Supported URLs:
     Direct audio files (.mp3 .wav .ogg …)
     Vocaroo  (vocaroo.com/XXXXXXXX or
               voca.ro/XXXXXXXX short links)
     CORS proxy fallback for blocked sites
════════════════════════════════════════ */

BotPlugin.define({

  id:      'intro',
  name:    'Intro Bot',
  version: '1.4',

  sidebarHtml() {
    return `
      <div class="panel" id="panel-intro">
        <div class="panel-title" onclick="togglePanel('intro')">
          Intro Bot <span class="chevron">▾</span>
        </div>
        <div class="panel-body">

          <!-- Folder info -->
          <div class="notice">
            Intro files are saved to:<br>
            <code>plugins/intro/intros/</code><br>
            Create this folder if it does not exist.
          </div>

          <!-- Channel points reward -->
          <div class="divider">channel points reward</div>

          <div class="field">
            <label>
              Reward ID
              <button class="btn-xs" id="ibDetectBtn"
                      onclick="IntroBotPlugin.startDetect()">
                Auto-detect
              </button>
            </label>
            <input id="ibRewardId" type="text"
                   placeholder="fills automatically on first redemption"
                   autocomplete="off" spellcheck="false"
                   oninput="IntroBotPlugin.saveRewardId(this.value)">
          </div>

          <div id="ibDetectStatus"
               style="font-size:0.72rem; color:#737380; min-height:1.2em">
          </div>

          <!-- Settings -->
          <div class="divider">settings</div>

          <div class="field"
               style="display:flex; flex-direction:column; gap:6px">

            <label style="display:flex; align-items:center;
                          gap:8px; cursor:pointer">
              <input id="ibEnabled" type="checkbox" checked
                     style="width:auto; accent-color:#9147ff"
                     onchange="IntroBotPlugin.saveSetting('enabled', this.checked)">
              <span style="font-size:0.78rem; color:#adadb8">
                Enabled (play intros on first message)
              </span>
            </label>

            <label style="display:flex; align-items:center;
                          gap:8px; cursor:pointer">
              <input id="ibConfirmChat" type="checkbox" checked
                     style="width:auto; accent-color:#9147ff"
                     onchange="IntroBotPlugin.saveSetting('confirmChat', this.checked)">
              <span style="font-size:0.78rem; color:#adadb8">
                Confirm in chat when intro saved
              </span>
            </label>

            <label style="display:flex; align-items:center;
                          gap:8px; cursor:pointer">
              <input id="ibSkipCommands" type="checkbox"
                     style="width:auto; accent-color:#9147ff"
                     onchange="IntroBotPlugin.saveSetting('skipCommands', this.checked)">
              <span style="font-size:0.78rem; color:#adadb8">
                Don't trigger intro on <code>!</code> commands
              </span>
            </label>

          </div>

          <!-- Session -->
          <div class="btn-row" style="margin-top:8px">
            <button class="btn-muted"
                    onclick="IntroBotPlugin.resetSession()">
              ↺ Reset Session
            </button>
          </div>

          <div id="ibSessionStatus"
               style="font-size:0.7rem; color:#4a4a60;
                      margin-top:4px; min-height:1em">
          </div>

          <!-- Saved intros -->
          <div class="divider">saved intros</div>

          <div id="ibIntroList"
               style="display:flex; flex-direction:column; gap:4px;
                      max-height:240px; overflow-y:auto">
            <p class="cmd-empty">No intros saved yet.</p>
          </div>

          <!-- Manual add -->
          <div class="divider">manual add / replace</div>

          <p class="help" style="margin-bottom:8px">
            Best sources:
            <strong style="color:#9a9ab0">vocaroo.com</strong> ·
            Discord CDN · Dropbox direct links<br>
            <span style="color:#4a4a60">
              Sites like myinstants.com are blocked by browser security.
            </span>
          </p>

          <div class="field">
            <label>Username</label>
            <input id="ibManualUser" type="text"
                   placeholder="theviewer"
                   autocomplete="off" spellcheck="false">
          </div>

          <div class="field">
            <label>Audio URL</label>
            <input id="ibManualUrl" type="text"
                   placeholder="https://… or vocaroo.com/…"
                   autocomplete="off" spellcheck="false">
          </div>

          <button class="btn-full btn-purple"
                  onclick="IntroBotPlugin.manualAdd()">
            📥 Download &amp; Save
          </button>

          <div id="ibManualStatus"
               style="font-size:0.72rem; color:#737380;
                      margin-top:6px; min-height:1em">
          </div>

        </div>
      </div>`;
  },


  /* ════════════════════════════════════════
     INIT
  ════════════════════════════════════════ */
  init() {
    window.IntroBotPlugin = IntroBotPlugin;
    IntroBotPlugin._load();
  },

  onMessage({ dname, nick, text, chan, tags }) {
    IntroBotPlugin._onMessage(dname, nick, text, chan, tags);
  },

  chatCommands: {}

});


/* ════════════════════════════════════════
   INTRO BOT HELPER OBJECT
════════════════════════════════════════ */
const IntroBotPlugin = {

  INTROS_PATH: 'plugins/intro/intros/',

  /* ── State ── */
  _intros:            {},
  _playedThisSession: new Set(),
  _detectingRewardId: false,
  _detectTimeout:     null,

  _settings: {
    rewardId:     '',
    enabled:      true,
    confirmChat:  true,
    skipCommands: false
  },

  _AUDIO_EXTS: new Set([
    '.mp3','.wav','.ogg','.flac','.m4a','.aac','.opus'
  ]),

  /*
   * Content-types that are DEFINITELY not audio — used to reject a
   * response immediately, before any byte-sniffing. This catches the
   * common failure case where a fetch (direct or via a CORS proxy)
   * returns an HTML error/interstitial/CAPTCHA page instead of the
   * actual file, which would otherwise slip through if nothing checks
   * the header before falling back to guessing.
   */
  _NON_AUDIO_TYPES: new Set([
    'text/html', 'text/plain', 'application/json', 'application/xml',
    'text/xml'
  ]),

  /*
   * FIX (#4): block requests to loopback/private/link-local addresses.
   */
  _isBlockedHost(hostname) {
    const h = hostname.toLowerCase();

    if (h === 'localhost' || h.endsWith('.localhost')) return true;
    if (h === '::1' || h === '[::1]')                   return true;

    const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (m) {
      const [a, b] = [parseInt(m[1], 10), parseInt(m[2], 10)];
      if (a === 127)                       return true;  // loopback
      if (a === 10)                        return true;  // private
      if (a === 172 && b >= 16 && b <= 31) return true;  // private
      if (a === 192 && b === 168)          return true;  // private
      if (a === 169 && b === 254)          return true;  // link-local
      if (a === 0)                         return true;  // "this network"
    }

    return false;
  },

  _isSafeUrl(url) {
    try {
      const u = new URL(url);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
      return !this._isBlockedHost(u.hostname);
    } catch(_) {
      return false;
    }
  },


  /* ════════════════════════════════════════
     PERSISTENCE
  ════════════════════════════════════════ */
  _load() {
    try {
      const raw = localStorage.getItem('twitchbot_intro');
      if (raw) {
        const data     = JSON.parse(raw);
        this._intros   = data.intros   || {};
        this._settings = Object.assign({}, this._settings, data.settings || {});
      }
    } catch(_) {
      this._intros = {};
    }

    this._populateUI();
    this._render();
    this._updateSessionStatus();
  },

  _save() {
    try {
      localStorage.setItem('twitchbot_intro', JSON.stringify({
        intros:   this._intros,
        settings: this._settings
      }));
    } catch(_) {}
  },

  _populateUI() {
    const s   = this._settings;
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!val;
      else                        el.value   = val;
    };
    set('ibRewardId',     s.rewardId);
    set('ibEnabled',      s.enabled);
    set('ibConfirmChat',  s.confirmChat);
    set('ibSkipCommands', s.skipCommands);
  },

  saveSetting(key, value) {
    if (value === 'true')  value = true;
    if (value === 'false') value = false;
    this._settings[key] = value;
    this._save();
  },

  saveRewardId(value) {
    this._settings.rewardId = value.trim();
    this._save();
  },


  /* ════════════════════════════════════════
     REWARD ID AUTO-DETECT
  ════════════════════════════════════════ */
  startDetect() {
    this._detectingRewardId = true;

    const statEl = document.getElementById('ibDetectStatus');
    const btn    = document.getElementById('ibDetectBtn');
    if (statEl) {
      statEl.textContent = '⏳ Waiting — have someone redeem the reward now…';
      statEl.style.color = '#9147ff';
    }
    if (btn) { btn.textContent = 'Detecting…'; btn.disabled = true; }

    if (this._detectTimeout) clearTimeout(this._detectTimeout);
    this._detectTimeout = setTimeout(() => {
      if (!this._detectingRewardId) return;
      this._detectingRewardId = false;
      if (statEl) {
        statEl.textContent = 'Timed out — try again.';
        statEl.style.color = '#e05555';
      }
      if (btn) { btn.textContent = 'Auto-detect'; btn.disabled = false; }
    }, 90_000);
  },

  _captureRewardId(rewardId) {
    this._detectingRewardId = false;
    if (this._detectTimeout) {
      clearTimeout(this._detectTimeout);
      this._detectTimeout = null;
    }

    this._settings.rewardId = rewardId;
    this._save();

    const inp    = document.getElementById('ibRewardId');
    const statEl = document.getElementById('ibDetectStatus');
    const btn    = document.getElementById('ibDetectBtn');

    if (inp)    inp.value = rewardId;
    if (statEl) {
      statEl.textContent = '✔ Reward ID captured';
      statEl.style.color = '#1db954';
    }
    if (btn) { btn.textContent = 'Auto-detect'; btn.disabled = false; }

    logSys(`Intro Bot: reward ID set to ${rewardId}`);
  },


  /* ════════════════════════════════════════
     MESSAGE HANDLER
  ════════════════════════════════════════ */
  _onMessage(dname, nick, text, chan, tags) {
    const lowerNick = nick.toLowerCase();
    const botNick   = (typeof botName !== 'undefined'
                        ? botName : '').toLowerCase();

    if (this._detectingRewardId && tags['custom-reward-id']) {
      this._captureRewardId(tags['custom-reward-id']);
    }

    const rid = this._settings.rewardId;
    if (rid && tags['custom-reward-id'] === rid) {
      this._handleRedemption(dname, nick, text.trim(), chan);
      return;
    }

    if (lowerNick === botNick) return;

    if (this._settings.skipCommands && text.trim().startsWith('!')) return;

    if (!this._settings.enabled)                   return;
    if (this._playedThisSession.has(lowerNick))     return;

    this._playedThisSession.add(lowerNick);
    this._updateSessionStatus();

    if (this._intros[lowerNick]) {
      setTimeout(() => this._playIntro(lowerNick), 400);
    }
  },


  /* ════════════════════════════════════════
     REDEMPTION HANDLING
  ════════════════════════════════════════ */
  async _handleRedemption(dname, nick, url, chan) {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      this._reply(chan,
        `@${dname} Please paste a direct audio link (MP3/WAV/OGG) ` +
        `or a Vocaroo link (vocaroo.com).`
      );
      return;
    }

    logSys(`Intro Bot: ${dname} submitted URL → ${url}`);

    if (this._settings.confirmChat) {
      this._reply(chan, `@${dname} ⏳ Downloading your intro sound…`);
    }

    const result = await this._downloadIntro(nick, url);

    if (result.ok) {
      if (this._settings.confirmChat) {
        this._reply(chan,
          `@${dname} ✔ Intro saved! ` +
          `It will play when you first chat each stream. 🎵`
        );
      }
      logSys(`Intro Bot: saved intro for ${dname} → "${result.filename}"`);
    } else {
      this._reply(chan,
        `@${dname} Sorry, I couldn't download that. ` +
        `Please try vocaroo.com — upload your sound there and paste the link. ` +
        `(${result.error})`
      );
      logSys(`Intro Bot: download failed for ${dname} — ${result.error}`, true);
    }
  },

  _reply(chan, text) {
    if (typeof send !== 'function') return;
    if (!chan) {
      if (typeof channel !== 'undefined' && channel) {
        chan = `#${channel}`;
      } else return;
    }
    send(chan, text);
  },


  /* ════════════════════════════════════════
     DOWNLOAD
  ════════════════════════════════════════ */
  async _downloadIntro(nick, url) {
    const lowerNick   = nick.toLowerCase();
    const downloadUrl = this._transformUrl(url);

    if (!this._isSafeUrl(downloadUrl)) {
      return { ok: false, error: 'That URL is not allowed.' };
    }

    let arrayBuffer;
    let ext = null;

    const attempts = [
      downloadUrl,
      `https://corsproxy.io/?${encodeURIComponent(downloadUrl)}`,
      `https://api.allorigins.win/raw?url=${encodeURIComponent(downloadUrl)}`
    ];

    let lastError = '';

    for (const attemptUrl of attempts) {
      try {
        logSys(`Intro Bot: trying ${attemptUrl.slice(0, 60)}…`);

        const resp = await fetch(attemptUrl, { mode: 'cors' });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        const ctHeader = resp.headers.get('content-type') || '';
        const ctBase   = ctHeader.split(';')[0].trim().toLowerCase();

        /*
         * FIX: reject known-non-audio content types immediately, before
         * any byte-sniffing or extension-guessing.
         *
         * Root cause of the bug this fixes: a failed/blocked request
         * (e.g. Vocaroo or a CORS proxy returning an HTML interstitial,
         * error, or CAPTCHA page instead of the real file) was silently
         * treated as a successful download. The old code had no check
         * on the Content-Type header at all — it only tried to match
         * audio magic bytes, and FELL BACK TO A HARDCODED '.mp3' DEFAULT
         * when neither the header nor the URL implied a recognised
         * audio extension. That hardcoded default then let ANY content
         * pass _looksLikeAudio()'s own extension-trusting fallback line,
         * regardless of what was actually downloaded — an HTML page a
         * few KB in size was stored and played back as if it were a
         * real intro sound, with no error at any point until playback
         * itself failed much later in the overlay's decodeAudioData().
         */
        if (this._NON_AUDIO_TYPES.has(ctBase)) {
          throw new Error(`Server returned non-audio content (${ctBase || 'unknown type'})`);
        }

        ext = this._extFromContentType(ctHeader) || this._extFromUrl(downloadUrl);
        /* No more silent '.mp3' fallback — if we don't know the type,
           _looksLikeAudio() below must prove it via magic bytes alone. */

        arrayBuffer = await resp.arrayBuffer();

        if (arrayBuffer.byteLength === 0) {
          throw new Error('Empty file received');
        }
        if (arrayBuffer.byteLength > 10 * 1024 * 1024) {
          throw new Error('File too large — maximum 10 MB');
        }
        if (!this._looksLikeAudio(arrayBuffer, ext)) {
          throw new Error('File does not appear to be audio');
        }

        /* Only now, having proven it's really audio, apply a display
           extension fallback for filename purposes. */
        if (!ext) ext = '.mp3';

        lastError = '';
        break;

      } catch(e) {
        lastError   = e.message;
        arrayBuffer = null;
        ext         = null;
      }
    }

    if (!arrayBuffer) {
      return {
        ok:    false,
        error: lastError || 'All download attempts failed'
      };
    }

    const safeNick = lowerNick.replace(/[^a-z0-9_\-]/g, '_');
    const filename = safeNick + ext;

    try {
      await _introIdbSet('intro_' + lowerNick, {
        arrayBuffer,
        ext,
        filename,
        addedAt:     Date.now(),
        url,
        displayName: nick
      });
    } catch(e) {
      return { ok: false, error: 'Save failed: ' + e.message };
    }

    this._intros[lowerNick] = {
      filename,
      addedAt:     Date.now(),
      url,
      displayName: nick
    };

    this._save();
    this._render();

    return { ok: true, filename };
  },


  /* ── URL transforms ── */
  _transformUrl(url) {
    const vocaroo = url.match(
      /(?:www\.)?(?:vocaroo\.com|voca\.ro)\/([a-zA-Z0-9]+)(?:\?|$)/
    );
    if (vocaroo) {
      return `https://media1.vocaroo.com/mp3/${vocaroo[1]}`;
    }
    return url;
  },

  _extFromContentType(ct) {
    const map = {
      'audio/mpeg':   '.mp3', 'audio/mp3':    '.mp3',
      'audio/wav':    '.wav', 'audio/wave':   '.wav',
      'audio/x-wav':  '.wav', 'audio/ogg':    '.ogg',
      'audio/webm':   '.webm',
      'audio/mp4':    '.m4a', 'audio/aac':    '.aac',
      'audio/opus':   '.opus','audio/flac':   '.flac',
      'audio/x-flac': '.flac'
    };
    return map[ct.split(';')[0].trim().toLowerCase()] || null;
  },

  _extFromUrl(url) {
    const clean = url.split('?')[0].split('#')[0];
    const dot   = clean.lastIndexOf('.');
    if (dot === -1) return null;
    const ext = clean.slice(dot).toLowerCase();
    return this._AUDIO_EXTS.has(ext) ? ext : null;
  },

  /*
   * FIX: '.webm' recognised as a valid audio magic-byte signature.
   * Vocaroo's media1.vocaroo.com/mp3/... endpoint (despite the '/mp3/'
   * in its path) often actually serves WebM/Opus audio, not a real MP3
   * container — the EBML header below is the correct signature for it.
   * This was already being silently mis-labelled '.mp3' by the old
   * hardcoded fallback; now it's correctly identified so the overlay
   * (and decodeAudioData) know what they're actually dealing with.
   */
  _looksLikeAudio(buffer, ext) {
    if (buffer.byteLength < 4) return false;
    const b = new Uint8Array(buffer.slice(0, 12));
    if (b[0]===0x49 && b[1]===0x44 && b[2]===0x33)             return true; // ID3 (mp3)
    if (b[0]===0xFF && (b[1]&0xE0)===0xE0)                     return true; // MPEG (mp3)
    if (b[0]===0x52 && b[1]===0x49 && b[2]===0x46 && b[3]===0x46) return true; // RIFF (wav)
    if (b[0]===0x4F && b[1]===0x67 && b[2]===0x67 && b[3]===0x53) return true; // OggS
    if (b[0]===0x66 && b[1]===0x4C && b[2]===0x61 && b[3]===0x43) return true; // fLaC
    if (b[4]===0x66 && b[5]===0x74 && b[6]===0x79 && b[7]===0x70) return true; // ftyp (m4a/aac)
    if (b[0]===0x1A && b[1]===0x45 && b[2]===0xDF && b[3]===0xA3) return true; // EBML (webm)
    /*
     * FIX: extension fallback now REQUIRES ext to be non-null — the
     * caller no longer passes a hardcoded '.mp3' guess here, so this
     * only succeeds when a genuine Content-Type or URL extension was
     * confirmed earlier. Unknown/unconfirmed type + unrecognised bytes
     * now correctly falls through to `return false` below, rejecting
     * the file — closing the exact gap that let an HTML error page
     * through before.
     */
    return !!ext && this._AUDIO_EXTS.has(ext);
  },


  /* ════════════════════════════════════════
     PLAYBACK
  ════════════════════════════════════════ */
  async _playIntro(lowerNick) {
    const intro = this._intros[lowerNick];
    if (!intro) return;

    let entry;
    try {
      entry = await _introIdbGet('intro_' + lowerNick);
    } catch(e) {
      logSys(`Intro Bot: IDB read error for ${lowerNick}: ${e.message}`, true);
      return;
    }

    if (!entry || !entry.arrayBuffer) {
      logSys(`Intro Bot: no audio data for ${lowerNick}`, true);
      return;
    }

    let base64;
    try {
      base64 = await this._toBase64(entry.arrayBuffer);
    } catch(e) {
      logSys(`Intro Bot: base64 encode error: ${e.message}`, true);
      return;
    }

    const mime = {
      '.mp3':  'audio/mpeg', '.wav':  'audio/wav',
      '.ogg':  'audio/ogg',  '.webm': 'audio/webm',
      '.m4a':  'audio/mp4',
      '.aac':  'audio/aac',  '.opus': 'audio/opus',
      '.flac': 'audio/flac'
    }[entry.ext] || 'audio/mpeg';

    sendToOverlay({
      type:  'intro-play',
      nick:  intro.displayName || lowerNick,
      audio: base64,
      mime
    });

    logSys(`Intro Bot: 🎵 playing intro for ${intro.displayName || lowerNick}`);
  },

  _toBase64(arrayBuffer) {
    return new Promise((resolve, reject) => {
      const reader    = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.onerror   = reject;
      reader.readAsDataURL(new Blob([arrayBuffer]));
    });
  },

  async playFor(lowerNick) {
    await this._playIntro(lowerNick);
  },


  /* ════════════════════════════════════════
     SESSION
  ════════════════════════════════════════ */
  resetSession() {
    this._playedThisSession.clear();
    this._updateSessionStatus();
    this._render();
    logSys('Intro Bot: session reset — intros will play again on next message.');
  },

  _updateSessionStatus() {
    const el = document.getElementById('ibSessionStatus');
    if (!el) return;
    const n = this._playedThisSession.size;
    el.textContent = n > 0
      ? `${n} viewer${n !== 1 ? 's' : ''} greeted this session`
      : 'No one greeted yet this session.';
  },


  /* ════════════════════════════════════════
     MANUAL ADD
  ════════════════════════════════════════ */
  async manualAdd() {
    const userEl = document.getElementById('ibManualUser');
    const urlEl  = document.getElementById('ibManualUrl');
    const statEl = document.getElementById('ibManualStatus');

    const nick = (userEl?.value || '').trim();
    const url  = (urlEl?.value  || '').trim();

    if (!nick) {
      if (statEl) {
        statEl.textContent = '✘ Username required.';
        statEl.style.color = '#e05555';
      }
      return;
    }
    if (!url) {
      if (statEl) {
        statEl.textContent = '✘ URL required.';
        statEl.style.color = '#e05555';
      }
      return;
    }

    if (statEl) {
      statEl.textContent = '⏳ Downloading…';
      statEl.style.color = '#9147ff';
    }

    const result = await this._downloadIntro(nick, url);

    if (result.ok) {
      if (statEl) {
        statEl.textContent = `✔ Saved as "${result.filename}"`;
        statEl.style.color = '#1db954';
      }
      if (userEl) userEl.value = '';
      if (urlEl)  urlEl.value  = '';
    } else {
      if (statEl) {
        statEl.textContent = `✘ ${result.error}`;
        statEl.style.color = '#e05555';
      }
    }
  },


  /* ════════════════════════════════════════
     DELETE
  ════════════════════════════════════════ */
  async deleteIntro(lowerNick) {
    try { await _introIdbDel('intro_' + lowerNick); } catch(_) {}
    delete this._intros[lowerNick];
    this._save();
    this._render();
    logSys(`Intro Bot: deleted intro for ${lowerNick}`);
  },


  /* ════════════════════════════════════════
     RENDER
  ════════════════════════════════════════ */
  _render() {
    const list = document.getElementById('ibIntroList');
    if (!list) return;

    const entries = Object.entries(this._intros);
    if (!entries.length) {
      list.innerHTML = '<p class="cmd-empty">No intros saved yet.</p>';
      return;
    }

    entries.sort((a, b) => a[0].localeCompare(b[0]));

    list.innerHTML = entries.map(([lowerNick, intro]) => {
      const played    = this._playedThisSession.has(lowerNick);
      const dateStr   = new Date(intro.addedAt).toLocaleDateString();
      const dispName  = intro.displayName || lowerNick;
      const safeNick  = _ibEsc(JSON.stringify(lowerNick));
      const safeDisp  = _ibEsc(JSON.stringify(lowerNick));

      return `
        <div class="media-item" style="${played ? 'opacity:0.5' : ''}">
          <div style="min-width:0; flex:1">
            <div class="media-name">
              ${_ibEsc(dispName)}
              ${played
                ? `<span class="cmd-ol-badge"
                         style="color:#1db954; border-color:#1a5a2a">
                     played
                   </span>`
                : ''}
            </div>
            <div class="media-cmd">
              ${_ibEsc(intro.filename)}
              <span style="color:#2a2a3a; margin-left:4px">
                · added ${dateStr}
              </span>
            </div>
          </div>
          <button class="btn-play"
                  onclick="IntroBotPlugin.playFor(${safeDisp})"
                  title="Play intro now">▶</button>
          <button class="btn-xs" style="margin-left:3px"
                  onclick="IntroBotPlugin.deleteIntro(${safeNick})"
                  title="Delete intro">✕</button>
        </div>`;
    }).join('');
  }

};


/* ════════════════════════════════════════
   INDEXEDDB HELPERS
════════════════════════════════════════ */
function _introIdbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('twitchbot_intro', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('intros');
    req.onsuccess       = e => resolve(e.target.result);
    req.onerror         = e => reject(e.target.error);
  });
}

async function _introIdbSet(key, value) {
  const db = await _introIdbOpen();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction('intros', 'readwrite');
    const req = tx.objectStore('intros').put(value, key);
    req.onsuccess = () => resolve();
    req.onerror   = e  => reject(e.target.error);
  });
}

async function _introIdbGet(key) {
  const db = await _introIdbOpen();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction('intros', 'readonly');
    const req = tx.objectStore('intros').get(key);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

async function _introIdbDel(key) {
  const db = await _introIdbOpen();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction('intros', 'readwrite');
    const req = tx.objectStore('intros').delete(key);
    req.onsuccess = () => resolve();
    req.onerror   = e  => reject(e.target.error);
  });
}

function _ibEsc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}