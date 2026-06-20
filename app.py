import os
import json
import uuid
import re
import time
import urllib.parse
import requests
from datetime import datetime
from flask import Flask, render_template, request, jsonify, send_from_directory, Response, stream_with_context
from bs4 import BeautifulSoup

app = Flask(__name__)

# 配置
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MUSIC_DIR = os.path.join(BASE_DIR, '音乐合集')
FAVORITES_FILE = os.path.join(BASE_DIR, 'favorites.json')
PLAYLISTS_FILE = os.path.join(BASE_DIR, 'playlists.json')
QEECC_BASE = 'https://www.qeecc.com'
QJJLB_BASE = 'http://qjjlb.quanjian.com.cn/musicdl/'
QJJLB_ORIGIN = 'http://qjjlb.quanjian.com.cn'
KUWO_LYRIC_URL = 'http://m.kuwo.cn/newh5/singles/songinfoandlrc?musicId={}'

# 请求头，模拟浏览器访问
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': QEECC_BASE,
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

# 全局 session 用于 qeecc 请求（维持 cookies）
_qeecc_session = None
_qjjlb_session = None
_search_cache = {}
_search_cache_ttl = 300


def get_qeecc_session():
    """获取带 cookies 的 requests Session"""
    global _qeecc_session
    if _qeecc_session is None:
        _qeecc_session = requests.Session()
        _qeecc_session.headers.update(HEADERS)
        # 先访问首页获取 cookies
        try:
            _qeecc_session.get(QEECC_BASE, timeout=10)
        except Exception:
            pass
    return _qeecc_session


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


def get_cached_search_results(keyword):
    cached = _search_cache.get(keyword)
    if not cached:
        return None
    if time.time() - cached['ts'] > _search_cache_ttl:
        _search_cache.pop(keyword, None)
        return None
    return [dict(song) for song in cached['results']]


def store_search_results(keyword, results):
    _search_cache[keyword] = {
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
    except (requests.RequestException, json.JSONDecodeError, ValueError) as e:
        return None, f'qjjlb 请求失败: {str(e)}'


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
        return None, f'qjjlb 请求失败: {str(e)}'


def search_qjjlb_migu(keyword, limit=10):
    data, err = fetch_qjjlb_json(
        'https://api.xcvts.cn/api/music/migu',
        params={'gm': keyword, 'n': '', 'num': limit, 'type': 'json'},
    )
    if err:
        return None, err
    if not isinstance(data, dict):
        return None, 'qjjlb migu 返回了无效数据'
    if int(data.get('code', 0) or 0) != 200:
        return None, str(data.get('error') or 'qjjlb migu 搜索失败')

    results = []
    for item in data.get('data', []) or []:
        if not isinstance(item, dict):
            continue
        n = item.get('n')
        url = build_qjjlb_ref('migu', kw=keyword, n=n, num=limit)
        song = make_qjjlb_song('migu', item, url=url, source_url=QJJLB_BASE)
        if song:
            results.append(song)
    return results, None


def search_qjjlb_netease(keyword, page=1, limit=10):
    data, err = fetch_qjjlb_json(
        'https://api.vkeys.cn/v2/music/netease',
        params={'word': keyword, 'page': page, 'num': limit},
    )
    if err:
        return None, err
    if not isinstance(data, dict):
        return None, 'qjjlb 网易云返回了无效数据'
    if int(data.get('code', 0) or 0) != 200:
        return None, str(data.get('error') or 'qjjlb 网易云搜索失败')

    results = []
    for item in data.get('data', []) or []:
        if not isinstance(item, dict):
            continue
        url = build_qjjlb_ref('netease', id=item.get('id', ''))
        song = make_qjjlb_song('netease', item, url=url, source_url=QJJLB_BASE, cover_url=item.get('cover', ''))
        if song:
            results.append(song)
    return results, None


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


def search_qjjlb(keyword, limit=30):
    cached_results = get_cached_search_results(keyword)
    if cached_results is not None:
        return cached_results

    results = []
    seen_keys = set()
    last_error = None
    source_limit = max(1, min(10, limit))
    source_fetchers = [
        lambda: search_qjjlb_qq(keyword, source_limit),
        lambda: search_qjjlb_kuwo(keyword, source_limit),
        lambda: search_qjjlb_netease(keyword, 1, source_limit),
    ]

    for fetcher in source_fetchers:
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
        store_search_results(keyword, results)
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


def get_favorites_map():
    """返回 {song_id: fav_entry} 的映射，方便快速查询"""
    favs = read_json(FAVORITES_FILE)
    return {f['id']: f for f in favs}


# ─── qeecc.com 爬取 ───────────────────────────────────────

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
# 中文名常用尾字（无分隔符时辅助判断歌手与歌名边界）
# 注意：qeecc 有时使用同形异码字符（如 U+516E 形似 U+56E1），全部覆盖
_ARTIST_END_CHARS = set('婕囡婷欣馨彤琳琪瑶璇莹雯璐琼玲珊岚萱蕊萌莎妮菲嫣娟汐豪俊')
_ARTIST_END_CHARS.add('兮')  # 囎（同形异码，形似 囡 U+56E1）


def clean_qeecc_title_text(text):
    if text is None:
        return ''

    title = re.sub(r'\s+', ' ', str(text)).strip()
    if not title:
        return ''

    title = re.sub(r'\s*(?:[-|·•]\s*)?(?:qeecc|酷我音乐)\s*$', '', title, flags=re.IGNORECASE)
    title = re.sub(r'^[\s&＆·•\-—_]+', '', title)
    return title.strip()


def normalize_qeecc_song_url(raw_url):
    if not raw_url:
        return None

    url = str(raw_url).strip()
    if not url or url.startswith(('javascript:', '#', 'mailto:')):
        return None

    match = re.search(r"(/song/[^'\" <>()]+)", url, flags=re.IGNORECASE)
    if match:
        url = match.group(1)

    if url.startswith('//'):
        url = 'https:' + url
    elif url.startswith('/'):
        url = QEECC_BASE + url
    elif not url.startswith('http'):
        url = QEECC_BASE + '/' + url.lstrip('/')

    return url if '/song/' in url else None


def extract_qeecc_song_url_from_tag(tag):
    if tag is None:
        return None

    for attr in ('href', 'data-href', 'data-url', 'data-link'):
        url = normalize_qeecc_song_url(tag.get(attr))
        if url:
            return url

    onclick = tag.get('onclick')
    if onclick:
        url = normalize_qeecc_song_url(onclick)
        if url:
            return url

    return None


def is_security_verification_text(text):
    if not text:
        return False

    normalized = re.sub(r'\s+', '', str(text)).lower()
    blocked_markers = ('安全验证', '安全检查', '验证码', '访问过于频繁', 'captcha', 'robot', 'verify')
    return any(marker in normalized for marker in blocked_markers)


def parse_song_title(title_raw):
    title = clean_qeecc_title_text(title_raw)
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
    """从歌曲 URL 中提取 qeecc 的歌曲 ID
    例如: /song/eHdzZ25zaWRk.html → eHdzZ25zaWRk
    """
    match = re.search(r'/song/([^/.]+)', song_url)
    return match.group(1) if match else None


def get_qeecc_play_data(song_id):
    sess = get_qeecc_session()
    try:
        resp = sess.post(
            f'{QEECC_BASE}/js/play.php',
            data={'id': song_id, 'type': 'music'},
            timeout=15,
        )
        resp.encoding = 'utf-8'
        data = resp.json()
        return data, None
    except requests.RequestException as e:
        return None, f'请求播放接口失败: {str(e)}'
    except (json.JSONDecodeError, ValueError):
        return None, '播放接口返回数据异常'


def fetch_kuwo_lyrics(lkid):
    if not lkid:
        return []

    try:
        resp = requests.get(
            KUWO_LYRIC_URL.format(urllib.parse.quote(str(lkid))),
            headers={
                'User-Agent': HEADERS['User-Agent'],
                'Referer': 'http://m.kuwo.cn/',
            },
            timeout=15,
        )
        resp.encoding = 'utf-8'
        data = resp.json()
    except (requests.RequestException, json.JSONDecodeError, ValueError):
        return []

    lyric_list = data.get('data', {}).get('lrclist') if isinstance(data.get('data'), dict) else None
    if not isinstance(lyric_list, list):
        return []

    lyrics = []
    for item in lyric_list:
        if not isinstance(item, dict):
            continue
        line = str(item.get('lineLyric', '')).strip()
        if not line:
            continue
        try:
            time_value = float(item.get('time', 0) or 0)
        except (TypeError, ValueError):
            time_value = 0
        lyrics.append({'time': time_value, 'text': line})

    return lyrics


def extract_media_url_from_html(html):
    if not html:
        return ''

    text = str(html).replace('\\/', '/')

    patterns = [
        r'https?://[^"\']+\.(?:m4a|mp3|aac|flac|m3u8)(?:\?[^"\']*)?',
        r'//[^"\']+\.(?:m4a|mp3|aac|flac|m3u8)(?:\?[^"\']*)?',
    ]
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            url = match.group(0)
            return 'https:' + url if url.startswith('//') else url

    for key in ('playUrl', 'playurl', 'songUrl', 'songurl', 'audioUrl', 'audiourl', 'url', 'src'):
        match = re.search(rf'"{key}"\s*:\s*"([^"]+)"', text, flags=re.IGNORECASE)
        if not match:
            continue
        url = match.group(1).replace('\\/', '/')
        if url.startswith('//'):
            url = 'https:' + url
        if re.search(r'\.(?:m4a|mp3|aac|flac|m3u8)(?:[?#].*)?$', url, flags=re.IGNORECASE):
            return url

    return ''


def search_qeecc(keyword):
    cached_results = get_cached_search_results(keyword)
    if cached_results is not None:
        return cached_results

    sess = get_qeecc_session()
    encoded = urllib.parse.quote(keyword)
    url = f'{QEECC_BASE}/so/{encoded}.html'
    results = []
    seen_keys = set()
    blocked_error = None
    qeecc_error = None

    try:
        resp = sess.get(url, timeout=15)
        resp.raise_for_status()
        resp.encoding = resp.apparent_encoding or 'utf-8'
    except requests.RequestException as e:
        qeecc_error = f'搜索请求失败: {str(e)}'
    else:
        soup = BeautifulSoup(resp.text, 'html.parser')

        for tag in soup.find_all(True):
            if tag.name in {'script', 'style', 'noscript'}:
                continue

            href = extract_qeecc_song_url_from_tag(tag)
            if not href:
                continue

            raw_title = clean_qeecc_title_text(
                tag.get_text(' ', strip=True)
                or tag.get('title', '')
                or tag.get('aria-label', '')
                or tag.get('data-title', '')
                or tag.get('alt', '')
            )
            if not raw_title:
                continue

            song_name, artist = parse_song_title(raw_title)
            qecc_id = extract_song_id(href)
            song_id = str(uuid.uuid5(uuid.NAMESPACE_URL, href) if not qecc_id else qecc_id)
            dedupe_key = song_id or f'{song_name}|{artist}'
            if dedupe_key in seen_keys:
                continue
            seen_keys.add(dedupe_key)

            results.append({
                'id': song_id,
                'title': song_name,
                'artist': artist,
                'url': href,
                'source': 'qeecc',
            })

        if not results:
            for match in re.finditer(r'(/song/[^\'" <>()]+)', resp.text, flags=re.IGNORECASE):
                href = normalize_qeecc_song_url(match.group(1))
                if not href:
                    continue

                qecc_id = extract_song_id(href)
                song_id = str(uuid.uuid5(uuid.NAMESPACE_URL, href) if not qecc_id else qecc_id)
                if song_id in seen_keys:
                    continue
                seen_keys.add(song_id)

                results.append({
                    'id': song_id,
                    'title': '未知歌曲',
                    'artist': '未知歌手',
                    'url': href,
                    'source': 'qeecc',
                })

        if not results:
            page_text = soup.get_text(' ', strip=True).lower()
            blocked_markers = ('安全验证', '安全检查', '验证码', '访问过于频繁', 'captcha', 'robot', 'verify')
            if any(marker.lower() in page_text for marker in blocked_markers):
                blocked_error = '搜索页面返回了安全验证内容，请稍后重试'

    if results:
        store_search_results(keyword, results)
        return results[:30]


    if blocked_error:
        return {'error': blocked_error}, 502
    if qeecc_error:
        return {'error': qeecc_error}, 502

    return []

def resolve_qjjlb_song_info(song_url):
    parsed = urllib.parse.urlparse(str(song_url).strip())
    if (parsed.scheme or '').lower() != 'qjjlb':
        return None, None

    provider = (parsed.netloc or parsed.path.lstrip('/')).strip().lower()
    params = {key: values[0] for key, values in urllib.parse.parse_qs(parsed.query).items()}

    if not provider:
        return None, '无效的 qjjlb 链接'

    if provider == 'migu':
        keyword = params.get('kw', '')
        limit = int(params.get('num', 10) or 10)
        page_data, err = fetch_qjjlb_json(
            'https://api.xcvts.cn/api/music/migu',
            params={'gm': keyword, 'n': params.get('n', ''), 'num': limit, 'type': 'json'},
        )
        if err:
            return None, err
        if not isinstance(page_data, dict):
            return None, 'qjjlb migu 返回了无效数据'

        payload = page_data.get('data')
        if isinstance(payload, list):
            payload = payload[0] if payload else {}
        if not isinstance(payload, dict):
            payload = page_data

        lrc_url = str(payload.get('lrc_url', '') or '').strip()
        lrc_text = ''
        if lrc_url:
            lrc_text, _ = fetch_qjjlb_text(lrc_url)

        source_url = str(payload.get('link', '') or '').strip() or str(payload.get('song_url', '') or '').strip()
        mp3_url = str(payload.get('music_url', '') or payload.get('url', '') or '').strip()
        if not mp3_url and source_url.startswith('http'):
            try:
                resp = requests.get(
                    source_url,
                    headers={
                        'User-Agent': HEADERS['User-Agent'],
                        'Referer': 'https://music.migu.cn/',
                    },
                    timeout=15,
                )
                resp.encoding = resp.apparent_encoding or 'utf-8'
                mp3_url = extract_media_url_from_html(resp.text)
            except requests.RequestException:
                mp3_url = ''

        if not mp3_url:
            return None, 'migu 音源暂时不可用'

        info = make_qjjlb_song(
            'migu',
            payload,
            url=str(song_url).strip(),
            source_url=source_url or QJJLB_BASE,
            mp3_url=mp3_url,
            cover_url=payload.get('cover', '') or payload.get('pic', ''),
            lyrics_text=lrc_text or payload.get('lrc', ''),
        )
        return info, None

    if provider == 'netease':
        song_id = params.get('id', '').strip()
        if not song_id:
            return None, 'qjjlb 网易云缺少歌曲 ID'

        detail_data, err = fetch_qjjlb_json(
            'https://api.qijieya.cn/meting/',
            params={'type': 'song', 'id': song_id},
        )
        if err:
            return None, err
        if not isinstance(detail_data, list) or not detail_data:
            return None, 'qjjlb 网易云返回了无效数据'

        detail = detail_data[0] if isinstance(detail_data[0], dict) else {}
        lyric_text = ''
        lyric_data, lyric_err = fetch_qjjlb_json(
            'https://api.vkeys.cn/v2/music/netease/lyric',
            params={'id': song_id},
        )
        if not lyric_err and isinstance(lyric_data, dict):
            lyric_text = str((lyric_data.get('data') or {}).get('lrc', '') or '')

        info = {
            'title': detail.get('name', '未知歌曲') or '未知歌曲',
            'artist': detail.get('artist', '未知歌手') or '未知歌手',
            'mp3_url': detail.get('url', '') or '',
            'source_url': detail.get('song_url') or f'https://music.163.com/#/song?id={song_id}',
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

    qjjlb_info, qjjlb_err = resolve_qjjlb_song_info(normalized_url)
    if qjjlb_info:
        return qjjlb_info, None
    if qjjlb_err and normalized_url.startswith('qjjlb://'):
        return {'error': qjjlb_err}, qjjlb_err

    song_id = extract_song_id(normalized_url)
    if not song_id:
        if qjjlb_err:
            return {'error': qjjlb_err}, qjjlb_err
        return {'error': '无法提取歌曲 ID'}, '无法提取歌曲 ID'

    play_data, err = get_qeecc_play_data(song_id)
    mp3_url = ''
    cover_url = ''
    lyric_id = ''
    lyrics = []
    song_name, artist = '未知歌曲', '未知歌手'

    if play_data:
        mp3_url = play_data.get('url', '') or ''
        if mp3_url.startswith('//'):
            mp3_url = 'https:' + mp3_url
        cover_url = play_data.get('pic', '') or ''
        lyric_id = str(play_data.get('lkid', '') or '')

        raw_name = play_data.get('name', '') or play_data.get('title', '')
        if raw_name and not is_security_verification_text(raw_name):
            song_name, artist = parse_song_title(raw_name)
        lyrics = fetch_kuwo_lyrics(lyric_id)

    sess = get_qeecc_session()
    try:
        resp = sess.get(normalized_url, timeout=15)
        resp.encoding = 'utf-8'
        soup = BeautifulSoup(resp.text, 'html.parser')
        title_tag = soup.find('title')
        raw_title = title_tag.get_text(strip=True) if title_tag else ''
        if raw_title and not is_security_verification_text(raw_title):
            if song_name == '未知歌曲' or artist == '未知歌手':
                song_name, artist = parse_song_title(raw_title)
    except Exception:
        pass

    if not mp3_url:
        mp3_url, err = extract_mp3_url(normalized_url)

    return {
        'title': song_name or '未知歌曲',
        'artist': artist or '未知歌手',
        'mp3_url': mp3_url,
        'source_url': normalized_url,
        'cover_url': cover_url,
        'lyric_id': lyric_id,
        'lyrics': lyrics,
    }, err


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/search')
def api_search():
    """搜索 qjjlb 歌曲"""
    q = request.args.get('q', '').strip()
    if not q:
        return jsonify({'error': '请输入搜索关键词'}), 400

    results = search_qjjlb(q)
    if isinstance(results, tuple):
        return jsonify(results[0]), results[1]

    # 标记已下载和已收藏状态
    local_songs = {s['id'] for s in get_local_music()}
    favs = get_favorites_map()

    for song in results:
        song['downloaded'] = song['id'] in local_songs
        song['favorited'] = song['id'] in favs

    return jsonify({'results': results})


@app.route('/api/song-info')
def api_song_info():
    """获取歌曲详情（含 MP3 链接）"""
    url = request.args.get('url', '').strip()
    if not url:
        return jsonify({'error': '缺少歌曲链接'}), 400

    info, err = get_song_info(url)
    if err:
        return jsonify({'error': err}), 502
    return jsonify(info)


@app.route('/api/music')
def api_music():
    """获取本地音乐列表"""
    songs = get_local_music()
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

    try:
        os.remove(filepath)
    except OSError as e:
        return jsonify({'error': f'删除文件失败: {str(e)}'}), 500

    # 先记录要清理的 song_id
    favs = read_json(FAVORITES_FILE)
    song_ids_to_remove = {f['id'] for f in favs if f.get('filename') == filename}
    song_ids_to_remove.add(filename)  # 文件名本身也作为备选 id

    # 从收藏中移除
    favs = [f for f in favs if f.get('filename') != filename]
    write_json(FAVORITES_FILE, favs)

    # 从所有歌单中移除关联的歌曲
    playlists = read_json(PLAYLISTS_FILE)
    for pl in playlists:
        pl['songs'] = [s for s in pl['songs'] if s not in song_ids_to_remove]
    write_json(PLAYLISTS_FILE, playlists)

    return jsonify({'success': True, 'message': f'{filename} 已删除'})


@app.route('/api/stream/<path:filename>')
def api_stream(filename):
    """流式播放本地 MP3 文件"""
    return send_from_directory(MUSIC_DIR, filename, mimetype='audio/mpeg')


@app.route('/api/proxy-stream')
def api_proxy_stream():
    """代理播放 qeecc 上的 MP3（未下载时在线听）"""
    mp3_url = request.args.get('url', '').strip()
    if not mp3_url:
        return jsonify({'error': '缺少 MP3 链接'}), 400

    # kuwo.cn CDN 会检查 Referer，用 qeecc 的 Referer 会被拒绝
    # 使用通用浏览器头，不加 Referer
    stream_headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    }
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
    title = data.get('title', '').strip()

    if not song_url:
        return jsonify({'error': '缺少歌曲链接'}), 400

    if re.search(r'\.mp3(?:[?#].*)?$', song_url, flags=re.IGNORECASE):
        mp3_url = song_url
    else:
        mp3_url, err = extract_mp3_url(song_url)
        if err:
            return jsonify({'error': f'获取下载链接失败: {err}'}), 502

    if not title:
        info, _ = get_song_info(song_url)
        if info:
            title = info.get('title', '未知歌曲') or '未知歌曲'
        else:
            parsed = urllib.parse.urlparse(song_url)
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

        return jsonify({
            'success': True,
            'filename': filename,
            'title': safe_title,
            'size': total_size,
        })
    except requests.RequestException as e:
        if os.path.exists(filepath):
            os.remove(filepath)
        return jsonify({'error': f'下载失败: {str(e)}'}), 502


@app.route('/api/favorites', methods=['GET'])
def api_get_favorites():
    return jsonify({'favorites': read_json(FAVORITES_FILE)})


@app.route('/api/favorites', methods=['POST'])
def api_add_favorite():
    data = request.get_json()
    if not data or not data.get('id'):
        return jsonify({'error': '缺少歌曲信息'}), 400

    favs = read_json(FAVORITES_FILE)
    # 去重
    if any(f['id'] == data['id'] for f in favs):
        return jsonify({'success': True, 'message': '已收藏'})

    fav = {
        'id': data['id'],
        'title': data.get('title', '未知歌曲'),
        'artist': data.get('artist', '未知歌手'),
        'url': data.get('url', ''),
        'filename': data.get('filename', ''),
        'downloaded': data.get('downloaded', False),
        'added_at': datetime.now().isoformat(),
    }
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
    return jsonify({'playlists': read_json(PLAYLISTS_FILE)})


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
                pl['songs'] = data['songs']
            if 'add_song' in data:
                if data['add_song'] not in pl['songs']:
                    pl['songs'].append(data['add_song'])
            if 'remove_song' in data:
                pl['songs'] = [s for s in pl['songs'] if s != data['remove_song']]
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
