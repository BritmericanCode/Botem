/* ════════════════════════════════════════
   CHAT OVERLAY PLUGIN  v1.4  —  overlay side

   No anchor system — the container always starts
   at a single fixed default position (bottom-left
   margin) and is fully repositioned via drag.
   PositionEditor's saved position always wins
   once one exists, same pattern as Timer and
   Death Counter.
════════════════════════════════════════ */

OverlayPlugin.register('chatoverlay', {

  handles: ['chatoverlay-message', 'chatoverlay-settings'],

  _settings:    null,
  _messages:    [],
  _idCounter:   0,
  _idleTimer:   null,
  _container:   null,
  _styleEl:     null,

  _defaults: {
    direction:    'up',
    width:        400,
    maxMsgs:      8,
    style:        'simple',
    fontSize:     18,
    bgOpacity:    60,
    textOpacity:  100,
    nameColour:   'twitch',
    radius:       6,
    animation:    'fade',
    animSpeed:    '0.3s',
    fadeAfter:    0,
    clearIdle:    0,
    hidePatterns: '',
    hideBot:      false,
    hideCommands: true
  },


  /* ════════════════════════════════════════
     INIT
  ════════════════════════════════════════ */
  init() {
    try {
      const raw = localStorage.getItem('twitchbot_chatoverlay');
      this._settings = raw
        ? Object.assign({}, this._defaults, JSON.parse(raw))
        : Object.assign({}, this._defaults);
    } catch(_) {
      this._settings = Object.assign({}, this._defaults);
    }

    this._buildDOM();
    this._applySettings();
  },

  _buildDOM() {
    const el  = document.createElement('div');
    el.id     = 'chatOverlayContainer';
    document.body.appendChild(el);
    this._container = el;

    const style = document.createElement('style');
    style.id    = 'chatOverlayStyles';
    document.head.appendChild(style);
    this._styleEl = style;
  },


  /* ════════════════════════════════════════
     MESSAGE DISPATCH
  ════════════════════════════════════════ */
  onMessage(msg) {
    switch (msg.type) {
      case 'chatoverlay-message':  this._addMessage(msg);              break;
      case 'chatoverlay-settings': this._onSettingsUpdate(msg.settings); break;
    }
  },

  onDisable() {
    this._clearAll();
    if (this._container) this._container.style.display = 'none';
  },

  onEnable() {
    if (this._container) this._container.style.display = 'flex';
  },

  /*
   * Declares the message container as positionable. PositionEditor's
   * saved drag position, if any, is applied in _applySettings() below
   * and always wins over the fixed default start position.
   */
  positioning: {
    el:         () => document.getElementById('chatOverlayContainer'),
    storageKey: 'twitchbot_pos_chatoverlay',
    default:    { xPct: 3, yPct: 70, scale: 100 },
    resizable:  true
  },

  _onSettingsUpdate(incoming) {
    if (!incoming) return;
    const oldDir = this._settings.direction;

    this._settings = Object.assign({}, this._defaults, incoming);

    try {
      localStorage.setItem('twitchbot_chatoverlay', JSON.stringify(this._settings));
    } catch(_) {}

    if (this._settings.direction !== oldDir) {
      this._clearAll();
    }

    this._applySettings();
  },


  /* ════════════════════════════════════════
     ADD MESSAGE
  ════════════════════════════════════════ */
  _addMessage(msg) {
    if (msg.settings) {
      const oldDir = this._settings.direction;

      this._settings = Object.assign({}, this._defaults, msg.settings);

      try {
        localStorage.setItem(
          'twitchbot_chatoverlay',
          JSON.stringify(this._settings)
        );
      } catch(_) {}

      if (this._settings.direction !== oldDir) {
        this._clearAll();
      }
      this._applySettings();
    }

    const s  = this._settings;
    const id = ++this._idCounter;

    const el      = document.createElement('div');
    el.className  = `co-message co-style-${s.style} co-anim-${s.animation}`;
    el.dataset.id = id;

    const nameSpan       = document.createElement('span');
    nameSpan.className   = 'co-name';
    nameSpan.textContent = msg.name;

    if (s.nameColour === 'twitch' && msg.colour) {
      nameSpan.style.color = msg.colour;
    } else if (s.nameColour === 'accent') {
      nameSpan.style.color = '#9147ff';
    } else {
      nameSpan.style.color = '#fff';
    }

    const textSpan       = document.createElement('span');
    textSpan.className   = 'co-text';
    textSpan.textContent = ': ' + msg.text;

    el.appendChild(nameSpan);
    el.appendChild(textSpan);

    if (s.direction === 'down') {
      this._container.insertBefore(el, this._container.firstChild || null);
    } else {
      this._container.appendChild(el);
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => el.classList.add('co-visible'));
    });

    const entry = { id, el, fadeTimer: null };
    this._messages.push(entry);

    while (this._messages.length > (s.maxMsgs || 8)) {
      const oldest = this._messages.shift();
      if (oldest.fadeTimer) clearTimeout(oldest.fadeTimer);
      this._removeElement(oldest.el);
    }

    if (s.fadeAfter > 0) {
      entry.fadeTimer = setTimeout(
        () => this._fadeOutMessage(entry),
        s.fadeAfter * 1000
      );
    }

    if (s.clearIdle > 0) {
      if (this._idleTimer) clearTimeout(this._idleTimer);
      this._idleTimer = setTimeout(() => {
        this._clearAll();
        this._idleTimer = null;
      }, s.clearIdle * 1000);
    }
  },

  _fadeOutMessage(entry) {
    if (!entry.el) return;
    entry.el.classList.add('co-fading');
    setTimeout(() => {
      this._removeElement(entry.el);
      const idx = this._messages.findIndex(m => m.id === entry.id);
      if (idx !== -1) this._messages.splice(idx, 1);
    }, 600);
  },

  _removeElement(el) {
    if (el && el.parentNode) el.parentNode.removeChild(el);
  },

  _clearAll() {
    this._messages.forEach(m => {
      if (m.fadeTimer) clearTimeout(m.fadeTimer);
      this._removeElement(m.el);
    });
    this._messages = [];
  },


  /* ════════════════════════════════════════
     APPLY SETTINGS TO CONTAINER

     Fixed starting position (bottom-left margin) — no anchor
     switch. applyStoredPosition() overrides top/left with any saved
     drag position at the end, same pattern as Timer and Death
     Counter.
  ════════════════════════════════════════ */
  _applySettings() {
    const s = this._settings;
    const c = this._container;
    if (!c) return;

    const direction = s.direction || 'up';
    const margin    = '20px';

    c.style.position      = 'fixed';
    c.style.zIndex        = '8000';
    c.style.display       = 'flex';
    c.style.flexDirection = 'column';
    c.style.gap           = '4px';
    c.style.overflowY     = 'hidden';
    c.style.maxWidth      = '90vw';
    c.style.width         = (s.width > 0) ? `${s.width}px` : 'auto';
    c.style.boxSizing     = 'border-box';
    c.style.minHeight     = '24px';   // ensures a draggable surface even when empty

    /*
     * FIX: don't clobber pointerEvents while this element is actively
     * being drag-positioned. This function runs on every incoming
     * chat message — without this check, any message arriving mid-drag
     * would silently reset pointerEvents back to 'none', killing the
     * ability to click-and-drag with no visible error at all.
     */
    if (PositionEditor._active?.id !== 'chatoverlay') {
      c.style.pointerEvents = 'none';
    }

    c.style.top    = 'auto';
    c.style.right  = 'auto';
    c.style.bottom = margin;
    c.style.left   = margin;

    c.style.maxHeight      = `calc(50vh)`;
    c.style.justifyContent = (direction === 'up') ? 'flex-end' : 'flex-start';

    const bgAlpha  = ((s.bgOpacity   ?? 60)  / 100).toFixed(2);
    const txtAlpha = ((s.textOpacity ?? 100) / 100).toFixed(2);
    const speed    = s.animSpeed || '0.3s';
    const rad      = `${s.radius ?? 6}px`;
    const fs       = `${s.fontSize ?? 18}px`;
    const slideIn  = 'translateY(14px)';

    this._styleEl.textContent = `
      #chatOverlayContainer { box-sizing: border-box; }

      .co-message {
        font-family:    'Segoe UI', system-ui, sans-serif;
        font-size:      ${fs};
        line-height:    1.4;
        opacity:        0;
        word-break:     break-word;
        flex-shrink:    0;
        pointer-events: none;
        user-select:    none;
        transition:     opacity ${speed} ease, transform ${speed} ease;
      }

      .co-style-simple {
        padding:       4px 8px;
        border-radius: ${rad};
        background:    rgba(0,0,0,${bgAlpha});
        color:         rgba(255,255,255,${txtAlpha});
        text-shadow:   1px 1px 3px rgba(0,0,0,.8);
      }
      .co-style-card {
        padding:       8px 12px;
        border-radius: ${rad};
        background:    rgba(24,24,27,${bgAlpha});
        border:        1px solid rgba(255,255,255,.08);
        color:         rgba(255,255,255,${txtAlpha});
        box-shadow:    0 2px 8px rgba(0,0,0,.4);
      }
      .co-style-minimal {
        padding: 2px 0;
        color:   rgba(255,255,255,${txtAlpha});
        text-shadow:
          -2px -2px 0 rgba(0,0,0,.9),
           2px -2px 0 rgba(0,0,0,.9),
          -2px  2px 0 rgba(0,0,0,.9),
           2px  2px 0 rgba(0,0,0,.9);
      }

      .co-name { font-weight: 700; }
      .co-text { font-weight: 400; }

      .co-anim-fade              { transform: none; }
      .co-anim-fade.co-visible   { opacity: 1; }

      .co-anim-slide             { transform: ${slideIn}; }
      .co-anim-slide.co-visible  { opacity: 1; transform: translate(0,0); }

      .co-anim-pop               { transform: scale(0.85); }
      .co-anim-pop.co-visible    { opacity: 1; transform: scale(1); }

      .co-anim-none              { transition: none; }
      .co-anim-none.co-visible   { opacity: 1; }

      .co-fading {
        opacity:    0 !important;
        transform:  scale(0.95) !important;
        transition: opacity .6s ease, transform .6s ease !important;
      }
    `;

    PositionEditor.applyStoredPosition('chatoverlay');
  }

});