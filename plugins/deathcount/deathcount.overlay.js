/* ════════════════════════════════════════
   DEATH COUNT PLUGIN  —  overlay side
════════════════════════════════════════ */

OverlayPlugin.register('deathcount', {

  _prevCount: null,

  init() {

    const style = document.createElement('style');
    style.textContent = `
      #deathCounter {
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
      }

      #deathCounterLabel {
        font-size:      0.45em;
        opacity:        0.9;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      #deathCounterNum {
        font-size: 5rem;
      }

      @keyframes death-pop {
        0%   { transform: scale(1);   color: #fff; }
        40%  { transform: scale(1.4); color: #ff4040; }
        100% { transform: scale(1);   color: #fff; }
      }
      #deathCounterNum.popping {
        animation: death-pop 0.45s ease-out forwards;
      }

      #deathCounter.pos-tl { top: 20px;    left: 20px;  }
      #deathCounter.pos-tr { top: 20px;    right: 20px; }
      #deathCounter.pos-bl { bottom: 20px; left: 20px;  }
      #deathCounter.pos-br { bottom: 20px; right: 20px; }
      #deathCounter.pos-c  {
        top: 50%; left: 50%;
        transform: translate(-50%, -50%);
      }
    `;
    document.head.appendChild(style);

    const wrap     = document.createElement('div');
    wrap.id        = 'deathCounter';
    wrap.className = 'pos-tl';
    wrap.innerHTML = `
      <span id="deathCounterLabel">💀 Deaths</span>
      <span id="deathCounterNum">0</span>
    `;
    document.body.appendChild(wrap);

    try {
      const raw = localStorage.getItem('twitchbot_death_state');
      if (raw) this._apply(JSON.parse(raw), false);
    } catch(_) {}
  },

  handles: ['deathcount-update'],

  onMessage(msg) {
    this._apply(msg.state, true);
  },

  onDisable() {
    const wrap = document.getElementById('deathCounter');
    if (wrap) wrap.style.display = 'none';
  },

  onEnable() {
    const wrap = document.getElementById('deathCounter');
    if (wrap) wrap.style.display = '';
  },

  /*
   * Declares this element as positionable. The core PositionEditor
   * (in overlay.js) uses this to know which DOM element to drag,
   * where to save the custom position, and what to fall back to
   * if no custom position has been set yet.
   */
  positioning: {
    el:         () => document.getElementById('deathCounter'),
    storageKey: 'twitchbot_pos_deathcount',
    default:    { xPct: 3, yPct: 3, scale: 100 },
    resizable:  true
  },

  _apply(state, animate) {
    if (!state) return;

    const wrap  = document.getElementById('deathCounter');
    const label = document.getElementById('deathCounterLabel');
    const num   = document.getElementById('deathCounterNum');
    if (!wrap) return;

    if (label) label.textContent = state.label || '💀 Deaths';

    const newCount = state.count ?? 0;
    if (num) {
      const didIncrease = animate
        && this._prevCount !== null
        && newCount > this._prevCount;

      num.textContent    = newCount;
      num.style.fontSize = state.size || '5rem';

      if (didIncrease) {
        num.classList.remove('popping');
        void num.offsetWidth;
        num.classList.add('popping');
      }
    }
    this._prevCount = newCount;

    wrap.className = state.pos || 'pos-tl';

    /*
     * Reapply any custom drag position AFTER the className above.
     * Inline style (set by applyStoredPosition) always wins over the
     * class-based CSS rule for the same properties, so this keeps a
     * custom position "sticky" across every future state update —
     * without this, the className assignment above would have nothing
     * overriding it, and a dragged position would only last until the
     * next chat command changed the count.
     */
    PositionEditor.applyStoredPosition('deathcount');
  }

});