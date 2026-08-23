/* ════════════════════════════════════════
   TIMER PLUGIN  v1.3  —  bot side

   Countdown timer with overlay display.

   Chat commands (mod+):
     !timer 5:00
     !timer pause / resume / reset / stop
════════════════════════════════════════ */

BotPlugin.define({

  id:      'timer',
  name:    'Timer',
  version: '1.3',
  positionable: true,

  sidebarHtml() {
    return `
      <div class="panel" id="panel-timer">
        <div class="panel-title" onclick="togglePanel('timer')">
          Timer <span class="chevron">▾</span>
        </div>
        <div class="panel-body">

          <div id="timerPreview" class="timer-preview idle">--:--</div>

          <div class="field" style="margin-top:8px">
            <label>Duration</label>
            <input id="timerInput" type="text"
                   placeholder="5:00  or  300  or  1:30:00"
                   autocomplete="off" spellcheck="false">
          </div>

          <div class="field">
            <label>
              Label
              <span class="opt">(shown on overlay)</span>
            </label>
            <input id="timerLabelInput" type="text"
                   placeholder="e.g. BRB Timer"
                   autocomplete="off" spellcheck="false">
          </div>

          <div class="field">
            <label>
              End Sound
              <span class="opt">(plays when timer hits zero)</span>
            </label>
            <select id="timerEndSound"
                    onchange="saveField('twitchbot_timer_end_sound', this.value)">
              <option value="">None</option>
            </select>
          </div>

          <div class="btn-row">
            <button id="timerStartBtn"
                    class="btn-green"
                    onclick="TimerPlugin.uiStart()">
              ▶ Start
            </button>
            <button id="timerPauseBtn"
                    class="btn-orange"
                    onclick="TimerPlugin.uiPauseResume()"
                    disabled>
              ⏸ Pause
            </button>
            <button id="timerResetBtn"
                    class="btn-red"
                    onclick="TimerPlugin.uiReset()"
                    disabled>
              ↺ Reset
            </button>
          </div>

          <p class="help" style="margin-top:8px; color:#4a4a60">
            Use the <strong style="color:#6a6a80">Positioning</strong> panel
            to drag this element anywhere on the overlay. Use the plugin's
            own enable switch above to hide it entirely.
          </p>

        </div>
      </div>`;
  },

  init() {
    window.TimerPlugin = TimerPlugin;
    TimerPlugin._restore();
    if (window.SoundsPlugin) SoundsPlugin._updateEndSoundSelect();
    TimerPlugin._startSidebarTick();
  },

  chatCommands: {

    '!timer': {
      permission: 'moderator',
      cooldown:   0,
      async handle({ parts, chan }) {
        const arg = (parts[1] || '').toLowerCase();
        if (!arg) { send(chan, 'Usage: !timer <time|pause|resume|reset|stop>'); return; }

        const t = TimerPlugin;
        if (arg === 'pause') {
          if (!t._running) return;
          t.pause();
          send(chan, `⏱ Timer paused — ${fmtDur(t._remaining)} remaining`);
        } else if (arg === 'resume') {
          if (t._running || t._remaining <= 0) return;
          t.resume();
          send(chan, '⏱ Timer resumed');
        } else if (arg === 'reset') {
          if (t._duration <= 0) return;
          t.reset();
          send(chan, `⏱ Timer reset to ${fmtDur(t._duration)}`);
        } else if (arg === 'stop') {
          t.clear();
          send(chan, '⏱ Timer stopped');
        } else {
          const secs = parseTimeDuration(parts[1]);
          if (secs <= 0) { send(chan, 'Usage: !timer 5:00'); return; }
          t.set(secs, '');
          t.start();
          send(chan, `⏱ Timer started: ${fmtDur(secs)}`);
        }
      }
    }

  }

});


/* ════════════════════════════════════════
   TIMER HELPER OBJECT
════════════════════════════════════════ */
const TimerPlugin = {

  _duration:  0,
  _remaining: 0,
  _running:   false,
  _endTime:   null,
  _label:     '',

  _sidebarTick: null,


  /* ── Public API ── */

  set(secs, label) {
    this._stopInternal();
    this._duration  = Math.max(0, secs);
    this._remaining = this._duration;
    this._running   = false;
    this._endTime   = null;
    this._label     = label || '';
    this._sync();
    this._updateSidebarUI();
  },

  start() {
    if (this._duration <= 0) return;
    if (this._remaining <= 0) this._remaining = this._duration;
    this._running = true;
    this._endTime = Date.now() + this._remaining * 1000;
    this._sync();
    this._updateSidebarUI();
  },

  pause() {
    if (!this._running) return;
    this._remaining = Math.max(0, (this._endTime - Date.now()) / 1000);
    this._running   = false;
    this._endTime   = null;
    this._sync();
    this._updateSidebarUI();
  },

  resume() {
    if (!this._running && this._remaining > 0) this.start();
  },

  reset() {
    this._stopInternal();
    this._remaining = this._duration;
    this._sync();
    this._updateSidebarUI();
  },

  clear() {
    this._stopInternal();
    this._duration  = 0;
    this._remaining = 0;
    this._label     = '';
    this._sync();
    this._updateSidebarUI();
  },


  /* ── Sync ── */

  _sync() {
    const s = {
      duration:  this._duration,
      remaining: this._remaining,
      running:   this._running,
      endTime:   this._endTime,
      label:     this._label,
      pos:  (g('selTimerPos')  && g('selTimerPos').value)  || 'pos-br',
      size: (g('selTimerSize') && g('selTimerSize').value) || '5rem'
    };
    try { localStorage.setItem('twitchbot_timer', JSON.stringify(s)); } catch(_) {}
    sendToOverlay({ type: 'timer-state', state: s });
  },

  _restore() {
    try {
      const raw = localStorage.getItem('twitchbot_timer');
      if (!raw) return;
      const s = JSON.parse(raw);
      this._duration  = s.duration  || 0;
      this._remaining = s.remaining || 0;
      this._running   = s.running   || false;
      this._endTime   = s.endTime   || null;
      this._label     = s.label     || '';

      if (this._running && this._endTime) {
        const rem = (this._endTime - Date.now()) / 1000;
        if (rem > 0) { this._remaining = rem; }
        else         { this._remaining = 0; this._running = false; this._endTime = null; }
      }
    } catch(_) {}
  },


  /* ── Sidebar tick ── */

  _startSidebarTick() {
    if (this._sidebarTick) return;
    this._sidebarTick = setInterval(() => this._tick(), 100);
  },

  _tick() {
    if (!this._running || !this._endTime) return;
    const rem = (this._endTime - Date.now()) / 1000;
    if (rem <= 0) {
      this._remaining = 0;
      this._running   = false;
      this._endTime   = null;
      this._onFinished();
    } else {
      this._remaining = rem;
    }
    this._updateSidebarUI();
  },

  _onFinished() {
    this._sync();
    sendToOverlay({ type: 'timer-finished' });

    const endSound = (g('timerEndSound') && g('timerEndSound').value)
                   || localStorage.getItem('twitchbot_timer_end_sound')
                   || '';
    if (endSound && window.SoundsPlugin) SoundsPlugin.play(endSound);
  },


  /* ── Sidebar UI ── */

  _updateSidebarUI() {
    const preview  = g('timerPreview');
    const startBtn = g('timerStartBtn');
    const pauseBtn = g('timerPauseBtn');
    const resetBtn = g('timerResetBtn');

    if (!preview) return;

    if (this._duration === 0) {
      preview.textContent = '--:--';
      preview.className   = 'timer-preview idle';
    } else if (this._remaining <= 0) {
      preview.textContent = "Time's up!";
      preview.className   = 'timer-preview finished';
    } else {
      preview.textContent = fmtDur(this._remaining);
      preview.className   = 'timer-preview'
        + (this._remaining <= 10 && this._running ? ' urgent' : '');
    }

    if (startBtn) {
      startBtn.disabled    = this._running;
      startBtn.textContent = (!this._running
        && this._remaining > 0
        && this._remaining < this._duration)
        ? '▶ Resume' : '▶ Start';
    }
    if (pauseBtn) pauseBtn.disabled = !this._running;
    if (resetBtn) resetBtn.disabled = this._duration === 0;
  },


  /* ── UI button handlers ── */

  uiStart() {
    const raw   = g('timerInput')  && g('timerInput').value.trim();
    const label = g('timerLabelInput') && g('timerLabelInput').value.trim() || '';
    if (raw) {
      const secs = parseTimeDuration(raw);
      if (secs > 0) { this.set(secs, label); this.start(); return; }
    }
    if (this._remaining > 0 && !this._running) this.start();
  },

  uiPauseResume() {
    if (this._running) this.pause();
    else if (this._remaining > 0) this.resume();
  },

  uiReset() { this.reset(); },


  /* ── Internal helpers ── */

  _stopInternal() {
    this._running = false;
    this._endTime = null;
  }

};