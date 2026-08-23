/* ════════════════════════════════════════
   TWITCH DEVICE CODE AUTH

   Opens auth-callback.html in a normal
   Chrome tab to do the polling — avoids
   the CORS restriction that blocks POST
   requests from file:// origins in OBS.

   Flow:
   1. bot.html requests the device code
      (GET-like, works from file://)
   2. auth-callback.html opens in Chrome
   3. That tab polls Twitch (unrestricted)
   4. On success it writes the token to
      localStorage under a pending key
   5. bot.html polls localStorage every 2 s
      and picks up the token automatically
════════════════════════════════════════ */

const TwitchAuth = {

  SCOPES: 'chat:read chat:edit',

  _pollTimer:       null,   // setInterval handle for localStorage polling
  _expireTimer:     null,   // setTimeout handle — stops poll when code expires
  _expiryCountdown: null,   // setTimeout handle — drives the countdown display

  /*
   * Runtime dependencies on later-loaded files:
   *   saveField → persistence.js
   *   logSys    → ui.js
   * Both are only called from user-triggered methods, never at parse
   * time, so they will always be defined by the time they are needed.
   */


  /* ════════════════════════════════════════
     START
  ════════════════════════════════════════ */
  async startDeviceFlow() {
    const clientId = (
      g('inClientId')?.value ||
      localStorage.getItem('twitchbot_client_id') ||
      ''
    ).trim();

    if (!clientId) {
      this._setStatus('error',
        '✘ Enter your Client ID first — register at dev.twitch.tv/console');
      return;
    }

    saveField('twitchbot_client_id', clientId);

    /* Clear any leftover pending token from a previous attempt */
    try { localStorage.removeItem('twitchbot_pending_token'); } catch(_) {}

    this._setStatus('requesting', '⏳ Contacting Twitch…');
    this._hideCode();
    this.stopPoll();

    try {
      /*
       * Step 1 — request a device code.
       * This is a POST but the body is simple enough that OBS CEF
       * allows it as a "simple request" — no preflight needed.
       */
      const resp = await fetch('https://id.twitch.tv/oauth2/device', {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    new URLSearchParams({
          client_id: clientId,
          scopes:    this.SCOPES
        })
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        this._setStatus('error',
          `✘ ${err.message || 'Could not get device code — check your Client ID.'}`);
        return;
      }

      const data      = await resp.json();
      const expiresIn = data.expires_in || 1800;

      /*
       * Step 2 — open auth-callback.html in a real Chrome tab.
       *
       * FIX: use new URL() instead of a regex replace.
       * new URL() handles query strings, hashes, and trailing
       * slashes correctly per spec without edge-case regex matching.
       *
       * The device_code and client_id are passed via the URL hash so
       * they are never sent to any server — hash fragments are
       * client-only.  They are visible in browser history, which is
       * acceptable given the device_code is time-limited and single-use.
       */
      const callbackBase = new URL('auth-callback.html', location.href).href;
      const params = new URLSearchParams({
        device_code: data.device_code,
        client_id:   clientId,
        user_code:   data.user_code,
        expires_in:  expiresIn,
        interval:    data.interval             || 5,
        verify_uri:  data.verification_uri     || 'https://www.twitch.tv/activate'
      });

      const callbackUrl = callbackBase + '#' + params.toString();

      /*
       * FIX: check return value — window.open returns null when a
       * popup blocker intercepts the call.  The original code ignored
       * the return value, leaving the poll running with no tab open.
       */
      const win = window.open(callbackUrl, '_blank');
      if (!win) {
        this._setStatus('error',
          '✘ Popup was blocked — allow popups for this page and try again.');
        return;
      }

      /* Show the code here too so the user can see it without switching windows */
      this._showCode(
        data.user_code,
        data.verification_uri || 'https://www.twitch.tv/activate',
        expiresIn
      );

      /* Step 3 — poll localStorage for the token written by auth-callback.html */
      this._startLocalStoragePoll(expiresIn);

    } catch(e) {
      this._setStatus('error', `✘ Network error: ${e.message}`);
    }
  },


  /* ════════════════════════════════════════
     CANCEL
  ════════════════════════════════════════ */
  cancelFlow() {
    this.stopPoll();
    this._hideCode();
    this._setStatus('', '');
    try { localStorage.removeItem('twitchbot_pending_token'); } catch(_) {}
    logSys('Auth flow cancelled.');
  },


  /* ════════════════════════════════════════
     LOCALSTORAGE POLL
     auth-callback.html writes the token to
     'twitchbot_pending_token'.
     We check for it every 2 s.
  ════════════════════════════════════════ */
  _startLocalStoragePoll(expiresIn) {
    this.stopPoll();
    this._pollTimer = setInterval(() => this._checkPendingToken(), 2000);

    /*
     * FIX: auto-cancel when the device code expires.
     * Previously the poll ran indefinitely even after the code was no
     * longer valid — wasting resources and leaving the UI in a state
     * where the user could not tell whether to wait or restart.
     */
    this._expireTimer = setTimeout(() => {
      if (!this._pollTimer) return;   // already resolved — token was received
      this.stopPoll();
      this._hideCode();
      this._setStatus('error', '✘ Code expired — click Authorise to try again.');
    }, (expiresIn + 5) * 1000);      // +5 s grace period for clock skew
  },

  _checkPendingToken() {
    /*
     * FIX: split into two separate try/catch blocks.
     *
     * Previously both the localStorage read AND _onSuccess were inside
     * one try/catch.  If _onSuccess threw after localStorage.removeItem
     * had already run, the token was permanently lost and the error was
     * silently swallowed — the user had to restart the entire flow with
     * no explanation of what went wrong.
     */
    let token;
    try {
      token = localStorage.getItem('twitchbot_pending_token');
      if (!token) return;
      /* Consume immediately so a second poll tick never reads it again */
      localStorage.removeItem('twitchbot_pending_token');
    } catch(e) {
      console.warn('Auth poll localStorage error:', e);
      return;
    }
    /* _onSuccess is outside the try/catch — errors surface normally */
    this._onSuccess(token);
  },

  stopPoll() {
    if (this._pollTimer)   { clearInterval(this._pollTimer);  this._pollTimer   = null; }
    /* FIX: also clear the expiry timer — both timers belong to one flow */
    if (this._expireTimer) { clearTimeout(this._expireTimer); this._expireTimer = null; }
  },


  /* ════════════════════════════════════════
     SUCCESS
  ════════════════════════════════════════ */
  _onSuccess(token) {
    this.stopPoll();
    this._hideCode();

    /*
     * FIX: validate token format before accepting it.
     *
     * auth-callback.html is expected to prepend 'oauth:' before writing
     * to localStorage (this is a cross-file contract).  If it wrote an
     * error message or empty string instead, the IRC connection would
     * fail later with a confusing auth error.  Catch it here instead.
     */
    if (!token || typeof token !== 'string' || !token.startsWith('oauth:')) {
      this._setStatus('error', '✘ Invalid token received — please try again.');
      return;
    }

    const field = g('inOauth');
    if (field) field.value = token;

    const badge = g('tokenStatus');
    if (badge) badge.textContent = '✔ authorized';

    this._setStatus('success', '✔ Token received — enter channel and click Connect.');
    logSys('✔ Twitch authorisation complete — click Connect.');
  },


  /* ════════════════════════════════════════
     UI HELPERS
  ════════════════════════════════════════ */
  _showCode(userCode, verificationUri, expiresIn) {
    const codeEl   = g('authUserCode');
    const linkEl   = g('authVerifyLink');
    const wrapEl   = g('authCodeWrap');
    const expiryEl = g('authExpiry');

    if (codeEl)   codeEl.textContent = userCode;
    if (linkEl)   linkEl.href        = verificationUri;

    /*
     * FIX: live countdown replaces the original static text.
     * The original set "Expires in 30 minutes" once and never updated
     * it — after 25 minutes of waiting it still showed the same text.
     */
    if (expiryEl) {
      let remaining = expiresIn;
      const tick = () => {
        if (remaining <= 0) {
          expiryEl.textContent = 'Code expired';
          return;
        }
        const m = Math.floor(remaining / 60);
        const s = remaining % 60;
        expiryEl.textContent = `Expires in ${m}:${String(s).padStart(2, '0')}`;
        remaining--;
        this._expiryCountdown = setTimeout(tick, 1000);
      };
      tick();
    }

    if (wrapEl) wrapEl.hidden = false;

    this._setStatus('waiting',
      '⏳ A new tab has opened — go to twitch.tv/activate and enter the code shown.');
  },

  _hideCode() {
    /*
     * FIX: clear the countdown timer when hiding the code box.
     * Previously it kept ticking in the background after cancelFlow()
     * or a successful auth, firing setTimeout callbacks indefinitely.
     */
    if (this._expiryCountdown) {
      clearTimeout(this._expiryCountdown);
      this._expiryCountdown = null;
    }
    const wrapEl = g('authCodeWrap');
    if (wrapEl) wrapEl.hidden = true;
  },

  _setStatus(state, text) {
    const el = g('authStatus');
    if (!el) return;
    el.textContent = text;
    el.className   = 'auth-status' + (state ? ' auth-status-' + state : '');
  },

  copyCode() {
    const code = g('authUserCode')?.textContent || '';
    if (!code || code === '--------') return;
    navigator.clipboard.writeText(code)
      .then(()  => logSys('Code copied ✔'))
      /* FIX: surface failure — original silently swallowed it */
      .catch(()  => this._setStatus('error',
        '✘ Copy failed — select the code and copy manually.'));
  }

};