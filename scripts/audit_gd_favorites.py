"""只读核对收藏与 GD 网易云目录；不修改收藏，不下载音频。"""
import json
import csv
import os
import re
import sqlite3
import sys
import time
from contextlib import closing
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'code' / 'backend'))
import app


def credits(value):
    return sorted(app.normalize_song_match_text(part) for part in re.split(r'[/、,&＆;；]', str(value or '')) if part.strip())


def classify(song, candidates):
    title, artist = app.normalize_song_match_text(song.get('title')), credits(song.get('artist'))
    if not title or not artist or artist == [app.normalize_song_match_text('未知歌手')]:
        return '待确认', []
    expected = set(re.findall(app.RECORDING_VERSION_PATTERN, ' '.join(str(song.get(k, '') or '') for k in ('title', 'album', 'version')).lower()))
    matches = []
    for candidate in candidates:
        actual = set(re.findall(app.RECORDING_VERSION_PATTERN, ' '.join(str(candidate.get(k, '') or '') for k in ('title', 'album', 'version')).lower()))
        if (app.normalize_song_match_text(candidate.get('title')) == title and credits(candidate.get('artist')) == artist
                and actual == expected
                and all(not song.get(k) or app.normalize_song_match_text(song[k]) == app.normalize_song_match_text(candidate.get(k, '')) for k in ('album', 'version'))):
            matches.append(candidate)
    return ('已匹配' if len(matches) == 1 else '待确认'), matches


def save(path, items):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding='utf-8')
    os.replace(temporary, path)
    for csv_path, rows in ((path.with_suffix('.csv'), items),
                           (path.with_name('gd-favorites-to-review.csv'), [item for item in items if item['status'] in ('待确认', '暂未核验')])):
        csv_temporary = csv_path.with_suffix('.csv.tmp')
        with csv_temporary.open('w', encoding='utf-8-sig', newline='') as output:
            writer = csv.writer(output)
            writer.writerow(['歌名', '歌手', '原专辑', '原版本', '核验状态', '说明', '候选歌曲'])
            for item in rows:
                candidates = '；'.join(' / '.join(str(candidate.get(key, '')) for key in ('title', 'artist', 'album', 'song_ref')) for candidate in item.get('candidates', []))
                fields = [item.get('title', ''), item.get('artist', ''), item.get('album', ''), item.get('version', ''), item['status'], item.get('reason', ''), candidates]
                writer.writerow(["'" + str(value) if str(value).lstrip().startswith(('=', '+', '-', '@')) else value for value in fields])
        os.replace(csv_temporary, csv_path)


def wait_for_budget():
    with closing(sqlite3.connect(app.gd_client.state_file)) as db:
        row = db.execute('SELECT at FROM requests WHERE at > ? ORDER BY at DESC LIMIT 1 OFFSET 24', (time.time() - 300,)).fetchone()
    delay = max(1, min(30, (row[0] if row else time.time() - 300) + 301 - time.time()))
    print(f'请求预算已满，等待 {delay:.0f} 秒', flush=True)
    time.sleep(delay)


def entry_for_song(song):
    return {'id': song.get('id'), 'title': song.get('title'), 'artist': song.get('artist'),
            'album': song.get('album', ''), 'version': song.get('version', ''),
            'original_ref': app.song_ref_from_song(song) or song.get('source_url', '') or song.get('url', ''),
            'status': '暂未核验'}


def identity(item):
    return tuple(item.get(key) or '' for key in ('id', 'title', 'artist', 'album', 'version', 'original_ref'))


def merge_progress(songs, previous):
    saved = {identity(item): item for item in previous}
    entries = [entry_for_song(song) for song in songs]
    # Earlier reports did not store the source reference; retain their existing progress once.
    old_by_id = {item.get('id'): item for item in previous if 'original_ref' not in item}
    for entry in entries:
        old = old_by_id.get(entry['id'])
        if old and all((old.get(key) or '') == (entry.get(key) or '') for key in ('title', 'artist', 'album', 'version')):
            old['original_ref'] = entry['original_ref']
            saved[identity(old)] = old
    return [saved.get(identity(entry), entry) for entry in entries]


def main():
    path = ROOT / '.cache' / 'gd-favorites-audit.json'
    songs = app.read_json(app.FAVORITES_FILE)
    result = [entry_for_song(song) for song in songs]
    if path.exists():
        previous = json.loads(path.read_text(encoding='utf-8'))
        backups = sorted((ROOT / '.cache').glob('source-migration-backup-*/favorites.json'), reverse=True)
        if backups and previous and 'album' not in previous[0]:
            original = json.loads(backups[0].read_text(encoding='utf-8'))
            if [item.get('id') for item in original] == [item.get('id') for item in previous]:
                for item, saved in zip(previous, original):
                    item.update(album=saved.get('album', ''), version=saved.get('version', ''))
        result = merge_progress(songs, previous)
        for item in result:
            if item.get('status') not in ('暂未核验', '本地文件') and 'catalog_count' not in item and not item.get('direct_id'):
                item.update(status='暂未核验', reason='需复核搜索结果范围')
            elif item.get('reason') == '搜索结果达到 50 条，请核对后续结果' and len(item.get('candidates', [])) == 1:
                item.update(status='已匹配', reason='待验证播放地址')
        for song, item in zip(songs, result):
            ref = app.song_ref_from_song(song)
            if app.urllib.parse.urlparse(ref).netloc == 'netease' and not item.get('direct_id'):
                item.update(status='暂未核验', reason='待核验原网易云 ID')
    save(path, result)
    index = 0
    while True:
        latest = app.read_json(app.FAVORITES_FILE)
        if [identity(entry_for_song(item)) for item in latest] != [identity(entry_for_song(item)) for item in songs]:
            if not latest and songs:
                print('收藏暂不可读，停止核验并保留已有清单。', flush=True)
                break
            result = merge_progress(latest, result)
            songs = latest
            index = 0
            save(path, result)
            print(f'收藏已更新，清单同步为 {len(songs)} 首。', flush=True)
            continue
        if index >= len(songs):
            break
        song = songs[index]
        entry = result[index]
        needs_more = entry.get('status') == '待确认' and entry.get('reason') == '搜索结果达到 50 条，请核对后续结果' and entry.get('checked_pages', 1) < 3
        if needs_more:
            page = entry.get('checked_pages', 1) + 1
            query = ' '.join(str(song.get(k, '') or '') for k in ('title', 'artist')).strip()
            while True:
                found, error = app.search_qjjlb_netease(query, page=page, limit=50, background=True)
                if error and '安全上限' in error:
                    wait_for_budget()
                    continue
                break
            if error:
                entry['followup_error'] = error
                save(path, result)
                print(f'上游不可用，停止后续页面核验：{error}', flush=True)
                break
            _, matches = classify(song, found)
            entry.pop('followup_error', None)
            entry['checked_pages'] = page
            if matches:
                entry['candidates'] = [{'title': item['title'], 'artist': item['artist'], 'album': item['album'], 'song_ref': item['song_ref']} for item in matches]
                entry['reason'] = '后续页面找到候选，请确认版本'
            elif len(found) < 50:
                entry['reason'] = f'已检查 {page} 页，未找到严格一致的候选'
            elif page >= 3:
                entry['reason'] = '已检查前 3 页，仍需核对更多结果'
            save(path, result)
            print(f'{index + 1}/{len(songs)} 已检查第 {page} 页', flush=True)
            if entry['reason'] != '搜索结果达到 50 条，请核对后续结果':
                index += 1
            continue
        if entry['status'] != '暂未核验' and (entry['status'] != '已匹配' or entry.get('playback_checked')):
            index += 1
            continue
        if app.hydrate_song_entry(song).get('filename'):
            entry.update(status='本地文件', reason='保留本地播放')
            save(path, result)
            index += 1
            continue
        ref = app.song_ref_from_song(song)
        direct_id = app.urllib.parse.urlparse(ref).netloc == 'netease'
        existing = entry.get('candidates', []) if entry['status'] == '已匹配' else []
        if direct_id and not existing:
            existing = [{'title': song.get('title', ''), 'artist': song.get('artist', ''), 'album': song.get('album', ''), 'song_ref': ref}]
            entry['direct_id'] = True
        while not existing:
            found, error = app.search_qjjlb_netease(' '.join(str(song.get(k, '') or '') for k in ('title', 'artist')).strip(), limit=50, background=True)
            if error and '安全上限' in error:
                wait_for_budget()
                continue
            break
        if not existing and error:
            entry['reason'] = error
            save(path, result)
            print(f'上游不可用，停止核验：{error}', flush=True)
            break
        status, matches = ('已匹配', existing) if existing else classify(song, found)
        if not existing:
            entry['catalog_count'] = len(found)
        if not existing and len(found) >= 50 and not matches:
            status = '待确认'
        entry.update(status=status, candidates=[{'title': item['title'], 'artist': item['artist'], 'album': item['album'], 'song_ref': item['song_ref']} for item in matches], reason=('搜索结果达到 50 条，请核对后续结果' if not existing and len(found) >= 50 and not matches else '多个候选' if matches else '未找到严格一致的候选'))
        if status == '已匹配':
            ref = matches[0]['song_ref']
            parsed = app.urllib.parse.urlparse(ref)
            song_id = app.urllib.parse.parse_qs(parsed.query).get('id', [''])[0]
            while True:
                payload, error = app.gd_client.request('url', id=song_id, br=320, background=True)
                if error and '安全上限' in error:
                    wait_for_budget()
                    continue
                break
            if error:
                entry.update(status='暂未核验', reason=error)
                save(path, result)
                print(f'上游不可用，停止核验：{error}', flush=True)
                break
            url = payload.get('url', '') if isinstance(payload, dict) else ''
            entry.update(status='已匹配' if str(url).startswith(('https://', 'http://')) else '待确认',
                         playback_checked=True, reason='找到播放地址' if url else '同名同歌手候选未返回播放地址')
        save(path, result)
        print(f'{index + 1}/{len(songs)} {status}', flush=True)
        if entry['status'] == '待确认' and entry['reason'] == '搜索结果达到 50 条，请核对后续结果':
            continue
        index += 1
    print(f'报告：{path}', flush=True)


if __name__ == '__main__':
    from gdstudio import process_lock
    try:
        with process_lock(str(ROOT / '.cache' / 'gd-favorites-audit.lock')):
            main()
    except OSError:
        print('另一份收藏核验正在运行，请稍后查看现有清单。', file=sys.stderr)
        sys.exit(1)
