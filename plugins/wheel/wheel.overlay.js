/* ════════════════════════════════════════
   WHEEL PLUGIN  —  overlay side

   Wedge size is proportional to each option's
   weight — the visual honestly matches the
   real odds, not just equal slices.

   Shows an empty placeholder wheel as soon as
   the plugin is enabled, even before the first
   spin. Supports drag-resize via the core
   PositionEditor (positioning.resizable: true).
════════════════════════════════════════ */

OverlayPlugin.register('wheel', {

  _wrap:      null,
  _wheelEl:   null,
  _resultEl:  null,
  _styleEl:   null,
  _rotation:  0,
  _hideTimer: null,

  _RADIUS: 160,   // px — half the wheel's diameter (320px)

  init() {
    const style = document.createElement('style');
    style.textContent = `
      #wheelWrap {
        position:       fixed;
        z-index:         850;
        display:         flex;
        flex-direction:  column;
        align-items:     center;
        gap:             10px;
        user-select:     none;
      }
      #wheelPointer {
        width:  0;
        height: 0;
        border-left:   14px solid transparent;
        border-right:  14px solid transparent;
        border-top:    22px solid #fff;
        filter: drop-shadow(0 2px 2px rgba(0,0,0,.6));
        margin-bottom: -4px;
        z-index: 2;
      }
      #wheelCircle {
        width:  320px;
        height: 320px;
        border-radius: 50%;
        border: 6px solid #fff;
        box-shadow: 0 4px 20px rgba(0,0,0,.5);
        position: relative;
        overflow: hidden;
        background: #3a3a3d;
      }
      #wheelCircle.wheel-empty::after {
        content: 'Add options in the\\A Wheel panel';
        white-space: pre;
        position: absolute;
        top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        color: #9a9aa8;
        font-family: 'Segoe UI', system-ui, sans-serif;
        font-size: 15px;
        text-align: center;
        line-height: 1.4;
      }
      .wheel-label-wrap {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 0;
        height: 0;
      }
      .wheel-label-text {
        position: absolute;
        left: 0;
        transform: translateX(-50%);
        color: #fff;
        font-family: 'Segoe UI', system-ui, sans-serif;
        font-weight: 700;
        font-size: 15px;
        text-shadow: 1px 1px 3px rgba(0,0,0,.9), 0 0 4px rgba(0,0,0,.6);
        white-space: nowrap;
        max-width: 110px;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #wheelResult {
        font-family: 'Arial Black', Impact, sans-serif;
        font-weight: 900;
        font-size: 1.6rem;
        color: #fff;
        text-shadow:
          -2px -2px 0 #000, 2px -2px 0 #000,
          -2px  2px 0 #000, 2px  2px 0 #000;
        text-align: center;
        opacity: 0;
        transition: opacity .3s ease;
      }
      #wheelResult.visible { opacity: 1; }
    `;
    document.head.appendChild(style);
    this._styleEl = style;

    const wrap = document.createElement('div');
    wrap.id     = 'wheelWrap';
    wrap.hidden = true;
    wrap.innerHTML = `
      <div id="wheelPointer"></div>
      <div id="wheelCircle" class="wheel-empty"></div>
      <div id="wheelResult"></div>
    `;
    document.body.appendChild(wrap);

    this._wrap     = wrap;
    this._wheelEl  = wrap.querySelector('#wheelCircle');
    this._resultEl = wrap.querySelector('#wheelResult');

    try {
      const raw = localStorage.getItem('twitchbot_wheel_state');
      if (raw) this._restoreStatic(JSON.parse(raw));
    } catch(_) {}

    PositionEditor.applyStoredPosition('wheel');
  },

  handles: ['wheel-spin'],

  onMessage(msg) {
    if (msg.type === 'wheel-spin') this._doSpin(msg);
  },

  onDisable() {
    if (this._wrap) this._wrap.hidden = true;
    if (this._hideTimer) { clearTimeout(this._hideTimer); this._hideTimer = null; }
  },

  /*
   * Show the wheel immediately on enable, even if no spin has ever
   * happened — an empty placeholder wheel (styled via .wheel-empty)
   * rather than nothing at all, so the streamer can see and position
   * it before the first real spin.
   */
  onEnable() {
    if (this._wrap) this._wrap.hidden = false;
    PositionEditor.applyStoredPosition('wheel');
  },

  positioning: {
    el:         () => document.getElementById('wheelWrap'),
    storageKey: 'twitchbot_pos_wheel',
    default:    { xPct: 38, yPct: 15, scale: 100 },
    resizable:  true
  },


  /* ════════════════════════════════════════
     BUILD SEGMENTS
  ════════════════════════════════════════ */
  _buildSegments(options) {
    const total = options.reduce((sum, o) => sum + (o.weight || 1), 0);
    let cursor = 0;
    return options.map((o, i) => {
      const span  = ((o.weight || 1) / total) * 360;
      const start = cursor;
      const end   = cursor + span;
      cursor = end;
      return {
        id:     o.id,
        label:  o.label,
        color:  WheelPluginColours(i),
        startDeg: start,
        endDeg:   end,
        midDeg:   start + span / 2
      };
    });
  },

  _renderWheel(segments) {
    if (!this._wheelEl) return;

    this._wheelEl.classList.remove('wheel-empty');

    const stops = segments
      .map(s => `${s.color} ${s.startDeg}deg ${s.endDeg}deg`)
      .join(', ');
    this._wheelEl.style.background = `conic-gradient(${stops})`;

    this._wheelEl.querySelectorAll('.wheel-label-wrap').forEach(el => el.remove());

    segments.forEach(s => {
      const labelWrap = document.createElement('div');
      labelWrap.className = 'wheel-label-wrap';
      labelWrap.style.transform = `rotate(${s.midDeg}deg)`;

      const text = document.createElement('span');
      text.className   = 'wheel-label-text';
      text.style.top   = `-${this._RADIUS - 30}px`;
      text.textContent = s.label;

      labelWrap.appendChild(text);
      this._wheelEl.appendChild(labelWrap);
    });
  },


  /* ════════════════════════════════════════
     SPIN ANIMATION
  ════════════════════════════════════════ */
  _doSpin(msg) {
    const options = msg.options || [];
    if (!options.length || !this._wheelEl) return;

    const segments = this._buildSegments(options);
    this._renderWheel(segments);

    const winnerSeg = segments.find(s => s.id === msg.winnerId);
    if (!winnerSeg) return;

    this._wrap.hidden = false;
    if (this._resultEl) this._resultEl.classList.remove('visible');
    if (this._hideTimer) { clearTimeout(this._hideTimer); this._hideTimer = null; }

    const spinMs = msg.spinDurationMs || 4000;

    const targetMod = (360 - winnerSeg.midDeg) % 360;
    const extraSpins = 4 + Math.floor(Math.random() * 3);
    const base = Math.ceil(this._rotation / 360) * 360;
    let newRotation = base + extraSpins * 360 + targetMod;
    while (newRotation <= this._rotation) newRotation += 360;

    this._wheelEl.style.transition = 'none';
    void this._wheelEl.offsetWidth;

    this._wheelEl.style.transition = `transform ${spinMs}ms cubic-bezier(0.12, 0.72, 0.15, 1)`;
    requestAnimationFrame(() => {
      this._wheelEl.style.transform = `rotate(${newRotation}deg)`;
    });

    this._rotation = newRotation;

    setTimeout(() => {
      if (this._resultEl) {
        this._resultEl.textContent = `🎉 ${winnerSeg.label}!`;
        this._resultEl.classList.add('visible');
      }

      this._persistState(segments, winnerSeg, newRotation % 360);

      const resultSecs = msg.resultDuration || 0;
      if (resultSecs > 0) {
        this._hideTimer = setTimeout(() => {
          this._wrap.hidden = true;
          this._hideTimer = null;
        }, resultSecs * 1000);
      }
    }, spinMs);

    PositionEditor.applyStoredPosition('wheel');
  },


  /* ════════════════════════════════════════
     PERSIST / RESTORE (static, no animation)
  ════════════════════════════════════════ */
  _persistState(segments, winnerSeg, restingDeg) {
    try {
      localStorage.setItem('twitchbot_wheel_state', JSON.stringify({
        segments: segments.map(s => ({ id: s.id, label: s.label, color: s.color, startDeg: s.startDeg, endDeg: s.endDeg })),
        winnerLabel: winnerSeg.label,
        restingDeg
      }));
    } catch(_) {}
  },

  _restoreStatic(state) {
    if (!state || !state.segments?.length) return;

    this._renderWheel(state.segments.map(s => ({
      ...s, midDeg: s.startDeg + (s.endDeg - s.startDeg) / 2
    })));

    this._wheelEl.style.transition = 'none';
    this._wheelEl.style.transform  = `rotate(${state.restingDeg || 0}deg)`;
    this._rotation = state.restingDeg || 0;

    if (this._resultEl && state.winnerLabel) {
      this._resultEl.textContent = `🎉 ${state.winnerLabel}!`;
      this._resultEl.classList.add('visible');
    }

    this._wrap.hidden = false;
  }

});

function WheelPluginColours(i) {
  const palette = [
    '#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6',
    '#e67e22', '#1abc9c', '#e84393', '#00b894', '#0984e3'
  ];
  return palette[i % palette.length];
}