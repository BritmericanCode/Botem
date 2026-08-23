/* ════════════════════════════════════════
   VIDEO CLIPS PLUGIN  v1.0

   Plays video files on the OBS overlay.

   Chat commands:
     !clip <name>     (mod+)
     !clipstop        (mod+)
     !clips           (everyone, 30 s cd)

   The overlay loads videos from the
   videos/ subfolder next to overlay.html.
════════════════════════════════════════ */

BotPlugin.define({

  id:      'videoclips',
  name:    'Video Clips',
  version: '1.0',


  /* ════════════════════════════════════════
     SIDEBAR PANEL
  ════════════════════════════════════════ */
  sidebarHtml() {
    return `
      <div class="panel" id="panel-videoclips">
        <div class="panel-title" onclick="togglePanel('videoclips')">
          Video Clips <span class="chevron">▾</span>
        </div>
        <div class="panel-body">

          <div class="notice">
            <strong>For OBS:</strong> put video files in a
            <code>videos/</code> folder next to
            <code>overlay.html</code>.
            Use <code>!clip &lt;name&gt;</code> in chat.
          </div>

          <div class="btn-row">
            <button class="btn-purple"
                    onclick="VideoClipsPlugin.openFiles()">
              📂 Open Files
            </button>
            <button id="stopClipBtn"
                    class="btn-red"
                    onclick="VideoClipsPlugin.stop()"
                    disabled>
              ⏹ Stop Clip
            </button>
          </div>

          <div id="videoFolderLabel"
               class="help"
               style="margin-top:6px">
            No clips loaded.
          </div>

          <div id="videosList" class="media-list"></div>

        </div>
      </div>`;
  },


  /* ════════════════════════════════════════
     INIT
  ════════════════════════════════════════ */
  init() {
    window.VideoClipsPlugin = VideoClipsPlugin;
  },


  /* ════════════════════════════════════════
     CHAT COMMANDS
  ════════════════════════════════════════ */
  chatCommands: {

    '!clips': {
      permission: 'everyone',
      cooldown:   30,
      async handle({ chan }) {
        const names = [...VideoClipsPlugin._files.keys()]
          .sort()
          .map(n => n.replace(/\.[^.]+$/, ''));
        send(chan, names.length
          ? 'Clips: ' + names.join(' · ')
          : 'No clips loaded.');
      }
    },

    '!clip': {
      permission: 'moderator',
      cooldown:   5,
      async handle({ parts, chan }) {
        const q = (parts[1] || '').replace(/^@/, '').trim();
        if (!q) { send(chan, 'Usage: !clip <name>'); return; }

        const key = VideoClipsPlugin.findKey(q);
        if (!key) {
          send(chan, `Clip "${q}" not found — use !clips to list.`);
          return;
        }

        await VideoClipsPlugin.play(key);
        send(chan, `🎬 Playing: ${key.replace(/\.[^.]+$/, '')}`);
      }
    },

    '!clipstop': {
      permission: 'moderator',
      cooldown:   2,
      async handle({ chan }) {
        VideoClipsPlugin.stop();
        send(chan, '🎬 Clip stopped.');
      }
    }

  }

});


/* ════════════════════════════════════════
   VIDEO CLIPS HELPER OBJECT
════════════════════════════════════════ */
const VideoClipsPlugin = {

  /* ── State ── */
  _files:   new Map(),   // filename → { handle, file }
  _EXTS:    new Set(['.mp4','.webm','.mov','.avi','.mkv']),


  /* ── File loading ── */
  async openFiles() {
    /* Try modern directory picker first */
    if ('showDirectoryPicker' in window) {
      try {
        const dh = await window.showDirectoryPicker({ mode: 'read' });
        this._files.clear();
        for await (const [name, handle] of dh.entries()) {
          if (handle.kind !== 'file') continue;
          const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
          if (this._EXTS.has(ext)) this._files.set(name, { handle, file: null });
        }
        this._updateUI();
        return;
      } catch(e) {
        if (e.name === 'AbortError') return;
        /* Falls through to file picker if API unavailable */
      }
    }
    this._openFilePicker();
  },

  _openFilePicker() {
    const inp    = document.createElement('input');
    inp.type     = 'file';
    inp.multiple = true;
    inp.accept   = '.mp4,.webm,.mov,.avi,.mkv,video/*';

    inp.onchange = ev => {
      const files = [...ev.target.files].filter(f => {
        const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
        return this._EXTS.has(ext);
      });
      if (!files.length) return;

      this._files.clear();
      for (const file of files) {
        this._files.set(file.name, { handle: null, file });
      }

      this._updateUI();
      logSys(`Video Clips: loaded ${files.length} clip(s).`);
    };

    inp.click();
  },


  /* ── Key lookup ── */
  findKey(q) {
    q = q.toLowerCase();
    for (const name of this._files.keys()) {
      if (name.toLowerCase() === q) return name;
      if (name.toLowerCase().replace(/\.[^.]+$/, '') === q) return name;
    }
    return null;
  },


  /* ── Playback ── */
  async play(name) {
    const vf = this._files.get(name); if (!vf) return;

    /* Local preview — opens a blob URL in a new window for monitoring */
    try {
      const file = vf.file || await vf.handle?.getFile();
      if (file) {
        const url = URL.createObjectURL(file);
        window.open(
          url, '_blank',
          'width=960,height=540,menubar=no,toolbar=no,location=no,status=no'
        );
      }
    } catch(_) {}

    /* Send to overlay */
    sendToOverlay({ type: 'video-show', name });

    /* Enable stop button */
    const btn = document.getElementById('stopClipBtn');
    if (btn) btn.disabled = false;
  },

  stop() {
    sendToOverlay({ type: 'video-hide' });
    const btn = document.getElementById('stopClipBtn');
    if (btn) btn.disabled = true;
  },


  /* ── UI ── */
  _updateUI() {
    const lbl = document.getElementById('videoFolderLabel');
    if (lbl) {
      const n = this._files.size;
      lbl.textContent = `🎬 ${n} clip${n !== 1 ? 's' : ''} loaded`;
      lbl.style.color = '#3a8a4a';
    }
    this._render();
  },

  _render() {
    const list = document.getElementById('videosList');
    if (!list) return;

    if (!this._files.size) {
      list.innerHTML = '<p class="cmd-empty">No clips found.</p>';
      return;
    }

    list.innerHTML = [...this._files.keys()].sort().map(name => {
      const base = name.replace(/\.[^.]+$/, '');
      const safe = _vcEsc(JSON.stringify(name));
      return `
        <div class="media-item">
          <div style="min-width:0; flex:1">
            <div class="media-name">${_vcEsc(base)}</div>
            <div class="media-cmd">!clip ${_vcEsc(base)}</div>
          </div>
          <button class="btn-play"
                  onclick="VideoClipsPlugin.play(${safe})"
                  title="Play on overlay">▶</button>
        </div>`;
    }).join('');
  }

};


/* ── Module-local escape helper ── */
function _vcEsc(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}