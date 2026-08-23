/* ════════════════════════════════════════
   SHOUTOUT PLUGIN  v2.3

   Basic shoutout — always works.
   Enhanced shoutout when Client ID is set:
     - Detects channel's last game
     - Picks a random clip
     - Plays clip as direct MP4 video
     - Auto-detects clip length
     - Hides overlay when clip ends

   Chat commands (mod+):
     !so @username
     !shoutout @username
════════════════════════════════════════ */

BotPlugin.define({

  id:      'shoutout',
  name:    'Shoutout',
  version: '2.3',


  /* ════════════════════════════════════════
     SIDEBAR PANEL
  ════════════════════════════════════════ */
  sidebarHtml() {
    return `
      <div class="panel" id="panel-shoutout">
        <div class="panel-title" onclick="togglePanel('shoutout')">
          Shoutout <span class="chevron">▾</span>
        </div>
        <div class="panel-body">

          <p class="help" style="margin-bottom:8px">
            Customise the shoutout message.<br>
            <code>{name}</code> is replaced with the username.
          </p>

          <div class="field">
            <label>Message Template</label>
            <input id="soTemplate"
                   type="text"
                   autocomplete="off" spellcheck="false"
                   placeholder="🎙️ Go check out {name} at https://twitch.tv/{name} 💜"
                   oninput="ShoutoutPlugin.saveTemplate(this.value)">
          </div>

          <p class="help" style="margin-top:6px; margin-bottom:4px">
            <strong>Preview:</strong><br>
            <span id="soPreview"
                  style="color:#6a6a80; font-style:italic;">
            </span>
          </p>

          <div class="divider">clip overlay</div>

          <div class="field">
            <label>
              Max clip duration on overlay (s)
              <span class="opt">clip ends early if shorter</span>
            </label>
            <input id="soClipDuration"
                   type="number" min="0" value="30"
                   oninput="saveField('twitchbot_so_clip_duration', this.value)">
          </div>

          <p class="help" style="margin-top:8px">
            Requires <strong>Client ID</strong> in the Connection
            panel. Without it only the basic message is sent.<br><br>
            Chat: <code>!so @user</code> ·
            <code>!shoutout @user</code>
            <em>(mod+)</em>
          </p>

        </div>
      </div>`;
  },


  /* ════════════════════════════════════════
     INIT
  ════════════════════════════════════════ */
  init() {
    window.ShoutoutPlugin = ShoutoutPlugin;

    /* Restore saved template */
    const saved = localStorage.getItem('twitchbot_so_template');
    const inp   = document.getElementById('soTemplate');
    if (inp && saved !== null) inp.value = saved;

    /* Restore max clip duration */
    const savedDur = localStorage.getItem('twitchbot_so_clip_duration');
    const durInp   = document.getElementById('soClipDuration');
    if (durInp && savedDur !== null) durInp.value = savedDur;

    ShoutoutPlugin._updatePreview();
  },


  /* ════════════════════════════════════════
     CHAT COMMANDS
  ════════════════════════════════════════ */
  chatCommands: {

    '!so': {
      permission: 'moderator',
      cooldown:   5,
      async handle({ parts, chan }) {
        const target = (parts[1] || '').replace(/^@/, '').trim();
        if (!target) { send(chan, 'Usage: !so @username'); return; }
        await ShoutoutPlugin.doShoutout(target, chan);
      }
    },

    '!shoutout': {
      permission: 'moderator',
      cooldown:   5,
      async handle({ parts, chan }) {
        const target = (parts[1] || '').replace(/^@/, '').trim();
        if (!target) { send(chan, 'Usage: !shoutout @username'); return; }
        await ShoutoutPlugin.doShoutout(target, chan);
      }
    }

  }

});


/* ════════════════════════════════════════
   SHOUTOUT HELPER OBJECT
════════════════════════════════════════ */
const ShoutoutPlugin = {

  DEFAULT: '🎙️ Go check out {name} over at https://twitch.tv/{name} — give them a follow! 💜',


  /* ── Template helpers ── */

  getTemplate() {
    return localStorage.getItem('twitchbot_so_template') || this.DEFAULT;
  },

  saveTemplate(val) {
    try { localStorage.setItem('twitchbot_so_template', val || ''); } catch(_) {}
    this._updatePreview();
  },

  buildMessage(name) {
    return this.getTemplate().replace(/\{name\}/g, name);
  },

  _updatePreview() {
    const el = document.getElementById('soPreview');
    if (!el) return;
    el.textContent = this.buildMessage('ExampleStreamer');
  },


  /* ════════════════════════════════════════
     MAIN SHOUTOUT FLOW
  ════════════════════════════════════════ */
  async doShoutout(target, chan) {

    /* 1 — Send basic shoutout immediately */
    send(chan, this.buildMessage(target));

    /* 2 — Skip API enrichment if no Client ID */
    const clientId = localStorage.getItem('twitchbot_client_id') || '';
    if (!clientId) {
      logSys('Shoutout: no Client ID set — skipping game/clip lookup.');
      return;
    }

    /* 3 — Fetch channel info and clips */
    const info = await this.fetchChannelInfo(target);
    if (!info) return;

    /* 4 — Game message */
    if (info.game) {
      send(chan, `🎮 ${target} was last playing: ${info.game}`);
    }

    /* 5 — Clip */
    if (info.clip) {
      const { title, url, thumbnail, videoUrl, durationSeconds } = info.clip;

      /*
       * Cap overlay duration to the configured maximum.
       * If the clip is shorter than the maximum, use the clip
       * length + 1 s buffer so it hides cleanly after playback.
       * The overlay also hides on the video's onended event,
       * so whichever fires first wins.
       */
      const maxDur   = parseInt(
        document.getElementById('soClipDuration')?.value ||
        localStorage.getItem('twitchbot_so_clip_duration') ||
        '30'
      );
      const clipSecs = durationSeconds || 0;
      const dur      = clipSecs > 0
        ? Math.min(maxDur, Math.ceil(clipSecs) + 1)
        : maxDur;

      logSys(`Shoutout: clip duration = ${clipSecs}s — overlay timeout = ${dur}s`);

      send(chan, `🎬 Clip: "${title}" → ${url}`);

      if (videoUrl) {
        logSys(`Shoutout: playing clip — ${title}`);

        sendToOverlay({
          type:    'alert-show',
          content: {
            type:     'video',
            url:      videoUrl,
            mime:     'video/mp4',
            duration: dur,
            text:     ''
          }
        });

      } else {
        /* No direct video URL — show thumbnail for full duration */
        logSys('Shoutout: no direct video URL — showing thumbnail only.');
        sendToOverlay({
          type:    'alert-show',
          content: {
            type:     'gif',
            url:      thumbnail,
            duration: dur,
            text:     `📺 ${target}${info.game ? '  ·  ' + info.game : ''}`
          }
        });
      }

    } else if (info.game) {
      /* No clip found — brief text overlay */
      sendToOverlay({
        type:    'alert-show',
        content: {
          type:     'text-only',
          duration: 5,
          text:     `📺 ${target}  ·  ${info.game}`
        }
      });
    }
  },


  /* ════════════════════════════════════════
     VIDEO URL — METHOD 1
     Derive from thumbnail URL.
     Only works for older Twitch CDN format:
     clips-media-assets2.twitch.tv
  ════════════════════════════════════════ */
  _extractVideoUrl(thumbnailUrl) {
    if (!thumbnailUrl) return null;
    try {
      if (!thumbnailUrl.includes('clips-media-assets2.twitch.tv')) {
        return null;
      }
      const videoUrl = thumbnailUrl
        .replace(/-preview-\d+x\d+\.jpg$/i, '.mp4')
        .replace(/-preview\.jpg$/i,          '.mp4');
      if (videoUrl.endsWith('.mp4')) {
        logSys(`Shoutout: derived video URL = ${videoUrl}`);
        return videoUrl;
      }
      return null;
    } catch(_) { return null; }
  },


  /* ════════════════════════════════════════
     VIDEO URL — METHOD 2
     Fetch via Twitch GQL API.
     Used for newer VAP-format clips where
     the MP4 URL cannot be derived from the
     thumbnail URL.
  ════════════════════════════════════════ */
  async _fetchClipVideoUrl(clipId) {
    try {
      logSys(`Shoutout: fetching clip URL for "${clipId}" via GQL…`);

      const resp = await fetch('https://gql.twitch.tv/gql', {
        method:  'POST',
        headers: {
          'Client-ID':    'kimne78kx3ncx6brgo4mv6wki5h1ko',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: `
            {
              clip(slug: "${clipId}") {
                playbackAccessToken(
                  params: {
                    platform: "web"
                    playerBackend: "mediaplayer"
                    playerType: "site"
                  }
                ) {
                  signature
                  value
                }
                videoQualities {
                  frameRate
                  quality
                  sourceURL
                }
              }
            }
          `
        })
      });

      if (!resp.ok) {
        logSys(`Shoutout: GQL request failed (${resp.status})`, true);
        return null;
      }

      const data = await resp.json();
      const clip = data?.data?.clip;

      if (!clip) {
        logSys('Shoutout: GQL returned no clip data', true);
        return null;
      }

      const qualities = clip.videoQualities || [];
      if (!qualities.length) {
        logSys('Shoutout: no video qualities returned from GQL', true);
        return null;
      }

      const token   = clip.playbackAccessToken;
      const best    = qualities[0];
      const sigPart = token
        ? `?sig=${encodeURIComponent(token.signature)}&token=${encodeURIComponent(token.value)}`
        : '';

      const videoUrl = best.sourceURL + sigPart;
      logSys('Shoutout: GQL video URL obtained ✔');
      return videoUrl;

    } catch(e) {
      logSys(`Shoutout: GQL error — ${e.message}`, true);
      return null;
    }
  },


  /* ════════════════════════════════════════
     TWITCH HELIX API
  ════════════════════════════════════════ */
  async fetchChannelInfo(login) {
    const clientId = localStorage.getItem('twitchbot_client_id') || '';
    const token    = (document.getElementById('inOauth')?.value || '')
                       .replace(/^oauth:/, '')
                       .trim();

    if (!clientId) return null;
    if (!token) {
      logSys('Shoutout: OAuth token not available.', true);
      return null;
    }

    const headers = {
      'Client-ID':     clientId,
      'Authorization': `Bearer ${token}`
    };

    try {

      /* ── Step 1: login → user ID ── */
      const userResp = await fetch(
        `https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`,
        { headers }
      );

      if (!userResp.ok) {
        logSys(
          `Shoutout: API error ${userResp.status} — check Client ID and token.`,
          true
        );
        return null;
      }

      const userData = await userResp.json();
      const user     = userData.data?.[0];
      if (!user) {
        logSys(`Shoutout: user "${login}" not found on Twitch.`, true);
        return null;
      }

      logSys(`Shoutout: found user ${user.display_name} (id: ${user.id})`);

      /* ── Step 2: channel info + clips (parallel) ── */
      const [chanResp, allClipsResp] = await Promise.all([
        fetch(
          `https://api.twitch.tv/helix/channels?broadcaster_id=${user.id}`,
          { headers }
        ),
        fetch(
          `https://api.twitch.tv/helix/clips?broadcaster_id=${user.id}&first=20`,
          { headers }
        )
      ]);

      const chanData     = chanResp.ok     ? await chanResp.json()     : null;
      const allClipsData = allClipsResp.ok ? await allClipsResp.json() : null;

      const channel  = chanData?.data?.[0];
      const gameName = channel?.game_name || '';
      const gameId   = channel?.game_id   || '';

      logSys(`Shoutout: last game = "${gameName}"`);

      let clips = allClipsData?.data || [];
      logSys(`Shoutout: found ${clips.length} total clips`);

      /* ── Step 3: narrow to last game if possible ── */
      if (gameId && clips.length > 0) {
        const gameClipsResp = await fetch(
          `https://api.twitch.tv/helix/clips` +
          `?broadcaster_id=${user.id}` +
          `&game_id=${gameId}` +
          `&first=20`,
          { headers }
        );
        if (gameClipsResp.ok) {
          const gameClipsData = await gameClipsResp.json();
          const gameClips     = gameClipsData?.data || [];
          logSys(`Shoutout: found ${gameClips.length} clips for "${gameName}"`);
          if (gameClips.length > 0) clips = gameClips;
        }
      }

      /* ── Step 4: pick a random clip ── */
      const clip = clips.length > 0
        ? clips[Math.floor(Math.random() * clips.length)]
        : null;

      if (clip) {
        logSys(`Shoutout: selected clip "${clip.title}" (${clip.duration}s)`);
      } else {
        logSys('Shoutout: no clips found for this channel.');
      }

      /* ── Step 5: get direct video URL ── */
      let videoUrl = this._extractVideoUrl(clip?.thumbnail_url);
      if (!videoUrl && clip?.id) {
        videoUrl = await this._fetchClipVideoUrl(clip.id);
      }

      return {
        game: gameName,
        clip: clip ? {
          id:              clip.id,
          title:           clip.title,
          url:             clip.url,
          thumbnail:       clip.thumbnail_url,
          videoUrl:        videoUrl,
          views:           clip.view_count,
          durationSeconds: clip.duration || 0
        } : null
      };

    } catch(e) {
      logSys(`Shoutout API error: ${e.message}`, true);
      return null;
    }
  }

};