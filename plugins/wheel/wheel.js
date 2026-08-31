/* ════════════════════════════════════════
   WHEEL PLUGIN  v1.1  —  bot side

   Streamer adds options (with optional
   weight), then spins to randomly pick one.
   Wedge size on the overlay is proportional
   to weight, so the visual matches the real
   odds — not just equal slices.

   Chat commands:
     !wheel   — list current options (everyone, 30s cd)
     !spin    — spin the wheel (mod+, 10s cd)
════════════════════════════════════════ */

BotPlugin.define({

  id:      'wheel',
  name:    'Wheel',
  version: '1.1',
  positionable: true,

  sidebarHtml() {
    return `
      <div class="panel" id="panel-wheel">
        <div class="panel-title" onclick="togglePanel('wheel')">
          Wheel <span class="chevron">▾</span>
        </div>
        <div class="panel-body">

          <button class="btn-full btn-purple" style="margin-bottom:10px"
                  onclick="WheelPlugin.uiSpin()">
            🎡 Spin the Wheel
          </button>

          <div class="divider">options</div>

          <div id="wheelOptList">
            <p class="cmd-empty">No options yet — add some below.</p>
          </div>

          <div class="divider" id="wheelFormDivider">add option</div>

          <div class="field">
            <label>Label</label>
            <input id="wheelOptLabel" type="text"
                   placeholder="e.g. Pizza night"
                   autocomplete="off" spellcheck="false">
          </div>

          <div class="field">
            <label>
              Weight
              <span class="opt">1 = normal, higher = more likely</span>
            </label>
            <input id="wheelOptWeight" type="number" min="1" value="1">
          </div>

          <div class="btn-row">
            <button id="wheelAddBtn" class="btn-purple"
                    onclick="WheelPlugin.addFromUI()">
              Add
            </button>
            <button id="wheelCancelBtn" class="btn-muted"
                    style="display:none"
                    onclick="WheelPlugin.cancelEdit()">
              Cancel
            </button>
          </div>

          <div class="divider">settings</div>

          <div class="two-col">
            <div class="field">
              <label>Spin duration (s)</label>
              <input id="wheelSpinDuration" type="number" min="1" max="15" value="4"
                     oninput="saveField('twitchbot_wheel_spin_duration', this.value)">
            </div>
            <div class="field">
              <label>
                Keep result on screen (s)
                <span class="opt">0 = until next spin</span>
              </label>
              <input id="wheelResultDuration" type="number" min="0" value="0"
                     oninput="saveField('twitchbot_wheel_result_duration', this.value)">
            </div>
          </div>

          <p class="help" style="margin-top:8px; color:#4a4a60">
            Use the <strong style="color:#6a6a80">Positioning</strong> panel
            to drag or resize the wheel anywhere on the overlay.
          </p>

        </div>
      </div>`;
  },

  init() {
    window.WheelPlugin = WheelPlugin;
    WheelPlugin._load();
    WheelPlugin._restoreSettings();
  },

  chatCommands: {

    '!wheel': {
      permission: 'everyone',
      cooldown:   30,
      async handle({ chan }) {
        const names = WheelPlugin._options.map(o => o.label);
        send(chan, names.length
          ? '🎡 Wheel options: ' + names.join(' · ')
          : 'The wheel has no options yet.');
      }
    },

    '!spin': {
      permission: 'moderator',
      cooldown:   10,
      async handle({ chan }) {
        const winner = WheelPlugin.spin();
        if (!winner) {
          send(chan, 'The wheel has no options — add some first!');
          return;
        }
        send(chan, '🎡 Spinning the wheel...');

        const spinMs = WheelPlugin._getSpinDurationMs();
        setTimeout(() => {
          send(chan, `🎉 Landed on: ${winner.label}!`);
        }, spinMs + 300);
      }
    }

  }

});


/* ════════════════════════════════════════
   WHEEL HELPER OBJECT
════════════════════════════════════════ */
const WheelPlugin = {

  _options:     [],
  _editingId:   null,
  _idCounter:   0,


  /* ════════════════════════════════════════
     ID GENERATION — stable, never reused.
  ════════════════════════════════════════ */
  _makeId() {
    this._idCounter = (this._idCounter + 1) % 1_000_000;
    return `wh_${Date.now()}_${this._idCounter}`;
  },


  /* ════════════════════════════════════════
     PERSISTENCE
  ════════════════════════════════════════ */
  _load() {
    try {
      const raw = localStorage.getItem('twitchbot_wheel_options');
      if (raw) this._options = JSON.parse(raw);
    } catch(_) {
      this._options = [];
    }
    this._render();
  },

  _save() {
    try {
      localStorage.setItem('twitchbot_wheel_options', JSON.stringify(this._options));
    } catch(_) {}
  },

  _restoreSettings() {
    const set = (id, key, def) => {
      const el = g(id);
      if (!el) return;
      const val = localStorage.getItem(key);
      el.value = (val !== null && val !== '') ? val : def;
    };
    set('wheelSpinDuration',   'twitchbot_wheel_spin_duration',   4);
    set('wheelResultDuration', 'twitchbot_wheel_result_duration', 0);
  },

  _getSpinDurationMs() {
    const raw = (g('wheelSpinDuration')?.value)
             || localStorage.getItem('twitchbot_wheel_spin_duration')
             || '4';
    const secs = Math.max(1, parseFloat(raw) || 4);
    return Math.round(secs * 1000);
  },

  _getResultDurationSecs() {
    const raw = (g('wheelResultDuration')?.value)
             || localStorage.getItem('twitchbot_wheel_result_duration')
             || '0';
    return Math.max(0, parseFloat(raw) || 0);
  },


  /* ════════════════════════════════════════
     WEIGHTED RANDOM PICK
  ════════════════════════════════════════ */
  _weightedPick(list) {
    const total = list.reduce((sum, o) => sum + (o.weight || 1), 0);
    let   rand  = Math.random() * total;
    for (const item of list) {
      rand -= (item.weight || 1);
      if (rand <= 0) return item;
    }
    return list[list.length - 1];
  },


  /* ════════════════════════════════════════
     SPIN
  ════════════════════════════════════════ */
  spin() {
    if (!this._options.length) return null;

    const winner = this._weightedPick(this._options);

    sendToOverlay({
      type:           'wheel-spin',
      options:        this._options.map(o => ({ id: o.id, label: o.label, weight: o.weight || 1 })),
      winnerId:       winner.id,
      spinDurationMs: this._getSpinDurationMs(),
      resultDuration: this._getResultDurationSecs()
    });

    return winner;
  },

uiSpin() {
  const winner = this.spin();
  if (!winner) {
    logSys('Wheel: no options to spin.', true);
    return;
  }

  /*
   * Post to actual Twitch chat, not just the private dashboard log —
   * this mirrors the !spin chat command's behaviour so the result is
   * visible to viewers regardless of which trigger (chat command or
   * sidebar button) started the spin.
   */
  if (typeof channel === 'undefined' || !channel) {
    logSys('Wheel: not connected to Twitch — spin result only logged locally.', true);
    return;
  }

  send(`#${channel}`, '🎡 Spinning the wheel...');

  const spinMs = this._getSpinDurationMs();
  setTimeout(() => {
    send(`#${channel}`, `🎉 Landed on: ${winner.label}!`);
  }, spinMs + 300);
},


  /* ════════════════════════════════════════
     ADD / EDIT / DELETE
  ════════════════════════════════════════ */
  addFromUI() {
    const label  = (g('wheelOptLabel')?.value  || '').trim();
    const weight = parseInt(g('wheelOptWeight')?.value || '1');

    if (!label) { logSys('Wheel: option label is required.', true); return; }

    const isEdit = this._editingId !== null;
    const entry = {
      id:     isEdit ? this._editingId : this._makeId(),
      label,
      weight: Math.max(1, isNaN(weight) ? 1 : weight)
    };

    if (isEdit) {
      const idx = this._options.findIndex(o => o.id === entry.id);
      if (idx !== -1) this._options[idx] = entry;
    } else {
      this._options.push(entry);
    }

    this._save();
    this._render();
    this.cancelEdit();
  },

  startEdit(id) {
    const opt = this._options.find(o => o.id === id);
    if (!opt) return;

    this._editingId = id;

    const labelEl  = g('wheelOptLabel');
    const weightEl = g('wheelOptWeight');
    if (labelEl)  labelEl.value  = opt.label;
    if (weightEl) weightEl.value = opt.weight || 1;

    const addBtn    = g('wheelAddBtn');
    const cancelBtn = g('wheelCancelBtn');
    const divider   = g('wheelFormDivider');
    if (addBtn)    addBtn.textContent      = 'Update';
    if (cancelBtn) cancelBtn.style.display = '';
    if (divider)   divider.textContent     = 'edit option';

    g('wheelOptLabel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  cancelEdit() {
    this._editingId = null;

    const labelEl  = g('wheelOptLabel');
    const weightEl = g('wheelOptWeight');
    if (labelEl)  labelEl.value  = '';
    if (weightEl) weightEl.value = 1;

    const addBtn    = g('wheelAddBtn');
    const cancelBtn = g('wheelCancelBtn');
    const divider   = g('wheelFormDivider');
    if (addBtn)    addBtn.textContent      = 'Add';
    if (cancelBtn) cancelBtn.style.display = 'none';
    if (divider)   divider.textContent     = 'add option';
  },

  deleteOption(id) {
    this._options = this._options.filter(o => o.id !== id);
    this._save();
    this._render();
    if (this._editingId === id) this.cancelEdit();
  },


  /* ════════════════════════════════════════
     RENDER
     IDs are our own generated strings (safe
     charset, no quotes possible) — embedding
     them directly in onclick is safe here.
     The user-supplied LABEL is never embedded
     in an attribute, only via esc() in text
     content.
  ════════════════════════════════════════ */
  _render() {
    const list = g('wheelOptList');
    if (!list) return;

    if (!this._options.length) {
      list.innerHTML = '<p class="cmd-empty">No options yet — add some below.</p>';
      return;
    }

    list.innerHTML = this._options.map(opt => `
      <div class="cmd-card">
        <div class="cmd-header">
          <div class="cmd-body" style="min-width:0">
            <div class="cmd-name">${esc(opt.label)}</div>
            <div class="cmd-resp">weight: ${opt.weight || 1}</div>
          </div>
          <div class="cmd-btns">
            <button class="btn-xs btn-edit" title="Edit"
                    onclick="WheelPlugin.startEdit('${opt.id}')">✏</button>
            <button class="btn-xs" title="Delete"
                    onclick="WheelPlugin.deleteOption('${opt.id}')">✕</button>
          </div>
        </div>
      </div>`
    ).join('');
  }

};