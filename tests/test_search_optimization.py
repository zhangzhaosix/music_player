import sys
import time
import unittest
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'code' / 'backend'))
import app


class SearchOptimizationTests(unittest.TestCase):
    def setUp(self):
        for cache in (app._gd_page_cache, app._playback_cache):
            cache.clear()

    def test_explicit_preview_filtered_but_legitimate_short_piece_kept(self):
        songs = [{'id': 'preview', 'is_preview': True}, {'id': 'short', 'expected_duration': 30}]
        with patch.object(app, 'search_qjjlb_netease', return_value=(songs, None)):
            self.assertEqual(app.search_qjjlb('quality'), [songs[1]])
        self.assertFalse(app.incomplete_audio(30, 30))
        self.assertFalse(app.incomplete_audio(30, None))
        self.assertTrue(app.incomplete_audio(30, 200))
        self.assertTrue(app.incomplete_audio(None, is_preview=True))
        self.assertEqual(app.source_quality({'dt': 200000})['expected_duration'], 200)

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

    def test_fallback_rejects_duet_with_partial_saved_credits(self):
        candidate = {'title': '如果的事', 'artist': '范玮琪/张韶涵', 'url': 'qjjlb://netease?id=229271'}
        info = {**candidate, 'mp3_url': 'https://audio.test/full.mp3'}
        with patch.object(app, 'search_qjjlb', return_value=[candidate]), \
             patch.object(app, 'get_song_info', return_value=(info, None)) as resolve:
            result, error = app.resolve_favorite_song_info({'title': '如果的事', 'artist': '范玮琪'}, False)
            self.assertIsNone(result)
            self.assertIsNotNone(error)
            resolve.assert_not_called()
        self.assertTrue(app.matching_artist_credits('张韶涵 / 范玮琪', '范玮琪/张韶涵'))
        self.assertFalse(app.matching_artist_credits('范玮琪翻唱 / 其他歌手', '范玮琪'))
        self.assertFalse(app.matching_artist_credits('范玮琪', '范玮琪/张韶涵'))
        self.assertFalse(app.matching_artist_credits('Artist', '未知歌手'))

    def test_failed_original_is_not_resolved_twice_and_source_error_stays_readable(self):
        with patch.object(app, 'get_song_info', return_value=(None, 'original timeout')) as original, \
             patch.object(app, 'search_qjjlb', return_value=({'error': '来源暂时不可用'}, 502)):
            response = app.app.test_client().get('/api/song-info', query_string={
                'url': 'qjjlb://qq?mid=failed', 'title': 'Song', 'artist': 'Artist', 'playback_only': 1})
            self.assertEqual(original.call_count, 0)
            self.assertEqual(response.status_code, 502)
            self.assertEqual(response.get_json()['error'], '来源暂时不可用')

    def test_stream_keeps_local_results_when_netease_fails(self):
        import json

        local = [{'id': 'local'}]
        with patch.object(app, 'search_local_songs', return_value=local), \
             patch.object(app.gd_client, 'request', return_value=(None, 'GD failure')) as upstream, \
             patch.object(app, 'decorate_search_results', side_effect=lambda songs: songs):
            response = app.app.test_client().get('/api/search?q=stream-test&stream=1')
            snapshots = [json.loads(line) for line in response.data.splitlines()]
        self.assertEqual(snapshots, [
            {'results': local, 'done': False, 'source_errors': {}, 'has_more': False},
            {'results': local, 'done': True, 'source_errors': {'netease': 'GD failure'}, 'has_more': False},
        ])
        self.assertEqual([call.args[0] for call in upstream.call_args_list], ['search'])


if __name__ == '__main__':
    unittest.main()
