/* ════════════════════════════════════════
   FIRST CHAT SOUND
   ════════════════════════════════════════
   Plays a sound on the overlay the first time any user
   chats in this channel. No settings, no chat commands —
   just drop an audio file at plugins/firstchat/welcome.mp3
   and it plays automatically.

   Detection is driven entirely by Twitch's own "first-msg"
   IRC tag (read in irc.js), NOT by any local history the bot
   keeps itself. Two things worth knowing as a result:

     - This is per-CHANNEL, not per-Twitch-account. A veteran
       viewer visiting your channel for the first time will
       trigger it — that's Twitch's own definition of the tag,
       same one that powers the "First time chatting" badge
       in Twitch's native chat UI.

     - It only fires for messages the bot is actually connected
       and listening for. If a user's real first message in the
       channel happened while the bot was offline, that specific
       trigger opportunity is gone — there's no way to retroactively
       query "has this user ever chatted here" outside of catching
       it live on the message itself.
════════════════════════════════════════ */

BotPlugin.define({
  id:   'firstchat',
  name: 'First Chat Sound',

  onFirstChat({ dname, nick, tags }) {
    if (typeof sendToOverlay === 'function') {
      sendToOverlay({ type: 'firstchat-play' });
    }
  },

  sidebarHtml() {
    return `
      <div class="panel" id="panel-firstchat">
        <div class="panel-title">
          <span>👋 First Chat Sound</span>
          <span class="chevron">▾</span>
        </div>
        <div class="panel-body">
          <p style="opacity:.7;font-size:.85em;margin:0 0 8px;">
            Plays a sound on the overlay whenever someone chats in this
            channel for the very first time — no settings needed.
          </p>
          <p style="opacity:.7;font-size:.85em;margin:0;">
            Drop your sound file at:<br>
            <code>plugins/firstchat/welcome.mp3</code>
          </p>
        </div>
      </div>`;
  }
});