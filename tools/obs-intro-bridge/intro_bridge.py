"""
Intro Bridge — OBS Python Script
══════════════════════════════════

Runs a small local-only HTTP server, launched automatically whenever OBS
starts, that lets the browser-based bot (running inside OBS's sandboxed
Browser Dock) save viewer-submitted intro sounds directly to disk.

WHY THIS EXISTS:
OBS's embedded browser (CEF) blocks the File System Access API's real
permission prompts (showSaveFilePicker/showOpenFilePicker throw
NotAllowedError), even though normal networking to localhost works fine
(the overlay already proves this via its obs-websocket connection). This
script sidesteps that entirely: the browser side just does a normal
fetch() to 127.0.0.1, and this script — running as a real, unrestricted
Python process — does the actual downloading and file-writing.

SETUP:
1. In OBS: Tools → Scripts → Python Settings, point it at a Python 3
   install if not already configured.
2. Tools → Scripts → "+" → select this file.
3. In the script's settings panel (right side of that same window), set:
     - Sounds Folder → your project's sounds/ folder
     - Shared Token  → leave the auto-generated value, or set your own
     - Port          → default 8756 is fine unless it conflicts
4. Copy the Shared Token value into the bot's own settings (bot-side
   wiring is a separate step — this script works fully standalone and
   can be tested with curl/Postman before that's connected).

This script has no dependency on anything else in the project and can be
tested entirely on its own.
"""

import obspython as obs
import http.server
import threading
import json
import os
import re
import socket
import secrets
import hmac
import urllib.request
import urllib.parse
import urllib.error
import ipaddress


# ════════════════════════════════════════
# CONFIG (populated by OBS's script settings)
# ════════════════════════════════════════
CONFIG = {
    'sounds_folder': '',
    'token':         '',
    'port':          8756,
    'max_bytes':     15 * 1024 * 1024,
    'overwrite':     True,
}

_server        = None
_server_thread = None


# ════════════════════════════════════════
# URL SAFETY (SSRF protection)
# ════════════════════════════════════════
def _is_blocked_ip(ip_str):
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError:
        return True  # unparsable -> treat as unsafe
    return (
        ip.is_loopback or ip.is_private or ip.is_link_local or
        ip.is_reserved or ip.is_multicast or ip.is_unspecified
    )


def _is_safe_url(url):
    parsed = urllib.parse.urlparse(url)

    if parsed.scheme not in ('http', 'https'):
        return False, 'Only http/https URLs are allowed.'

    hostname = parsed.hostname
    if not hostname:
        return False, 'That URL has no host.'

    if hostname.lower() == 'localhost':
        return False, 'That URL is not allowed.'

    try:
        infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        return False, 'Could not resolve that host.'

    for info in infos:
        ip_str = info[4][0]
        if _is_blocked_ip(ip_str):
            return False, 'That URL is not allowed.'

    return True, None


def _transform_url(url):
    """Rewrite known short-link/embed URLs to a direct media link.
    Mirrors the same transform already used on the bot side for
    Vocaroo links (both vocaroo.com and voca.ro)."""
    m = re.search(r'(?:vocaroo\.com|voca\.ro)/(?:embed/)?([A-Za-z0-9]+)', url)
    if m:
        return f'https://media1.vocaroo.com/mp3/{m.group(1)}'
    return url


# ════════════════════════════════════════
# DOWNLOAD + VALIDATION
# ════════════════════════════════════════
_NON_AUDIO_CONTENT_TYPES = {
    'text/html', 'text/plain', 'application/json',
    'application/xml', 'text/xml',
}

_CONTENT_TYPE_EXT_MAP = {
    'audio/mpeg':   '.mp3',
    'audio/mp3':    '.mp3',
    'audio/wav':    '.wav',
    'audio/x-wav':  '.wav',
    'audio/wave':   '.wav',
    'audio/ogg':    '.ogg',
    'audio/webm':   '.webm',
    'audio/flac':   '.flac',
    'audio/x-flac': '.flac',
}


class _NoAutoRedirect(urllib.request.HTTPRedirectHandler):
    """Intercepts redirects so each hop's target can be re-validated
    against the SSRF checks before it's followed, rather than trusting
    urllib to silently chase an arbitrary redirect chain."""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None  # causes the 3xx response itself to be returned,
                      # instead of being auto-followed


def _detect_extension(data, content_type):
    if len(data) >= 4:
        head4 = data[:4]
        if head4 == b'OggS':
            return '.ogg'
        if head4 == b'fLaC':
            return '.flac'
        if head4 == b'\x1A\x45\xDF\xA3':
            return '.webm'
        if head4 == b'RIFF' and len(data) >= 12 and data[8:12] == b'WAVE':
            return '.wav'
    if len(data) >= 3 and data[:3] == b'ID3':
        return '.mp3'
    if len(data) >= 2 and data[0] == 0xFF and (data[1] & 0xE0) == 0xE0:
        return '.mp3'  # bare MP3 frame sync, no ID3 tag

    return _CONTENT_TYPE_EXT_MAP.get(content_type)  # None if unverifiable


def fetch_audio(url, max_bytes, timeout=10, max_redirects=5):
    current_url = _transform_url(url)

    for _ in range(max_redirects + 1):
        ok, err = _is_safe_url(current_url)
        if not ok:
            raise ValueError(err)

        req    = urllib.request.Request(current_url, headers={'User-Agent': 'IntroBridge/1.0'})
        opener = urllib.request.build_opener(_NoAutoRedirect())

        try:
            resp = opener.open(req, timeout=timeout)
        except urllib.error.HTTPError as e:
            raise ValueError(f'That link returned an error (HTTP {e.code}).')
        except urllib.error.URLError:
            raise ValueError('Could not reach that URL.')

        status = getattr(resp, 'status', None) or resp.getcode()

        if status in (301, 302, 303, 307, 308):
            location = resp.headers.get('Location')
            resp.close()
            if not location:
                raise ValueError('That link redirected with no destination.')
            current_url = urllib.parse.urljoin(current_url, location)
            continue

        content_type = (resp.headers.get('Content-Type') or '').split(';')[0].strip().lower()
        if content_type in _NON_AUDIO_CONTENT_TYPES or content_type.startswith('text/'):
            resp.close()
            raise ValueError('That link does not point to an audio file.')

        data = bytearray()
        while True:
            chunk = resp.read(65536)
            if not chunk:
                break
            data.extend(chunk)
            if len(data) > max_bytes:
                resp.close()
                raise ValueError('That file is too large.')
        resp.close()

        return bytes(data), content_type

    raise ValueError('Too many redirects.')


# ════════════════════════════════════════
# FILENAME SAFETY
# ════════════════════════════════════════
_RESERVED_WINDOWS_NAMES = (
    {'CON', 'PRN', 'AUX', 'NUL'} |
    {f'COM{i}' for i in range(1, 10)} |
    {f'LPT{i}' for i in range(1, 10)}
)


def sanitize_filename(name):
    name = (name or '').strip()
    name = name.replace('/', '_').replace('\\', '_').replace('..', '_')
    name = re.sub(r'[^A-Za-z0-9_-]', '_', name)
    name = name.strip('._')

    if not name:
        name = 'user'
    if name.upper() in _RESERVED_WINDOWS_NAMES:
        name = f'_{name}'

    return name[:64]


def resolve_final_path(folder, base_name, ext, overwrite):
    candidate = os.path.join(folder, base_name + ext)
    if overwrite or not os.path.exists(candidate):
        return candidate

    i = 2
    while True:
        candidate = os.path.join(folder, f'{base_name}_{i}{ext}')
        if not os.path.exists(candidate):
            return candidate
        i += 1


def write_file_atomic(path, data):
    tmp_path = path + '.tmp'
    with open(tmp_path, 'wb') as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp_path, path)  # atomic on both Windows and POSIX


# ════════════════════════════════════════
# HTTP HANDLER
# ════════════════════════════════════════
class Handler(http.server.BaseHTTPRequestHandler):
    server_version = 'IntroBridge/1.0'

    def _send_json(self, status, obj):
        body = json.dumps(obj).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_GET(self):
        if self.path == '/health':
            self._send_json(200, {'ok': True, 'service': 'intro-bridge'})
        else:
            self._send_json(404, {'ok': False, 'error': 'Not found.'})

    def do_POST(self):
        if self.path != '/claim-intro':
            self._send_json(404, {'success': False, 'error': 'Unknown endpoint.'})
            return

        try:
            length = int(self.headers.get('Content-Length', '0') or '0')
        except ValueError:
            length = 0

        if length <= 0 or length > 8192:
            self._send_json(400, {'success': False, 'error': 'Invalid request size.'})
            return

        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode('utf-8'))
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._send_json(400, {'success': False, 'error': 'Invalid JSON.'})
            return

        token = str(payload.get('token', ''))
        name  = str(payload.get('name', ''))
        url   = str(payload.get('url', ''))

        if not CONFIG['token'] or not hmac.compare_digest(token, CONFIG['token']):
            self._send_json(403, {'success': False, 'error': 'Invalid token.'})
            return

        if not CONFIG['sounds_folder'] or not os.path.isdir(CONFIG['sounds_folder']):
            self._send_json(500, {'success': False, 'error': 'Sounds folder is not configured on the bridge.'})
            return

        if not url:
            self._send_json(400, {'success': False, 'error': 'No URL provided.'})
            return

        safe_name = sanitize_filename(name)

        try:
            data, content_type = fetch_audio(url, CONFIG['max_bytes'])
        except ValueError as e:
            self._send_json(400, {'success': False, 'error': str(e)})
            return
        except Exception as e:
            print(f'[IntroBridge] fetch error: {e}')
            self._send_json(502, {'success': False, 'error': 'Could not download that URL.'})
            return

        ext = _detect_extension(data, content_type)
        if not ext:
            self._send_json(400, {'success': False, 'error': 'That does not look like a supported audio file.'})
            return

        final_path = resolve_final_path(CONFIG['sounds_folder'], safe_name, ext, CONFIG['overwrite'])

        try:
            write_file_atomic(final_path, data)
        except OSError as e:
            print(f'[IntroBridge] write error: {e}')
            self._send_json(500, {'success': False, 'error': 'Could not save the file locally.'})
            return

        filename = os.path.basename(final_path)
        print(f'[IntroBridge] Saved intro for "{name}" -> {filename} ({len(data)} bytes)')
        self._send_json(200, {'success': True, 'filename': filename})

    def log_message(self, fmt, *args):
        pass  # suppress default per-request console noise


# ════════════════════════════════════════
# SERVER LIFECYCLE
# ════════════════════════════════════════
def start_server():
    global _server, _server_thread
    stop_server()

    try:
        _server = http.server.ThreadingHTTPServer(('127.0.0.1', CONFIG['port']), Handler)
    except OSError as e:
        print(f'[IntroBridge] Could not bind to 127.0.0.1:{CONFIG["port"]} — {e}')
        _server = None
        return

    _server_thread = threading.Thread(target=_server.serve_forever, daemon=True)
    _server_thread.start()
    print(f'[IntroBridge] Listening on http://127.0.0.1:{CONFIG["port"]}')


def stop_server():
    global _server, _server_thread
    if _server:
        try:
            _server.shutdown()
            _server.server_close()
        except Exception:
            pass
    _server        = None
    _server_thread = None


# ════════════════════════════════════════
# OBS SCRIPT HOOKS
# ════════════════════════════════════════
def script_description():
    return (
        "<b>Intro Bridge</b><br><br>"
        "Runs a small local-only server so the browser-based bot can save "
        "viewer-submitted intro sounds directly to disk — bypassing the file "
        "permission restrictions inside OBS's Browser Dock.<br><br>"
        "Set a Sounds Folder below, then copy the Shared Token into the "
        "bot's settings."
    )


def script_defaults(settings):
    obs.obs_data_set_default_int(settings, 'port', 8756)
    obs.obs_data_set_default_int(settings, 'max_mb', 15)
    obs.obs_data_set_default_bool(settings, 'overwrite', True)
    obs.obs_data_set_default_string(settings, 'token', secrets.token_hex(16))


def script_properties():
    props = obs.obs_properties_create()
    obs.obs_properties_add_path(props, 'sounds_folder', 'Sounds Folder',
                                 obs.OBS_PATH_DIRECTORY, '', None)
    obs.obs_properties_add_int(props, 'port', 'Local Port', 1024, 65535, 1)
    obs.obs_properties_add_text(props, 'token', 'Shared Token', obs.OBS_TEXT_PASSWORD)
    obs.obs_properties_add_int(props, 'max_mb', 'Max File Size (MB)', 1, 100, 1)
    obs.obs_properties_add_bool(props, 'overwrite', 'Overwrite existing file on re-claim')
    return props


def script_update(settings):
    CONFIG['sounds_folder'] = obs.obs_data_get_string(settings, 'sounds_folder')
    CONFIG['token']         = obs.obs_data_get_string(settings, 'token')
    CONFIG['max_bytes']     = obs.obs_data_get_int(settings, 'max_mb') * 1024 * 1024
    CONFIG['overwrite']     = obs.obs_data_get_bool(settings, 'overwrite')

    new_port = obs.obs_data_get_int(settings, 'port')
    if new_port != CONFIG['port'] or _server is None:
        CONFIG['port'] = new_port
        start_server()


def script_load(settings):
    script_update(settings)


def script_unload():
    stop_server()