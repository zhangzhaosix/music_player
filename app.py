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

# 请求头，模拟浏览器访问
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': QEECC_BASE,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
}

# 全局 session 用于 qeecc 请求（维持 cookies）
_qeecc_session = None


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


# ─── 数据读写工具 ──────────────────────────────────────────

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
}

# 中文名常用尾字（无分隔符时辅助判断歌手与歌名边界）
# 中文名常用尾字（无分隔符时辅助判断歌手与歌名边界）
# 注意：qeecc 有时使用同形异码字符（如 U+516E 形似 U+56E1），全部覆盖
_ARTIST_END_CHARS = set('婕囡婷欣馨彤琳琪瑶璇莹雯璐琼玲珊岚萱蕊萌莎妮菲嫣娟汐豪俊')
_ARTIST_END_CHARS.add('兮')  # 囎（同形异码，形似 囡 U+56E1）


def parse_song_title(title_raw):
    """从 qeecc 标题格式解析出歌曲名和歌手
    格式示例: 陈奕迅·孤勇者[MP3]  或  半吨兄弟·再见[MP3]

    策略:
    1. 先尝试分隔符拆分（歌手·歌曲名）
    2. 若无分隔符，用 COMMON_ARTISTS 匹配前缀
    3. 再根据中文名常用尾字启发式拆分
    4. 仍失败则整段作为歌名，未知歌手
    """
    title = title_raw.strip()
    if not title:
        return '未知歌曲', '未知歌手'

    # 去掉后缀标签（大小写不敏感）
    title = re.sub(r'\[(?:MP3|Mp3|FLAC|Mp3_Lrc|APE|WAV)\]', '', title, flags=re.IGNORECASE)
    # 去掉书卷号《》
    title = re.sub(r'[《》]', '', title)
    title = title.strip()

    artist = '未知歌手'
    song_name = title

    # 策略 1：分隔符拆分（· • － — - | / 等）
    sep_match = re.search(r'^(.+?)[·•・－—\-\\|/](.+)$', title)
    if sep_match:
        candidate = sep_match.group(1).strip()
        if candidate and len(candidate) < 30:
            return sep_match.group(2).strip(), candidate

    # 策略 2：无分隔符时，用常见歌手字典匹配前缀
    # 按名字长度降序匹配（避免"谢天笑"被"谢天"短匹配截胡）
    for a in sorted(COMMON_ARTISTS, key=len, reverse=True):
        if title.startswith(a):
            rest = title[len(a):].strip()
            if rest and len(rest) >= 2:
                return rest, a

    # 策略 3：用中文名常用尾字启发式拆分
    # 取前 2~4 字，若末尾字是常见歌手名尾字，视为歌手名
    for split_pos in (4, 3, 2):
        if split_pos >= len(title):
            continue
        candidate = title[:split_pos]
        if candidate[-1] in _ARTIST_END_CHARS:
            rest = title[split_pos:].strip()
            if rest and len(rest) >= 2:
                return rest, candidate

    return song_name, artist


def extract_song_id(song_url):
    """从歌曲 URL 中提取 qeecc 的歌曲 ID
    例如: /song/eHdzZ25zaWRk.html → eHdzZ25zaWRk
    """
    match = re.search(r'/song/([^/.]+)', song_url)
    return match.group(1) if match else None


def get_qeecc_play_data(song_id):
    """通过 qeecc 的播放 API 获取 MP3 地址
    POST /js/play.php {id, type} → {url, pic, lkid, name, ...}
    """
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


def search_qeecc(keyword):
    """搜索 qeecc 网站，返回歌曲列表"""
    sess = get_qeecc_session()
    encoded = urllib.parse.quote(keyword)
    url = f'{QEECC_BASE}/so/{encoded}.html'
    try:
        resp = sess.get(url, timeout=15)
        resp.encoding = 'utf-8'
    except requests.RequestException as e:
        return {'error': f'搜索请求失败: {str(e)}'}, 502

    soup = BeautifulSoup(resp.text, 'html.parser')
    results = []
    seen_hrefs = set()

    # 搜索结果页面中，歌曲链接格式为 <a href="/song/xxx.html"> 标题[Mp3]
    for link in soup.find_all('a', href=True):
        href = link['href']
        if '/song/' not in href:
            continue
        if href.startswith('//'):
            href = 'https:' + href
        elif not href.startswith('http'):
            href = QEECC_BASE + '/' + href.lstrip('/')

        if href in seen_hrefs:
            continue
        seen_hrefs.add(href)

        raw_title = link.get_text(strip=True) or link.get('title', '')
        raw_title = raw_title.strip()
        if not raw_title:
            continue

        song_name, artist = parse_song_title(raw_title)
        qecc_id = extract_song_id(href)
        song_id = str(uuid.uuid5(uuid.NAMESPACE_URL, href) if not qecc_id else qecc_id)

        results.append({
            'id': song_id,
            'title': song_name,
            'artist': artist,
            'url': href,
            'source': 'qeecc',
        })

    # 去重
    seen_titles = set()
    unique_results = []
    for r in results:
        key = r['title'] + r['artist']
        if key not in seen_titles:
            seen_titles.add(key)
            unique_results.append(r)

    return unique_results[:30]


def extract_mp3_url(song_url):
    """通过 qeecc 播放 API 获取 MP3 直链"""
    song_id = extract_song_id(song_url)
    if not song_id:
        return None, '无法从链接中提取歌曲 ID'

    data, err = get_qeecc_play_data(song_id)
    if err:
        return None, err
    if not data:
        return None, '播放接口返回空数据'

    mp3_url = data.get('url', '')
    if not mp3_url:
        return None, '播放接口返回数据中无 MP3 链接'

    if mp3_url.startswith('//'):
        mp3_url = 'https:' + mp3_url

    return mp3_url, None


def get_song_info(song_url):
    """获取歌曲详细信息，优先使用播放 API"""
    song_id = extract_song_id(song_url)
    if not song_id:
        return {'error': '无法提取歌曲 ID'}, '无法提取歌曲 ID'

    # 获取 MP3 链接
    mp3_url, err = extract_mp3_url(song_url)

    # 从页面提取标题和歌手
    sess = get_qeecc_session()
    try:
        resp = sess.get(song_url, timeout=15)
        resp.encoding = 'utf-8'
        soup = BeautifulSoup(resp.text, 'html.parser')
        title_tag = soup.find('title')
        raw_title = title_tag.get_text(strip=True) if title_tag else ''
        song_name, artist = parse_song_title(raw_title) if raw_title else ('未知歌曲', '未知歌手')
    except Exception:
        # 如果页面获取失败，尝试从播放 API 获取
        data, _ = get_qeecc_play_data(song_id)
        if data:
            raw_name = data.get('name', '') or data.get('title', '')
            song_name, artist = parse_song_title(raw_name) if raw_name else ('未知歌曲', '未知歌手')
        else:
            song_name, artist = '未知歌曲', '未知歌手'

    return {
        'title': song_name or '未知歌曲',
        'artist': artist or '未知歌手',
        'mp3_url': mp3_url,
        'source_url': song_url,
    }, err


# ─── 路由 ──────────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/search')
def api_search():
    """搜索 qeecc 歌曲"""
    q = request.args.get('q', '').strip()
    if not q:
        return jsonify({'error': '请输入搜索关键词'}), 400

    results = search_qeecc(q)
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
    """从 qeecc 下载 MP3 到本地"""
    data = request.get_json()
    song_url = data.get('url', '').strip()
    title = data.get('title', '').strip()

    if not song_url:
        return jsonify({'error': '缺少歌曲链接'}), 400

    # 获取 MP3 链接
    mp3_url, err = extract_mp3_url(song_url)
    if err:
        return jsonify({'error': f'获取下载链接失败: {err}'}), 502

    if not title:
        info, _ = get_song_info(song_url)
        if info:
            title = info.get('title', '未知歌曲') or '未知歌曲'

    # 清理文件名
    safe_title = re.sub(r'[\\/:*?"<>|]', '_', title).strip()
    filename = f'{safe_title}_{int(time.time())}.mp3'
    filepath = os.path.join(MUSIC_DIR, filename)

    # 确保目录存在
    os.makedirs(MUSIC_DIR, exist_ok=True)

    # kuwo.cn CDN 需要去掉 Referer，否则返回 403
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
        # 下载失败清理残留
        if os.path.exists(filepath):
            os.remove(filepath)
        return jsonify({'error': f'下载失败: {str(e)}'}), 502


# ─── 收藏 API ──────────────────────────────────────────────

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
