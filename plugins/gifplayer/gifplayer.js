/* ════════════════════════════════════════
   GIF PLAYER PLUGIN  v1.1
════════════════════════════════════════ */

BotPlugin.define({

  id:      'gifplayer',
  name:    'GIF Player',
  version: '1.1',

  sidebarHtml() {
    return `
      <div class="panel" id="panel-gifplayer">
        <div class="panel-title" onclick="togglePanel('gifplayer')">
          GIF Player <span class="chevron">▾</span>
        </div>
        <div class="panel-body">
          <p class="help" style="margin-bottom:8px">
            Paste a <strong>direct image URL</strong> (must end in
            <code>.gif</code>, <code>.png</code>, etc.).<br>
            Right-click a GIF on Tenor/Giphy →
            <em>Copy image address</em>.
          </p>
          <div class="field">
            <label>GIF / Image URL</label>
            <input id="gifUrl" type="text"
                   placeholder="https://media.tenor.com/…/reaction.gif"
                   autocomplete="off" spellcheck="false">
          </div>
          <div class="field">
            <label>
              Duration (s)
              <span class="opt">0 = stays until stopped</span>
            </label>
            <input id="gifDuration" type="number" min="0" value="5">
          </div>
          <div class="btn-row">
            <button class="btn-purple" onclick="GifPlayerPlugin.showFromUI()">▶ Show</button>
            <button class="btn-red"    onclick="GifPlayerPlugin.hide()">⏹ Hide</button>
          </div>
        </div>
      </div>`;
  },

  init() {
    window.GifPlayerPlugin = {

      show(url, durationSecs = 5) {
        if (!url) return;
        sendToOverlay({
          type:    'alert-show',
          content: {
            type:     url.match(/\.(gif|png|jpe?g|webp|svg|avif)/i) ? 'gif' : 'image',
            url:      url,
            duration: durationSecs
          }
        });
      },

      hide() {
        /*
         * Send the hide message three times with short delays.
         * obs-websocket occasionally drops a single message if the
         * previous request response hasn't fully flushed — retrying
         * guarantees delivery without flooding.
         */
        sendToOverlay({ type: 'alert-hide' });
        setTimeout(() => sendToOverlay({ type: 'alert-hide' }), 250);
        setTimeout(() => sendToOverlay({ type: 'alert-hide' }), 600);
      },

      showFromUI() {
        const url = document.getElementById('gifUrl')?.value?.trim();
        const dur = parseInt(document.getElementById('gifDuration')?.value);
        if (!url) { logSys('GIF Player: enter a URL first.', true); return; }
        this.show(url, isNaN(dur) ? 5 : Math.max(0, dur));
      }
    };
  },

  chatCommands: {

    '!gif': {
      permission: 'moderator',
      cooldown:   5,
      async handle({ parts, chan }) {
        const url = parts[1];
        if (!url || !url.startsWith('http')) {
          send(chan, 'Usage: !gif <direct-image-url> [seconds]');
          return;
        }
        const dur = parseInt(parts[2]);
        const secs = isNaN(dur) ? 5 : Math.max(0, dur);
        window.GifPlayerPlugin?.show(url, secs);
        send(chan, secs > 0 ? `🎬 Showing GIF for ${secs}s` : '🎬 Showing GIF');
      }
    },

    '!gifstop': {
      permission: 'moderator',
      cooldown:   2,
      async handle({ chan }) {
        window.GifPlayerPlugin?.hide();
        send(chan, '🎬 GIF hidden');
      }
    }

  }

});