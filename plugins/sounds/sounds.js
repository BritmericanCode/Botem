/* ════════════════════════════════════════
   SOUNDS PLUGIN  v3.2

   Audio is played entirely through the
   overlay Browser Source — the only CEF
   context OBS captures audio from.

   The bot panel sends the sound name/data
   to the overlay via BroadcastChannel or
   obs-websocket. The overlay does the
   actual playback.

   Chat commands:
     !sound <name>    (everyone)
     !sounds          (everyone, 30 s cd)
════════════════════════════════════════ */

BotPlugin.define({

  id:      'sounds',
  name:    'Sounds',
  version: '3.2',

  sidebarHtml() {
    return `
      <div class="panel" id="panel-sounds">
        <div class="panel-title" onclick="togglePanel('sounds')">
          Sounds <span class="chevron">▾</span>
        </div>
        <div class="panel-body">

          <p class="help" style="margin-bottom:8px">
            Pick the folder containing your sound files.<br>
            After the first pick it reloads automatically.
          </p>

          <div class="btn-row">
            <button class="btn-purple"
                    onclick="SoundsPlugin.pickFolder()">
              📂 Pick Folder
            </button>
            <button class="btn-muted"
                    onclick="SoundsPlugin.refresh()">
              ↻ Refresh
            </button>
          </div>

          <div id="soundsFolderLabel"
               class="help"
               style="margin-top:6px">
            No folder selected.
          </div>

          <div class="field" style="margin-top:10px">
            <label>
              Volume
              <span id="soundsVolumeLabel">100%</span>
            </label>
            <input id="soundsVolumeSlider"
                   type="range" min="0" max="100" value="100"
                   oninput="SoundsPlugin.setVolume(this.value)">
          </div>

          <div id="soundsList" class="media-list"></div>

          <p class="help" style="margin-top:10px; color:#4a4a60">
            Audio plays through the overlay browser source.<br>
            Ensure <strong style="color:#6a6a80">Control audio
            via OBS</strong> is ticked in overlay source properties
            and set to
            <strong style="color:#6a6a80">Monitor and Output</strong>
            in Advanced Audio Properties.
          </p>

        </div>
      </div>`;
  },

  init() {
    window.SoundsPlugin = SoundsPlugin;

    /* Restore saved volume */
    const savedVol = parseInt(
      localStorage.getItem('twitchbot_sounds_volume') || '100'
    );
    SoundsPlugin._volume = savedVol / 100;

    const slider = document.getElementById('soundsVolumeSlider');
    const label  = document.getElementById('soundsVolumeLabel');
    if (slider) slider.value      = savedVol;
    if (label)  label.textContent = `${savedVol}%`;

    /* Restore previously picked folder */
    SoundsPlugin._tryRestoreFolder();
  },

  chatCommands: {

    '!sound': {
      permission: 'everyone',
      cooldown:   0,
      async handle({ parts, chan }) {
        const q = parts[1] || '';
        if (!q) { send(chan, 'Usage: !sound <name>'); return; }
        if (!await SoundsPlugin.play(q)) {
          send(chan, `Sound "${q}" not found — use !sounds to list.`);
        }
      }
    },

    '!sounds': {
      permission: 'everyone',
      cooldown:   30,
      async handle({ chan }) {
        const names = [...SoundsPlugin._files.keys()]
          .sort()
          .map(n => n.replace(/\.[^.]+$/, ''));
        send(chan, names.length
          ? 'Sounds: ' + names.join(' · ')
          : 'No sounds loaded.');
      }
    }

  }

});


/* ════════════════════════════════════════
   SOUNDS HELPER OBJECT
════════════════════════════════════════ */
const SoundsPlugin = {

  _files:         new Map(),
  _dirHandle:     null,
  _pendingHandle: null,
  _volume:        1.0,

  _EXTS: new Set(['.mp3','.wav','.ogg','.flac','.m4a','.aac','.opus']),


  /* ── Folder picking ── */
  async pickFolder() {
    if ('showDirectoryPicker' in window) {
      try {
        const handle = await window.showDirectoryPicker({ mode: 'read' });
        await this._useHandle(handle);
        await _idbSet('twitchbot_sounds_dir', handle);
        return;
      } catch(e) {
        if (e.name === 'AbortError') return;
      }
    }
    this._fallbackFilePicker();
  },

  async _tryRestoreFolder() {
    try {
      const handle = await _idbGet('twitchbot_sounds_dir');
      if (!handle) return;
      const perm = await handle.queryPermission({ mode: 'read' });
      if (perm === 'granted') {
        await this._useHandle(handle);
      } else {
        this._showReGrantButton(handle);
      }
    } catch(_) {}
  },

  _showReGrantButton(handle) {
    const lbl = document.getElementById('soundsFolderLabel');
    if (lbl) {
      lbl.innerHTML = `
        📁 <strong style="color:#9a9ab0">${handle.name}</strong>
        — permission needed<br>
        <button class="btn-xs btn-edit"
                style="margin-top:4px"
                onclick="SoundsPlugin._reGrantPermission()">
          🔓 Re-grant access
        </button>`;
    }
    this._pendingHandle = handle;
  },

  async _reGrantPermission() {
    if (!this._pendingHandle) return;
    try {
      const perm = await this._pendingHandle.requestPermission({ mode: 'read' });
      if (perm === 'granted') {
        await this._useHandle(this._pendingHandle);
        await _idbSet('twitchbot_sounds_dir', this._pendingHandle);
      }
    } catch(_) {}
    this._pendingHandle = null;
  },

  async _useHandle(handle) {
    this._dirHandle = handle;
    await this._loadFromDirectory();
  },


  /* ── Fallback file picker ── */
  _fallbackFilePicker() {
    const inp    = document.createElement('input');
    inp.type     = 'file';
    inp.multiple = true;
    inp.accept   = '.mp3,.wav,.ogg,.flac,.m4a,.aac,.opus,audio/*';

    inp.onchange = async ev => {
      const files = [...ev.target.files].filter(f => {
        const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
        return this._EXTS.has(ext);
      });
      if (!files.length) { logSys('No audio files selected.', true); return; }

      this._files.clear();
      for (const file of files) {
        this._files.set(file.name, { file, arrayBuffer: null });
      }

      const n = files.length;
      this._updateLabel(`🎵 ${n} file${n !== 1 ? 's' : ''} loaded`);
      this._render();
      this._updateEndSoundSelect();
      logSys(`Sounds: loaded ${n} file(s).`);
    };

    inp.click();
  },


  /* ── Load from directory ── */
  async _loadFromDirectory() {
    if (!this._dirHandle) return;
    this._files.clear();

    try {
      for await (const [name, handle] of this._dirHandle.entries()) {
        if (handle.kind !== 'file') continue;
        const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
        if (this._EXTS.has(ext)) {
          this._files.set(name, { handle, arrayBuffer: null });
        }
      }
    } catch(e) {
      this._updateLabel(`✘ Could not read folder: ${e.message}`, true);
      return;
    }

    const n = this._files.size;
    this._updateLabel(
      `📁 ${this._dirHandle.name} — ${n} sound${n !== 1 ? 's' : ''}`
    );
    this._render();
    this._updateEndSoundSelect();
    logSys(`Sounds: loaded ${n} file(s) from "${this._dirHandle.name}".`);
  },

  async refresh() {
    if (this._dirHandle) {
      await this._loadFromDirectory();
    } else {
      const lbl = document.getElementById('soundsFolderLabel');
      if (lbl) lbl.textContent = 'No folder selected — click Pick Folder.';
    }
  },


  /* ── Buffer access ── */
  async _getBuffer(name) {
    const sf = this._files.get(name); if (!sf) return null;
    if (!sf.arrayBuffer) {
      try {
        if (sf.handle) {
          const file     = await sf.handle.getFile();
          sf.arrayBuffer = await file.arrayBuffer();
        } else if (sf.file) {
          sf.arrayBuffer = await sf.file.arrayBuffer();
        }
      } catch(e) {
        logSys(`Sounds: could not read "${name}": ${e.message}`, true);
        return null;
      }
    }
    return sf.arrayBuffer;
  },

  findKey(q) {
    q = q.toLowerCase();
    for (const name of this._files.keys()) {
      if (name.toLowerCase() === q)                         return name;
      if (name.toLowerCase().replace(/\.[^.]+$/, '') === q) return name;
    }
    return null;
  },


  /* ── Play ── */
  async play(query) {

    const key = this.findKey(query);
    if (!key) {
      logSys(`Sound play: key not found for "${query}"`, true);
      return false;
    }

    const buf = await this._getBuffer(key);
    if (!buf) {
      logSys(`Sound play: buffer not loaded for "${key}"`, true);
      return false;
    }

    logSys(`Sound play: sending "${key}" — ${buf.byteLength} bytes`);

    /* Path A — BroadcastChannel with full ArrayBuffer */
    try {
      const bc = new BroadcastChannel('twitchbot-obs-v1');
      bc.postMessage({
        type:        'sound-play',
        name:        key,
        arrayBuffer: buf.slice(0)
      });
      bc.close();
      logSys('Sound play: BC message sent ✔');
    } catch(e) {
      logSys(`Sound play: BC failed — ${e.message}`, true);
    }

    /* Path B — obs-websocket filename only */
    if (typeof obsEvent === 'function') {
      obsEvent({ type: 'sound-play', name: key });
      logSys('Sound play: obsEvent sent ✔');
    } else {
      logSys('Sound play: obsEvent not available', true);
    }

    return true;
  },


  /* ── Volume ── */
  setVolume(val) {
    this._volume = parseInt(val) / 100;
    try { localStorage.setItem('twitchbot_sounds_volume', val); } catch(_) {}
    const lbl = document.getElementById('soundsVolumeLabel');
    if (lbl) lbl.textContent = `${val}%`;
  },


  /* ── Timer end-sound select ── */
  _updateEndSoundSelect() {
    const sel = document.getElementById('timerEndSound');
    if (!sel) return;
    const saved = localStorage.getItem('twitchbot_timer_end_sound') || '';
    sel.innerHTML = '<option value="">None</option>';
    [...this._files.keys()].sort().forEach(name => {
      const opt       = document.createElement('option');
      opt.value       = name;
      opt.textContent = name.replace(/\.[^.]+$/, '');
      if (name === saved) opt.selected = true;
      sel.appendChild(opt);
    });
  },


  /* ── UI helpers ── */
  _updateLabel(text, isError = false) {
    const lbl = document.getElementById('soundsFolderLabel');
    if (!lbl) return;
    lbl.textContent = text;
    lbl.style.color = isError ? '#e05555' : '#3a8a4a';
  },

  _render() {
  const list = document.getElementById('soundsList');
  if (!list) return;
  if (!this._files.size) {
    list.innerHTML = '<p class="cmd-empty">No audio files found.</p>';
    return;
  }
  list.innerHTML = [...this._files.keys()].sort().map(name => {
    const base = name.replace(/\.[^.]+$/, '');
    /*
     * FIX: _sEsc(JSON.stringify(name)) converts the double quotes
     * that JSON.stringify adds into &quot; so the onclick attribute
     * is valid HTML and the browser executes the correct JavaScript.
     *
     * Without this, onclick="SoundsPlugin.play("name.mp3")" ends
     * the attribute at the first inner " — the JS is incomplete and
     * Chrome silently swallows the syntax error.
     */
    const safe = _sEsc(JSON.stringify(name));
    return `
      <div class="media-item">
        <div style="min-width:0; flex:1">
          <div class="media-name">${_sEsc(base)}</div>
          <div class="media-cmd">!sound ${_sEsc(base)}</div>
        </div>
        <button class="btn-play"
                onclick="SoundsPlugin.play(${safe})"
                title="Play">▶</button>
      </div>`;
  }).join('');
},

};


/* ════════════════════════════════════════
   INDEXEDDB HELPERS
════════════════════════════════════════ */

function _idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('twitchbot', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('kv');
    req.onsuccess       = e => resolve(e.target.result);
    req.onerror         = e => reject(e.target.error);
  });
}

async function _idbSet(key, value) {
  try {
    const db = await _idbOpen();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction('kv', 'readwrite');
      const req = tx.objectStore('kv').put(value, key);
      req.onsuccess = ()  => resolve();
      req.onerror   = e   => reject(e.target.error);
    });
  } catch(_) {}
}

async function _idbGet(key) {
  try {
    const db = await _idbOpen();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction('kv', 'readonly');
      const req = tx.objectStore('kv').get(key);
      req.onsuccess = e => resolve(e.target.result);
      req.onerror   = e => reject(e.target.error);
    });
  } catch(_) { return null; }
}


/* ── Module-local escape helper ── */
function _sEsc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}