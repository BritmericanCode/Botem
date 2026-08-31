/* ════════════════════════════════════════
   FIRST CHAT SOUND — overlay-side handler
   ════════════════════════════════════════
   Plays a bundled sound file whenever the bot-side plugin
   detects a user's first-ever message in this channel
   (driven by Twitch's own "first-msg" IRC tag — see irc.js
   and plugins/firstchat/firstchat.js for where that's read
   and dispatched).

   No visual element — this plugin never draws anything on
   screen. It exists purely because overlay.html is the only
   page OBS actually captures audio/video from (it's loaded
   as a Browser SOURCE, part of the scene) — bot.html is a
   Browser DOCK, a control panel only you see, never captured.
   Any sound needs to be triggered from here to be heard by
   the stream, same reason Sounds/Intro route through this
   page's shared AudioContext (getCtx(), defined in core
   overlay.js) instead of playing locally in the bot window.

   Setup: drop an audio file at
     plugins/firstchat/welcome.mp3
   (any format the browser's decodeAudioData() supports —
   mp3/wav/ogg/webm/flac all work, same as Sounds/Intro).
   No settings, no chat commands — this plugin just plays
   that one file every time it's triggered.
════════════════════════════════════════ */

OverlayPlugin.register('firstchat', {
  handles: ['firstchat-play'],

  onMessage(msg) {
    playWelcomeSound();
  }
});

/*
 * Fetched and decoded once, then cached — repeat triggers
 * reuse the already-decoded AudioBuffer rather than re-fetching
 * and re-decoding the file every single time (same caching
 * pattern the Sounds plugin uses for its `decoded` Map).
 */
let _welcomeBufferPromise = null;

async function playWelcomeSound() {
  try {
    const ctx = getCtx(); // shared AudioContext from core overlay.js

    if (!_welcomeBufferPromise) {
      _welcomeBufferPromise = fetch('plugins/firstchat/welcome.mp3')
        .then(resp => {
          if (!resp.ok) throw new Error('HTTP ' + resp.status);
          return resp.arrayBuffer();
        })
        .then(buf => ctx.decodeAudioData(buf))
        .catch(e => {
          _welcomeBufferPromise = null; // allow retry on next trigger
          throw e;
        });
    }

    const buffer = await _welcomeBufferPromise;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);

  } catch(e) {
    console.warn('firstchat: could not play welcome sound:', e);
  }
}