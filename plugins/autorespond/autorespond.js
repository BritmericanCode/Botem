/* ════════════════════════════════════════
   AUTO-RESPOND PLUGIN  v1.4

   Watches chat for messages matching a
   trigger pattern and automatically sends
   a response after a random delay.

   Each rule has:
     id          — stable identifier, assigned
                   once at creation, never reused
     trigger     — text to watch for
                   (plain text or /regex/)
     response    — what to send
     match mode  — anywhere / exact /
                   starts-with / regex
     who we watch— anyone / streamer /
                   moderator+ / bot-only
     min delay   — minimum seconds before reply
     max delay   — maximum seconds before reply
     enabled     — on/off per rule
     once        — fire once then disable
     cooldown    — seconds between fires
════════════════════════════════════════ */

BotPlugin.define({

  id:      'autorespond',
  name:    'Auto Respond',
  version: '1.4',

  sidebarHtml() {
    return `
      <div class="panel" id="panel-autorespond">
        <div class="panel-title" onclick="togglePanel('autorespond')">
          Auto Respond <span class="chevron">▾</span>
        </div>
        <div class="panel-body">

          <!-- Rule list -->
          <div id="arRuleList">
            <p class="cmd-empty">No rules yet.</p>
          </div>

          <div class="divider" style="margin-top:10px">add rule</div>

          <!-- Trigger -->
          <div class="field">
            <label>
              Trigger text
              <span class="opt">wrap in /…/ for regex</span>
            </label>
            <input id="arTrigger" type="text"
                   placeholder='type !join  or  /giveaway/i'
                   autocomplete="off" spellcheck="false">
          </div>

          <!-- Match mode -->
          <div class="field">
            <label>Match mode</label>
            <select id="arMatchMode">
              <option value="anywhere">Anywhere in message</option>
              <option value="exact">Exact message</option>
              <option value="starts">Starts with</option>
              <option value="regex">Regex (auto if /…/)</option>
            </select>
          </div>

          <!-- Response -->
          <div class="field">
            <label>
              Response
              <span class="opt">what to send</span>
            </label>
            <input id="arResponse" type="text"
                   placeholder="!join"
                   autocomplete="off" spellcheck="false">
          </div>

          <!-- Who we watch -->
          <div class="field">
            <label>Watch messages from</label>
            <select id="arWatchWho">
              <option value="anyone">Anyone</option>
              <option value="others">Others (not bot)</option>
              <option value="streamer">Streamer only</option>
              <option value="moderator">Moderators+</option>
              <option value="bot">Bot only</option>
            </select>
          </div>

          <!-- Delay -->
          <div class="two-col">
            <div class="field">
              <label>Min delay (s)</label>
              <input id="arMinDelay" type="number"
                     min="0" step="0.1" value="1.0">
            </div>
            <div class="field">
              <label>Max delay (s)</label>
              <input id="arMaxDelay" type="number"
                     min="0" step="0.1" value="3.0">
            </div>
          </div>

          <!-- Cooldown + once -->
          <div class="two-col">
            <div class="field">
              <label>
                Cooldown (s)
                <span class="opt">0 = none</span>
              </label>
              <input id="arCooldown" type="number"
                     min="0" step="1" value="0">
            </div>
            <div class="field"
                 style="display:flex; align-items:center;
                        gap:8px; padding-top:22px">
              <input id="arOnce" type="checkbox"
                     style="width:auto; accent-color:#9147ff; cursor:pointer">
              <label style="font-size:0.78rem; color:#adadb8;
                            margin:0; cursor:pointer"
                     for="arOnce">
                Fire once then disable
              </label>
            </div>
          </div>

          <div class="btn-row">
            <button id="arAddBtn" class="btn-purple"
                    onclick="AutoRespondPlugin.addFromUI()">
              Add Rule
            </button>
            <button id="arCancelBtn" class="btn-muted"
                    style="display:none"
                    onclick="AutoRespondPlugin.cancelEdit()">
              Cancel
            </button>
          </div>

        </div>
      </div>`;
  },

  init() {
    window.AutoRespondPlugin = AutoRespondPlugin;
    AutoRespondPlugin._load();
  },

  /*
   * FIX: replaces the previous window.addChat monkey-patch (_hookMessages).
   * See dispatchDisplay() in plugins.js for rationale. Disabling this
   * plugin via its sidebar toggle now actually stops rule matching
   * entirely, rather than only being cosmetic.
   */
  onDisplay({ name, text, isBot }) {
    AutoRespondPlugin._onMessage(name, text, isBot);
  },

  chatCommands: {}

});


/* ════════════════════════════════════════
   AUTO-RESPOND HELPER OBJECT
════════════════════════════════════════ */
const AutoRespondPlugin = {

  _rules:       [],
  _lastFired:   {},   // id → timestamp
  _pending:     {},   // id → setTimeout handle
  _editingIndex: null,

  _idCounter: 0,

  _recentSelfMessages: new Map(),
  _SELF_MSG_WINDOW_MS: 5000,


  /* ════════════════════════════════════════
     ID GENERATION
  ════════════════════════════════════════ */
  _makeId() {
    this._idCounter = (this._idCounter + 1) % 1_000_000;
    return `ar_${Date.now()}_${this._idCounter}`;
  },


  /* ── Persistence ── */
  _save() {
    try {
      localStorage.setItem(
        'twitchbot_autorespond',
        JSON.stringify(this._rules)
      );
    } catch(_) {}
  },

  _load() {
    try {
      const raw = localStorage.getItem('twitchbot_autorespond');
      if (raw) this._rules = JSON.parse(raw);
    } catch(_) { this._rules = []; }

    let migrated = false;
    for (const rule of this._rules) {
      if (!rule.id) {
        rule.id  = this._makeId();
        migrated = true;
      }
    }
    if (migrated) this._save();

    this._render();
  },


  /* ════════════════════════════════════════
     SELF-ECHO TRACKING
  ════════════════════════════════════════ */
  _markSelfSent(text) {
    const now = Date.now();
    this._recentSelfMessages.set(text, now);

    for (const [msg, ts] of this._recentSelfMessages) {
      if (now - ts > this._SELF_MSG_WINDOW_MS) {
        this._recentSelfMessages.delete(msg);
      }
    }
  },


  /* ════════════════════════════════════════
     MESSAGE HANDLER
  ════════════════════════════════════════ */
  _onMessage(name, text, isBot) {
    if (!this._rules.length) return;

    if (isBot) {
      const sentAt = this._recentSelfMessages.get(text);
      if (sentAt && Date.now() - sentAt < this._SELF_MSG_WINDOW_MS) {
        this._recentSelfMessages.delete(text);
        return;
      }
    }

    const lowerText = text.toLowerCase();
    const lowerName = name.toLowerCase();

    for (const rule of this._rules) {
      if (!rule.enabled) continue;

      const botNameLower  = (typeof botName !== 'undefined' ? botName : '').toLowerCase();
      const channelLower  = (typeof channel !== 'undefined' ? channel : '').toLowerCase();
      const isBotMsg      = lowerName === botNameLower;
      const isStreamerMsg = lowerName === channelLower;

      switch (rule.watchWho) {
        case 'bot':      if (!isBotMsg)      continue; break;
        case 'streamer': if (!isStreamerMsg) continue; break;
        case 'others':   if (isBotMsg)       continue; break;
        case 'anyone':
        default:                                       break;
      }

      if (!this._matches(rule, text, lowerText)) continue;

      if (rule.cooldown > 0) {
        const last = this._lastFired[rule.id] || 0;
        if (Date.now() - last < rule.cooldown * 1000) continue;
      }

      this._scheduleResponse(rule);
    }
  },

  _matches(rule, text, lowerText) {
    const trigger = rule.trigger || '';
    if (!trigger) return false;

    if (/^\/.*\/[gimsuy]*$/.test(trigger) || rule.matchMode === 'regex') {
      try {
        const parts = trigger.match(/^\/(.*)\/([gimsuy]*)$/);
        const re    = parts
          ? new RegExp(parts[1], parts[2])
          : new RegExp(trigger, 'i');
        return re.test(text);
      } catch(_) { return false; }
    }

    const lowerTrigger = trigger.toLowerCase();

    switch (rule.matchMode) {
      case 'exact':  return lowerText === lowerTrigger;
      case 'starts': return lowerText.startsWith(lowerTrigger);
      case 'anywhere':
      default:       return lowerText.includes(lowerTrigger);
    }
  },

  _scheduleResponse(rule) {
    const id = rule.id;

    if (this._pending[id]) {
      clearTimeout(this._pending[id]);
      delete this._pending[id];
    }

    const minMs = Math.max(0, (rule.minDelay || 0) * 1000);
    const maxMs = Math.max(minMs, (rule.maxDelay || 0) * 1000);
    const delay = minMs + Math.random() * (maxMs - minMs);

    this._pending[id] = setTimeout(() => {
      delete this._pending[id];

      const current = this._rules.find(r => r.id === id);
      if (!current || !current.enabled) return;

      if (typeof channel === 'undefined' || !channel) return;
      if (typeof send !== 'function') return;

      send(`#${channel}`, current.response);
      this._markSelfSent(current.response);
      logSys(`Auto-respond: sent "${current.response}" ← "${current.trigger}"`);

      this._lastFired[id] = Date.now();

      if (current.once) {
        current.enabled = false;
        this._save();
        this._render();
        logSys(`Auto-respond: rule "${current.trigger}" disabled (once).`);
      }
    }, delay);

    logSys(
      `Auto-respond: matched "${rule.trigger}" — ` +
      `responding in ${(delay / 1000).toFixed(1)}s`
    );
  },


  /* ════════════════════════════════════════
     UI — ADD / EDIT
  ════════════════════════════════════════ */
  addFromUI() {
    const trigger   = (document.getElementById('arTrigger')?.value   || '').trim();
    const response  = (document.getElementById('arResponse')?.value  || '').trim();
    const matchMode = document.getElementById('arMatchMode')?.value  || 'anywhere';
    const watchWho  = document.getElementById('arWatchWho')?.value   || 'anyone';
    const minDelay  = parseFloat(document.getElementById('arMinDelay')?.value || '1');
    const maxDelay  = parseFloat(document.getElementById('arMaxDelay')?.value || '3');
    const cooldown  = parseInt(document.getElementById('arCooldown')?.value   || '0');
    const once      = document.getElementById('arOnce')?.checked || false;

    if (!trigger)  { logSys('Auto-respond: trigger is required.',  true); return; }
    if (!response) { logSys('Auto-respond: response is required.', true); return; }

    const isEdit = this._editingIndex !== null;
    const existingId = isEdit ? this._rules[this._editingIndex]?.id : null;

    const rule = {
      id: existingId || this._makeId(),
      trigger,
      response,
      matchMode,
      watchWho,
      minDelay:  Math.max(0, isNaN(minDelay) ? 1 : minDelay),
      maxDelay:  Math.max(0, isNaN(maxDelay) ? 3 : maxDelay),
      cooldown:  Math.max(0, isNaN(cooldown) ? 0 : cooldown),
      once,
      enabled:   true
    };

    if (isEdit) {
      this._rules[this._editingIndex] = rule;
    } else {
      this._rules.push(rule);
    }

    this._save();
    this._render();
    this.cancelEdit();
  },

  startEdit(index) {
    const rule = this._rules[index];
    if (!rule) return;

    this._editingIndex = index;

    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val;
    };

    set('arTrigger',   rule.trigger);
    set('arResponse',  rule.response);
    set('arMatchMode', rule.matchMode || 'anywhere');
    set('arWatchWho',  rule.watchWho  || 'anyone');
    set('arMinDelay',  rule.minDelay  ?? 1);
    set('arMaxDelay',  rule.maxDelay  ?? 3);
    set('arCooldown',  rule.cooldown  ?? 0);

    const once = document.getElementById('arOnce');
    if (once) once.checked = !!rule.once;

    const addBtn    = document.getElementById('arAddBtn');
    const cancelBtn = document.getElementById('arCancelBtn');
    if (addBtn)    addBtn.textContent       = 'Update Rule';
    if (cancelBtn) cancelBtn.style.display  = '';

    const panel = document.getElementById('panel-autorespond');
    if (panel) panel.classList.remove('collapsed');
    panel?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  cancelEdit() {
    this._editingIndex = null;

    ['arTrigger', 'arResponse'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    const setDefault = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val;
    };
    setDefault('arMatchMode', 'anywhere');
    setDefault('arWatchWho',  'anyone');
    setDefault('arMinDelay',  '1.0');
    setDefault('arMaxDelay',  '3.0');
    setDefault('arCooldown',  '0');

    const once = document.getElementById('arOnce');
    if (once) once.checked = false;

    const addBtn    = document.getElementById('arAddBtn');
    const cancelBtn = document.getElementById('arCancelBtn');
    if (addBtn)    addBtn.textContent      = 'Add Rule';
    if (cancelBtn) cancelBtn.style.display = 'none';
  },

  toggleEnabled(index) {
    if (!this._rules[index]) return;
    this._rules[index].enabled = !this._rules[index].enabled;
    this._save();
    this._render();
  },

  deleteRule(index) {
    const rule = this._rules[index];
    if (!rule) return;

    if (this._pending[rule.id]) {
      clearTimeout(this._pending[rule.id]);
      delete this._pending[rule.id];
    }
    delete this._lastFired[rule.id];

    this._rules.splice(index, 1);
    this._save();
    this._render();
    if (this._editingIndex === index) this.cancelEdit();
  },


  /* ════════════════════════════════════════
     RENDER
  ════════════════════════════════════════ */
  _render() {
    const list = document.getElementById('arRuleList');
    if (!list) return;

    if (!this._rules.length) {
      list.innerHTML = '<p class="cmd-empty">No rules yet.</p>';
      return;
    }

    const watchLabels = {
      anyone:    'Anyone',
      others:    'Others',
      streamer:  'Streamer',
      moderator: 'Mods+',
      bot:       'Bot only'
    };

    const modeLabels = {
      anywhere: 'anywhere',
      exact:    'exact',
      starts:   'starts with',
      regex:    'regex'
    };

    list.innerHTML = this._rules.map((rule, i) => {
      const dim          = rule.enabled ? '' : 'style="opacity:0.45"';
      const toggleLabel  = rule.enabled ? '⏸' : '▶';
      const toggleTitle  = rule.enabled ? 'Disable' : 'Enable';
      const delayStr     = rule.minDelay === rule.maxDelay
        ? `${rule.minDelay}s`
        : `${rule.minDelay}–${rule.maxDelay}s`;

      return `
        <div class="cmd-card" ${dim}>
          <div class="cmd-header">
            <div class="cmd-body" style="min-width:0">

              <div class="cmd-name"
                   style="color:${rule.enabled ? '#9147ff' : '#4a4a60'}">
                ${_arEsc(rule.trigger)}
                ${rule.once
                  ? `<span class="cmd-ol-badge"
                           style="color:#e91e8c; border-color:#5a1a5a">
                       once
                     </span>`
                  : ''}
              </div>

              <div class="cmd-resp" title="${_arEsc(rule.response)}">
                → ${_arEsc(rule.response)}
              </div>

              <div style="display:flex; gap:5px; flex-wrap:wrap; margin-top:5px">
                <span style="font-size:0.68rem; background:#0d2035;
                             color:#4a9eff; border:1px solid #1a3a60;
                             border-radius:3px; padding:0 5px">
                  ${delayStr} delay
                </span>
                ${rule.cooldown > 0
                  ? `<span style="font-size:0.68rem; background:#0e0e10;
                                  color:#737380; border:1px solid #3a3a3d;
                                  border-radius:3px; padding:0 5px">
                       ${rule.cooldown}s cd
                     </span>`
                  : ''}
                <span style="font-size:0.68rem; background:#1c1c22;
                             color:#737380; border:1px solid #3a3a3d;
                             border-radius:3px; padding:0 5px">
                  ${modeLabels[rule.matchMode] || rule.matchMode}
                </span>
                <span style="font-size:0.68rem; background:#1c1c22;
                             color:#737380; border:1px solid #3a3a3d;
                             border-radius:3px; padding:0 5px">
                  from: ${watchLabels[rule.watchWho] || rule.watchWho}
                </span>
              </div>

            </div>

            <div class="cmd-btns">
              <button class="btn-xs"
                      title="${toggleTitle}"
                      onclick="AutoRespondPlugin.toggleEnabled(${i})">
                ${toggleLabel}
              </button>
              <button class="btn-xs btn-edit"
                      title="Edit"
                      onclick="AutoRespondPlugin.startEdit(${i})">
                ✏
              </button>
              <button class="btn-xs"
                      title="Delete"
                      onclick="AutoRespondPlugin.deleteRule(${i})">
                ✕
              </button>
            </div>
          </div>
        </div>`;
    }).join('');
  }

};


/* ── Module-local escape helper ── */
function _arEsc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}