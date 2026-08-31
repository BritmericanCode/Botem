/* ════════════════════════════════════════
   TIMER PLUGIN  —  overlay side
════════════════════════════════════════ */

OverlayPlugin.register('timer', {

  _interval: null,
  _state:    null,

  init() {
    if (document.getElementById('timerDisplay')) return;

    const style = document.createElement('style');
    style.textContent = `
      #timerDisplay {
        position:       fixed;
        z-index:        900;
        display:        flex;
        flex-direction: column;
        align-items:    center;
        line-height:    1.1;
        font-family:    'Arial Black', Impact, sans-serif;
        font-weight:    900;
        color:          #fff;
        text-shadow:
          -2px -2px 0 #000,
           2px -2px 0 #000,
          -2px  2px 0 #000,
           2px  2px 0 #000,
           0    0  10px rgba(0,0,0,0.9);
        pointer-events: none;
        user-select:    none;
        width:          max-content;
        max-width:      calc(100vw - 20px);
      }

      #timerLabel {
        font-size:      0.45em;
        opacity:        0.9;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      #timerTime {
        font-size: 5rem;
      }

      #timerDisplay.urgent #timerTime {
        color:     #ff4040;
        animation: timer-pulse 0.5s ease-in-out infinite alternate;
      }

      @keyframes timer-pulse {
        from { opacity: 1;   }
        to   { opacity: 0.4; }
      }

      #timerDisplay.pos-tl { top: 20px;    left: 20px;  }
      #timerDisplay.pos-tr { top: 20px;    right: 20px; }
      #timerDisplay.pos-bl { bottom: 20px; left: 20px;  }
      #timerDisplay.pos-br { bottom: 20px; right: 20px; }
      #timerDisplay.pos-c  {
        top: 50%; left: 50%;
        transform: translate(-50%, -50%);
      }
    `;
    document.head.appendChild(style);

    const wrap     = document.createElement('div');
    wrap.id        = 'timerDisplay';
    wrap.innerHTML = `
      <span id="timerLabel"></span>
      <span id="timerTime">--:--</span>
    `;
    document.body.appendChild(wrap);

    try {
      const raw = localStorage.getItem('twitchbot_timer');
      if (raw) this._applyState(JSON.parse(raw));
    } catch(_) {}

    this._interval = setInterval(() => this._tick(), 100);
  },

  handles: ['timer-state', 'timer-finished'],

  onMessage(msg) {
    if (msg.type === 'timer-state')    this._applyState(msg.state);
    if (msg.type === 'timer-finished') this._onFinished();
  },

  onDisable() {
    const wrap = document.getElementById('timerDisplay');
    if (wrap) wrap.hidden = true;
  },

  onEnable() {
    const wrap = document.getElementById('timerDisplay');
    if (wrap) wrap.hidden = false;
    if (this._state) this._applyState(this._state);
  },

  positioning: {
    el:         () => document.getElementById('timerDisplay'),
    storageKey: 'twitchbot_pos_timer',
    default:    { xPct: 80, yPct: 80, scale: 100 },
    resizable:  true
  },


  /* ── Apply full state snapshot from bot ── */

  _applyState(s) {
    if (!s) return;
    this._state = s;

    const wrap  = document.getElementById('timerDisplay');
    const label = document.getElementById('timerLabel');
    const time  = document.getElementById('timerTime');
    if (!wrap) return;

    if (label) label.textContent  = s.label || '';
    if (time)  time.style.fontSize = s.size  || '5rem';

    wrap.className = s.pos || 'pos-br';

    this._updateDisplay();

    PositionEditor.applyStoredPosition('timer');
  },


  /* ── Timer finished ── */

  _onFinished() {
    const wrap = document.getElementById('timerDisplay');
    const time = document.getElementById('timerTime');
    if (time) time.textContent = "Time's up!";
    if (wrap) wrap.classList.remove('urgent');
  },


  /* ── Local tick — interpolates between bot state pushes ── */

  _tick() {
    const s = this._state;
    if (!s || !s.running || !s.endTime) return;

    const rem = (s.endTime - Date.now()) / 1000;
    if (rem <= 0) {
      s.remaining = 0;
      s.running   = false;
      this._onFinished();
    } else {
      s.remaining = rem;
      this._updateDisplay();
    }
  },


  /* ── Update the time text + urgent class ── */

  _updateDisplay() {
    const s    = this._state;
    const wrap = document.getElementById('timerDisplay');
    const time = document.getElementById('timerTime');
    if (!s || !time || !wrap) return;

    if (s.remaining <= 0) {
      time.textContent = "Time's up!";
      wrap.classList.remove('urgent');
    } else {
      time.textContent = this._fmt(s.remaining);
      if (s.remaining <= 10 && s.running) {
        wrap.classList.add('urgent');
      } else {
        wrap.classList.remove('urgent');
      }
    }
  },


  /* ── Format seconds → MM:SS or H:MM:SS ── */

  _fmt(secs) {
    secs = Math.max(0, Math.ceil(secs));
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    const p = n => String(n).padStart(2, '0');
    return h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
  }

});