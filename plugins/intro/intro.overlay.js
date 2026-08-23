/* ════════════════════════════════════════
   INTRO BOT PLUGIN  —  overlay side

   Receives base64-encoded audio from the
   bot panel and plays it through the Web
   Audio API — the same mechanism used by
   the Sounds plugin and core overlay.js,
   since this is the only CEF context whose
   audio output OBS actually captures.
════════════════════════════════════════ */

OverlayPlugin.register('intro', {

  handles: ['intro-play'],

  onMessage(msg) {
    this._play(msg);
  },

  /* ── Decode base64 → ArrayBuffer → play ── */
  async _play(msg) {
    if (!msg.audio) return;

    let arrayBuffer;
    try {
      arrayBuffer = this._base64ToArrayBuffer(msg.audio);
    } catch(e) {
      console.warn('IntroBot overlay: base64 decode failed:', e);
      return;
    }

    try {
      const ctx = getCtx();               // shared AudioContext from core overlay.js
      const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));

      const volRaw = parseFloat(
        localStorage.getItem('twitchbot_sounds_volume') || '100'
      );
      const vol = Math.max(0, Math.min(1, volRaw / 100));

      const gain      = ctx.createGain();
      gain.gain.value = vol;
      gain.connect(ctx.destination);

      const source  = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(gain);
      source.start(0);

    } catch(e) {
      console.warn(`IntroBot overlay: playback failed for "${msg.nick}":`, e);
    }
  },

  /* ── Base64 → ArrayBuffer ── */
  _base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

});