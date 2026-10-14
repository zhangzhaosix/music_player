import sys
import time
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'code' / 'backend'))
import app


class SearchPlayabilityTests(unittest.TestCase):
    def setUp(self):
        probe = patch.object(app, 'probe_playable_audio', return_value=None)
        probe.start()
        self.addCleanup(probe.stop)
        for cache in (app._playback_cache, app._qq_detail_cache, app._search_cache,
                      app._source_cache, app._lyrics_cache):
            cache.clear()

    def song(self, mid, **extra):
        ref = app.build_qjjlb_ref('qq', mid=mid)
        return {'id': mid, 'title': 'Song', 'artist': 'Artist', 'url': ref,
                'song_ref': ref, **extra}

    def test_catalog_full_length_with_trial_address_is_hidden_before_first_snapshot(self):
        song = self.song('trial')
        with patch.object(app, 'search_qjjlb_qq', return_value=([song], None)), \
             patch.object(app, 'fetch_vkeys_json', return_value=({'mid': 'trial', 'song': 'Song',
                 'singer': 'Artist', 'url': 'https://audio.test/trial.mp3',
                 'interval': '4分49秒', 'quality': '音乐试听'}, None)) as fetch:
            snapshots = list(app.search_snapshots('trial-query'))
            self.assertTrue(all(not snapshot['results'] for snapshot in snapshots))
            self.assertEqual(snapshots[-1]['source_errors'], {})
            self.assertEqual(app.search_qjjlb('trial-query'), [])
            self.assertEqual(fetch.call_count, 1)

    def test_same_recording_backup_repairs_search_without_duplicate_rows(self):
        song = self.song('trial', alternate_versions=[self.song('full')])
        with patch.object(app, 'fetch_vkeys_json', side_effect=[
            ({'quality': '音乐试听', 'url': 'https://audio.test/trial.mp3'}, None),
            ({'mid': 'full', 'song': 'Song', 'singer': 'Artist', 'url': 'https://audio.test/full.mp3'}, None),
        ]):
            result, error = app.validate_search_song(song, time.monotonic() + 1)
        self.assertIsNone(error)
        self.assertEqual(result['id'], 'trial')
        self.assertEqual(result['song_ref'], 'qjjlb://qq?mid=full')

    def test_temporary_failure_is_not_negative_cached_and_can_recover(self):
        song = self.song('recover')
        with patch.object(app, 'fetch_vkeys_json', side_effect=[
            (None, '落月读取超时，请重试'),
            ({'song': 'Song', 'singer': 'Artist', 'url': 'https://audio.test/full.mp3'}, None),
        ]):
            result, error = app.validate_search_song(song, time.monotonic() + 1)
            self.assertIsNone(result)
            self.assertIn('超时', error)
            self.assertFalse(app._playback_cache)
            result, error = app.validate_search_song(song, time.monotonic() + 1)
        self.assertIsNone(error)
        self.assertIsNotNone(result)

    def test_empty_address_is_rejected_and_rechecked_after_cache_expiry(self):
        song = self.song('empty')
        with patch.object(app, 'fetch_vkeys_json', side_effect=[
            ({'song': 'Song', 'singer': 'Artist', 'url': ''}, None),
            ({'song': 'Song', 'singer': 'Artist', 'url': 'https://audio.test/full.mp3'}, None),
        ]) as fetch:
            self.assertIsNone(app.validate_search_song(song, time.monotonic() + 1)[0])
            self.assertIsNone(app.validate_search_song(song, time.monotonic() + 1)[0])
            self.assertEqual(fetch.call_count, 1)
            app._playback_cache['qjjlb:qq:empty']['ts'] -= 301
            self.assertIsNotNone(app.validate_search_song(song, time.monotonic() + 1)[0])
        self.assertEqual(fetch.call_count, 2)

    def test_wrong_singer_rejected_but_legitimate_short_song_kept(self):
        with patch.object(app, 'fetch_vkeys_json', side_effect=[
            ({'song': 'Song', 'singer': 'Cover', 'url': 'https://audio.test/wrong.mp3'}, None),
            ({'song': 'Song', 'singer': 'Artist', 'url': 'https://audio.test/short.mp3', 'interval': '0分30秒'}, None),
        ]):
            self.assertIsNone(app.validate_search_song(self.song('wrong'), time.monotonic() + 1)[0])
            short, error = app.validate_search_song(self.song('short'), time.monotonic() + 1)
        self.assertIsNone(error)
        self.assertEqual(short['expected_duration'], 30)

    def test_verified_playback_reuses_resolution_without_fetching_again(self):
        song = self.song('warm')
        with patch.object(app, 'fetch_vkeys_json', return_value=({'song': 'Song', 'singer': 'Artist',
            'url': 'https://audio.test/full.mp3'}, None)) as fetch:
            validated, _ = app.validate_search_song(song, time.monotonic() + 1)
            response = app.app.test_client().get('/api/song-info', query_string={
                'url': validated['song_ref'], 'playback_only': 1})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(fetch.call_count, 1)

    def test_api_temporary_failure_never_tells_frontend_to_hide_song(self):
        with patch.object(app, 'get_song_info', return_value=(None, '读取超时')), \
             patch.object(app, 'resolve_favorite_song_info', return_value=(None, '落月暂无可确认同歌手、同版本的可播完整版')), \
             patch.object(app, 'find_existing_downloaded_song', return_value=None):
            response = app.app.test_client().get('/api/song-info', query_string={
                'url': 'qjjlb://qq?mid=temporary', 'title': 'Song', 'artist': 'Artist', 'playback_only': 1})
        self.assertEqual(response.json['error_code'], 'source_temporary')

    def test_verified_results_appear_before_slow_check_finishes(self):
        def verify(song, deadline):
            if song['id'] == 'slow':
                time.sleep(.15)
            return song, None
        with patch.object(app, 'search_qjjlb_qq', return_value=([self.song('fast'), self.song('slow')], None)), \
             patch.object(app, 'validate_search_song', side_effect=verify):
            snapshots = app.search_snapshots('progressive-validation')
            started = time.monotonic()
            first = next(snapshot for snapshot in snapshots if snapshot['results'])
            self.assertLess(time.monotonic() - started, .1)
            self.assertEqual(first['results'][0]['id'], 'fast')
            self.assertFalse(first['done'])
            self.assertEqual(len(list(snapshots)[-1]['results']), 2)

    def test_hidden_live_response_is_not_published_as_original_recording(self):
        with patch.object(app, 'fetch_vkeys_json', return_value=({'mid': 'wrong-version', 'song': 'Song',
                'singer': 'Artist', 'subtitle': 'Live版', 'url': 'https://audio.test/live.mp3'}, None)):
            song, error = app.validate_search_song(self.song('wrong-version'), time.monotonic() + 1)
        self.assertIsNone(song)
        self.assertIsNone(error)


class AudioProbeTests(unittest.TestCase):
    def setUp(self):
        app._upstream_cooldowns.clear()

    class Response:
        def __init__(self, body=b'ID3', mime='audio/mpeg', status=206, length='1024'):
            self.body, self.status_code = body, status
            self.headers = {'Content-Type': mime, 'Content-Length': length}
            self.reads = 0
            self.closed = False
        def __enter__(self):
            return self
        def __exit__(self, *args):
            self.closed = True
        def raise_for_status(self):
            if self.status_code >= 400:
                raise app.requests.HTTPError('failed')
        def iter_content(self, size):
            self.reads += 1
            yield self.body
            raise AssertionError('probe must not read the whole track')

    def test_valid_audio_reads_only_one_small_range_and_closes_connection(self):
        from unittest.mock import Mock
        response = self.Response()
        session = Mock()
        session.get.return_value = response
        with patch.object(app, 'get_stream_session', return_value=session):
            error = app.probe_playable_audio('https://audio.test/song.mp3', time.monotonic() + 1)
        self.assertIsNone(error)
        self.assertEqual(session.get.call_args.kwargs['headers']['Range'], 'bytes=0-1023')
        self.assertEqual(response.reads, 1)
        self.assertTrue(response.closed)

    def test_empty_file_and_disguised_error_page_are_not_playable(self):
        from unittest.mock import Mock
        for response in (self.Response(length='0'), self.Response(body=b'<html>Error</html>', mime='application/octet-stream')):
            session = Mock()
            session.get.return_value = response
            with patch.object(app, 'get_stream_session', return_value=session):
                error = app.probe_playable_audio('https://audio.test/song.mp3', time.monotonic() + 1)
            self.assertTrue(app.is_unavailable_source_error(error))
            self.assertTrue(response.closed)

    def test_rate_limit_is_temporary_and_retry_after_prevents_another_request(self):
        from unittest.mock import Mock
        response = self.Response(status=429)
        response.headers['Retry-After'] = '120'
        session = Mock()
        session.get.return_value = response
        with patch.object(app, 'get_stream_session', return_value=session):
            for _ in range(2):
                error = app.probe_playable_audio('https://limited-audio.test/song.mp3', time.monotonic() + 1)
                self.assertFalse(app.is_unavailable_source_error(error))
        self.assertEqual(session.get.call_count, 1)
        self.assertGreater(app._upstream_cooldowns['limited-audio.test'], time.monotonic() + 119)


if __name__ == '__main__':
    unittest.main()
