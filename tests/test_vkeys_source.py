import sys
import time
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'code' / 'backend'))
import app


class VkeysSourceTests(unittest.TestCase):
    def setUp(self):
        app._playback_cache.clear()
        app._qq_detail_cache.clear()
        app._lyrics_cache.clear()

    def test_search_keeps_distinct_album_versions_and_platform_types(self):
        item = {'mid': 'one', 'song': '孤岛', 'singer': '赵二', 'album': '孤岛',
                'grp': [{'mid': 'two', 'song': '孤岛', 'singer': '赵二', 'album': '现场'},
                        {'mid': 'one', 'song': '孤岛', 'singer': '赵二', 'type': 113}]}
        with patch.object(app, 'fetch_vkeys_json', return_value=([item], None)):
            songs, error = app.search_qjjlb_qq('孤岛 赵二')
        self.assertIsNone(error)
        self.assertEqual(len(songs), 3)
        self.assertEqual(len({song['id'] for song in songs}), 3)
        self.assertEqual(songs[1]['album'], '现场')
        self.assertTrue(all(song['download_allowed'] is False for song in songs))

    def test_old_qq_ref_uses_standard_audio_and_parses_real_catalog_duration(self):
        payload = {'mid': '001jMegF1zcMgb', 'song': '孤岛', 'singer': '赵二',
                   'url': 'https://audio.test/full.mp3', 'interval': '4分59秒'}
        with patch.object(app, 'fetch_vkeys_json', return_value=(payload, None)) as fetch:
            first, error = app.resolve_qjjlb_song_info('qjjlb://qq?msg=孤岛&mid=001jMegF1zcMgb', False)
            second, _ = app.resolve_qjjlb_song_info('qjjlb://qq?msg=赵二&mid=001jMegF1zcMgb', False)
        self.assertIsNone(error)
        self.assertEqual(first, second)
        self.assertEqual(first['expected_duration'], 299)
        self.assertEqual(fetch.call_count, 1)
        self.assertEqual(fetch.call_args.args[1]['quality'], 7)
        self.assertTrue(app.incomplete_audio(30, first['expected_duration']))
        self.assertFalse(app.incomplete_audio(30, app.source_quality({'interval': '0分30秒'})['expected_duration']))

    def test_refresh_invalidates_address_and_detail_caches(self):
        ref = 'qjjlb://qq?mid=refresh'
        with patch.object(app, 'fetch_vkeys_json', side_effect=[
            ({'url': 'https://audio.test/old.mp3'}, None),
            ({'url': 'https://audio.test/new.mp3'}, None),
        ]):
            client = app.app.test_client()
            self.assertIn('old.mp3', client.get('/api/song-info', query_string={'url': ref, 'playback_only': 1}).json['mp3_url'])
            self.assertIn('new.mp3', client.get('/api/song-info', query_string={'url': ref, 'playback_only': 1, 'refresh': 1}).json['mp3_url'])

    def test_same_id_with_wrong_response_id_is_rejected(self):
        with patch.object(app, 'fetch_vkeys_json', return_value=({'mid': 'other', 'url': 'https://audio.test/wrong.mp3'}, None)):
            info, error = app.resolve_qjjlb_song_info('qjjlb://qq?mid=expected', False)
        self.assertIsNone(info)
        self.assertIn('不匹配', error)
        self.assertIsNone(next(iter(app._playback_cache.values()))['info'])

    def test_same_mid_cannot_return_instrumental_for_normal_song(self):
        with patch.object(app, 'fetch_vkeys_json', return_value=({'mid': 'expected', 'type': 113, 'url': 'https://audio.test/wrong.mp3'}, None)):
            info, error = app.resolve_qjjlb_song_info('qjjlb://qq?mid=expected', False)
        self.assertIsNone(info)
        self.assertIn('版本不匹配', error)

    def test_explicit_trial_quality_is_rejected_even_with_full_catalog_length(self):
        payload = {'url': 'https://audio.test/preview.mp3', 'quality': '试听音质', 'interval': '4分59秒'}
        with patch.object(app, 'fetch_vkeys_json', return_value=(payload, None)):
            info, error = app.resolve_qjjlb_song_info('qjjlb://qq?mid=trial', False)
        self.assertIsNone(info)
        self.assertIn('试听', error)
        self.assertIsNone(next(iter(app._playback_cache.values()))['info'])
        self.assertFalse(app._qq_detail_cache)

    def test_library_capabilities_are_derived_without_rewriting_old_records(self):
        original = {'id': 'old', 'title': 'Song', 'artist': 'Artist', 'song_ref': 'qjjlb://qq?mid=old'}
        with patch.object(app, 'existing_music_file', return_value=None), patch.object(app, 'find_existing_downloaded_song', return_value=None):
            hydrated = app.hydrate_song_entry(original)
        self.assertFalse(hydrated['download_allowed'])
        self.assertNotIn('download_allowed', original)

    def test_new_favorite_keeps_album_and_version_for_future_recovery(self):
        song = {'id': 'new', 'title': 'Song', 'artist': 'Artist', 'album': 'Album', 'version': 'Live版', 'song_ref': 'qjjlb://qq?mid=new'}
        with patch.object(app, 'read_json', return_value=[]), patch.object(app, 'write_json') as save, patch.object(app, 'existing_music_file', return_value=None), patch.object(app, 'find_existing_downloaded_song', return_value=None):
            response = app.app.test_client().post('/api/favorites', json=song)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(save.call_args.args[1][0]['album'], 'Album')
        self.assertEqual(save.call_args.args[1][0]['version'], 'Live版')

    def test_hidden_live_version_and_wrong_resolved_artist_are_rejected(self):
        with patch.object(app, 'search_qjjlb', return_value=[{'title': 'Song', 'artist': 'Artist', 'version': 'Live版'}]):
            self.assertIsNone(app.resolve_favorite_song_info({'title': 'Song', 'artist': 'Artist'}, False)[0])
        candidate = {'title': 'Song', 'artist': 'Artist', 'url': 'qjjlb://qq?mid=other'}
        with patch.object(app, 'search_qjjlb', return_value=[candidate]), patch.object(app, 'get_song_info', return_value=({'title': 'Song', 'artist': 'Cover', 'mp3_url': 'https://audio.test/wrong.mp3'}, None)):
            self.assertIsNone(app.resolve_favorite_song_info({'title': 'Song', 'artist': 'Artist'}, False)[0])

    def test_fallback_skips_rejected_id_wrong_artist_and_wrong_album(self):
        ref = 'qjjlb://qq?mid=original'
        candidates = [
            {'title': 'Song', 'artist': 'Artist', 'album': 'Album', 'url': ref},
            {'title': 'Song', 'artist': 'Cover', 'album': 'Album'},
            {'title': 'Song', 'artist': 'Artist', 'album': 'Live'},
            {'title': 'Song (DJ版)', 'artist': 'Artist', 'album': 'Album'},
        ]
        with patch.object(app, 'search_qjjlb', return_value=candidates), patch.object(app, 'get_song_info') as lookup:
            info, error = app.resolve_favorite_song_info({'title': 'Song', 'artist': 'Artist', 'album': 'Album', 'excluded_ref': ref}, False)
        self.assertIsNone(info)
        self.assertTrue(error)
        lookup.assert_not_called()

    def test_stream_only_source_cannot_download_or_start_whole_audio_analysis(self):
        url = 'https://ws.stream.qqmusic.qq.com/M500x.mp3?guid=api.vkeys.cn'
        self.assertIsNone(app.resolve_download_target(url)[0])
        with patch.object(app, 'get_song_info', return_value=({'mp3_url': url, 'stream_only': True}, None)):
            self.assertIsNone(app.extract_mp3_url('qjjlb://qq?mid=x')[0])
        with patch.object(app.audio_analysis, 'query') as query:
            response = app.app.test_client().post('/api/audio-analysis', json={'audio_url': '/api/proxy-stream?' + app.urllib.parse.urlencode({'url': url})})
        self.assertEqual(response.json['status'], 'unavailable')
        query.assert_not_called()

    def test_fallback_shares_remaining_request_budget(self):
        def lookup(fav, include_lyrics):
            self.assertFalse(include_lyrics)
            self.assertLessEqual(app._request_context.deadline - time.monotonic(), 10)
            self.assertEqual(fav['excluded_ref'], 'qjjlb://qq?mid=old')
            return {'mp3_url': 'https://audio.test/full.mp3'}, None
        with patch.object(app, 'resolve_favorite_song_info', side_effect=lookup):
            response = app.app.test_client().get('/api/song-info', query_string={
                'url': 'qjjlb://qq?mid=old', 'title': 'Song', 'artist': 'Artist',
                'playback_only': 1, 'fallback_only': 1})
        self.assertEqual(response.status_code, 200)

    def test_duplicate_recordings_merge_but_keep_same_source_backups(self):
        item = {'mid': 'one', 'song': '孤岛', 'singer': '赵二', 'album': '孤岛', 'grp': [
            {'mid': 'two', 'song': '孤岛', 'singer': '赵二', 'album': '精选集', 'subtitle': '某电视剧片尾曲'},
            {'mid': 'three', 'song': '孤岛', 'singer': '赵二', 'subtitle': 'Live版'},
            {'mid': 'four', 'song': '孤岛', 'singer': '其他歌手'},
            {'mid': 'trial', 'song': '孤岛', 'singer': '赵二', 'is_preview': True},
        ]}
        with patch.object(app, 'fetch_vkeys_json', return_value=([item, item], None)) as fetch:
            songs, error = app.search_qjjlb_qq('孤岛 赵二')
        self.assertIsNone(error)
        self.assertEqual(len(songs), 3)
        self.assertEqual(songs[0]['alternate_versions'][0]['song_ref'], 'qjjlb://qq?mid=two&song_type=0')
        self.assertEqual(fetch.call_count, 1)

    def test_merged_backup_is_used_only_after_primary_fails(self):
        main = {'title': 'Song', 'artist': 'Artist', 'song_ref': 'qjjlb://qq?mid=primary'}
        backup = {'title': 'Song', 'artist': 'Artist', 'song_ref': 'qjjlb://qq?mid=backup'}
        main['alternate_versions'] = [backup]
        with patch.object(app, 'search_qjjlb', return_value=[main]), \
             patch.object(app, 'get_song_info', return_value=({'title': 'Song', 'artist': 'Artist', 'mp3_url': 'https://audio.test/full.mp3'}, None)) as lookup:
            info, error = app.resolve_favorite_song_info({'title': 'Song', 'artist': 'Artist', 'excluded_ref': main['song_ref']}, False)
        self.assertIsNone(error)
        self.assertEqual(info['song_ref'], backup['song_ref'])
        lookup.assert_called_once_with(backup['song_ref'], include_lyrics=False)

    def test_old_platform_favorites_and_playlists_resolve_only_through_luoyue(self):
        for provider in ('kuwo', 'netease'):
            app._search_cache.clear()
            app._source_cache.clear()
            app._playback_cache.clear()
            app._qq_detail_cache.clear()
            old = {'id': 'old', 'title': 'Song', 'artist': 'Artist', 'type': provider, 'songid': '123'}
            with patch.object(app, 'existing_music_file', return_value=None), \
                 patch.object(app, 'find_existing_downloaded_song', return_value=None), \
                 patch.object(app, 'fetch_vkeys_json', side_effect=[
                     ([{'mid': 'new', 'song': 'Song', 'singer': 'Artist'}], None),
                     ({'mid': 'new', 'song': 'Song', 'singer': 'Artist', 'url': 'https://audio.test/full.mp3'}, None),
                 ]) as luoyue, patch.object(app, 'fetch_musicbox_json') as netease, \
                 patch.object(app, 'fetch_qjjlb_json') as kuwo:
                hydrated = app.hydrate_song_entry(old)
                response = app.app.test_client().get('/api/song-info', query_string={
                    'url': hydrated['song_ref'], 'title': old['title'], 'artist': old['artist'], 'playback_only': 1})
            self.assertEqual(response.status_code, 200)
            self.assertTrue(response.json['stream_only'])
            self.assertEqual(luoyue.call_count, 2)
            self.assertFalse(hydrated['download_allowed'])
            self.assertNotIn('song_ref', old)
            netease.assert_not_called()
            kuwo.assert_not_called()


    def test_legacy_match_tries_merged_full_version_after_preview(self):
        main = {'title': 'Song', 'artist': 'Artist', 'song_ref': 'qjjlb://qq?mid=preview'}
        main['alternate_versions'] = [{'title': 'Song', 'artist': 'Artist', 'song_ref': 'qjjlb://qq?mid=full'}]
        with patch.object(app, 'search_qjjlb', return_value=[main]), \
             patch.object(app, 'get_song_info', side_effect=[
                 (None, '此音源为试听片段'),
                 ({'title': 'Song', 'artist': 'Artist', 'mp3_url': 'https://audio.test/full.mp3'}, None),
             ]) as lookup:
            info, error = app.resolve_favorite_song_info({'title': 'Song', 'artist': 'Artist'}, False)
        self.assertIsNone(error)
        self.assertEqual(info['song_ref'], 'qjjlb://qq?mid=full')
        self.assertEqual(lookup.call_count, 2)
