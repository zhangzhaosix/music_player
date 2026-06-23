import os
import json
import uuid
import re
import time
import urllib.parse
import requests
from datetime import datetime
from flask import Flask, render_template, request, jsonify, send_from_directory, Response, stream_with_context

app = Flask(__name__)

# 配置
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MUSIC_DIR = os.path.join(BASE_DIR, '音乐合集')
FAVORITES_FILE = os.path.join(BASE_DIR, 'favorites.json')
PLAYLISTS_FILE = os.path.join(BASE_DIR, 'playlists.json')
DOWNLOAD_INDEX_FILE = os.path.join(BASE_DIR, 'downloads.json')
QJJLB_BASE = 'http://qjjlb.quanjian.com.cn/musicdl/'
QJJLB_ORIGIN = 'http://qjjlb.quanjian.com.cn'
MUSICBOX_WEB_BASE = 'https://mu-jie.cc/musicBox/'
MUSICBOX_API_BASE = 'https://fy-musicbox-api.mu-jie.cc'
MUSICBOX_ORIGIN = 'https://mu-jie.cc'

# 请求头，模拟浏览器访问
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': QJJLB_BASE,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-User': '?1',
}

_qjjlb_session = None
_musicbox_session = None
_search_cache = {}
_search_cache_ttl = 300
SEARCH_SOURCES = ('qq', 'kuwo', 'netease')
DEFAULT_SOURCE_LIMIT = 20


def format_upstream_request_error(source_name, error):
    message = str(error or '').strip()
    lowered = message.lower()
    blocked_markers = (
        'winerror 10013',
        'failed to establish a new connection',
        'max retries exceeded',
    )
    if any(marker in lowered for marker in blocked_markers):
        return f'{source_name} 暂时不可用，请检查本机网络权限或代理设置后重试'
    return f'{source_name} 请求失败，请稍后重试'


def get_qjjlb_session():
    """获取带 cookies 的 qjjlb requests Session"""
    global _qjjlb_session
    if _qjjlb_session is None:
        _qjjlb_session = requests.Session()
        _qjjlb_session.headers.update({
            'User-Agent': HEADERS['User-Agent'],
            'Referer': QJJLB_BASE,
            'Origin': QJJLB_ORIGIN,
            'Accept': 'application/json, text/plain, */*',
        })
        try:
            _qjjlb_session.get(QJJLB_BASE, timeout=10)
        except Exception:
            pass
    return _qjjlb_session


def get_musicbox_session():
    """获取带 cookies 的 musicBox requests Session"""
    global _musicbox_session
    if _musicbox_session is None:
        _musicbox_session = requests.Session()
        _musicbox_session.headers.update({
            'User-Agent': HEADERS['User-Agent'],
            'Referer': MUSICBOX_WEB_BASE,
            'Origin': MUSICBOX_ORIGIN,
            'Accept': 'application/json, text/plain, */*',
        })
        try:
            _musicbox_session.get(MUSICBOX_WEB_BASE, timeout=10)
        except Exception:
            pass
    return _musicbox_session


def make_search_cache_key(keyword, source_names=None, source_limit=DEFAULT_SOURCE_LIMIT):
    sources = tuple(source_names or SEARCH_SOURCES)
    return (keyword, ','.join(sources), int(source_limit or DEFAULT_SOURCE_LIMIT))


def get_cached_search_results(keyword, source_names=None, source_limit=DEFAULT_SOURCE_LIMIT):
    cached = _search_cache.get(make_search_cache_key(keyword, source_names, source_limit))
    if not cached:
        return None
    if time.time() - cached['ts'] > _search_cache_ttl:
        _search_cache.pop(make_search_cache_key(keyword, source_names, source_limit), None)
        return None
    return [dict(song) for song in cached['results']]


def store_search_results(keyword, results, source_names=None, source_limit=DEFAULT_SOURCE_LIMIT):
    _search_cache[make_search_cache_key(keyword, source_names, source_limit)] = {
        'ts': time.time(),
        'results': [dict(song) for song in results],
    }


def parse_lrc_text(lrc_text):
    lyrics = []
    if not lrc_text:
        return lyrics

    for raw_line in str(lrc_text).splitlines():
        line = raw_line.strip()
        if not line:
            continue
        timestamps = list(re.finditer(r'\[(\d{2}):(\d{2})(?:\.(\d{1,3}))?\]', line))
        text = re.sub(r'^(?:\[\d{2}:\d{2}(?:\.\d{1,3})?\])+\s*', '', line).strip()
        if not text or not timestamps:
            continue

        match = timestamps[-1]
        minutes = int(match.group(1))
        seconds = int(match.group(2))
        fraction = match.group(3) or '0'
        try:
            milliseconds = int((fraction + '000')[:3])
        except ValueError:
            milliseconds = 0

        lyrics.append({
            'time': minutes * 60 + seconds + (milliseconds / 1000.0),
            'text': text,
        })

    return lyrics


def build_qjjlb_ref(provider, **params):
    query = urllib.parse.urlencode({k: v for k, v in params.items() if v not in (None, '')})
    return f'qjjlb://{provider}' + (f'?{query}' if query else '')


def make_qjjlb_song(provider, item, *, url='', source_url='', mp3_url='', cover_url='', lyrics_text=''):
    if not isinstance(item, dict):
        return None

    title = str(
        item.get('title', '')
        or item.get('song_title', '')
        or item.get('song_name', '')
        or item.get('music_name', '')
        or item.get('song', '')
        or item.get('name', '')
    ).strip() or '未知歌曲'
    artist = str(
        item.get('author', '')
        or item.get('singer', '')
        or item.get('artist', '')
        or item.get('singer_name', '')
        or item.get('singername', '')
    ).strip() or '未知歌手'
    url = str(url or item.get('url', '') or '').strip()
    source_url = str(source_url or item.get('link', '') or '').strip()
    mp3_url = str(mp3_url or item.get('music_url', '') or item.get('url', '') or '').strip()
    cover_url = str(cover_url or item.get('cover', '') or item.get('pic', '') or '').strip()

    if mp3_url.startswith('//'):
        mp3_url = 'https:' + mp3_url
    if url.startswith('//'):
        url = 'https:' + url
    if source_url.startswith('//'):
        source_url = 'https:' + source_url
    if cover_url.startswith('//'):
        cover_url = 'https:' + cover_url

    canonical = url or source_url or mp3_url or f'{provider}:{title}:{artist}'

    return {
        'id': str(uuid.uuid5(uuid.NAMESPACE_URL, canonical)),
        'title': title,
        'artist': artist,
        'url': url or source_url or mp3_url,
        'mp3_url': mp3_url,
        'source_url': source_url or url or mp3_url or QJJLB_BASE,
        'source': 'qjjlb',
        'cover_url': cover_url,
        'type': provider,
        'songid': item.get('songid', item.get('id', '')),
        'lyrics': parse_lrc_text(lyrics_text or item.get('lrc', '') or item.get('lyric', '') or ''),
    }


def fetch_qjjlb_json(url, params=None, timeout=20):
    sess = get_qjjlb_session()
    try:
        last_err = None
        resp = None
        for attempt in range(2):
            try:
                resp = sess.get(url, params=params, timeout=timeout)
                resp.raise_for_status()
                break
            except requests.RequestException as e:
                last_err = e
                if attempt == 1:
                    raise
                time.sleep(0.2)
        if resp is None:
            raise last_err
        return resp.json(), None
    except requests.RequestException as e:
        return None, format_upstream_request_error('qjjlb', e)
    except (json.JSONDecodeError, ValueError):
        return None, 'qjjlb 返回了无效数据'


def fetch_qjjlb_text(url, params=None, timeout=20):
    sess = get_qjjlb_session()
    try:
        resp = None
        last_err = None
        for attempt in range(2):
            try:
                resp = sess.get(url, params=params, timeout=timeout)
                resp.raise_for_status()
                break
            except requests.RequestException as e:
                last_err = e
                if attempt == 1:
                    raise
                time.sleep(0.2)
        if resp is None:
            raise last_err
        return resp.text, None
    except requests.RequestException as e:
        return None, format_upstream_request_error('qjjlb', e)


def fetch_musicbox_json(url, params=None, timeout=20):
    sess = get_musicbox_session()
    try:
        last_err = None
        resp = None
        for attempt in range(2):
            try:
                resp = sess.get(url, params=params, timeout=timeout)
                resp.raise_for_status()
                break
            except requests.RequestException as e:
                last_err = e
                if attempt == 1:
                    raise
                time.sleep(0.2)
        if resp is None:
            raise last_err
        return resp.json(), None
    except requests.RequestException as e:
        return None, format_upstream_request_error('musicBox', e)
    except (json.JSONDecodeError, ValueError):
        return None, 'musicBox 返回了无效数据'


def fetch_musicbox_text(url, params=None, timeout=20):
    sess = get_musicbox_session()
    try:
        resp = None
        last_err = None
        for attempt in range(2):
            try:
                resp = sess.get(url, params=params, timeout=timeout)
                resp.raise_for_status()
                break
            except requests.RequestException as e:
                last_err = e
                if attempt == 1:
                    raise
                time.sleep(0.2)
        if resp is None:
            raise last_err
        return resp.text, None
    except requests.RequestException as e:
        return None, format_upstream_request_error('musicBox', e)


def make_musicbox_netease_song(item):
    if not isinstance(item, dict):
        return None

    song_id = str(item.get('id', '') or '').strip()
    title = str(item.get('name', '') or item.get('title', '') or '').strip() or '未知歌曲'
    artist = str(item.get('artist', '') or item.get('singer', '') or '').strip() or '未知歌手'
    mp3_url = str(item.get('url', '') or '').strip()
    lrc_url = str(item.get('lrc', '') or '').strip()
    cover_url = str(item.get('pic', '') or item.get('cover', '') or '').strip()
    qjjlb_ref = build_qjjlb_ref('netease', id=song_id) if song_id else ''
    canonical = song_id or mp3_url or f'netease:{title}:{artist}'

    return {
        'id': song_id or str(uuid.uuid5(uuid.NAMESPACE_URL, canonical)),
        'title': title,
        'artist': artist,
        'url': mp3_url or qjjlb_ref or lrc_url,
        'mp3_url': mp3_url,
        'source_url': qjjlb_ref or mp3_url or MUSICBOX_WEB_BASE,
        'source': 'qjjlb',
        'cover_url': cover_url,
        'type': 'netease',
        'songid': song_id,
        'lyrics': [],
    }


def search_qjjlb_netease(keyword, page=1, limit=10):
    results = []
    seen_keys = set()
    current_page = max(1, int(page or 1))
    remaining = max(1, int(limit or 10))
    last_error = None

    while remaining > 0:
        request_limit = min(10, remaining)
        data, err = fetch_musicbox_json(
            f'{MUSICBOX_API_BASE}/netease/search/song/',
            params={'keywords': keyword, 'pn': current_page, 'limit': request_limit},
        )
        if err:
            last_error = err
            break
        if not isinstance(data, list):
            last_error = 'musicBox 网易云返回了无效数据'
            break

        page_results = []
        for item in data:
            song = make_musicbox_netease_song(item)
            if not song:
                continue
            song_id = song.get('id')
            if song_id in seen_keys:
                continue
            seen_keys.add(song_id)
            page_results.append(song)

        if not page_results:
            break

        results.extend(page_results)
        remaining = limit - len(results)
        if remaining <= 0 or len(page_results) < request_limit:
            break
        current_page += 1

    if results:
        return results[:limit], None
    return None, last_error or 'musicBox 网易云搜索失败'


def search_qjjlb_qq(keyword, limit=10):
    data, err = fetch_qjjlb_json(
        'https://tang.api.s01s.cn/music_open_api.php',
        params={'msg': keyword, 'type': 'json'},
    )
    if err:
        return None, err

    if isinstance(data, dict):
        items = data.get('data', [])
    elif isinstance(data, list):
        items = data
    else:
        items = []

    results = []
    for item in (items or [])[:limit]:
        if not isinstance(item, dict):
            continue
        mid = item.get('song_mid', '')
        if not mid:
            continue
        url = build_qjjlb_ref('qq', msg=keyword, mid=mid)
        song = make_qjjlb_song('qq', item, url=url, source_url=QJJLB_BASE)
        if song:
            results.append(song)
    return results, None


def search_qjjlb_kuwo(keyword, limit=10):
    data, err = fetch_qjjlb_json(
        'https://kw-api.cenguigui.cn/',
        params={'name': keyword, 'page': 1, 'limit': limit},
    )
    if err:
        return None, err
    if not isinstance(data, dict):
        return None, 'qjjlb 酷我返回了无效数据'
    if int(data.get('code', 0) or 0) != 200:
        return None, str(data.get('error') or 'qjjlb 酷我搜索失败')

    results = []
    for item in data.get('data', []) or []:
        if not isinstance(item, dict):
            continue
        url = str(item.get('url', '')).strip() or build_qjjlb_ref('kuwo', id=item.get('rid', ''))
        mp3_url = str(item.get('url', '')).strip()
        song = make_qjjlb_song(
            'kuwo',
            item,
            url=url,
            source_url=QJJLB_BASE,
            mp3_url=mp3_url,
            cover_url=item.get('pic', ''),
            lyrics_text=item.get('lrc', ''),
        )
        if song:
            results.append(song)
    return results, None


def search_qjjlb(keyword, limit=60, source_names=None, source_limit=DEFAULT_SOURCE_LIMIT):
    source_names = list(source_names or SEARCH_SOURCES)
    source_limit = max(1, min(50, int(source_limit or DEFAULT_SOURCE_LIMIT)))
    cached_results = get_cached_search_results(keyword, source_names, source_limit)
    if cached_results is not None:
        return cached_results

    results = []
    seen_keys = set()
    last_error = None
    source_fetchers = {
        'qq': lambda: search_qjjlb_qq(keyword, source_limit),
        'kuwo': lambda: search_qjjlb_kuwo(keyword, source_limit),
        'netease': lambda: search_qjjlb_netease(keyword, 1, source_limit),
    }

    for source_name in source_names:
        fetcher = source_fetchers.get(source_name)
        if not fetcher:
            continue
        page_results, err = fetcher()
        if err:
            last_error = err
            continue
        if not page_results:
            continue

        for song in page_results:
            if not isinstance(song, dict):
                continue
            song_id = song.get('id')
            if song_id in seen_keys:
                continue
            seen_keys.add(song_id)
            results.append(song)
            if len(results) >= limit:
                break

        if len(results) >= limit:
            break

    if results:
        store_search_results(keyword, results, source_names, source_limit)
        return results[:limit]

    if last_error:
        return {'error': last_error}, 502

    return []


def read_json(filepath):
    if not os.path.exists(filepath):
        return []
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        return []


def write_json(filepath, data):
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def get_local_music():
    """扫描音乐合集目录，返回本地音乐列表"""
    if not os.path.exists(MUSIC_DIR):
        return []
    songs = []
    for fname in os.listdir(MUSIC_DIR):
        if fname.lower().endswith('.mp3'):
            # 从文件名解析标题：去掉 _timestamp 后缀再解析歌手/歌名
            base = os.path.splitext(fname)[0]
            base_clean = re.sub(r'_\d{10}$', '', base)

            # 尝试用 parse_song_title 拆分歌手和歌名
            song_title, song_artist = parse_song_title(base_clean)

            songs.append({
                'id': fname,
                'filename': fname,
                'title': song_title,
                'artist': song_artist,
            })
    return songs


def read_download_index():
    records = read_json(DOWNLOAD_INDEX_FILE)
    if not isinstance(records, list):
        return []
    return [record for record in records if isinstance(record, dict)]


def write_download_index(records):
    write_json(DOWNLOAD_INDEX_FILE, records)


def local_stream_url(filename):
    return f'/api/stream/{urllib.parse.quote(filename)}'


def existing_music_file(filename):
    filename = str(filename or '').strip()
    if not filename:
        return ''
    if '..' in filename or '/' in filename or '\\' in filename:
        return ''
    return filename if os.path.exists(os.path.join(MUSIC_DIR, filename)) else ''


def get_download_record(filename):
    filename = str(filename or '').strip()
    if not filename:
        return {}
    for record in read_download_index():
        if str(record.get('filename', '') or '').strip() == filename:
            return record
    return {}


def same_song_identity(candidate_title, candidate_artist, title, artist):
    candidate_title = normalize_song_match_text(candidate_title)
    candidate_artist = normalize_song_match_text(candidate_artist)
    title = normalize_song_match_text(title)
    artist = normalize_song_match_text(artist)
    if not title or not artist or not candidate_title or not candidate_artist:
        return False

    return (
        (candidate_title == title or candidate_title in title or title in candidate_title)
        and (candidate_artist == artist or candidate_artist in artist or artist in candidate_artist)
    )


def find_existing_downloaded_song(song_url='', source_url='', title='', artist=''):
    candidates = []
    for candidate in (song_url, source_url):
        candidate = str(candidate or '').strip()
        if candidate and candidate not in candidates:
            candidates.append(candidate)

    local_music = get_local_music()
    records = read_download_index()

    # 先按原始链接/解析后的链接命中
    for record in records:
        filename = str(record.get('filename', '') or '').strip()
        if not filename or not os.path.exists(os.path.join(MUSIC_DIR, filename)):
            continue
        record_urls = {
            str(record.get('source_url', '') or '').strip(),
            str(record.get('resolved_url', '') or '').strip(),
            str(record.get('song_url', '') or '').strip(),
        }
        if any(candidate and candidate in record_urls for candidate in candidates):
            return filename

    # 再按标题+歌手兜底
    for record in records:
        filename = str(record.get('filename', '') or '').strip()
        if not filename or not os.path.exists(os.path.join(MUSIC_DIR, filename)):
            continue
        if same_song_identity(record.get('title', ''), record.get('artist', ''), title, artist):
            return filename

    for song in local_music:
        if same_song_identity(song.get('title', ''), song.get('artist', ''), title, artist):
            return song.get('filename', '')

    return ''


def hydrate_song_entry(song, favorites_by_id=None):
    favorites_by_id = favorites_by_id or {}
    if isinstance(song, dict):
        hydrated = dict(song)
    else:
        song_id = str(song or '').strip()
        hydrated = dict(favorites_by_id.get(song_id, {}))
        if not hydrated:
            hydrated = {'id': song_id, 'title': song_id, 'artist': '未知歌手', 'url': ''}

    song_id = str(hydrated.get('id', '') or '').strip()
    filename = existing_music_file(hydrated.get('filename', ''))
    if not filename and song_id.lower().endswith('.mp3'):
        filename = existing_music_file(song_id)
    if not filename:
        filename = find_existing_downloaded_song(
            hydrated.get('url', ''),
            hydrated.get('source_url', ''),
            hydrated.get('title', ''),
            hydrated.get('artist', ''),
        )

    if filename:
        record = get_download_record(filename)
        hydrated['filename'] = filename
        hydrated['downloaded'] = True
        hydrated['mp3_url'] = local_stream_url(filename)
        hydrated.setdefault('id', song_id or filename)
        if record:
            if not hydrated.get('title') or hydrated.get('title') == filename:
                hydrated['title'] = record.get('title') or hydrated.get('title') or filename
            if not hydrated.get('artist') or hydrated.get('artist') == '未知歌手':
                hydrated['artist'] = record.get('artist') or hydrated.get('artist') or '未知歌手'
            hydrated['url'] = hydrated.get('url') or record.get('song_url') or record.get('source_url') or ''
            hydrated['source_url'] = hydrated.get('source_url') or record.get('source_url') or record.get('song_url') or ''
    else:
        hydrated['downloaded'] = bool(hydrated.get('downloaded') and hydrated.get('filename'))

    hydrated.setdefault('id', song_id or hydrated.get('filename', '') or hydrated.get('url', ''))
    hydrated.setdefault('title', '未知歌曲')
    hydrated.setdefault('artist', '未知歌手')
    hydrated.setdefault('url', '')
    hydrated.setdefault('filename', '')
    return hydrated


def search_local_songs(keyword):
    keyword_norm = normalize_song_match_text(keyword)
    if not keyword_norm:
        return []

    results = []
    seen = set()
    for song in get_local_music():
        hydrated = hydrate_song_entry(song)
        haystack = normalize_song_match_text(' '.join([
            hydrated.get('title', ''),
            hydrated.get('artist', ''),
            hydrated.get('filename', ''),
        ]))
        if keyword_norm not in haystack:
            continue
        song_id = hydrated.get('id')
        if song_id in seen:
            continue
        seen.add(song_id)
        results.append(hydrated)
    return results


def save_download_record(*, filename, title='', artist='', song_url='', source_url='', resolved_url=''):
    filename = str(filename or '').strip()
    if not filename:
        return

    records = [record for record in read_download_index() if str(record.get('filename', '') or '').strip() != filename]
    records.append({
        'filename': filename,
        'title': str(title or '').strip(),
        'artist': str(artist or '').strip(),
        'song_url': str(song_url or '').strip(),
        'source_url': str(source_url or '').strip(),
        'resolved_url': str(resolved_url or '').strip(),
        'downloaded_at': datetime.now().isoformat(),
    })
    write_download_index(records)


def remove_download_record(filename):
    filename = str(filename or '').strip()
    if not filename:
        return

    records = read_download_index()
    next_records = [record for record in records if str(record.get('filename', '') or '').strip() != filename]
    if len(next_records) != len(records):
        write_download_index(next_records)


def get_favorites_map():
    """返回 {song_id: fav_entry} 的映射，方便快速查询"""
    favs = read_json(FAVORITES_FILE)
    return {f['id']: f for f in favs}


def is_song_favorited(song, favorites):
    if not isinstance(song, dict):
        return False
    for fav in favorites.values():
        if not isinstance(fav, dict):
            continue
        if fav.get('id') == song.get('id'):
            return True
        if fav.get('filename') and fav.get('filename') == song.get('filename'):
            return True
        if same_song_identity(fav.get('title', ''), fav.get('artist', ''), song.get('title', ''), song.get('artist', '')):
            return True
    return False


def is_supported_song_url(song_url):
    if not song_url:
        return False

    normalized = str(song_url).strip()
    if not normalized:
        return False

    if normalized.startswith('qjjlb://'):
        return True
    if re.search(r'\.mp3(?:[?#].*)?$', normalized, flags=re.IGNORECASE):
        return True

    parsed = urllib.parse.urlparse(normalized)
    return 'music.163.com' in (parsed.netloc or '').lower()


def has_real_lyrics_entries(lyrics):
    if not isinstance(lyrics, list):
        return False
    for item in lyrics:
        if not isinstance(item, dict):
            continue
        if str(item.get('text', '') or '').strip():
            return True
    return False


def normalize_song_match_text(text):
    return re.sub(r'[\s·•－—\-_/()（）\[\]【】,，.。！？!?\'"“”‘’]+', '', str(text or '').lower())


def score_song_match(candidate, title, artist):
    if not isinstance(candidate, dict):
        return -1

    candidate_title = normalize_song_match_text(candidate.get('title', ''))
    candidate_artist = normalize_song_match_text(candidate.get('artist', ''))
    target_title = normalize_song_match_text(title)
    target_artist = normalize_song_match_text(artist)
    score = 0

    if target_title and candidate_title:
        if candidate_title == target_title:
            score += 10
        elif target_title in candidate_title or candidate_title in target_title:
            score += 5

    if target_artist and candidate_artist:
        if candidate_artist == target_artist:
            score += 6
        elif target_artist in candidate_artist or candidate_artist in target_artist:
            score += 3

    if candidate.get('mp3_url'):
        score += 1
    return score


def resolve_favorite_song_info(fav):
    if not isinstance(fav, dict):
        return None, '无效的收藏数据'

    title = str(fav.get('title', '') or '').strip()
    artist = str(fav.get('artist', '') or '').strip()
    source_url = str(fav.get('source_url', '') or fav.get('url', '') or '').strip()
    direct_info = None

    if is_supported_song_url(source_url):
        info, err = get_song_info(source_url)
        if info and not err and info.get('mp3_url'):
            direct_info = info
            if has_real_lyrics_entries(info.get('lyrics')) or has_real_lyrics_entries(fav.get('lyrics')):
                return info, None

    query = ' '.join(part for part in (title, artist) if part).strip()
    if not query:
        if direct_info:
            return direct_info, None
        return None, '无法恢复歌曲播放信息'

    search_results = search_qjjlb(query, limit=20, source_names=SEARCH_SOURCES, source_limit=10)
    if isinstance(search_results, tuple):
        return None, search_results[1]

    best = None
    best_score = -1
    for candidate in search_results or []:
        score = score_song_match(candidate, title, artist)
        if score > best_score:
            best_score = score
            best = candidate

    if not best or best_score <= 0:
        return None, '未找到可播放歌曲'

    candidate_url = str(best.get('source_url', '') or '').strip()
    if not is_supported_song_url(candidate_url):
        candidate_url = str(best.get('url', '') or '').strip()
    if not is_supported_song_url(candidate_url):
        candidate_url = ''

    if candidate_url:
        info, err = get_song_info(candidate_url)
        if info and not err and info.get('mp3_url'):
            return info, None

    if best.get('mp3_url'):
        return best, None

    if direct_info:
        return direct_info, None

    return None, '未找到可播放歌曲'


# 常见中文歌手名单（无分隔符时用于拆分识别）
COMMON_ARTISTS = {
    '周杰伦', '林俊杰', '王力宏', '蔡依林', '张惠妹', '孙燕姿', '梁静茹',
    '陈奕迅', '周深', '邓紫棋', '林志炫', '张靓颖', '李荣浩', '薛之谦',
    '毛不易', '华晨宇', '张杰', '李宇春', '张韶涵', '王菲', '那英', '韩红',
    '孙楠', '汪峰', '许巍', '朴树', '李健', '刀郎', '崔健', '窦唯', '张楚',
    '郑钧', '许嵩', '胡彦斌', '吴青峰', '陈绮贞', '蔡健雅', '范玮琪',
    '张震岳', '罗大佑', '李宗盛', '周华健', '任贤齐', '张信哲', '刘德华',
    '张学友', '郭富城', '黎明', '王杰', '齐秦', '赵传', '伍佰', '陈升',
    '谭咏麟', '张国荣', '梅艳芳', '陈慧娴', '田震', '杨坤', '庞龙',
    '李玉刚', '霍尊', '费玉清', '邓丽君', '蔡琴', '孟庭苇', '韩宝仪',
    '冷漠', '庄心妍', '六哲', '欢子', '郑源', '祁隆', '乌兰托娅',
    '降央卓玛', '曲婉婷', '谢天笑', '二手玫瑰', '痛仰', '新裤子',
    '逃跑计划', '万能青年旅店', '草东没有派对', '告五人', '八三夭',
    '房东的猫', '陈粒', '好妹妹', '赵雷', '宋冬野', '马頔', '尧十三',
    '海龟先生', '五条人', '棱镜', '夏日入侵企画', '回春丹',
    '凤凰传奇', '玖月奇迹', '筷子兄弟', 'TFBOYS', '五月天', '苏打绿',
    '田馥甄', '杨丞琳', '王心凌', '刘若英', '莫文蔚', '林忆莲',
    '陈慧琳', '容祖儿', 'Twins', '杨千嬅', '梁咏琪', '郑秀文',
    '叶倩文', '林峯', '谢霆锋', '陈小春', '古巨基', '李克勤',
    '林子祥', '关喆', '黄龄', '阿兰', '萨顶顶', '龚琳娜',
    ' Beyond', 'BEYOND', ' 汪苏泷', '徐良', 'By2', 'SHE', 'S.H.E',
    '飞轮海', '南拳妈妈', '信乐团', '动力火车', '羽泉', '水木年华',
    '黑豹', '唐朝', '超载', '舌头', '左小祖咒', '陈珊妮', '魏如萱',
    '安溥', '张悬', '黄小琥', '萧煌奇', '杨宗纬', '萧敬腾', '方大同',
    '卫兰', '卫诗', '侧田', '王菀之', '麦浚龙', '周国贤',
    # 更多常见新生代/网络歌手
    '苏星婕', '旺仔小乔', '韩小囡', 'en', '就是南方凯', '秋原依',
    '王靖雯', '队长', '买辣椒也用券', '隔壁老樊', '要不要买菜',
    '你的上好佳', '一口甜', '皮卡丘多多', '小阿七', '戴羽彤',
    '于梓贝', '阿冗', '枯木逢春', '虎二', '王贰浪', '王巨星',
    '尹昔眠', '傲七爷', '林贝贝', '周兴哲', '韦礼安', '陈鸿宇',
    '谢春花', '柳爽', '陈雪凝', '刘瑞琦', '曾轶可', '阿肆',
    '金玟岐', '孟慧圆', '叶炫清', '郭静', '弦子', '张含韵',
    '刘惜君', '郁可唯', '谭维维', '尚雯婕', '光良', '品冠',
    '陶喆', '王若琳', '满舒克', '王以太', '姜云升', '刘聪',
    '艾福杰尼', '黄旭', '派克特', '功夫胖', '蛋堡', 'Lu1',
    '付豪',
    '阿桑', '徐君', '任然', '程响', '海来阿木', '张碧晨', '单依纯', '王琪',
    '阿悠悠', '小阿枫', '张远', '赵乃吉', '张紫豪', '陈雅森', '魏佳艺', '花僮',
}

# 中文名常用尾字（无分隔符时辅助判断歌手与歌名边界）
_ARTIST_END_CHARS = set('婕囡婷欣馨彤琳琪瑶璇莹雯璐琼玲珊岚萱蕊萌莎妮菲嫣娟汐豪俊')
_ARTIST_END_CHARS.add('兮')  # 囎（同形异码，形似 囡 U+56E1）


def clean_song_title_text(text):
    if text is None:
        return ''

    title = re.sub(r'\s+', ' ', str(text)).strip()
    if not title:
        return ''

    title = re.sub(r'\s*(?:[-|·•]\s*)?酷我音乐\s*$', '', title, flags=re.IGNORECASE)
    title = re.sub(r'^[\s&＆·•\-—_]+', '', title)
    return title.strip()


def parse_song_title(title_raw):
    title = clean_song_title_text(title_raw)
    if not title:
        return '未知歌曲', '未知歌手'

    title = re.sub(r'\[(?:MP3|Mp3|FLAC|Mp3_Lrc|APE|WAV)\]', '', title, flags=re.IGNORECASE)
    title = re.sub(r'[《》]', '', title)
    title = title.strip()

    artist = '未知歌手'
    song_name = title

    sep_match = re.search(r'^(.+?)[·•・－—\-\\|/](.+)$', title)
    if sep_match:
        candidate = sep_match.group(1).strip()
        if candidate and len(candidate) < 30:
            return sep_match.group(2).strip(), candidate

    normalized_artists = sorted({a.strip() for a in COMMON_ARTISTS if a and a.strip()}, key=len, reverse=True)
    for a in normalized_artists:
        if title.startswith(a):
            rest = title[len(a):].strip()
            if rest and len(rest) >= 2:
                return rest, a

    for split_pos in (4, 3, 2):
        if split_pos >= len(title):
            continue
        artist_part = title[:split_pos]
        song_part = title[split_pos:]
        if len(song_part) < 2:
            continue
        if artist_part[-1] in _ARTIST_END_CHARS:
            return song_part.strip(), artist_part.strip()

    return song_name or '未知歌曲', artist or '未知歌手'


def extract_song_id(song_url):
    """从歌曲 URL 中提取歌曲 ID。
    例如: music.163.com/#/song?id=185726 → 185726
    """
    url = str(song_url or '').strip()
    if not url:
        return None

    parsed = urllib.parse.urlparse(url)
    netloc = (parsed.netloc or '').lower()
    if 'music.163.com' in netloc:
        for candidate in (parsed.query, parsed.fragment, url):
            query = candidate.split('?', 1)[-1]
            match = re.search(r'(?:^|[?&])id=([^&#/?]+)', query, flags=re.IGNORECASE)
            if match:
                return match.group(1)

    return None

def resolve_qjjlb_song_info(song_url):
    parsed = urllib.parse.urlparse(str(song_url).strip())
    if (parsed.scheme or '').lower() != 'qjjlb':
        return None, None

    provider = (parsed.netloc or parsed.path.lstrip('/')).strip().lower()
    params = {key: values[0] for key, values in urllib.parse.parse_qs(parsed.query).items()}

    if not provider:
        return None, '无效的 qjjlb 链接'

    if provider == 'netease':
        song_id = params.get('id', '').strip()
        if not song_id:
            return None, 'qjjlb 网易云缺少歌曲 ID'

        detail_data, err = fetch_musicbox_json(
            f'{MUSICBOX_API_BASE}/meting/',
            params={'server': 'netease', 'type': 'song', 'id': song_id},
        )
        if err:
            return None, err
        if not isinstance(detail_data, list) or not detail_data:
            return None, 'musicBox 网易云返回了无效数据'

        detail = detail_data[0] if isinstance(detail_data[0], dict) else {}
        lyric_text = ''
        lyric_text, lyric_err = fetch_musicbox_text(
            f'{MUSICBOX_API_BASE}/meting/',
            params={'server': 'netease', 'type': 'lrc', 'id': song_id},
        )
        if lyric_err:
            lyric_text = ''

        info = {
            'title': detail.get('name', '未知歌曲') or '未知歌曲',
            'artist': detail.get('artist', '未知歌手') or '未知歌手',
            'mp3_url': detail.get('url', '') or '',
            'source_url': detail.get('url', '') or f'{MUSICBOX_WEB_BASE}#/search',
            'cover_url': detail.get('pic', '') or detail.get('cover', '') or '',
            'lyric_id': song_id,
            'lyrics': parse_lrc_text(lyric_text),
        }
        return info, None

    if provider == 'qq':
        mid = params.get('mid', '').strip()
        if not mid:
            return None, 'qjjlb QQ 缺少歌曲 mid'

        detail_data, err = fetch_qjjlb_json(
            'https://tang.api.s01s.cn/music_open_api.php',
            params={'msg': params.get('msg', ''), 'type': 'json', 'mid': mid},
        )
        if err:
            return None, err
        if not isinstance(detail_data, dict):
            return None, 'qjjlb QQ 返回了无效数据'

        def pick_best_play_url(data):
            if data.get('song_play_url_sq'):
                return data.get('song_play_url_sq'), 'LOSSLESS'
            if data.get('song_play_url_pq'):
                return data.get('song_play_url_pq'), 'LOSSLESS'
            if data.get('song_play_url_accom'):
                return data.get('song_play_url_accom'), 'HQ'
            if data.get('song_play_url_hq'):
                return data.get('song_play_url_hq'), 'HQ'
            if data.get('song_play_url_standard'):
                return data.get('song_play_url_standard'), 'STD'
            if data.get('song_play_url_fq'):
                return data.get('song_play_url_fq'), 'LOW'
            return data.get('song_play_url', ''), ''

        mp3_url, quality_label = pick_best_play_url(detail_data)
        lyric_text = str(detail_data.get('song_lyric', '') or detail_data.get('lyric', '') or '')
        info = {
            'title': detail_data.get('song_title') or detail_data.get('song_name') or '未知歌曲',
            'artist': detail_data.get('singer_name') or '未知歌手',
            'mp3_url': mp3_url or '',
            'source_url': detail_data.get('song_h5_url') or f'https://y.qq.com/n/ryqq/songDetail/{mid}',
            'cover_url': detail_data.get('album_pic') or detail_data.get('singer_pic') or '',
            'lyric_id': mid,
            'lyrics': parse_lrc_text(lyric_text),
        }
        if quality_label:
            info['quality_label'] = quality_label
        return info, None

    if provider == 'kuwo':
        song_id = params.get('id', '').strip()
        if not song_id:
            return None, 'qjjlb 酷我缺少歌曲 ID'

        detail_data, err = fetch_qjjlb_json(
            'https://kw-api.cenguigui.cn/',
            params={'id': song_id, 'type': 'song', 'level': 'zp', 'format': 'json'},
        )
        if err:
            return None, err
        if not isinstance(detail_data, dict):
            return None, 'qjjlb 酷我返回了无效数据'

        payload = detail_data.get('data') if isinstance(detail_data.get('data'), dict) else detail_data
        if not isinstance(payload, dict):
            return None, 'qjjlb 酷我返回了无效数据'

        info = {
            'title': payload.get('name', '未知歌曲') or '未知歌曲',
            'artist': payload.get('artist', '未知歌手') or '未知歌手',
            'mp3_url': payload.get('url', '') or '',
            'source_url': payload.get('song_url') or payload.get('url', '') or f'https://www.kuwo.cn/play_detail/{song_id}',
            'cover_url': payload.get('pic', '') or '',
            'lyric_id': song_id,
            'lyrics': parse_lrc_text(payload.get('lyric', '') or ''),
        }
        return info, None

    return None, f'不支持的 qjjlb 来源: {provider}'


def extract_mp3_url(song_url):
    """从歌曲链接中获取可播放直链"""
    info, err = get_song_info(song_url)
    if err:
        return None, err

    mp3_url = str(info.get('mp3_url', '') or '').strip()
    if not mp3_url:
        return None, '播放接口返回数据中无 MP3 链接'

    if mp3_url.startswith('//'):
        mp3_url = 'https:' + mp3_url

    return mp3_url, None


def resolve_download_target(song_url, source_url=''):
    candidates = []
    for candidate in (song_url, source_url):
        candidate = str(candidate or '').strip()
        if candidate and candidate not in candidates:
            candidates.append(candidate)

    last_err = None
    for candidate in candidates:
        if re.search(r'\.mp3(?:[?#].*)?$', candidate, flags=re.IGNORECASE):
            return candidate, candidate, None

        mp3_url, err = extract_mp3_url(candidate)
        if mp3_url:
            return mp3_url, candidate, None
        last_err = err

    return None, None, last_err or '该歌曲链接已不再支持，请重新搜索'


def get_song_info(song_url):
    if not song_url:
        return {'error': '无法提取歌曲链接'}, '无法提取歌曲链接'

    normalized_url = str(song_url).strip()
    if not normalized_url:
        return {'error': '无法提取歌曲链接'}, '无法提取歌曲链接'

    if re.search(r'\.mp3(?:[?#].*)?$', normalized_url, flags=re.IGNORECASE):
        return {
            'title': '未知歌曲',
            'artist': '未知歌手',
            'mp3_url': normalized_url,
            'source_url': normalized_url,
            'cover_url': '',
            'lyric_id': '',
            'lyrics': [],
        }, None

    qjjlb_info = None
    qjjlb_err = None
    if normalized_url.startswith('qjjlb://'):
        qjjlb_info, qjjlb_err = resolve_qjjlb_song_info(normalized_url)
        if qjjlb_info:
            return qjjlb_info, None
        return {'error': qjjlb_err or '无效的 qjjlb 链接'}, qjjlb_err or '无效的 qjjlb 链接'

    parsed = urllib.parse.urlparse(normalized_url)
    if 'music.163.com' in (parsed.netloc or '').lower():
        song_id = extract_song_id(normalized_url)
        if not song_id:
            return {'error': '无法提取歌曲 ID'}, '无法提取歌曲 ID'

        qjjlb_ref = build_qjjlb_ref('netease', id=song_id)
        qjjlb_info, qjjlb_err = resolve_qjjlb_song_info(qjjlb_ref)
        if qjjlb_info:
            return qjjlb_info, None
        return {'error': qjjlb_err or '网易云歌曲解析失败'}, qjjlb_err or '网易云歌曲解析失败'

    err = '该歌曲链接已不再支持，请重新搜索'
    return {'error': err}, err


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/search')
def api_search():
    """搜索 qjjlb 歌曲"""
    q = request.args.get('q', '').strip()
    if not q:
        return jsonify({'error': '请输入搜索关键词'}), 400


    try:
        source_limit = int(request.args.get('source_limit', DEFAULT_SOURCE_LIMIT))
    except (TypeError, ValueError):
        return jsonify({'error': 'source_limit 必须是数字'}), 400
    source_limit = max(1, min(50, source_limit))

    results = search_qjjlb(q, limit=len(SEARCH_SOURCES) * source_limit, source_names=SEARCH_SOURCES, source_limit=source_limit)
    if isinstance(results, tuple):
        payload, status_code = results
        local_results = search_local_songs(q)
        if local_results:
            results = local_results
        elif int(status_code or 500) >= 500:
            return jsonify(payload)
        else:
            return jsonify(payload), status_code
    elif not results:
        results = search_local_songs(q)

    # 标记已下载和已收藏状态
    local_songs = {s['id'] for s in get_local_music()}
    favs = get_favorites_map()

    for song in results:
        existing_filename = find_existing_downloaded_song(
            song.get('url', ''),
            song.get('source_url', ''),
            song.get('title', ''),
            song.get('artist', ''),
        )
        song['downloaded'] = bool(existing_filename) or song['id'] in local_songs
        if existing_filename:
            song['filename'] = existing_filename
        song['favorited'] = is_song_favorited(song, favs)

    return jsonify({'results': results})


@app.route('/api/song-info')
def api_song_info():
    """获取歌曲详情（含 MP3 链接）"""
    url = request.args.get('url', '').strip()
    title = request.args.get('title', '').strip()
    artist = request.args.get('artist', '').strip()
    if not url:
        return jsonify({'error': '缺少歌曲链接'}), 400

    existing_filename = find_existing_downloaded_song(url, url, title, artist)
    if existing_filename:
        return jsonify({
            'title': title or os.path.splitext(existing_filename)[0],
            'artist': artist,
            'mp3_url': local_stream_url(existing_filename),
            'source_url': url,
            'filename': existing_filename,
            'downloaded': True,
            'cover_url': '',
            'lyric_id': '',
            'lyrics': [],
        })

    info, err = get_song_info(url)
    if info and not err and has_real_lyrics_entries(info.get('lyrics')):
        return jsonify(info)

    if title or artist:
        fallback_info, fallback_err = resolve_favorite_song_info({
            'title': title,
            'artist': artist,
            'url': url,
            'source_url': url,
            'lyrics': info.get('lyrics') if info else [],
        })
        if fallback_info:
            return jsonify(fallback_info)
        if info and not err and info.get('mp3_url'):
            return jsonify(info)
        return jsonify({'error': fallback_err or err or '无法获取歌曲详情'}), 502

    if err:
        return jsonify({'error': err}), 502
    return jsonify(info)


@app.route('/api/music')
def api_music():
    """获取本地音乐列表"""
    songs = [hydrate_song_entry(song) for song in get_local_music()]
    favs = get_favorites_map()

    for song in songs:
        song['downloaded'] = True
        song['favorited'] = song['id'] in favs

    return jsonify({'music': songs})


@app.route('/api/music/<filename>', methods=['DELETE'])
def api_delete_music(filename):
    """删除本地音乐文件，同时清理收藏和歌单中的引用"""
    # 安全检查：防止路径穿越
    if '..' in filename or '/' in filename or '\\' in filename:
        return jsonify({'error': '非法文件名'}), 400

    filepath = os.path.join(MUSIC_DIR, filename)
    if not os.path.exists(filepath):
        return jsonify({'error': '文件不存在'}), 404

    last_error = None
    for attempt in range(3):
        try:
            os.remove(filepath)
            last_error = None
            break
        except OSError as e:
            last_error = e
            if getattr(e, 'winerror', None) != 32 or attempt == 2:
                return jsonify({'error': f'删除文件失败: {str(e)}'}), 500
            time.sleep(0.15)

    remove_download_record(filename)

    # 先记录要清理的 song_id
    favs = read_json(FAVORITES_FILE)
    song_ids_to_remove = {f['id'] for f in favs if f.get('filename') == filename}
    song_ids_to_remove.add(filename)  # 文件名本身也作为备选 id

    # 从收藏中移除
    favs = [f for f in favs if f.get('filename') != filename]
    write_json(FAVORITES_FILE, favs)

    # 从所有歌单中移除关联的歌曲
    def should_remove_playlist_song(song_item):
        if isinstance(song_item, dict):
            return (
                song_item.get('id') in song_ids_to_remove
                or song_item.get('filename') == filename
            )
        return song_item in song_ids_to_remove

    playlists = read_json(PLAYLISTS_FILE)
    for pl in playlists:
        songs = pl.get('songs') if isinstance(pl, dict) else []
        if not isinstance(songs, list):
            songs = []
        pl['songs'] = [s for s in songs if not should_remove_playlist_song(s)]
    write_json(PLAYLISTS_FILE, playlists)

    return jsonify({'success': True, 'message': f'{filename} 已删除'})


@app.route('/api/stream/<path:filename>')
def api_stream(filename):
    """流式播放本地 MP3 文件"""
    return send_from_directory(MUSIC_DIR, filename, mimetype='audio/mpeg')


@app.route('/api/proxy-stream')
def api_proxy_stream():
    """代理播放在线 MP3（未下载时在线听）"""
    mp3_url = request.args.get('url', '').strip()
    if not mp3_url:
        return jsonify({'error': '缺少 MP3 链接'}), 400

    # musicBox 的音频直链会校验来源，命中该域名时补上最小必要头
    stream_headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    }
    parsed = urllib.parse.urlparse(mp3_url)
    if 'mu-jie.cc' in (parsed.netloc or '').lower():
        stream_headers.update({
            'Referer': MUSICBOX_WEB_BASE,
            'Origin': MUSICBOX_ORIGIN,
            'Accept': '*/*',
        })
    range_header = request.headers.get('Range')
    if range_header:
        stream_headers['Range'] = range_header

    try:
        req = requests.get(mp3_url, headers=stream_headers, stream=True, timeout=30)
        req.raise_for_status()

        def generate():
            for chunk in req.iter_content(chunk_size=8192):
                if chunk:
                    yield chunk

        headers = {
            'Accept-Ranges': 'bytes',
        }
        for header in ('Content-Length', 'Content-Range'):
            if header in req.headers:
                headers[header] = req.headers[header]

        return Response(
            stream_with_context(generate()),
            content_type=req.headers.get('content-type', 'audio/mpeg'),
            status=req.status_code,
            headers=headers,
        )
    except requests.RequestException as e:
        return jsonify({'error': f'代理播放失败: {str(e)}'}), 502


@app.route('/api/download', methods=['POST'])
def api_download():
    """下载歌曲到本地"""
    data = request.get_json()
    song_url = data.get('url', '').strip()
    source_url = data.get('source_url', '').strip()
    title = data.get('title', '').strip()
    artist = data.get('artist', '').strip()

    if not song_url:
        return jsonify({'error': '缺少歌曲链接'}), 400

    existing_filename = find_existing_downloaded_song(song_url, source_url, title, artist)
    if existing_filename:
        return jsonify({
            'success': True,
            'skipped': True,
            'filename': existing_filename,
            'title': title or os.path.splitext(existing_filename)[0],
            'message': '歌曲已存在本地',
        })

    mp3_url, resolved_url, err = resolve_download_target(song_url, source_url)
    if err:
        return jsonify({'error': f'获取下载链接失败: {err}'}), 502
    resolved_url = resolved_url or song_url

    if not title:
        info, _ = get_song_info(resolved_url)
        if info:
            title = info.get('title', '未知歌曲') or '未知歌曲'
        else:
            parsed = urllib.parse.urlparse(resolved_url)
            fallback_title = os.path.splitext(os.path.basename(parsed.path))[0].strip()
            title = fallback_title or '未知歌曲'

    # 清理文件名中的非法字符
    safe_title = re.sub(r'[\/:*?"<>|]', '_', title).strip()
    filename = f'{safe_title}_{int(time.time())}.mp3'
    filepath = os.path.join(MUSIC_DIR, filename)

    # 确保目录存在
    os.makedirs(MUSIC_DIR, exist_ok=True)

    # 只保留最小请求头，降低触发反爬的概率
    dl_headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    }
    try:
        resp = requests.get(mp3_url, headers=dl_headers, stream=True, timeout=60)
        resp.raise_for_status()

        total_size = 0
        with open(filepath, 'wb') as f:
            for chunk in resp.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
                    total_size += len(chunk)

        save_download_record(
            filename=filename,
            title=safe_title,
            artist=artist,
            song_url=song_url,
            source_url=source_url,
            resolved_url=resolved_url or mp3_url,
        )

        return jsonify({
            'success': True,
            'filename': filename,
            'title': safe_title,
            'size': total_size,
            'skipped': False,
        })
    except requests.RequestException as e:
        if os.path.exists(filepath):
            os.remove(filepath)
        return jsonify({'error': f'下载失败: {str(e)}'}), 502


@app.route('/api/favorites', methods=['GET'])
def api_get_favorites():
    favorites = [hydrate_song_entry(fav) for fav in read_json(FAVORITES_FILE)]
    return jsonify({'favorites': favorites})


@app.route('/api/favorites', methods=['POST'])
def api_add_favorite():
    data = request.get_json()
    if not data or not data.get('id'):
        return jsonify({'error': '缺少歌曲信息'}), 400

    fav = {
        'id': data['id'],
        'title': data.get('title', '未知歌曲'),
        'artist': data.get('artist', '未知歌手'),
        'url': data.get('url', ''),
        'source_url': data.get('source_url', ''),
        'mp3_url': data.get('mp3_url', ''),
        'filename': data.get('filename', ''),
        'downloaded': data.get('downloaded', False),
        'added_at': datetime.now().isoformat(),
    }
    fav = hydrate_song_entry(fav)
    favs = read_json(FAVORITES_FILE)
    for existing in favs:
        if (
            existing.get('id') == fav.get('id')
            or (existing.get('filename') and existing.get('filename') == fav.get('filename'))
            or same_song_identity(existing.get('title', ''), existing.get('artist', ''), fav.get('title', ''), fav.get('artist', ''))
        ):
            return jsonify({'success': True, 'message': '已收藏', 'favorite': hydrate_song_entry(existing)})

    favs.append(fav)
    write_json(FAVORITES_FILE, favs)
    return jsonify({'success': True, 'favorite': fav})


@app.route('/api/favorites', methods=['DELETE'])
def api_remove_favorite():
    data = request.get_json()
    song_id = data.get('id', '')
    if not song_id:
        return jsonify({'error': '缺少歌曲 ID'}), 400

    favs = read_json(FAVORITES_FILE)
    favs = [f for f in favs if f['id'] != song_id]
    write_json(FAVORITES_FILE, favs)
    return jsonify({'success': True})


# ─── 歌单 API ──────────────────────────────────────────────

@app.route('/api/playlists', methods=['GET'])
def api_get_playlists():
    favorites_by_id = get_favorites_map()
    playlists = read_json(PLAYLISTS_FILE)
    for playlist in playlists:
        songs = playlist.get('songs', [])
        playlist['songs'] = [hydrate_song_entry(song, favorites_by_id) for song in songs]
    return jsonify({'playlists': playlists})


@app.route('/api/playlists', methods=['POST'])
def api_create_playlist():
    data = request.get_json()
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'error': '请输入歌单名称'}), 400

    playlists = read_json(PLAYLISTS_FILE)
    playlist = {
        'id': str(uuid.uuid4()),
        'name': name,
        'songs': [],
        'created_at': datetime.now().isoformat(),
    }
    playlists.append(playlist)
    write_json(PLAYLISTS_FILE, playlists)
    return jsonify({'success': True, 'playlist': playlist}), 201


@app.route('/api/playlists/<playlist_id>', methods=['PUT'])
def api_update_playlist(playlist_id):
    data = request.get_json()
    playlists = read_json(PLAYLISTS_FILE)

    for pl in playlists:
        if pl['id'] == playlist_id:
            if 'name' in data:
                pl['name'] = data['name'].strip()
            if 'songs' in data:
                pl['songs'] = [hydrate_song_entry(song, get_favorites_map()) for song in data['songs']]
            if 'add_song' in data:
                add_song = hydrate_song_entry(data['add_song'], get_favorites_map())
                if not any((s.get('id') if isinstance(s, dict) else s) == add_song.get('id') for s in pl['songs']):
                    pl['songs'].append(add_song)
            if 'remove_song' in data:
                remove_song_id = data['remove_song']
                pl['songs'] = [
                    s for s in pl['songs']
                    if (s.get('id') if isinstance(s, dict) else s) != remove_song_id
                ]
            write_json(PLAYLISTS_FILE, playlists)
            return jsonify({'success': True, 'playlist': pl})

    return jsonify({'error': '歌单不存在'}), 404


@app.route('/api/playlists/<playlist_id>', methods=['DELETE'])
def api_delete_playlist(playlist_id):
    playlists = read_json(PLAYLISTS_FILE)
    playlists = [pl for pl in playlists if pl['id'] != playlist_id]
    write_json(PLAYLISTS_FILE, playlists)
    return jsonify({'success': True})


# ─── 启动 ──────────────────────────────────────────────────

if __name__ == '__main__':
    os.makedirs(MUSIC_DIR, exist_ok=True)
    print(f'[Music] 我的音乐播放器启动！')
    print(f'[Dir] 音乐目录: {MUSIC_DIR}')
    print(f'[URL] 访问地址: http://127.0.0.1:5000')
    app.run(debug=True, host='127.0.0.1', port=5000)

