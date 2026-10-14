"""Audit original favorite sources only. Apply an inspected report with --apply."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'code' / 'backend'))
import app
from audio_analysis import binary, INPUT_FORMATS


def probe_duration(path):
    probe = binary('ffprobe', str(ROOT))
    if not probe:
        raise RuntimeError('缺少 FFprobe，无法确认实际时长')
    result = subprocess.run([
        probe, '-v', 'error', '-protocol_whitelist', 'file,pipe',
        '-format_whitelist', INPUT_FORMATS, '-select_streams', 'a:0',
        '-show_entries', 'stream=duration:format=duration', '-of', 'json', str(path),
    ], capture_output=True, text=True, encoding='utf-8', timeout=15, check=True,
       creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
    payload = json.loads(result.stdout)
    if not payload.get('streams'):
        raise ValueError('没有音频轨道')
    duration = float(payload.get('format', {}).get('duration') or payload['streams'][0].get('duration') or 0)
    if not 0 < duration < 86400:
        raise ValueError('无法确认实际时长')
    return duration


def measure_online(url, directory):
    path = directory / ('audio-' + uuid.uuid4().hex)
    deadline, size = time.monotonic() + 45, 0
    try:
        with app.get_stream_session().get(url, headers=app.playback_headers(url), stream=True, timeout=(3, 8)) as response:
            response.raise_for_status()
            mime = response.headers.get('Content-Type', '').lower()
            if mime.startswith(('text/', 'application/json')):
                raise ValueError('返回了非音频内容')
            with path.open('wb') as file:
                for chunk in response.iter_content(65536):
                    size += len(chunk)
                    if size > app.MAX_AUDIO_BYTES or time.monotonic() > deadline:
                        raise ValueError('核验下载超过大小或时间上限')
                    file.write(chunk)
            length = response.headers.get('Content-Length')
            if not size or (length and not response.headers.get('Content-Encoding') and size != int(length)):
                raise ValueError('音频未完整传输')
        return probe_duration(path)
    finally:
        if path.exists():
            path.unlink()


def audit(entries, directory):
    failures, rows = {}, []
    for index, song in enumerate(entries, 1):
        ref = app.song_ref_from_song(song) or song.get('url', '')
        provider = app.urllib.parse.urlparse(ref).netloc
        row = {'id': song['id'], 'title': song.get('title', ''), 'artist': song.get('artist', ''),
               'song_ref': ref, 'actual_duration': None, 'expected_duration': None,
               'is_preview': False, 'status': 'unverified', 'reason': ''}
        try:
            if failures.get(provider, 0) >= 3:
                raise ValueError('该来源连续不可用，停止重复请求；本条保留')
            hydrated = app.hydrate_song_entry(song)
            if hydrated.get('filename'):
                duration = probe_duration(Path(app.MUSIC_DIR) / hydrated['filename'])
                info = hydrated
            else:
                # Never call api_song_info: its recovery path can choose another recording.
                info, error = app.resolve_qjjlb_song_info_uncached(ref, include_lyrics=False) if ref.startswith('qjjlb://') else app.get_song_info(ref, include_lyrics=False)
                if error or not info or not info.get('mp3_url'):
                    raise ValueError(error or '原音源无可播放地址')
                duration = measure_online(info['mp3_url'], directory)
            expected = info.get('expected_duration') or song.get('expected_duration')
            row.update(actual_duration=round(duration, 3), expected_duration=expected,
                       is_preview=info.get('is_preview') is True)
            if app.incomplete_audio(duration, expected, info.get('is_preview', False)):
                row.update(status='incomplete', reason='来源明确标记试听' if info.get('is_preview') else '实际音频明显短于同一歌曲的完整曲长')
            elif 20 <= duration <= 45 and not expected:
                row.update(status='uncertain', reason='短音频，但缺少同一歌曲完整曲长或试听标记；保留')
            else:
                row.update(status='retained', reason='没有证据证明音源不完整')
            failures[provider] = 0
        except Exception as error:
            failures[provider] = failures.get(provider, 0) + 1
            row['reason'] = str(error)[:300]
        rows.append(row)
        print(json.dumps({'index': index, 'count': len(entries), **row}, ensure_ascii=False), flush=True)
        if row['status'] != 'unverified':
            time.sleep(1)
    return rows


def apply_report(report, favorites_path):
    """Require an unchanged snapshot, then replace only favorites atomically."""
    raw = favorites_path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != report['favorites_sha256']:
        raise ValueError('收藏在核验后已发生变化，需重新核验；未删除任何条目')
    entries = json.loads(raw)
    removed = {row['id']: row for row in report['rows'] if row['status'] == 'incomplete'}
    if not set(removed).issubset({song['id'] for song in entries}):
        raise ValueError('核验报告包含不存在的收藏目标；未删除任何条目')
    for row in removed.values():
        actual = row.get('actual_duration')
        if not isinstance(actual, (int, float)) or actual <= 0 or not app.incomplete_audio(
                actual, row.get('expected_duration'), row.get('is_preview') is True):
            raise ValueError('缺少已确认的实际时长或不完整音源证据；未删除任何条目')
    for song in entries:
        if song['id'] in removed:
            row = removed[song['id']]
            ref = app.song_ref_from_song(song) or song.get('url', '')
            if ref != row['song_ref'] or song.get('title', '') != row['title'] or song.get('artist', '') != row['artist']:
                raise ValueError('删除目标与核验条目不一致')
    if not removed:
        return 0
    backup = favorites_path.parent / ('favorites-before-audit-' + uuid.uuid4().hex + '.json')
    # The backup lives in ignored cache, not alongside runtime collection files.
    backup = ROOT / '.cache' / backup.name
    backup.write_bytes(raw)
    kept = [song for song in entries if song['id'] not in removed]
    temporary = favorites_path.with_name('favorites-audit-' + uuid.uuid4().hex + '.tmp')
    try:
        temporary.write_text(json.dumps(kept, ensure_ascii=False, indent=2), encoding='utf-8')
        if favorites_path.read_bytes() != raw:
            raise ValueError('收藏在写入前发生变化；未删除任何条目')
        os.replace(temporary, favorites_path)
    finally:
        if temporary.exists():
            temporary.unlink()
    return len(entries) - len(kept)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', type=Path, help='apply a previously inspected report')
    args = parser.parse_args()
    favorites = Path(app.FAVORITES_FILE)
    if args.apply:
        print(json.dumps({'removed': apply_report(json.loads(args.apply.read_text(encoding='utf-8')), favorites)}, ensure_ascii=False))
        return
    directory = ROOT / '.cache' / ('favorites-audit-' + time.strftime('%Y%m%d-%H%M%S'))
    directory.mkdir(parents=True)
    raw = favorites.read_bytes()
    report = {'favorites_sha256': hashlib.sha256(raw).hexdigest(), 'rows': audit(json.loads(raw), directory)}
    output = directory / 'report.json'
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'report': str(output), 'counts': {status: sum(row['status'] == status for row in report['rows'])
                      for status in ('incomplete', 'retained', 'uncertain', 'unverified')}}, ensure_ascii=False))


if __name__ == '__main__':
    main()
