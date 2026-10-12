"""Measure original audio once; playback uses metadata, never processed audio."""
import hashlib
import ipaddress
import json
import math
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import tempfile
import threading
import time
from collections import OrderedDict
from urllib.parse import urljoin, urlparse

import requests

TARGET_LUFS = -18.0
PEAK_DBTP = -2.0
MAX_GAIN_DB = 6.0
FALLBACK_GAIN_DB = -2.0
MAX_AUDIO_BYTES = 100 * 1024 * 1024
ANALYSIS_VERSION = 1
INPUT_FORMATS = 'mp3,aac,mov,flac,wav,ogg'
MIMES = {'.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
         '.flac': 'audio/flac', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.opus': 'audio/ogg'}


def binary(name, root):
    configured = os.environ.get(name.upper() + '_PATH')
    if configured:
        return configured if Path(configured).is_file() else None
    bundled = Path(root) / '.cache' / 'tools' / 'ffmpeg' / (name + ('.exe' if os.name == 'nt' else ''))
    return str(bundled) if bundled.is_file() else shutil.which(name)


def run_tool(command, timeout=120):
    try:
        return subprocess.run(command, capture_output=True, text=True, encoding='utf-8',
                              errors='replace', timeout=timeout, check=True,
                              creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
    except (subprocess.SubprocessError, OSError) as error:
        raise RuntimeError('音频工具无法完整读取或分析该文件') from error


def probe_audio(path, root):
    tool = binary('ffprobe', root)
    if not tool:
        raise RuntimeError('缺少 FFprobe，请配置 FFPROBE_PATH')
    result = run_tool([tool, '-v', 'error', '-protocol_whitelist', 'file,pipe', '-format_whitelist', INPUT_FORMATS,
                       '-select_streams', 'a:0', '-show_streams', '-show_format',
                       '-of', 'json', str(path)], timeout=15)
    data = json.loads(result.stdout)
    streams = data.get('streams', [])
    if not streams:
        raise ValueError('文件不包含可播放音频')
    stream = streams[0]
    codec = stream.get('codec_name', '')
    container = data.get('format', {}).get('format_name', '')
    if codec == 'aac' and ('mov' in container or container == 'aac'):
        extension = '.m4a' if 'mov' in container else '.aac'
    elif codec == 'mp3' and container == 'mp3':
        extension = '.mp3'
    elif codec == 'flac' and container == 'flac':
        extension = '.flac'
    elif codec.startswith('pcm_') and container == 'wav':
        extension = '.wav'
    elif codec in ('opus', 'vorbis') and container == 'ogg':
        extension = '.opus' if codec == 'opus' else '.ogg'
    else:
        raise ValueError('当前播放器不支持此音频编码或容器')
    return {'codec': codec, 'container': container, 'extension': extension,
            'mime': MIMES[extension], 'sample_rate': int(stream.get('sample_rate', 0)),
            'channels': int(stream.get('channels', 0)),
            'bit_rate': int(stream.get('bit_rate') or data.get('format', {}).get('bit_rate') or 0)}


def parse_loudness(log):
    summary = log.rsplit('Summary:', 1)[-1]
    def value(pattern):
        match = re.search(pattern, summary)
        if not match:
            raise ValueError('响度分析结果不完整')
        return float(match.group(1))
    loudness = value(r'\bI:\s*(-?\d+(?:\.\d+)?|-inf)\s+LUFS')
    lra = value(r'\bLRA:\s*(\d+(?:\.\d+)?)\s+LU')
    peak = value(r'True peak:\s*Peak:\s*(-?\d+(?:\.\d+)?|-inf)\s+dBFS')
    if not math.isfinite(peak) or not math.isfinite(loudness) or loudness <= -70:
        return {'status': 'silent', 'gain_db': FALLBACK_GAIN_DB}
    gain = min(TARGET_LUFS - loudness, PEAK_DBTP - peak, MAX_GAIN_DB)
    return {'status': 'ready', 'integrated_lufs': loudness, 'true_peak_dbtp': peak,
            'loudness_range_lu': lra, 'gain_db': gain,
            'peak_limited': PEAK_DBTP - peak < TARGET_LUFS - loudness}


def measure_audio(path, root):
    metadata = probe_audio(path, root)
    if metadata['channels'] not in (1, 2):
        raise ValueError('整曲分析当前仅支持单声道和立体声')
    tool = binary('ffmpeg', root)
    if not tool:
        raise RuntimeError('缺少 FFmpeg，请配置 FFMPEG_PATH')
    result = run_tool([tool, '-hide_banner', '-nostdin', '-protocol_whitelist', 'file,pipe', '-format_whitelist', INPUT_FORMATS,
                       '-i', str(path), '-map', '0:a:0', '-af', 'ebur128=peak=true:dualmono=true',
                       '-f', 'null', '-'])
    return {**parse_loudness(result.stderr), 'audio': metadata}


def validate_remote_url(url):
    parsed = urlparse(url)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError('无效的音频地址')
    addresses = socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == 'https' else 80))
    if not addresses or any(not ipaddress.ip_address(item[4][0]).is_global for item in addresses):
        raise ValueError('不允许分析内网或本机音频地址')


def fetch_audio(url, path, headers=None):
    """Bounded, original-byte download; validate every redirect and never retry blocked sources."""
    deadline = time.monotonic() + 120
    with requests.Session() as session:
        for _ in range(6):
            validate_remote_url(url)
            with session.get(url, headers=headers or {}, stream=True, timeout=(4, 8), allow_redirects=False) as response:
                if response.status_code in (301, 302, 303, 307, 308):
                    url = urljoin(url, response.headers.get('Location', ''))
                    continue
                response.raise_for_status()
                if response.status_code != 200:
                    raise ValueError('音频必须完整返回，不能仅分析片段')
                expected = int(response.headers.get('Content-Length', 0))
                if expected > MAX_AUDIO_BYTES:
                    raise ValueError('音频超过 100 MB 分析上限')
                size = 0
                digest = hashlib.sha256()
                with open(path, 'wb') as output:
                    for chunk in response.iter_content(65536):
                        size += len(chunk)
                        if size > MAX_AUDIO_BYTES or time.monotonic() > deadline:
                            raise ValueError('音频下载超过大小或时间限制')
                        digest.update(chunk)
                        output.write(chunk)
                if not size or (expected and size != expected):
                    raise ValueError('音频文件不完整')
                return digest.hexdigest()
    raise ValueError('音频重定向次数过多')


class AudioAnalysis:
    def __init__(self, root, music_dir):
        self.root = Path(root)
        self.music_dir = Path(music_dir)
        self.directory = self.root / '.cache' / 'audio-analysis'
        self.lock = threading.RLock()
        self.sources = OrderedDict()
        self.jobs = OrderedDict()
        self.results = OrderedDict()
        self.wake = threading.Event()
        self.worker = None

    def register(self, url, headers=None, version=''):
        """Only playback-resolved sources are eligible for a background remote fetch."""
        with self.lock:
            previous = self.sources.get(url, {})
            safe_headers = {key: value for key, value in (headers or {}).items()
                            if key.lower() not in ('range', 'if-range')}
            self.sources[url] = {'headers': safe_headers or previous.get('headers', {}),
                                 'version': version or previous.get('version', ''), 'expires': time.time() + 3600}
            self.sources.move_to_end(url)
            while len(self.sources) > 256:
                self.sources.popitem(last=False)

    def source(self, audio_url):
        from urllib.parse import parse_qs, unquote
        parsed = urlparse(audio_url)
        if parsed.scheme or parsed.netloc:
            raise ValueError('仅支持播放器的同源音频路径')
        if parsed.path.startswith('/api/stream/'):
            filename = unquote(parsed.path[len('/api/stream/'):])
            path = (self.music_dir / filename).resolve()
            if path.parent != self.music_dir.resolve() or not path.is_file():
                raise ValueError('本地音频不存在或路径无效')
            stat = path.stat()
            if stat.st_size > MAX_AUDIO_BYTES:
                raise ValueError('音频超过 100 MB 分析上限')
            identity = f'local:{path.name}:{stat.st_mtime_ns}:{stat.st_size}'
            source = {'path': path, 'identity': identity, 'ttl': 0}
        elif parsed.path == '/api/proxy-stream':
            url = parse_qs(parsed.query).get('url', [''])[0]
            with self.lock:
                registered = self.sources.get(url)
                if not registered or registered['expires'] <= time.time():
                    raise ValueError('音源尚未解析或播放，请稍后重试')
                source = {'url': url, 'headers': registered['headers'], 'ttl': 300,
                          'identity': f"remote:{url}:{registered['version']}"}
        else:
            raise ValueError('无效的播放器音频路径')
        key = hashlib.sha256(f"{ANALYSIS_VERSION}:{source['identity']}".encode()).hexdigest()
        return key, source

    def cached(self, key):
        try:
            result = json.loads((self.directory / (key + '.json')).read_text(encoding='utf-8'))
            if not isinstance(result, dict) or result.get('status') not in ('ready', 'silent'):
                return None
            gain, expires = result.get('gain_db'), result.get('expires', 0)
            if type(gain) not in (int, float) or not math.isfinite(gain) or gain > MAX_GAIN_DB:
                return None
            if type(expires) not in (int, float) or not math.isfinite(expires) or expires < 0:
                return None
            if expires and expires <= time.time():
                return None
            return result
        except (OSError, ValueError):
            return None

    def query(self, audio_url, start=False, priority='current'):
        key, source = self.source(audio_url)
        with self.lock:
            result = self.cached(key)
            if result:
                return {**result, 'version': key}
            previous = self.results.get(key)
            if previous and previous.get('status') == 'failed' and previous['retry_after'] > time.time():
                return previous
            if key in self.jobs:
                if start and priority == 'current':
                    self.jobs[key]['priority'] = 0
                return {'status': 'pending', 'version': key}
            if not start:
                return {'status': 'unavailable', 'version': key}
            if not binary('ffmpeg', self.root) or not binary('ffprobe', self.root):
                return {'status': 'unavailable', 'message': '未配置 FFmpeg/FFprobe', 'version': key}
            if priority == 'current':
                for old_key, job in list(self.jobs.items()):
                    if job['priority'] == 0 and not job.get('running'):
                        del self.jobs[old_key]
            if priority == 'next':
                for old_key, job in list(self.jobs.items()):
                    if job['priority'] == 1 and not job.get('running'):
                        del self.jobs[old_key]
            if len(self.jobs) >= 8:
                return {'status': 'busy', 'version': key}
            self.jobs[key] = {**source, 'priority': 0 if priority == 'current' else 1}
            if not self.worker or not self.worker.is_alive():
                self.worker = threading.Thread(target=self.process, daemon=True, name='audio-analysis')
                self.worker.start()
            self.wake.set()
            return {'status': 'pending', 'version': key}

    def process(self):
        while True:
            self.wake.wait()
            with self.lock:
                if not self.jobs:
                    self.wake.clear()
                    continue
                key = min(self.jobs, key=lambda item: self.jobs[item]['priority'])
                job = self.jobs[key]
                job['running'] = True
            temporary_audio = draft = None
            try:
                self.directory.mkdir(parents=True, exist_ok=True)
                path = job.get('path')
                if path is None:
                    with tempfile.NamedTemporaryFile(prefix='work-', suffix='.audio', dir=self.directory, delete=False) as temporary:
                        temporary_audio = path = Path(temporary.name)
                    fingerprint = fetch_audio(job['url'], path, job['headers'])
                else:
                    stat = path.stat()
                    identity = f'local:{path.name}:{stat.st_mtime_ns}:{stat.st_size}'
                    if identity != job['identity']:
                        raise ValueError('分析前音频文件已变化')
                    with path.open('rb') as audio:
                        fingerprint = hashlib.file_digest(audio, 'sha256').hexdigest() if hasattr(hashlib, 'file_digest') else hashlib.sha256(audio.read()).hexdigest()
                result = {**measure_audio(path, self.root), 'fingerprint': fingerprint,
                          'version': key, 'expires': time.time() + job['ttl'] if job['ttl'] else 0}
                if job.get('path'):
                    stat = path.stat()
                    if f'local:{path.name}:{stat.st_mtime_ns}:{stat.st_size}' != job['identity']:
                        raise ValueError('分析期间音频文件已变化')
                target = self.directory / (key + '.json')
                with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', prefix='work-', suffix='.json.tmp', dir=self.directory, delete=False) as output:
                    draft = Path(output.name)
                    json.dump(result, output, ensure_ascii=False, allow_nan=False)
                os.replace(draft, target)
                draft = None
                # Metadata only; the one active job owns at most one 100 MB temporary audio file.
                for old in sorted(self.directory.glob('*.json'), key=lambda item: item.stat().st_mtime, reverse=True)[256:]:
                    old.unlink(missing_ok=True)
            except Exception:
                result = {'status': 'failed', 'message': '音频分析暂不可用，继续保守播放',
                          'version': key, 'retry_after': time.time() + 60}
            finally:
                for temporary in (temporary_audio, draft):
                    if temporary is not None:
                        try:
                            temporary.unlink(missing_ok=True)
                        except OSError:
                            pass
            with self.lock:
                self.results[key] = result
                while len(self.results) > 256:
                    self.results.popitem(last=False)
                self.jobs.pop(key, None)
