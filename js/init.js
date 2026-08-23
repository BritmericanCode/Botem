/* ════════════════════════════════════════
   INITIALISATION
════════════════════════════════════════ */

(async function init() {

  loadCommands();
  loadSavedFields();
  loadPanelStates();

  const botInp = g('botPathInput');
  if (botInp) botInp.value = location.href;

  try {
    const port = localStorage.getItem('twitchbot_obs_port');
    const pass = localStorage.getItem('twitchbot_obs_password');
    if (port && g('obsPort'))     g('obsPort').value     = port;
    if (pass && g('obsPassword')) g('obsPassword').value = pass;
  } catch(_) {}

  try {
    const ip = localStorage.getItem('twitchbot_lan_ip');
    if (ip && g('obsLanIP')) {
      g('obsLanIP').value = ip;
      updateOverlayUrl();
    } else {
      detectLanIP().then(detected => {
        if (detected && g('obsLanIP') && !g('obsLanIP').value) {
          g('obsLanIP').value = detected;
          saveField('twitchbot_lan_ip', detected);
          updateOverlayUrl();
        }
      });
    }
  } catch(_) {}

/* Restore Connection panel fields */
try {
  const clientId = localStorage.getItem('twitchbot_client_id');
  const readyMsg = localStorage.getItem('twitchbot_ready_msg');
  const exitMsg  = localStorage.getItem('twitchbot_exit_msg');
  if (clientId !== null && g('inClientId')) g('inClientId').value = clientId;
  if (readyMsg !== null && g('inReadyMsg')) g('inReadyMsg').value = readyMsg;
  if (exitMsg  !== null && g('inExitMsg'))  g('inExitMsg').value  = exitMsg;
} catch(_) {}

  /* Load plugins */
  await BotPlugin.loadAll();
  
    /* Populate the Positioning dropdown now that all plugins have registered */
  Positioning.populateSelect();

  if (window.SoundsPlugin) SoundsPlugin._updateEndSoundSelect();

  window.addEventListener('beforeunload', () => {
    /*
     * FIX: 'socket' renamed to 'ircWs' in state.js — this reference was
     * never updated to match, so this handler threw a silent ReferenceError
     * on every page unload and the exit message never sent.
     */
    if (ircWs && ircWs.readyState === WebSocket.OPEN) {
      const msg = getExitMessage();
      if (msg) ircWs.send(`PRIVMSG #${channel} :${msg}`);
    }
  });

}());