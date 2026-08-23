/* ════════════════════════════════════════
   DEATH COUNT PLUGIN  v1.2

   Chat commands:
     !death             — +1 death  (permission: configurable in sidebar)
     !deaths            — show count (everyone, 30 s cd)
     !setdeaths <n>     — set count  (mod+)
     !resetdeaths       — reset to 0 (mod+)
     !deathcooldown <s> — change !death cooldown (mod+)
════════════════════════════════════════ */

BotPlugin.define({

  id:      'deathcount',
  name:    'Death Counter',
  version: '1.2',
  positionable: true,   // lets the core Positioning panel find and list this plugin

  sidebarHtml() {
    return `
      <div class="panel" id="panel-deathcount">
        <div class="panel-title" onclick="togglePanel('deathcount')">
          Death Counter <span class="chevron">▾</span>
        </div>
        <div class="panel-body">

          <div id="deathPreview" class="timer-preview idle">0</div>

          <div class="btn-row" style="margin-top:8px">
            <button class="btn-green"  onclick="DeathCountPlugin.uiAdd()">+1 Death</button>
            <button class="btn-orange" onclick="DeathCountPlugin.uiSubtract()">−1</button>
            <button class="btn-red"    onclick="DeathCountPlugin.uiReset()">↺ Reset</button>
          </div>

          <div class="field" style="margin-top:10px">
            <label>Label <span class="opt">(shown on overlay)</span></label>
            <input id="deathLabelInput" type="text"
                   placeholder="💀 Deaths"
                   autocomplete="off" spellcheck="false"
                   oninput="saveField('twitchbot_death_label', this.value);
                            DeathCountPlugin._sync()">
          </div>

          <div class="two-col">
            <div class="field">
              <label>!death Permission</label>
              <select id="deathPermSelect"
                      onchange="saveField('twitchbot_death_perm', this.value)">
                <option value="everyone">Everyone</option>
                <option value="vip">VIP+</option>
                <option value="moderator" selected>Mod+</option>
                <option value="streamer">Streamer only</option>
              </select>
            </div>
            <div class="field">
              <label>Cooldown (s)</label>
              <input id="deathCooldownInput" type="number" min="0" step="1" value="0"
                     autocomplete="off"
                     oninput="saveField('twitchbot_death_cooldown', this.value)">
            </div>
          </div>

          <div class="divider">Overlay Appearance</div>

          <div class="two-col">
            <div class="field">
              <label>Position</label>
              <select id="deathPosSelect"
                      onchange="saveField('twitchbot_death_pos', this.value);
                                DeathCountPlugin._sync()">
                <option value="pos-tl" selected>Top Left</option>
                <option value="pos-tr">Top Right</option>
                <option value="pos-bl">Bottom Left</option>
                <option value="pos-br">Bottom Right</option>
                <option value="pos-c">Center</option>
              </select>
            </div>
            <div class="field">
              <label>Size</label>
              <select id="deathSizeSelect"
                      onchange="saveField('twitchbot_death_size', this.value);
                                DeathCountPlugin._sync()">
                <option value="3.5rem">Small</option>
                <option value="5rem" selected>Normal</option>
                <option value="7rem">Large</option>
                <option value="10rem">X-Large</option>
              </select>
            </div>
          </div>

          <p class="help" style="margin-top:8px; color:#4a4a60">
            Use the <strong style="color:#6a6a80">Positioning</strong> panel
            to drag this element anywhere on the overlay.
          </p>

        </div>
      </div>`;
  },

  init() {
    window.DeathCountPlugin = DeathCountPlugin;
    DeathCountPlugin._restore();
    DeathCountPlugin._updateSidebarUI();
    DeathCountPlugin._sync();
  },

  chatCommands: {

    '!death': {
      get permission() {
        try   { return localStorage.getItem('twitchbot_death_perm') || 'moderator'; }
        catch(_) { return 'moderator'; }
      },
      get cooldown() {
        try   { return parseInt(localStorage.getItem('twitchbot_death_cooldown') || '0') || 0; }
        catch(_) { return 0; }
      },
      async handle({ chan }) {
        DeathCountPlugin.add(1);
        send(chan, `💀 ${DeathCountPlugin._getLabel()}: ${DeathCountPlugin._count}`);
      }
    },

    '!deaths': {
      permission: 'everyone',
      cooldown:   30,
      async handle({ chan }) {
        send(chan, `💀 ${DeathCountPlugin._getLabel()}: ${DeathCountPlugin._count}`);
      }
    },

    '!setdeaths': {
      permission: 'moderator',
      cooldown:   0,
      async handle({ parts, chan }) {
        const n = parseInt(parts[1]);
        if (isNaN(n) || n < 0) { send(chan, 'Usage: !setdeaths <number>'); return; }
        DeathCountPlugin.setCount(n);
        send(chan, `💀 ${DeathCountPlugin._getLabel()} set to ${n}`);
      }
    },

    '!resetdeaths': {
      permission: 'moderator',
      cooldown:   0,
      async handle({ chan }) {
        DeathCountPlugin.setCount(0);
        send(chan, '💀 Death count reset to 0');
      }
    },

    '!deathcooldown': {
      permission: 'moderator',
      cooldown:   0,
      async handle({ parts, chan }) {
        const s = parseInt(parts[1]);
        if (isNaN(s) || s < 0) { send(chan, 'Usage: !deathcooldown <seconds>'); return; }
        DeathCountPlugin.setCooldown(s);
        send(chan, `💀 Death command cooldown set to ${s}s`);
      }
    }

  }

});


/* ════════════════════════════════════════
   DEATH COUNT HELPER OBJECT
════════════════════════════════════════ */
const DeathCountPlugin = {

  _count: 0,

  add(n = 1) {
    this._count = Math.max(0, this._count + n);
    this._saveCount();
    this._sync();
    this._updateSidebarUI();
  },

  subtract(n = 1) {
    this._count = Math.max(0, this._count - n);
    this._saveCount();
    this._sync();
    this._updateSidebarUI();
  },

  setCount(n) {
    this._count = Math.max(0, Math.round(n));
    this._saveCount();
    this._sync();
    this._updateSidebarUI();
  },

  setCooldown(s) {
    try { localStorage.setItem('twitchbot_death_cooldown', String(s)); } catch(_) {}
    const el = g('deathCooldownInput');
    if (el) el.value = s;
  },

  uiAdd()      { this.add(1); },
  uiSubtract() { this.subtract(1); },
  uiReset()    { this.setCount(0); },

  _getLabel() {
    const el = g('deathLabelInput');
    return (el && el.value.trim())
        || localStorage.getItem('twitchbot_death_label')
        || 'Deaths';
  },

  _saveCount() {
    try { localStorage.setItem('twitchbot_death_count', String(this._count)); } catch(_) {}
  },

  _restore() {
    try {
      this._count = parseInt(localStorage.getItem('twitchbot_death_count') || '0') || 0;

      const set = (id, val) => { const el = g(id); if (el) el.value = val; };
      set('deathLabelInput',    localStorage.getItem('twitchbot_death_label')    || '💀 Deaths');
      set('deathPermSelect',    localStorage.getItem('twitchbot_death_perm')     || 'moderator');
      set('deathCooldownInput', localStorage.getItem('twitchbot_death_cooldown') || '0');
      set('deathPosSelect',     localStorage.getItem('twitchbot_death_pos')      || 'pos-tl');
      set('deathSizeSelect',    localStorage.getItem('twitchbot_death_size')     || '5rem');
    } catch(_) {}
  },

  _sync() {
    const state = {
      count: this._count,
      label: this._getLabel(),
      pos:  (g('deathPosSelect')  && g('deathPosSelect').value)
         ||  localStorage.getItem('twitchbot_death_pos')  || 'pos-tl',
      size: (g('deathSizeSelect') && g('deathSizeSelect').value)
         ||  localStorage.getItem('twitchbot_death_size') || '5rem'
    };

    try { localStorage.setItem('twitchbot_death_state', JSON.stringify(state)); } catch(_) {}
    sendToOverlay({ type: 'deathcount-update', state });
  },

  _updateSidebarUI() {
    const preview = g('deathPreview');
    if (!preview) return;

    preview.textContent = String(this._count);
    preview.className   = this._count > 0 ? 'timer-preview' : 'timer-preview idle';
  }

};