/* ════════════════════════════════════════
   CHAT OVERLAY PLUGIN  v1.4  —  bot side
════════════════════════════════════════ */

BotPlugin.define({

  id:      'chatoverlay',
  name:    'Chat Overlay',
  version: '1.4',
  positionable: true,

  sidebarHtml() {
    return `
      <div class="panel" id="panel-chatoverlay">
        <div class="panel-title" onclick="togglePanel('chatoverlay')">
          Chat Overlay <span class="chevron">▾</span>
        </div>
        <div class="panel-body">

          <div class="divider">position &amp; size</div>

          <p class="help" style="margin-bottom:8px">
            Use the <strong style="color:#6a6a80">Positioning</strong> panel
            to drag this anywhere on the overlay.
          </p>

          <div class="two-col">
            <div class="field">
              <label>Stack direction</label>
              <select id="coDirection"
                      onchange="ChatOverlayPlugin.saveSetting('direction', this.value)">
                <option value="up">Newest at bottom</option>
                <option value="down">Newest at top</option>
              </select>
            </div>
            <div class="field">
              <label>Max messages</label>
              <input id="coMaxMsgs" type="number" min="1" max="50" value="8"
                     onchange="ChatOverlayPlugin.saveSetting('maxMsgs', this.value)">
            </div>
          </div>

          <div class="field">
            <label>Width (px) <span class="opt">0 = auto</span></label>
            <input id="coWidth" type="number" min="0" value="400"
                   onchange="ChatOverlayPlugin.saveSetting('width', this.value)">
          </div>

          <div class="divider">appearance</div>

          <div class="two-col">
            <div class="field">
              <label>Style</label>
              <select id="coStyle"
                      onchange="ChatOverlayPlugin.saveSetting('style', this.value)">
                <option value="simple">Simple</option>
                <option value="card">Cards</option>
                <option value="minimal">Minimal</option>
              </select>
            </div>
            <div class="field">
              <label>Font size (px)</label>
              <input id="coFontSize" type="number" min="10" max="48" value="18"
                     onchange="ChatOverlayPlugin.saveSetting('fontSize', this.value)">
            </div>
          </div>

          <div class="two-col">
            <div class="field">
              <label>Background opacity</label>
              <input id="coBgOpacity" type="range" min="0" max="100" value="60"
                     oninput="ChatOverlayPlugin.saveSetting('bgOpacity', this.value)">
            </div>
            <div class="field">
              <label>Text opacity</label>
              <input id="coTextOpacity" type="range" min="10" max="100" value="100"
                     oninput="ChatOverlayPlugin.saveSetting('textOpacity', this.value)">
            </div>
          </div>

          <div class="two-col">
            <div class="field">
              <label>Username colour</label>
              <select id="coNameColour"
                      onchange="ChatOverlayPlugin.saveSetting('nameColour', this.value)">
                <option value="twitch">Twitch colour</option>
                <option value="white">White</option>
                <option value="accent">Purple accent</option>
              </select>
            </div>
            <div class="field">
              <label>Corner radius (px)</label>
              <input id="coRadius" type="number" min="0" max="24" value="6"
                     onchange="ChatOverlayPlugin.saveSetting('radius', this.value)">
            </div>
          </div>

          <div class="divider">animation</div>

          <div class="two-col">
            <div class="field">
              <label>Enter animation</label>
              <select id="coAnimation"
                      onchange="ChatOverlayPlugin.saveSetting('animation', this.value)">
                <option value="fade">Fade in</option>
                <option value="slide">Slide in</option>
                <option value="pop">Pop in</option>
                <option value="none">None</option>
              </select>
            </div>
            <div class="field">
              <label>Animation speed</label>
              <select id="coAnimSpeed"
                      onchange="ChatOverlayPlugin.saveSetting('animSpeed', this.value)">
                <option value="0.15s">Fast</option>
                <option value="0.3s" selected>Normal</option>
                <option value="0.5s">Slow</option>
              </select>
            </div>
          </div>

          <div class="divider">message lifetime</div>

          <div class="two-col">
            <div class="field">
              <label>Fade out after (s) <span class="opt">0 = never</span></label>
              <input id="coFadeAfter" type="number" min="0" value="0"
                     onchange="ChatOverlayPlugin.saveSetting('fadeAfter', this.value)">
            </div>
            <div class="field">
              <label>Clear after idle (s) <span class="opt">0 = never</span></label>
              <input id="coClearIdle" type="number" min="0" value="0"
                     onchange="ChatOverlayPlugin.saveSetting('clearIdle', this.value)">
            </div>
          </div>

          <div class="divider">filters</div>

          <div class="field">
            <label style="flex-direction:column; gap:6px; align-items:flex-start">
              <span>Hide messages matching (one per line):</span>
              <textarea id="coHidePatterns" rows="3"
                        style="width:100%; background:#0e0e10; border:1px solid #3a3a3d;
                               border-radius:4px; color:#efeff1; font-size:0.8rem;
                               padding:6px 8px; resize:vertical; font-family:monospace"
                        placeholder="!commands&#10;!so&#10;/^!/"
                        onchange="ChatOverlayPlugin.saveSetting('hidePatterns', this.value)">
              </textarea>
            </label>
          </div>

          <div class="field" style="display:flex; flex-direction:column; gap:6px">
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer">
              <input id="coHideBot" type="checkbox"
                     style="width:auto; accent-color:#9147ff"
                     onchange="ChatOverlayPlugin.saveSetting('hideBot', this.checked)">
              <span style="font-size:0.78rem; color:#adadb8">
                Hide bot's own messages
              </span>
            </label>
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer">
              <input id="coHideCommands" type="checkbox" checked
                     style="width:auto; accent-color:#9147ff"
                     onchange="ChatOverlayPlugin.saveSetting('hideCommands', this.checked)">
              <span style="font-size:0.78rem; color:#adadb8">
                Hide messages starting with !
              </span>
            </label>
          </div>

          <div class="divider">test</div>
          <button class="btn-full btn-muted"
                  onclick="ChatOverlayPlugin.sendTest()">
            Send test messages to overlay
          </button>

        </div>
      </div>`;
  },

  init() {
    window.ChatOverlayPlugin = ChatOverlayPlugin;
    ChatOverlayPlugin._loadSettings();
  },

  onDisplay({ name, text, isBot }) {
    ChatOverlayPlugin._onMessage(name, text, isBot);
  },

  chatCommands: {}

});


const ChatOverlayPlugin = {

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

  _settings: {},


  /* ── Settings ── */
  _loadSettings() {
    try {
      const raw = localStorage.getItem('twitchbot_chatoverlay');
      this._settings = raw
        ? Object.assign({}, this._defaults, JSON.parse(raw))
        : Object.assign({}, this._defaults);
    } catch(_) {
      this._settings = Object.assign({}, this._defaults);
    }
    this._populateUI();
  },

  _populateUI() {
    const s   = this._settings;
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!val;
      else                        el.value   = val;
    };
    set('coDirection',    s.direction);
    set('coWidth',        s.width);
    set('coMaxMsgs',      s.maxMsgs);
    set('coStyle',        s.style);
    set('coFontSize',     s.fontSize);
    set('coBgOpacity',    s.bgOpacity);
    set('coTextOpacity',  s.textOpacity);
    set('coNameColour',   s.nameColour);
    set('coRadius',       s.radius);
    set('coAnimation',    s.animation);
    set('coAnimSpeed',    s.animSpeed);
    set('coFadeAfter',    s.fadeAfter);
    set('coClearIdle',    s.clearIdle);
    set('coHidePatterns', s.hidePatterns);
    set('coHideBot',      s.hideBot);
    set('coHideCommands', s.hideCommands);
  },

  saveSetting(key, value) {
    if (value === 'true')  value = true;
    if (value === 'false') value = false;
    if (typeof value === 'string' && value !== '' && !isNaN(value)) {
      value = parseFloat(value);
    }
    this._settings[key] = value;
    try {
      localStorage.setItem('twitchbot_chatoverlay', JSON.stringify(this._settings));
    } catch(_) {}
    sendToOverlay({
      type:     'chatoverlay-settings',
      settings: Object.assign({}, this._settings)
    });
  },


  /* ── Message handling ── */
  _onMessage(name, text, isBot) {
    const s = this._settings;

    if (isBot && s.hideBot) return;
    if (s.hideCommands && text.trim().startsWith('!')) return;

    if (s.hidePatterns) {
      const patterns = s.hidePatterns.split('\n').map(p => p.trim()).filter(Boolean);
      for (const pat of patterns) {
        try {
          const m  = pat.match(/^\/(.*)\/([gimsuy]*)$/);
          const re = m ? new RegExp(m[1], m[2]) : null;
          if (re ? re.test(text) : text.toLowerCase().includes(pat.toLowerCase())) return;
        } catch(_) {}
      }
    }

    sendToOverlay({
      type:      'chatoverlay-message',
      name,
      text,
      isBot,
      colour:    this._getUserColour(name),
      settings: Object.assign({}, this._settings)
    });
  },

  _getUserColour(name) {
    const colours = [
      '#FF4500','#2E8B57','#DAA520','#9ACD32',
      '#FF69B4','#5F9EA0','#1E90FF','#FF7F50',
      '#9400D3','#00FF7F'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colours[Math.abs(hash) % colours.length];
  },

  sendTest() {
    ['TestUser', 'AnotherViewer', 'StreamFan99'].forEach((name, i) => {
      setTimeout(() => {
        this._onMessage(name, `Test message ${i + 1} — hello from ${name}!`, false);
      }, i * 400);
    });
  }

};