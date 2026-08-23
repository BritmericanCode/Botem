/* ════════════════════════════════════════
   PLUGIN REGISTRY
════════════════════════════════════════ */

const BotPlugin = {

  _plugins:   [],
  _cooldowns: Object.create(null),


  /* ── Registration ── */

  define(config) {
    if (!config.id) {
      console.warn('BotPlugin.define: missing id'); return;
    }
    if (!/^[a-z0-9_-]+$/i.test(config.id)) {
      console.warn(
        `BotPlugin.define: invalid id "${config.id}" — ` +
        `use letters, numbers, hyphens, or underscores only.`
      );
      return;
    }
    if (this._plugins.find(p => p.id === config.id)) {
      console.warn(`BotPlugin: duplicate plugin id "${config.id}"`); return;
    }
    this._plugins.push(config);
  },

  all() { return [...this._plugins]; },
  get(id) { return this._plugins.find(p => p.id === id); },


  /* ── Enable / Disable ── */

  isEnabled(id) {
    try {
      const raw = localStorage.getItem('twitchbot_plugin_enabled_' + id);
      return raw === null ? true : raw === 'true';
    } catch(_) { return true; }
  },

  setEnabled(id, enabled) {
    try {
      localStorage.setItem('twitchbot_plugin_enabled_' + id, String(enabled));
    } catch(_) {}
    this._applyEnabledState(id, enabled);

    /*
     * FIX: broadcast the toggle to the overlay immediately.
     *
     * Previously, disabling a plugin only affected FUTURE dispatch on
     * the bot side (chatCommands / onMessage / onDisplay all check
     * isEnabled()) — it had no effect on anything the plugin had
     * ALREADY sent to the overlay. Chat Overlay text stayed on screen,
     * a Death Counter or Timer stayed visible, indefinitely, until
     * something else happened to refresh them.
     *
     * sendToOverlay() is defined in obs.js, loaded after this file —
     * this is a runtime-only dependency (setEnabled is only ever
     * called from a user's click, long after all scripts have
     * loaded), so the typeof guard is defensive only.
     */
    if (typeof sendToOverlay === 'function') {
      sendToOverlay({ type: 'plugin-toggle', id, enabled: !!enabled });
    }
  },

  _applyEnabledState(id, enabled) {
    const body   = document.getElementById(`plugin-body-${id}`);
    const toggle = document.getElementById(`plugin-toggle-${id}`);
    const track  = document.getElementById(`plugin-track-${id}`);

    if (body) {
      body.style.opacity       = enabled ? '' : '0.35';
      body.style.pointerEvents = enabled ? '' : 'none';
    }
    if (toggle) toggle.checked         = enabled;
    if (track)  track.style.background = enabled ? '#9147ff' : '#3a3a3d';
  },


  /* ── Loading ── */

  async loadAll() {
    const list = window.ENABLED_PLUGINS;
    if (!Array.isArray(list)) {
      console.warn('BotPlugin.loadAll: window.ENABLED_PLUGINS not defined — no plugins loaded.');
      this._initAll();
      return;
    }

    for (const name of list) {
      await this._loadScript(`plugins/${name}/${name}.js`)
        .catch(e => {
          console.warn(`Plugin "${name}" failed to load:`, e);
          this._warn(`Plugin "${name}" could not be loaded — check plugins/${name}/${name}.js exists.`);
        });
    }

    this._initAll();
  },

  _loadScript(src) {
    return new Promise((resolve, reject) => {
      const s   = document.createElement('script');
      s.src     = src;
      s.onload  = resolve;
      s.onerror = e => { s.remove(); reject(e); };
      document.head.appendChild(s);
    });
  },

  _initAll() {
    for (const plugin of this._plugins) {
      try {
        if (typeof plugin.sidebarHtml === 'function') {
          this._injectPanel(plugin);
        }
        if (typeof plugin.init === 'function') plugin.init();
        this._applyEnabledState(plugin.id, this.isEnabled(plugin.id));
      } catch(e) {
        console.error(`Plugin "${plugin.id}" init error:`, e);
        this._warn(`Plugin "${plugin.id}" threw an error during init — see console.`);
      }
    }
  },

  _injectPanel(plugin) {
    const rawHtml = plugin.sidebarHtml();
    if (!rawHtml) return;

    const tmpl = document.createElement('template');
    tmpl.innerHTML = rawHtml.trim();
    const panel = tmpl.content.firstElementChild;
    if (!panel) return;

    panel.classList.add('collapsed');

    const titleEl = panel.querySelector('.panel-title');
    const bodyEl  = panel.querySelector('.panel-body');

    if (titleEl && bodyEl) {
      bodyEl.id = `plugin-body-${plugin.id}`;

      const toggleHtml = `
        <label id="plugin-track-${plugin.id}"
               class="plugin-toggle-track"
               title="Enable / disable ${esc(plugin.name || plugin.id)}"
               onclick="event.stopPropagation()"
               style="background:#9147ff">
          <input id="plugin-toggle-${plugin.id}"
                 class="plugin-toggle-input"
                 type="checkbox"
                 checked
                 onchange="BotPlugin.setEnabled('${plugin.id}', this.checked)">
          <span class="plugin-toggle-thumb"></span>
        </label>`;

      const chevron = titleEl.querySelector('.chevron');
      if (chevron) chevron.insertAdjacentHTML('beforebegin', toggleHtml);
      else         titleEl.insertAdjacentHTML('beforeend',   toggleHtml);
    }

    const anchor = document.getElementById('panel-activecmds');
    const aside  = document.querySelector('aside');
    if (aside && anchor) aside.insertBefore(panel, anchor);
    else if (aside)      aside.appendChild(panel);
  },


  /* ── Cooldown helpers ── */

  _isOnCooldown(pluginId, token, nick, cdSecs) {
    if (!cdSecs) return false;
    const key    = `${pluginId}:${token}`;
    const bucket = this._cooldowns[key];
    if (!bucket) return false;
    const ts = bucket[nick];
    return !!ts && (Date.now() - ts) < cdSecs * 1000;
  },

  _stampCooldown(pluginId, token, nick) {
    const key = `${pluginId}:${token}`;
    if (!this._cooldowns[key]) this._cooldowns[key] = Object.create(null);
    const bucket = this._cooldowns[key];

    const nicks = Object.keys(bucket);
    if (nicks.length > 500) delete bucket[nicks[0]];

    bucket[nick] = Date.now();
  },


  /* ── Command dispatch ── */

  async handleCommand(token, dname, nick, parts, chan, tags) {
    const ul = getUserLevel(tags);

    for (const plugin of this._plugins) {

      if (!this.isEnabled(plugin.id)) continue;

      const def = plugin.chatCommands?.[token];
      if (!def) continue;

      if (!canUse(ul, def.permission || 'everyone')) continue;

      const cdSec = def.cooldown ?? 0;
      if (cdSec > 0) {
        if (this._isOnCooldown(plugin.id, token, nick, cdSec)) return true;
        this._stampCooldown(plugin.id, token, nick);
      }

      try {
        await def.handle({ dname, nick, parts, chan, tags });
      } catch(e) {
        console.error(`Plugin "${plugin.id}" command "${token}" error:`, e);
      }

      return true;
    }

    return false;
  },

  dispatchMessage(dname, nick, text, chan, tags) {
    for (const plugin of this._plugins) {
      if (!this.isEnabled(plugin.id))             continue;
      if (typeof plugin.onMessage !== 'function') continue;
      try {
        plugin.onMessage({ dname, nick, text, chan, tags });
      } catch(e) {
        console.error(`Plugin "${plugin.id}" onMessage error:`, e);
      }
    }
  },

  dispatchDisplay(name, text, isBot) {
    for (const plugin of this._plugins) {
      if (!this.isEnabled(plugin.id))             continue;
      if (typeof plugin.onDisplay !== 'function') continue;
      try {
        plugin.onDisplay({ name, text, isBot });
      } catch(e) {
        console.error(`Plugin "${plugin.id}" onDisplay error:`, e);
      }
    }
  },

  _warn(msg) {
    if (typeof logSys === 'function') logSys('⚠ ' + msg, true);
    else console.warn(msg);
  }

};