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
        app._source_cache.clear()
        app._search_cache.clear()
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

    def test_full_search_page_with_duplicate_recordings_needs_confirmation(self):
        items = [dict(self.item, id=str(index)) for index in range(50)]
        with patch.object(app.gd_client, 'request', return_value=(items, None)):
            result, error = app.resolve_favorite_song_info({'title': '歌', 'artist': '歌手'}, include_lyrics=False)
        self.assertIsNone(result)
        self.assertIn('确认版本', error)

    def test_legacy_qq_is_not_contacted(self):
        with patch.object(app, 'fetch_vkeys_json', side_effect=AssertionError('old source contacted')):
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
        results = []
        with patch.object(app.gd_client, 'request', side_effect=fetch) as mocked:
            first = threading.Thread(target=lambda: results.append(app.search_qjjlb_netease('并发测试', limit=1)))
            second = threading.Thread(target=lambda: results.append(app.search_qjjlb_netease('并发测试', limit=1)))
            first.start()
            self.assertTrue(entered.wait(2))
            second.start()
            time.sleep(.05)
            release.set()
            first.join(5)
            second.join(5)
            self.assertEqual(mocked.call_count, 1)
            self.assertEqual(len(results), 2)
            self.assertTrue(all(item[0][0]['title'] == '歌' for item in results))

    def test_search_cache_evicts_least_recently_used(self):
        with patch.object(app, 'CACHE_LIMIT', 2):
            app.store_search_results('a', [{'id': 'a'}])
            app.store_search_results('b', [{'id': 'b'}])
            self.assertEqual(app.get_cached_search_results('a')[0]['id'], 'a')
            app.store_search_results('c', [{'id': 'c'}])
            self.assertIsNone(app.get_cached_search_results('b'))
            self.assertIsNotNone(app.get_cached_search_results('a'))

    def test_search_timeout_reports_netease_source(self):
        def slow(*args, **kwargs):
            time.sleep(.15)
            return [], None
        with patch.object(app, 'SEARCH_BUDGET', .05), patch.object(app, 'search_qjjlb_netease', side_effect=slow):
            final = list(app.search_snapshots('超时测试'))[-1]
            self.assertEqual(final['results'], [])
            self.assertIn('netease', final['source_errors'])
            time.sleep(.16)

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
