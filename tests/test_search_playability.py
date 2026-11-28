import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'code' / 'backend'))
import app


class SearchPlayabilityTests(unittest.TestCase):
    def setUp(self):
        for cache in (app._playback_cache, app._lyrics_cache, app._gd_page_cache):
            cache.clear()

    def test_catalog_result_appears_without_playback_precheck(self):
        item = {'id': 'trial', 'name': 'Song', 'artist': ['Artist'], 'source': 'netease'}
        with patch.object(app.gd_client, 'request', return_value=([item], None)) as fetch:
            result = app.search_qjjlb('trial-query')
        self.assertEqual(result[0]['title'], 'Song')
        self.assertEqual(fetch.call_count, 1)
        self.assertEqual(fetch.call_args.args[0], 'search')

    def test_temporary_playback_failure_is_not_cached(self):
        ref = 'qjjlb://netease?id=recover'
        with patch.object(app.gd_client, 'request', side_effect=[(None, '读取超时'), ({'url': 'https://audio.test/full.mp3'}, None)]) as fetch:
            first, error = app.resolve_qjjlb_song_info(ref, False)
            self.assertIsNone(first)
            self.assertIn('超时', error)
            second, error = app.resolve_qjjlb_song_info(ref, False)
        self.assertIsNone(error)
        self.assertEqual(second['mp3_url'], 'https://audio.test/full.mp3')
        self.assertEqual(fetch.call_count, 2)

    def test_empty_address_is_not_saved_and_can_be_retried(self):
        ref = 'qjjlb://netease?id=empty'
        with patch.object(app.gd_client, 'request', side_effect=[({'url': ''}, None), ({'url': 'https://audio.test/full.mp3'}, None)]) as fetch:
            first, error = app.resolve_qjjlb_song_info(ref, False)
            self.assertIsNone(first)
            self.assertIn('未提供', error)
            second, error = app.resolve_qjjlb_song_info(ref, False)
        self.assertIsNone(error)
        self.assertTrue(second['mp3_url'])
        self.assertEqual(fetch.call_count, 2)

    def test_playback_uses_cached_url_for_same_recording(self):
        ref = 'qjjlb://netease?id=warm'
        with patch.object(app.gd_client, 'request', return_value=({'url': 'https://audio.test/full.mp3'}, None)) as fetch:
            self.assertIsNone(app.resolve_qjjlb_song_info(ref, False)[1])
            self.assertIsNone(app.resolve_qjjlb_song_info(ref, False)[1])
        self.assertEqual(fetch.call_count, 1)

    def test_legacy_match_rejects_live_recording(self):
        candidate = {'title': 'Song', 'artist': 'Artist', 'album': 'Live', 'url': 'qjjlb://netease?id=live'}
        with patch.object(app, 'search_qjjlb', return_value=[candidate]), patch.object(app, 'get_song_info') as resolve:
            result, error = app.resolve_favorite_song_info({'title': 'Song', 'artist': 'Artist'}, False)
        self.assertIsNone(result)
        self.assertIsNotNone(error)
        resolve.assert_not_called()


if __name__ == '__main__':
    unittest.main()
