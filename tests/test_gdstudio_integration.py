import json
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'code' / 'backend'))
import app


class GDIntegrationTests(unittest.TestCase):
    def setUp(self):
        app._gd_page_cache.clear()
        app._playback_cache.clear()
        app._gd_covers.clear()
        self.item = {'id': '123', 'name': '歌', 'artist': ['歌手'], 'album': '专辑',
                     'pic_id': '456', 'lyric_id': '123', 'source': 'netease'}

    def test_search_pagination_cache_and_playback(self):
        def request(kind, **kwargs):
            if kind == 'search':
                return [self.item], None
            if kind == 'url':
                return {'url': 'https://example.com/song.mp3'}, None
            return {'lyric': '[00:01.00]歌词'}, None
        with patch.object(app.gd_client, 'request', side_effect=request) as mocked:
            client = app.app.test_client()
            first = client.get('/api/search?q=歌&source_limit=1').get_json()['results'][0]
            self.assertEqual(first['cover_url'], '/api/gd-cover/456')
            self.assertFalse(first['download_allowed'])
            second = client.get('/api/search?q=歌&source_limit=1&page=2').get_json()
            self.assertTrue(second['has_more'])
            client.get('/api/search?q=歌&source_limit=1&page=2')
            searches = [call for call in mocked.call_args_list if call.args[0] == 'search']
            self.assertEqual(len(searches), 2)
            result = client.get('/api/song-info', query_string={'url': first['song_ref'], 'playback_only': 1}).get_json()
            self.assertEqual(result['mp3_url'], 'https://example.com/song.mp3')
            self.assertTrue(result['stream_only'])
            lyric = client.get('/api/song-info', query_string={'url': first['song_ref'], 'lyrics_only': 1}).get_json()
            self.assertEqual(lyric['lyrics_status'], 'ok')
            self.assertEqual(sum(call.args[0] == 'url' for call in mocked.call_args_list), 1)

    def test_ambiguous_legacy_match_is_not_played(self):
        duplicate = {**self.item, 'id': '124'}
        with patch.object(app.gd_client, 'request', return_value=([self.item, duplicate], None)):
            result, error = app.resolve_favorite_song_info({'title': '歌', 'artist': '歌手'}, include_lyrics=False)
        self.assertIsNone(result)
        self.assertIn('确认版本', error)

    def test_legacy_does_not_select_different_duet(self):
        item = {**self.item, 'artist': ['歌手', '另一位歌手']}
        with patch.object(app.gd_client, 'request', return_value=([item], None)):
            result, error = app.resolve_favorite_song_info({'title': '歌', 'artist': '歌手'}, include_lyrics=False)
        self.assertIsNone(result)
        self.assertIsNotNone(error)

    def test_temporary_address_failure_keeps_original_error_and_skips_search(self):
        client = app.app.test_client()
        for message, code in [('GD 音乐台暂时不可用，请稍后重试', 'source_temporary'),
                              ('GD 音乐台请求受限，请稍后重试', 'source_restricted')]:
            with patch.object(app.gd_client, 'request', return_value=(None, message)) as upstream:
                result = client.get('/api/song-info', query_string={
                    'url': 'https://music.163.com/#/song?id=123', 'title': '歌', 'artist': '歌手', 'playback_only': 1,
                })
            self.assertEqual(result.json, {'error': message, 'error_code': code})
            self.assertEqual([call.args[0] for call in upstream.call_args_list], ['url'])

    def test_live_backup_requires_same_album_and_full_artist_credits(self):
        item = {**self.item, 'id': 'backup', 'name': '歌（现场）', 'album': '同一场公演'}
        def request(kind, **params):
            if kind == 'search':
                self.assertEqual(params['name'], '歌 歌手')
                return [dict(item, id='duet', artist=['歌手', '其他歌手']),
                        dict(item, id='other', album='另一场公演'), item, item], None
            return {'url': 'https://audio.example/backup.mp3' if params['id'] == 'backup' else None}, None
        with patch.object(app.gd_client, 'request', side_effect=request) as upstream:
            result = app.app.test_client().get('/api/song-info', query_string={
                'url': 'qjjlb://netease?id=123', 'title': '歌 (Live版)', 'artist': '歌手',
                'album': '同一场公演', 'playback_only': 1,
            })
        self.assertEqual(result.status_code, 200)
        self.assertEqual(app.qjjlb_song_identity_key_from_url(result.json['song_ref']), 'qjjlb:netease:backup')
        self.assertEqual([call.kwargs['id'] for call in upstream.call_args_list if call.args == ('url',)], ['123', 'backup'])

    def test_local_fallback_does_not_substitute_a_different_recording(self):
        with tempfile.TemporaryDirectory() as directory:
            filename = 'local.mp3'
            Path(directory, filename).touch()
            saved = {'title': '歌 (Live版)', 'artist': '歌手', 'filename': filename, 'album': '某场演出',
                     'song_ref': 'qjjlb://netease?id=123'}
            with patch.object(app, 'read_download_index', return_value=[saved]), patch.object(app, 'MUSIC_DIR', directory):
                self.assertEqual(app.find_existing_downloaded_song('qjjlb://netease?id=123&lyric_id=456'), filename)
                self.assertEqual(app.find_existing_downloaded_song(title='歌', artist='歌手'), '')
                self.assertEqual(app.find_existing_downloaded_song(title='歌 (Live版)', artist='歌手', album='另一场演出'), '')
                hydrated = app.hydrate_song_entry({'filename': 'moved.mp3', 'mp3_url': '/api/stream/moved.mp3', 'downloaded': True})
                self.assertEqual((hydrated['filename'], hydrated['mp3_url'], hydrated['downloaded']), ('', '', False))

    def test_full_search_page_with_duplicate_recordings_needs_confirmation(self):
        items = [dict(self.item, id=str(index)) for index in range(50)]
        with patch.object(app.gd_client, 'request', return_value=(items, None)):
            result, error = app.resolve_favorite_song_info({'title': '歌', 'artist': '歌手'}, include_lyrics=False)
        self.assertIsNone(result)
        self.assertIn('确认版本', error)

    def test_legacy_qq_is_not_contacted(self):
        with patch.object(app.gd_client, 'request', side_effect=AssertionError('retired reference picked an upstream')):
            _, error = app.resolve_qjjlb_song_info_uncached('qjjlb://qq?mid=123')
        self.assertIn('旧音源', error)

    def test_cover_failure_uses_default_and_is_temporarily_cached(self):
        with patch.object(app.gd_client, 'request', return_value=(None, '暂时不可用')) as mocked:
            client = app.app.test_client()
            first = client.get('/api/gd-cover/456')
            second = client.get('/api/gd-cover/456')
            self.assertEqual(first.status_code, 200)
            self.assertEqual(first.mimetype, 'image/png')
            self.assertEqual(second.status_code, 200)
            self.assertEqual(mocked.call_count, 1)
            first.close()
            second.close()

    def test_concurrent_playback_shares_temporary_failure_without_caching_it(self):
        entered, release = threading.Event(), threading.Event()
        def fail(*args, **kwargs):
            entered.set()
            release.wait(3)
            return None, 'GD 音乐台拒绝访问'
        results = []
        with patch.object(app.gd_client, 'request', side_effect=fail) as mocked:
            def resolve():
                results.append(app.resolve_qjjlb_song_info('qjjlb://netease?id=999', False))
            first = threading.Thread(target=resolve)
            second = threading.Thread(target=resolve)
            first.start()
            self.assertTrue(entered.wait(2))
            second.start()
            deadline = time.monotonic() + 2
            while not app._playback_requests['qjjlb:netease:999']._cond._waiters and time.monotonic() < deadline:
                time.sleep(.005)
            self.assertTrue(app._playback_requests['qjjlb:netease:999']._cond._waiters)
            release.set()
            first.join(5)
            second.join(5)
            self.assertEqual(mocked.call_count, 1)
            self.assertEqual([item[1] for item in results], ['GD 音乐台拒绝访问'] * 2)
            self.assertNotIn('qjjlb:netease:999', app._playback_cache)

    def test_concurrent_searches_share_one_upstream_request(self):
        entered, release = threading.Event(), threading.Event()
        def fetch(*args, **kwargs):
            entered.set()
            release.wait(3)
            return [self.item], None
        results = {}
        with patch.object(app.gd_client, 'request', side_effect=fetch) as mocked:
            def search(name, lookup):
                results[name] = lookup()

            first = threading.Thread(target=search, args=('catalog', lambda: app.search_qjjlb('并发测试', source_limit=1)))
            second = threading.Thread(target=search, args=('page', lambda: app.search_qjjlb_netease('并发测试', limit=1)))
            first.start()
            self.assertTrue(entered.wait(2))
            second.start()
            time.sleep(.05)
            release.set()
            first.join(5)
            second.join(5)
        self.assertEqual(mocked.call_count, 1)
        self.assertEqual(results['page'][1], None)
        self.assertEqual(results['catalog'], results['page'][0])

    def test_search_cache_evicts_least_recently_used(self):
        with patch.object(app, 'CACHE_LIMIT', 2), patch.object(app.gd_client, 'request', return_value=([self.item], None)) as fetch:
            for keyword in ('a', 'b', 'a', 'c', 'a', 'b'):
                self.assertEqual(app.search_qjjlb(keyword)[0]['songid'], '123')
        self.assertEqual([call.kwargs['name'] for call in fetch.call_args_list], ['a', 'b', 'c', 'b'])

    def test_search_timeout_reports_netease_source(self):
        release, completed = threading.Event(), threading.Event()

        def slow(*args, **kwargs):
            try:
                release.wait(2)
                return None, 'GD timeout'
            finally:
                completed.set()

        with patch.object(app, 'SEARCH_BUDGET', .05), patch.object(app.gd_client, 'request', side_effect=slow):
            try:
                started = time.monotonic()
                response = app.app.test_client().get('/api/search?q=deadline&stream=1')
                final = json.loads(response.data.splitlines()[-1])
                self.assertLess(time.monotonic() - started, .5)
                self.assertEqual(final['results'], [])
                self.assertTrue(final['done'])
                self.assertFalse(final['has_more'])
                self.assertIn('超时', final['source_errors']['netease'])
            finally:
                release.set()
                self.assertTrue(completed.wait(2))

    def test_favorites_keep_cover_and_playlists_keep_original_data(self):
        with tempfile.TemporaryDirectory() as directory:
            favorites = str(Path(directory) / 'favorites.json')
            playlists = str(Path(directory) / 'playlists.json')
            Path(favorites).write_text('[]', encoding='utf-8')
            Path(playlists).write_text('[{"id":"list","songs":[{"id":"old","title":"旧歌","artist":"歌手"}]}]', encoding='utf-8')
            before = Path(playlists).read_bytes()
            with patch.object(app, 'FAVORITES_FILE', favorites), patch.object(app, 'PLAYLISTS_FILE', playlists):
                song = app.make_qjjlb_song('netease', self.item, url='qjjlb://netease?id=123')
                song.update({'cover_url': '/api/gd-cover/456', 'pic_id': '456'})
                client = app.app.test_client()
                self.assertEqual(client.post('/api/favorites', json=song).status_code, 200)
                self.assertEqual(client.get('/api/favorites').get_json()['favorites'][0]['cover_url'], '/api/gd-cover/456')
                self.assertEqual(Path(playlists).read_bytes(), before)
                self.assertEqual(client.post('/api/download', json={'url': song['url'], 'song_ref': song['song_ref']}).status_code, 403)

    def test_restricted_audio_stops_followup_requests(self):
        class Response:
            status_code = 403
            headers = {}
            def close(self):
                pass
        class Session:
            def get(self, *args, **kwargs):
                return Response()
        url = 'https://audio.example/restricted.mp3'
        app._gd_stream_urls.add(url)
        self.addCleanup(app._gd_stream_urls.discard, url)
        with patch.object(app, 'get_stream_session', return_value=Session()), patch.object(app.gd_client, 'block') as block:
            response = app.app.test_client().get('/api/proxy-stream', query_string={'url': url})
        self.assertEqual(response.status_code, 502)
        block.assert_called_once()

    def test_cached_audio_cannot_request_upstream_while_paused_or_cooling_down(self):
        from gdstudio import GDStudioClient
        with tempfile.TemporaryDirectory() as directory:
            gd = GDStudioClient(str(Path(directory) / 'state.sqlite'), clock=lambda: 1000)
            url = 'https://audio.example/cached.mp3'
            app._gd_stream_urls.add(url)
            self.addCleanup(app._gd_stream_urls.discard, url)
            with patch.object(app, 'gd_client', gd), patch.object(app, 'get_stream_session') as session:
                gd.block()
                self.assertEqual(app.app.test_client().get('/api/proxy-stream', query_string={'url': url}).status_code, 503)
                gd.resume()
                gd.cooldown('120')
                self.assertEqual(app.app.test_client().get('/api/proxy-stream', query_string={'url': url}).status_code, 503)
                session.assert_not_called()

    def test_limited_audio_honors_retry_after(self):
        class Response:
            status_code = 429
            headers = {'Retry-After': '120'}
            def close(self):
                pass
        class Session:
            def get(self, *args, **kwargs):
                return Response()
        url = 'https://audio.example/limited.mp3'
        app._gd_stream_urls.add(url)
        self.addCleanup(app._gd_stream_urls.discard, url)
        with patch.object(app, 'get_stream_session', return_value=Session()), patch.object(app.gd_client, 'cooldown') as cooldown:
            response = app.app.test_client().get('/api/proxy-stream', query_string={'url': url})
        self.assertEqual(response.status_code, 502)
        cooldown.assert_called_once_with('120')

    def test_audio_captcha_stops_followup_requests(self):
        class Response:
            status_code = 200
            headers = {'Content-Type': 'text/html'}
            def raise_for_status(self):
                pass
            def iter_content(self, chunk_size):
                yield '请完成验证码'.encode('utf-8')
            def close(self):
                pass
        class Session:
            def get(self, *args, **kwargs):
                return Response()
        url = 'https://audio.example/challenge.mp3'
        app._gd_stream_urls.add(url)
        self.addCleanup(app._gd_stream_urls.discard, url)
        with patch.object(app, 'get_stream_session', return_value=Session()), patch.object(app.gd_client, 'block') as block:
            response = app.app.test_client().get('/api/proxy-stream', query_string={'url': url})
        self.assertEqual(response.status_code, 502)
        block.assert_called_once()


if __name__ == '__main__':
    unittest.main()
