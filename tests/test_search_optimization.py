import sys
import time
import threading
import unittest
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'code' / 'backend'))
import app


class SearchOptimizationTests(unittest.TestCase):
    def setUp(self):
        for cache in (app._search_cache, app._source_cache, app._playback_cache,
                      app._qq_detail_cache, app._upstream_cooldowns):
            cache.clear()

    def test_search_never_dispatches_retired_sources(self):
        with patch.object(app, 'search_qjjlb_qq', return_value=([{'id': 'one'}], None)) as qq, \
             patch.object(app, 'search_qjjlb_kuwo') as kuwo, \
             patch.object(app, 'search_qjjlb_netease') as netease:
            final = list(app.search_snapshots('single', source_names=['qq', 'kuwo', 'netease']))[-1]
        self.assertTrue(final['done'])
        self.assertEqual(final['results'], [{'id': 'one'}])
        self.assertEqual(qq.call_count, 1)
        kuwo.assert_not_called()
        netease.assert_not_called()

    def test_source_deadline_reports_failure_without_other_source_requests(self):
        def slow(*args):
            time.sleep(.15)
            return [], None
        with patch.object(app, 'SEARCH_BUDGET', .05), \
             patch.object(app, 'search_qjjlb_qq', side_effect=slow):
            started = time.monotonic()
            final = list(app.search_snapshots('deadline'))[-1]
            self.assertLess(time.monotonic() - started, .12)
            self.assertEqual(final['results'], [])
            self.assertIn('qq', final['source_errors'])
            time.sleep(.16)

    def test_two_searches_coalesce_and_then_hit_cache(self):
        entered = threading.Event()
        def fetch(*args):
            entered.set()
            time.sleep(.06)
            return [{'id': 'one'}], None
        with patch.object(app, 'search_qjjlb_qq', side_effect=fetch) as mocked:
            with ThreadPoolExecutor(max_workers=2) as callers:
                a = callers.submit(app.search_qjjlb, 'same', source_names=['qq'])
                entered.wait(1)
                b = callers.submit(app.search_qjjlb, 'same', source_names=['qq'])
                self.assertEqual(a.result(), b.result())
            self.assertEqual(app.search_qjjlb('same', source_names=['qq']), [{'id': 'one'}])
            self.assertEqual(mocked.call_count, 1)

    def test_explicit_preview_filtered_but_legitimate_short_piece_kept(self):
        songs = [{'id': 'preview', 'is_preview': True}, {'id': 'short', 'expected_duration': 30}]
        with patch.object(app, 'search_qjjlb_qq', return_value=(songs, None)):
            self.assertEqual(app.search_qjjlb('quality', source_names=['qq']), [songs[1]])
        self.assertFalse(app.incomplete_audio(30, 30))
        self.assertFalse(app.incomplete_audio(30, None))
        self.assertTrue(app.incomplete_audio(30, 200))
        self.assertTrue(app.incomplete_audio(None, is_preview=True))
        self.assertEqual(app.source_quality({'dt': 200000})['expected_duration'], 200)

    def test_403_never_retries_and_sets_cooldown(self):
        class Response:
            status_code = 403
            headers = {}
            def close(self):
                pass
        class Session:
            calls = 0
            def get(self, *args, **kwargs):
                self.calls += 1
                return Response()
        session = Session()
        for _ in range(2):
            data, error = app.fetch_upstream('https://rejected.test/song', {}, session, 'test')
            self.assertIsNone(data)
            self.assertTrue(error)
        self.assertEqual(session.calls, 1)

    def test_read_timeout_does_not_double_wait(self):
        class Session:
            calls = 0
            def get(self, *args, **kwargs):
                self.calls += 1
                raise requests.ReadTimeout('slow')
        session = Session()
        _, error = app.fetch_upstream('https://slow.test/song', {}, session, 'test')
        self.assertIn('读取超时', error)
        self.assertEqual(session.calls, 1)

    def test_retry_after_is_respected_and_cache_counts_are_bounded(self):
        class Response:
            status_code = 429
            headers = {'Retry-After': '120'}
            def close(self):
                pass
        class Session:
            def get(self, *args, **kwargs):
                return Response()
        now = time.monotonic()
        app.fetch_upstream('https://limited.test/song', {}, Session(), 'test')
        self.assertGreaterEqual(app._upstream_cooldowns['limited.test'], now + 120)
        with patch.object(app, 'CACHE_LIMIT', 2), \
             patch.object(app, 'search_qjjlb_qq', return_value=([{'id': 'song'}], None)):
            for keyword in ('one', 'two', 'three'):
                app.search_qjjlb(keyword, source_names=['qq'])
            self.assertLessEqual(len(app._search_cache), 2)
            self.assertLessEqual(len(app._source_cache), 2)

    def test_preview_cannot_be_extracted_for_download(self):
        with patch.object(app, 'get_song_info', return_value=({'mp3_url': 'https://audio.test/clip.mp3', 'is_preview': True}, None)):
            url, error = app.extract_mp3_url('qjjlb://qq?mid=preview')
            self.assertIsNone(url)
            self.assertIn('试听', error)

    def test_playback_coalesces_by_provider_id_not_search_keyword(self):
        def resolve(*args, **kwargs):
            time.sleep(.05)
            return {'mp3_url': 'https://audio.test/song.mp3'}, None
        with patch.object(app, 'resolve_qjjlb_song_info_uncached', side_effect=resolve) as mocked:
            with ThreadPoolExecutor(max_workers=2) as callers:
                futures = [callers.submit(app.resolve_qjjlb_song_info, ref, False)
                           for ref in ('qjjlb://qq?msg=a&mid=123', 'qjjlb://qq?msg=b&mid=123')]
                self.assertEqual(futures[0].result(), futures[1].result())
            self.assertEqual(mocked.call_count, 1)

    def test_playback_fallback_never_waits_for_lyrics(self):
        candidate = {'title': 'Song', 'artist': 'Artist', 'url': 'qjjlb://qq?mid=123'}
        def details(url, include_lyrics=True):
            if url.startswith('qjjlb:'):
                self.assertFalse(include_lyrics)
                return {'title': 'Song', 'artist': 'Artist', 'mp3_url': 'https://audio.test/song.mp3'}, None
            return None, 'old url'
        with patch.object(app, 'get_song_info', side_effect=details), \
             patch.object(app, 'search_qjjlb', return_value=[candidate]), \
             patch.object(app, 'resolve_song_lyrics', side_effect=AssertionError('lyrics must stay independent')):
            response = app.app.test_client().get('/api/song-info', query_string={
                'url': 'https://legacy.test/song', 'title': 'Song', 'artist': 'Artist', 'playback_only': 1})
            self.assertEqual(response.status_code, 200)

    def test_fallback_rejects_same_title_wrong_artist_and_wrong_version(self):
        for candidate in ({'title': 'Song', 'artist': 'Cover Singer'},
                          {'title': 'Song (Live)', 'artist': 'Artist'}):
            with patch.object(app, 'search_qjjlb', return_value=[candidate]):
                info, error = app.resolve_favorite_song_info({'title': 'Song', 'artist': 'Artist'}, False)
                self.assertIsNone(info)
                self.assertTrue(error)

    def test_fallback_accepts_original_duet_with_partial_saved_credits(self):
        candidate = {'title': '如果的事', 'artist': '范玮琪/张韶涵', 'url': 'qjjlb://netease?id=229271'}
        info = {**candidate, 'mp3_url': 'https://audio.test/full.mp3'}
        with patch.object(app, 'search_qjjlb', return_value=[candidate]), \
             patch.object(app, 'get_song_info', return_value=(info, None)) as resolve:
            result, error = app.resolve_favorite_song_info({'title': '如果的事', 'artist': '范玮琪'}, False)
            self.assertIsNone(error)
            self.assertEqual(result['mp3_url'], info['mp3_url'])
            self.assertEqual(result['song_ref'], candidate['url'])
            resolve.assert_called_once_with(candidate['url'], include_lyrics=False)
        self.assertTrue(app.matching_artist_credits('张韶涵 / 范玮琪', '范玮琪/张韶涵'))
        self.assertFalse(app.matching_artist_credits('范玮琪翻唱 / 其他歌手', '范玮琪'))
        self.assertFalse(app.matching_artist_credits('范玮琪', '范玮琪/张韶涵'))
        self.assertFalse(app.matching_artist_credits('Artist', '未知歌手'))

    def test_failed_original_is_not_resolved_twice_and_source_error_stays_readable(self):
        with patch.object(app, 'get_song_info', return_value=(None, 'original timeout')) as original, \
             patch.object(app, 'search_qjjlb', return_value=({'error': '来源暂时不可用'}, 502)):
            response = app.app.test_client().get('/api/song-info', query_string={
                'url': 'qjjlb://qq?mid=failed', 'title': 'Song', 'artist': 'Artist', 'playback_only': 1})
            self.assertEqual(original.call_count, 1)
            self.assertEqual(response.status_code, 502)
            self.assertEqual(response.get_json()['error'], '来源暂时不可用')

    def test_stream_endpoint_returns_only_luoyue_and_finishes(self):
        with patch.object(app, 'search_qjjlb_qq', return_value=([{'id': 'good'}], None)), \
             patch.object(app, 'search_qjjlb_kuwo') as kuwo, \
             patch.object(app, 'search_qjjlb_netease') as netease, \
             patch.object(app, 'decorate_search_results', side_effect=lambda songs: songs):
            response = app.app.test_client().get('/api/search?q=stream-test&stream=1')
            import json
            snapshots = [json.loads(line) for line in response.data.splitlines()]
            self.assertTrue(snapshots[-1]['done'])
            self.assertEqual(snapshots[-1]['results'], [{'id': 'good'}])
            self.assertEqual(snapshots[-1]['source_errors'], {})
            kuwo.assert_not_called()
            netease.assert_not_called()


if __name__ == '__main__':
    unittest.main()
