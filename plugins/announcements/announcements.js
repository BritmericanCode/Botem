/* ════════════════════════════════════════
   ANNOUNCEMENTS PLUGIN  v1.3

   Automatically posts announcements to
   Twitch chat on a configurable schedule.
════════════════════════════════════════ */

BotPlugin.define({

  id:      'announcements',
  name:    'Announcements',
  version: '1.3',

  sidebarHtml() {
    return `
      <div class="panel" id="panel-announcements">
        <div class="panel-title" onclick="togglePanel('announcements')">
          Announcements <span class="chevron">▾</span>
        </div>
        <div class="panel-body">

          <div class="divider">global settings</div>

          <div class="two-col">
            <div class="field">
              <label>
                Min gap (min)
                <span class="opt">between any posts</span>
              </label>
              <input id="annGlobalGap" type="number" min="1" value="10"
                     onchange="AnnouncementsPlugin.saveGlobal('globalGap', this.value)">
            </div>
            <div class="field">
              <label>
                Max gap (min)
                <span class="opt">longest wait</span>
              </label>
              <input id="annGlobalMax" type="number" min="1" value="30"
                     onchange="AnnouncementsPlugin.saveGlobal('globalMax', this.value)">
            </div>
          </div>

          <div class="field"
               style="display:flex; flex-direction:column; gap:6px">

            <label style="display:flex; align-items:center;
                          gap:8px; cursor:pointer">
              <input id="annPauseWhenBusy" type="checkbox"
                     style="width:auto; accent-color:#9147ff"
                     onchange="AnnouncementsPlugin.saveGlobal(
                       'pauseWhenBusy', this.checked)">
              <span style="font-size:0.78rem; color:#adadb8">
                Pause when chat is active
                <span class="opt">(holds until quiet)</span>
              </span>
            </label>

            <label style="display:flex; align-items:center;
                          gap:8px; cursor:pointer">
              <input id="annRandomOrder" type="checkbox" checked
                     style="width:auto; accent-color:#9147ff"
                     onchange="AnnouncementsPlugin.saveGlobal(
                       'randomOrder', this.checked)">
              <span style="font-size:0.78rem; color:#adadb8">
                Random order
                <span class="opt">(uncheck for sequential)</span>
              </span>
            </label>

          </div>

          <div id="annStatus"
               style="font-size:0.72rem; color:#737380;
                      margin-top:8px; min-height:1.4em">
            Not running.
          </div>

          <div class="btn-row">
            <button id="annRunBtn"  class="btn-green"
                    onclick="AnnouncementsPlugin.start()">
              ▶ Start
            </button>
            <button id="annStopBtn" class="btn-red"
                    onclick="AnnouncementsPlugin.stop()"
                    disabled>
              ⏹ Stop
            </button>
            <button class="btn-muted"
                    onclick="AnnouncementsPlugin.postNext()">
              ⏭ Post Now
            </button>
          </div>

          <div class="divider" style="margin-top:12px">
            announcements
          </div>

          <div id="annList"
               style="display:flex; flex-direction:column; gap:4px;
                      max-height:220px; overflow-y:auto;
                      margin-bottom:8px">
            <p class="cmd-empty">No announcements yet.</p>
          </div>

          <div class="divider" id="annFormDivider">
            add announcement
          </div>

          <div class="field">
            <label>Title <span class="opt">(for your reference)</span></label>
            <input id="annTitle" type="text"
                   placeholder="e.g. Twitter link"
                   autocomplete="off" spellcheck="false">
          </div>

          <div class="field">
            <label>Message</label>
            <textarea id="annMessage" rows="3"
                      style="width:100%; background:#0e0e10;
                             border:1px solid #3a3a3d; border-radius:4px;
                             color:#efeff1; font-size:0.85rem;
                             padding:7px 10px; resize:vertical;
                             font-family:inherit"
                      placeholder="Follow me on Twitter! → https://twitter.com/…"
                      spellcheck="false"></textarea>
          </div>

          <div class="two-col">
            <div class="field">
              <label>
                Min interval (min)
                <span class="opt">this message</span>
              </label>
              <input id="annInterval" type="number" min="1" value="30">
            </div>
            <div class="field">
              <label>
                Weight
                <span class="opt">1 = normal</span>
              </label>
              <input id="annWeight" type="number" min="1" max="10" value="1">
            </div>
          </div>

          <div class="btn-row">
            <button id="annAddBtn" class="btn-purple"
                    onclick="AnnouncementsPlugin.addFromUI()">
              Add
            </button>
            <button id="annCancelBtn" class="btn-muted"
                    style="display:none"
                    onclick="AnnouncementsPlugin.cancelEdit()">
              Cancel
            </button>
          </div>

          <div class="divider">templates</div>
          <p class="help" style="margin-bottom:6px">
            Click to add a pre-filled announcement:
          </p>
          <div style="display:flex; flex-wrap:wrap; gap:5px">
            <button class="btn-xs"
                    onclick="AnnouncementsPlugin.addTemplate('follow')">
              Follow
            </button>
            <button class="btn-xs"
                    onclick="AnnouncementsPlugin.addTemplate('prime')">
              Prime Sub
            </button>
            <button class="btn-xs"
                    onclick="AnnouncementsPlugin.addTemplate('discord')">
              Discord
            </button>
            <button class="btn-xs"
                    onclick="AnnouncementsPlugin.addTemplate('twitter')">
              Twitter/X
            </button>
            <button class="btn-xs"
                    onclick="AnnouncementsPlugin.addTemplate('youtube')">
              YouTube
            </button>
            <button class="btn-xs"
                    onclick="AnnouncementsPlugin.addTemplate('tiktok')">
              TikTok
            </button>
            <button class="btn-xs"
                    onclick="AnnouncementsPlugin.addTemplate('donate')">
              Donate
            </button>
            <button class="btn-xs"
                    onclick="AnnouncementsPlugin.addTemplate('schedule')">
              Schedule
            </button>
          </div>

        </div>
      </div>`;
  },


  /* ════════════════════════════════════════
     INIT
  ════════════════════════════════════════ */
  init() {
    window.AnnouncementsPlugin = AnnouncementsPlugin;
    AnnouncementsPlugin._load();
  },

  /*
   * FIX: replaces the previous window.addChat monkey-patch (_hookMessages).
   * See dispatchDisplay() in plugins.js for rationale. The actual posting
   * loop already checks isEnabled() directly (see _scheduleNext/_tryPost
   * below, added in v1.2) — this change additionally stops the "is chat
   * busy" tracker from updating while disabled, for full consistency.
   */
  onDisplay() {
    AnnouncementsPlugin._lastMessageAt = Date.now();
  },

  chatCommands: {}

});


/* ════════════════════════════════════════
   ANNOUNCEMENTS HELPER OBJECT
════════════════════════════════════════ */
const AnnouncementsPlugin = {

  _announcements: [],
  _global: {
    globalGap:     10,
    globalMax:     30,
    pauseWhenBusy: false,
    randomOrder:   true
  },

  _running:       false,
  _timer:         null,
  _nextIndex:     0,
  _lastPostedAt:  0,
  _lastMessageAt: 0,
  _lastPostedId:  null,
  _editingId:     null,

  _BUSY_WINDOW_MS: 30_000,


  /* ════════════════════════════════════════
     TEMPLATES
  ════════════════════════════════════════ */
  _templates: {
    follow: {
      title:    'Follow reminder',
      message:  'Enjoying the stream? Hit that Follow button so you never miss a stream! 💜',
      interval: 30,
      weight:   1
    },
    prime: {
      title:    'Prime Sub',
      message:  'Did you know Amazon Prime members get a free Twitch sub every month? ' +
                'Use it here — it costs you nothing and supports the stream! 👑',
      interval: 45,
      weight:   1
    },
    discord: {
      title:    'Discord',
      message:  '💬 Join the community on Discord → https://discord.gg/YOURLINK',
      interval: 30,
      weight:   1
    },
    twitter: {
      title:    'Twitter / X',
      message:  '🐦 Follow on Twitter/X for stream updates → https://twitter.com/YOURHANDLE',
      interval: 35,
      weight:   1
    },
    youtube: {
      title:    'YouTube',
      message:  '🎬 VODs and highlights on YouTube → https://youtube.com/@YOURCHANNEL',
      interval: 35,
      weight:   1
    },
    tiktok: {
      title:    'TikTok',
      message:  '🎵 Catch clips on TikTok → https://tiktok.com/@YOURHANDLE',
      interval: 35,
      weight:   1
    },
    donate: {
      title:    'Donate',
      message:  '☕ Want to support the stream? Tips are always appreciated → https://YOURLINK',
      interval: 45,
      weight:   1
    },
    schedule: {
      title:    'Stream schedule',
      message:  '📅 Stream schedule: Mon / Wed / Fri at 8pm EST. Follow so you get notified!',
      interval: 40,
      weight:   1
    }
  },


  /* ════════════════════════════════════════
     PERSISTENCE
  ════════════════════════════════════════ */
  _load() {
    try {
      const raw = localStorage.getItem('twitchbot_announcements');
      if (raw) {
        const data          = JSON.parse(raw);
        this._announcements = data.announcements || [];
        this._global        = Object.assign({}, this._global, data.global || {});
      }
    } catch(_) {
      this._announcements = [];
    }

    this._populateGlobalUI();
    this._render();
  },

  _save() {
    try {
      localStorage.setItem('twitchbot_announcements', JSON.stringify({
        announcements: this._announcements,
        global:        this._global
      }));
    } catch(_) {}
  },


  /* ════════════════════════════════════════
     GLOBAL SETTINGS
  ════════════════════════════════════════ */
  saveGlobal(key, value) {
    if (value === 'true')  value = true;
    if (value === 'false') value = false;
    if (typeof value === 'string' && value !== '' && !isNaN(value)) {
      value = parseFloat(value);
    }
    this._global[key] = value;
    this._save();

    if (this._running) {
      if (this._timer) { clearTimeout(this._timer); this._timer = null; }
      this._scheduleNext();
    }
  },

  _populateGlobalUI() {
    const g   = this._global;
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!val;
      else                        el.value   = val;
    };
    set('annGlobalGap',     g.globalGap);
    set('annGlobalMax',     g.globalMax);
    set('annPauseWhenBusy', g.pauseWhenBusy);
    set('annRandomOrder',   g.randomOrder);
  },


  /* ════════════════════════════════════════
     START / STOP
  ════════════════════════════════════════ */
  start() {
    const enabled = this._announcements.filter(a => a.enabled);
    if (!enabled.length) {
      logSys('Announcements: no enabled announcements to post.', true);
      return;
    }

    if (typeof channel === 'undefined' || !channel) {
      logSys('Announcements: connect to Twitch first.', true);
      return;
    }

    this._running   = true;
    this._nextIndex = 0;
    this._updateRunUI();
    this._scheduleNext();
    logSys('Announcements: started.');
  },

  stop() {
    this._running = false;
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    this._updateRunUI();
    this._setStatus('Stopped.');
    logSys('Announcements: stopped.');
  },


  /* ════════════════════════════════════════
     SCHEDULING
  ════════════════════════════════════════ */
  _scheduleNext() {
    if (!this._running) return;

    if (typeof BotPlugin !== 'undefined' && !BotPlugin.isEnabled('announcements')) {
      this._running = false;
      if (this._timer) { clearTimeout(this._timer); this._timer = null; }
      this._updateRunUI();
      this._setStatus('Stopped — plugin disabled.');
      logSys('Announcements: stopped — plugin was disabled.', true);
      return;
    }

    const minMs = (this._global.globalGap || 10) * 60_000;
    const maxMs = Math.max(minMs, (this._global.globalMax || 30) * 60_000);
    const delay = minMs + Math.random() * (maxMs - minMs);
    const mins  = (delay / 60_000).toFixed(1);

    this._setStatus(`Next post in ~${mins} min`);

    this._timer = setTimeout(() => {
      this._timer = null;
      this._tryPost();
    }, delay);
  },

  _tryPost() {
    if (!this._running) return;

    if (typeof BotPlugin !== 'undefined' && !BotPlugin.isEnabled('announcements')) {
      this._running = false;
      if (this._timer) { clearTimeout(this._timer); this._timer = null; }
      this._updateRunUI();
      this._setStatus('Stopped — plugin disabled.');
      logSys('Announcements: stopped — plugin was disabled.', true);
      return;
    }

    if (this._global.pauseWhenBusy) {
      const idle = Date.now() - this._lastMessageAt;
      if (idle < this._BUSY_WINDOW_MS) {
        this._setStatus('Chat active — waiting…');
        this._timer = setTimeout(() => {
          this._timer = null;
          this._tryPost();
        }, 60_000);
        return;
      }
    }

    this.postNext();
  },

  postNext() {
    const enabled = this._announcements.filter(a => a.enabled);
    if (!enabled.length) {
      logSys('Announcements: no enabled announcements.', true);
      if (this._running) this._scheduleNext();
      return;
    }

    let chosen = null;

    if (this._global.randomOrder) {
      chosen = this._weightedPick(enabled);
    } else {
      this._nextIndex = this._nextIndex % enabled.length;
      chosen          = enabled[this._nextIndex];
      this._nextIndex = (this._nextIndex + 1) % enabled.length;
    }

    if (!chosen) {
      if (this._running) this._scheduleNext();
      return;
    }

    const lastFired = chosen._lastFired || 0;
    const minGap    = (chosen.interval || 30) * 60_000;

    if (Date.now() - lastFired < minGap) {
      const fallback = enabled.filter(
        a => a.id !== chosen.id &&
             (Date.now() - (a._lastFired || 0)) >= (a.interval || 30) * 60_000
      );
      if (fallback.length) {
        chosen = this._global.randomOrder
          ? this._weightedPick(fallback)
          : fallback[0];
      } else {
        this._setStatus('All announcements on cooldown — skipping.');
        if (this._running) this._scheduleNext();
        return;
      }
    }

    this._sendAnnouncement(chosen);
    if (this._running) this._scheduleNext();
  },

  postOne(id) {
    const ann = this._announcements.find(a => a.id === id);
    if (ann) this._sendAnnouncement(ann);
  },

  _sendAnnouncement(ann) {
    if (typeof channel === 'undefined' || !channel) {
      logSys('Announcements: not connected to Twitch.', true);
      return;
    }
    if (typeof send !== 'function') {
      logSys('Announcements: send() not available.', true);
      return;
    }

    send(`#${channel}`, ann.message);

    ann._lastFired     = Date.now();
    this._lastPostedAt = Date.now();
    this._lastPostedId = ann.id;

    this._save();
    this._render();

    logSys(`Announcements: posted "${ann.title}"`);
    this._setStatus(
      `Last: "${ann.title}" at ${new Date().toLocaleTimeString()}`
    );
  },


  /* ════════════════════════════════════════
     WEIGHTED RANDOM
  ════════════════════════════════════════ */
  _weightedPick(list) {
    const total = list.reduce((sum, a) => sum + (a.weight || 1), 0);
    let   rand  = Math.random() * total;
    for (const item of list) {
      rand -= (item.weight || 1);
      if (rand <= 0) return item;
    }
    return list[list.length - 1];
  },


  /* ════════════════════════════════════════
     ADD / EDIT / DELETE
  ════════════════════════════════════════ */
  addFromUI() {
    const title    = (document.getElementById('annTitle')?.value   || '').trim();
    const message  = (document.getElementById('annMessage')?.value || '').trim();
    const interval = parseInt(document.getElementById('annInterval')?.value || '30');
    const weight   = parseInt(document.getElementById('annWeight')?.value   || '1');

    if (!message) {
      logSys('Announcements: message is required.', true);
      return;
    }

    const isEdit = this._editingId !== null && this._editingId !== undefined;
    const id     = isEdit ? this._editingId : Date.now();

    const entry = {
      id,
      title:      title || message.slice(0, 40),
      message,
      interval:   Math.max(1, isNaN(interval) ? 30 : interval),
      weight:     Math.max(1, isNaN(weight)   ? 1  : weight),
      enabled:    true,
      _lastFired: isEdit
        ? (this._announcements.find(a => a.id === id)?._lastFired || 0)
        : 0
    };

    if (isEdit) {
      const idx = this._announcements.findIndex(a => a.id === id);
      if (idx !== -1) this._announcements[idx] = entry;
    } else {
      this._announcements.push(entry);
    }

    this._save();
    this._render();
    this.cancelEdit();
  },

  startEdit(id) {
    const ann = this._announcements.find(a => a.id === id);
    if (!ann) return;
    this._editingId = id;

    const set = (elId, val) => {
      const el = document.getElementById(elId);
      if (el) el.value = val;
    };
    set('annTitle',    ann.title);
    set('annMessage',  ann.message);
    set('annInterval', ann.interval);
    set('annWeight',   ann.weight);

    const addBtn    = document.getElementById('annAddBtn');
    const cancelBtn = document.getElementById('annCancelBtn');
    const divider   = document.getElementById('annFormDivider');
    if (addBtn)    addBtn.textContent       = 'Update';
    if (cancelBtn) cancelBtn.style.display  = '';
    if (divider)   divider.textContent      = 'edit announcement';

    const panel = document.getElementById('panel-announcements');
    if (panel) panel.classList.remove('collapsed');
    document.getElementById('annTitle')?.scrollIntoView({
      behavior: 'smooth', block: 'nearest'
    });
  },

  cancelEdit() {
    this._editingId = null;

    ['annTitle', 'annMessage'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    const setDef = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.value = v;
    };
    setDef('annInterval', 30);
    setDef('annWeight',   1);

    const addBtn    = document.getElementById('annAddBtn');
    const cancelBtn = document.getElementById('annCancelBtn');
    const divider   = document.getElementById('annFormDivider');
    if (addBtn)    addBtn.textContent      = 'Add';
    if (cancelBtn) cancelBtn.style.display = 'none';
    if (divider)   divider.textContent     = 'add announcement';
  },

  toggleEnabled(id) {
    const ann = this._announcements.find(a => a.id === id);
    if (!ann) return;
    ann.enabled = !ann.enabled;
    this._save();
    this._render();
  },

  deleteAnnouncement(id) {
    this._announcements = this._announcements.filter(a => a.id !== id);
    this._save();
    this._render();
    if (this._editingId === id) this.cancelEdit();
  },

  addTemplate(key) {
    const tpl = this._templates[key];
    if (!tpl) return;
    this._announcements.push({
      id:         Date.now() + Math.random(),
      title:      tpl.title,
      message:    tpl.message,
      interval:   tpl.interval,
      weight:     tpl.weight,
      enabled:    true,
      _lastFired: 0
    });
    this._save();
    this._render();
    logSys(
      `Announcements: added "${tpl.title}" template — ` +
      `edit the message to add your link.`
    );
  },


  /* ════════════════════════════════════════
     UI HELPERS
  ════════════════════════════════════════ */
  _setStatus(text) {
    const el = document.getElementById('annStatus');
    if (el) el.textContent = text;
  },

  _updateRunUI() {
    const runBtn  = document.getElementById('annRunBtn');
    const stopBtn = document.getElementById('annStopBtn');
    if (runBtn)  runBtn.disabled  =  this._running;
    if (stopBtn) stopBtn.disabled = !this._running;
    this._setStatus(this._running ? 'Running…' : 'Stopped.');
  },

  _fmtAgo(ts) {
    if (!ts) return 'never';
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 60)   return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
  },

  _render() {
    const list = document.getElementById('annList');
    if (!list) return;

    if (!this._announcements.length) {
      list.innerHTML =
        '<p class="cmd-empty">No announcements yet — use templates below.</p>';
      return;
    }

    list.innerHTML = this._announcements.map(ann => {
      const dim        = ann.enabled ? '' : 'opacity:0.4;';
      const toggleIcon = ann.enabled ? '⏸' : '▶';
      const toggleTip  = ann.enabled ? 'Disable' : 'Enable';
      const lastFired  = this._fmtAgo(ann._lastFired);
      const isLast     = ann.id === this._lastPostedId;

      return `
        <div class="cmd-card" style="${dim}">
          <div class="cmd-header">
            <div class="cmd-body" style="min-width:0">
              <div class="cmd-name"
                   style="color:${ann.enabled ? '#9147ff' : '#4a4a60'}">
                ${_annEsc(ann.title)}
                ${isLast
                  ? `<span class="cmd-ol-badge"
                           style="color:#1db954; border-color:#1a5a2a">
                       last sent
                     </span>`
                  : ''}
              </div>
              <div class="cmd-resp" title="${_annEsc(ann.message)}">
                ${_annEsc(ann.message)}
              </div>
              <div style="display:flex; gap:6px; margin-top:4px; flex-wrap:wrap">
                <span style="font-size:0.68rem; color:#4a4a60">
                  every ${ann.interval}m+
                </span>
                <span style="font-size:0.68rem; color:#4a4a60">
                  weight: ${ann.weight}
                </span>
                <span style="font-size:0.68rem; color:#3a5a3a">
                  last: ${lastFired}
                </span>
              </div>
            </div>
            <div class="cmd-btns">
              <button class="btn-xs"
                      title="${toggleTip}"
                      onclick="AnnouncementsPlugin.toggleEnabled(${ann.id})">
                ${toggleIcon}
              </button>
              <button class="btn-xs btn-edit"
                      title="Edit"
                      onclick="AnnouncementsPlugin.startEdit(${ann.id})">
                ✏
              </button>
              <button class="btn-xs"
                      title="Post now"
                      onclick="AnnouncementsPlugin.postOne(${ann.id})">
                ▶
              </button>
              <button class="btn-xs"
                      title="Delete"
                      onclick="AnnouncementsPlugin.deleteAnnouncement(${ann.id})">
                ✕
              </button>
            </div>
          </div>
        </div>`;
    }).join('');
  }

};


/* ── Module-local escape helper ── */
function _annEsc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}