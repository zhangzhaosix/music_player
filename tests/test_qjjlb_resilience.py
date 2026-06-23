import json
import os
import unittest
import tempfile
from unittest.mock import mock_open, patch

import requests

import app


class FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


class QjjlbResilienceTests(unittest.TestCase):
    def setUp(self):
        app._search_cache.clear()

    def test_fetch_musicbox_json_returns_friendly_message_when_connection_is_denied(self):
        class FakeSession:
            def get(self, url, params=None, timeout=None):
                raise requests.ConnectionError(
                    'HTTPSConnectionPool(host="blocked.example", port=443): '
                    'Max retries exceeded with url: / '
                    '(Caused by NewConnectionError('
                    '"HTTPSConnection(host=\\"blocked.example\\", port=443): '
                    'Failed to establish a new connection: '
                    '[WinError 10013] access denied"))'
                )

        with patch.object(app, 'get_musicbox_session', return_value=FakeSession()):
            data, err = app.fetch_musicbox_json('https://blocked.example/api')

        self.assertIsNone(data)
        self.assertEqual(err, 'musicBox 暂时不可用，请检查本机网络权限或代理设置后重试')

    def test_fetch_qjjlb_json_retries_once_after_connection_error(self):
        calls = {'count': 0}

        class FakeSession:
            def get(self, url, params=None, timeout=None):
                calls['count'] += 1
                if calls['count'] == 1:
                    raise requests.ConnectionError('Connection aborted.')
                return FakeResponse({'code': 200, 'data': []})

        with patch.object(app, 'get_qjjlb_session', return_value=FakeSession()):
            data, err = app.fetch_qjjlb_json('https://example.test/api')

        self.assertIsNone(err)
        self.assertEqual(data, {'code': 200, 'data': []})
        self.assertEqual(calls['count'], 2)

    def test_search_qjjlb_skips_failed_sources_and_returns_later_results(self):
        with patch.object(app, 'search_qjjlb_qq', return_value=(None, 'qq source failed')), \
             patch.object(app, 'search_qjjlb_kuwo', return_value=([{'id': 'kuwo-1'}], None)), \
             patch.object(app, 'search_qjjlb_netease', return_value=([], None)):
            results = app.search_qjjlb('起风了', limit=10, source_names=['qq', 'kuwo', 'netease'])

        self.assertIsInstance(results, list)
        self.assertEqual(results, [{'id': 'kuwo-1'}])

    def test_search_qjjlb_uses_selected_sources_only(self):
        with patch.object(app, 'search_qjjlb_qq', return_value=([{'id': 'qq-1'}], None)) as qq, \
             patch.object(app, 'search_qjjlb_kuwo', return_value=([{'id': 'kuwo-1'}], None)) as kuwo, \
             patch.object(app, 'search_qjjlb_netease', return_value=([{'id': 'netease-1'}], None)) as netease:
            results = app.search_qjjlb('test', limit=60, source_names=['qq'], source_limit=20)

        self.assertEqual(results, [{'id': 'qq-1'}])
        qq.assert_called_once_with('test', 20)
        kuwo.assert_not_called()
        netease.assert_not_called()

    def test_search_qjjlb_cache_includes_selected_sources(self):
        with patch.object(app, 'search_qjjlb_qq', return_value=([{'id': 'qq-1'}], None)), \
             patch.object(app, 'search_qjjlb_kuwo', return_value=([{'id': 'kuwo-1'}], None)), \
             patch.object(app, 'search_qjjlb_netease', return_value=([], None)):
            qq_results = app.search_qjjlb('same-keyword', source_names=['qq'], source_limit=20)
            kuwo_results = app.search_qjjlb('same-keyword', source_names=['kuwo'], source_limit=20)

        self.assertEqual(qq_results, [{'id': 'qq-1'}])
        self.assertEqual(kuwo_results, [{'id': 'kuwo-1'}])

    def test_search_qjjlb_defaults_to_qq_only(self):
        with patch.object(app, 'search_qjjlb_qq', return_value=([{'id': 'qq-1'}], None)) as qq, \
             patch.object(app, 'search_qjjlb_kuwo', return_value=([{'id': 'kuwo-1'}], None)) as kuwo, \
             patch.object(app, 'search_qjjlb_netease', return_value=([{'id': 'netease-1'}], None)) as netease:
            results = app.search_qjjlb('test-default-source', limit=1)

        self.assertEqual(results, [{'id': 'qq-1'}])
        qq.assert_called_once_with('test-default-source', 20)
        kuwo.assert_not_called()
        netease.assert_not_called()

    def test_api_search_uses_qq_only(self):
        client = app.app.test_client()

        with patch.object(app, 'search_qjjlb_qq', return_value=([{'id': 'qq-1'}], None)) as qq, \
             patch.object(app, 'search_qjjlb_kuwo', return_value=([{'id': 'kuwo-1'}], None)) as kuwo, \
             patch.object(app, 'search_qjjlb_netease', return_value=([{'id': 'netease-1'}], None)) as netease, \
             patch.object(app, 'get_local_music', return_value=[]), \
             patch.object(app, 'get_favorites_map', return_value={}):
            resp = client.get('/api/search', query_string={'q': 'test-api-search', 'source_limit': '20'})

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.get_json()['results'], [{'id': 'qq-1', 'downloaded': False, 'favorited': False}])
        qq.assert_called_once_with('test-api-search', 20)
        kuwo.assert_not_called()
        netease.assert_not_called()

    def test_api_search_returns_friendly_error_without_502_status(self):
        client = app.app.test_client()

        with patch.object(
            app,
            'search_qjjlb',
            return_value=({'error': 'musicBox 暂时不可用，请检查本机网络权限或代理设置后重试'}, 502),
        ):
            resp = client.get('/api/search', query_string={'q': 'blocked-search', 'source_limit': '20'})

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            resp.get_json(),
            {'error': 'musicBox 暂时不可用，请检查本机网络权限或代理设置后重试'},
        )

    def test_api_download_falls_back_to_source_url(self):
        client = app.app.test_client()

        class DownloadResponse:
            def raise_for_status(self):
                return None

            def iter_content(self, chunk_size=8192):
                yield b'fake-mp3-bytes'

        def fake_extract_mp3_url(song_url):
            if song_url == 'https://legacy.example.test/song.html':
                return None, '该歌曲链接已不再支持，请重新搜索'
            if song_url == 'qjjlb://netease?id=1394167216':
                return 'https://audio.example.test/song.mp3', None
            self.fail(f'unexpected song url: {song_url}')

        def fake_requests_get(url, headers=None, stream=None, timeout=None):
            self.assertEqual(url, 'https://audio.example.test/song.mp3')
            self.assertTrue(stream)
            self.assertEqual(timeout, 60)
            return DownloadResponse()

        with patch.object(app, 'extract_mp3_url', side_effect=fake_extract_mp3_url), \
             patch.object(app.requests, 'get', side_effect=fake_requests_get), \
             patch.object(app.os, 'makedirs') as makedirs_mock, \
             patch('builtins.open', mock_open()):
            resp = client.post('/api/download', json={
                'url': 'https://legacy.example.test/song.html',
                'source_url': 'qjjlb://netease?id=1394167216',
                'title': '知我',
            })

        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertTrue(data['success'])
        self.assertTrue(data['filename'].endswith('.mp3'))
        makedirs_mock.assert_called_once()

    def test_api_download_skips_when_existing_file_matches_source_url(self):
        client = app.app.test_client()

        with tempfile.TemporaryDirectory() as tmpdir:
            music_dir = os.path.join(tmpdir, '音乐合集')
            os.makedirs(music_dir, exist_ok=True)
            existing_filename = '15-LOVE_1700000000.mp3'
            existing_path = os.path.join(music_dir, existing_filename)
            with open(existing_path, 'wb') as f:
                f.write(b'fake-mp3')

            download_index_path = os.path.join(tmpdir, 'downloads.json')
            with open(download_index_path, 'w', encoding='utf-8') as f:
                json.dump([{
                    'source_url': 'qjjlb://qq?msg=love&mid=0031Yimn3CnJFa',
                    'resolved_url': 'https://audio.example.test/song.mp3',
                    'title': 'LOVE',
                    'artist': '15',
                    'filename': existing_filename,
                }], f, ensure_ascii=False, indent=2)

            with patch.object(app, 'BASE_DIR', tmpdir), \
                 patch.object(app, 'MUSIC_DIR', music_dir), \
                 patch.object(app, 'DOWNLOAD_INDEX_FILE', download_index_path), \
                 patch.object(app.requests, 'get', side_effect=AssertionError('download should be skipped')):
                resp = client.post('/api/download', json={
                    'url': 'qjjlb://qq?msg=love&mid=0031Yimn3CnJFa',
                    'source_url': 'https://legacy.example.test/song.html',
                    'title': 'LOVE',
                    'artist': '15',
                })

        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertTrue(data['success'])
        self.assertTrue(data.get('skipped'))
        self.assertEqual(data['filename'], existing_filename)

    def test_api_download_skips_when_existing_file_matches_title_and_artist(self):
        client = app.app.test_client()

        with tempfile.TemporaryDirectory() as tmpdir:
            music_dir = os.path.join(tmpdir, '音乐合集')
            os.makedirs(music_dir, exist_ok=True)
            existing_filename = '15-LOVE_1700000000.mp3'
            existing_path = os.path.join(music_dir, existing_filename)
            with open(existing_path, 'wb') as f:
                f.write(b'fake-mp3')

            with patch.object(app, 'BASE_DIR', tmpdir), \
                 patch.object(app, 'MUSIC_DIR', music_dir), \
                 patch.object(app.requests, 'get', side_effect=AssertionError('download should be skipped')):
                resp = client.post('/api/download', json={
                    'url': 'https://legacy.example.test/song.html',
                    'source_url': 'https://legacy.example.test/song.html',
                    'title': 'LOVE',
                    'artist': '15',
                })

        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertTrue(data['success'])
        self.assertTrue(data.get('skipped'))
        self.assertEqual(data['filename'], existing_filename)

    def test_api_delete_music_returns_success_after_removing_file(self):
        client = app.app.test_client()

        with tempfile.TemporaryDirectory() as tmpdir:
            music_dir = os.path.join(tmpdir, '音乐合集')
            os.makedirs(music_dir, exist_ok=True)
            filename = 'LOVE_1700000000.mp3'
            with open(os.path.join(music_dir, filename), 'wb') as f:
                f.write(b'fake-mp3')

            download_index_path = os.path.join(tmpdir, 'downloads.json')
            with open(download_index_path, 'w', encoding='utf-8') as f:
                json.dump([{
                    'filename': filename,
                    'title': 'LOVE',
                    'artist': '15',
                    'song_url': 'qjjlb://qq?msg=love&mid=0031Yimn3CnJFa',
                    'source_url': 'qjjlb://qq?msg=love&mid=0031Yimn3CnJFa',
                    'resolved_url': 'https://audio.example.test/song.mp3',
                }], f, ensure_ascii=False, indent=2)

            favorites_path = os.path.join(tmpdir, 'favorites.json')
            with open(favorites_path, 'w', encoding='utf-8') as f:
                json.dump([{
                    'id': filename,
                    'title': 'LOVE',
                    'artist': '15',
                    'filename': filename,
                }], f, ensure_ascii=False, indent=2)

            playlists_path = os.path.join(tmpdir, 'playlists.json')
            with open(playlists_path, 'w', encoding='utf-8') as f:
                json.dump([{
                    'id': 'pl-1',
                    'name': 'test',
                    'songs': [filename],
                }], f, ensure_ascii=False, indent=2)

            with patch.object(app, 'BASE_DIR', tmpdir), \
                 patch.object(app, 'MUSIC_DIR', music_dir), \
                 patch.object(app, 'DOWNLOAD_INDEX_FILE', download_index_path), \
                 patch.object(app, 'FAVORITES_FILE', favorites_path), \
                 patch.object(app, 'PLAYLISTS_FILE', playlists_path):
                resp = client.delete(f'/api/music/{filename}')

            self.assertEqual(resp.status_code, 200)
            self.assertEqual(resp.get_json()['success'], True)
            self.assertFalse(os.path.exists(os.path.join(music_dir, filename)))

            with open(download_index_path, 'r', encoding='utf-8') as f:
                self.assertEqual(json.load(f), [])

    def test_api_search_marks_downloaded_when_local_file_matches_title_and_artist(self):
        client = app.app.test_client()

        with tempfile.TemporaryDirectory() as tmpdir:
            music_dir = os.path.join(tmpdir, '音乐合集')
            os.makedirs(music_dir, exist_ok=True)
            existing_filename = '15-LOVE_1700000000.mp3'
            with open(os.path.join(music_dir, existing_filename), 'wb') as f:
                f.write(b'fake-mp3')

            with patch.object(app, 'BASE_DIR', tmpdir), \
                 patch.object(app, 'MUSIC_DIR', music_dir), \
                 patch.object(app, 'get_favorites_map', return_value={}), \
                 patch.object(app, 'search_qjjlb', return_value=[{
                     'id': 'upstream-song-id',
                     'title': 'LOVE',
                     'artist': '15',
                     'url': 'https://legacy.example.test/song.html',
                     'source_url': 'https://legacy.example.test/song.html',
                 }]):
                resp = client.get('/api/search', query_string={'q': 'LOVE', 'source_limit': '20'})

        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertEqual(len(data['results']), 1)
        self.assertTrue(data['results'][0]['downloaded'])
        self.assertEqual(data['results'][0]['filename'], existing_filename)

    def test_api_update_playlist_removes_song_by_id_from_object_entries(self):
        client = app.app.test_client()
        playlist_id = 'playlist-1'
        song_entry = {
            'id': 'qq-1',
            'title': '15-LOVE',
            'artist': 'Hearts2Hearts',
            'url': 'qjjlb://qq?msg=love&mid=0031Yimn3CnJFa',
        }
        playlists = [{
            'id': playlist_id,
            'name': '111',
            'songs': [song_entry],
            'created_at': '2026-06-23T11:20:19.814348',
        }]

        with patch.object(app, 'read_json', return_value=playlists), \
             patch.object(app, 'write_json') as write_json_mock:
            resp = client.put(f'/api/playlists/{playlist_id}', json={'remove_song': 'qq-1'})

        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertEqual(data['playlist']['songs'], [])
        write_json_mock.assert_called_once()

    def test_search_qjjlb_netease_paginates_to_fill_requested_limit(self):
        first_page = [{'id': f'netease-{i}'} for i in range(1, 11)]
        second_page = [{'id': f'netease-{i}'} for i in range(11, 21)]
        calls = []

        def fake_fetch(url, params=None, timeout=None):
            calls.append((url, params))
            page = params['pn']
            self.assertEqual(url, 'https://fy-musicbox-api.mu-jie.cc/netease/search/song/')
            self.assertEqual(set(params.keys()), {'keywords', 'pn', 'limit'})
            if page == 1:
                return first_page, None
            if page == 2:
                return second_page, None
            return [], None

        with patch.object(app, 'fetch_musicbox_json', side_effect=fake_fetch):
            results, err = app.search_qjjlb_netease('知我', limit=20)

        self.assertIsNone(err)
        self.assertEqual(len(results), 20)
        self.assertEqual(calls[0][1], {'keywords': '知我', 'pn': 1, 'limit': 10})
        self.assertEqual(calls[1][1], {'keywords': '知我', 'pn': 2, 'limit': 10})

    def test_search_qjjlb_netease_keeps_partial_results_when_later_page_fails(self):
        first_page = [{'id': f'netease-{i}'} for i in range(1, 11)]

        def fake_fetch(url, params=None, timeout=None):
            if params['pn'] == 1:
                return first_page, None
            return None, 'qjjlb 网易云搜索失败'

        with patch.object(app, 'fetch_musicbox_json', side_effect=fake_fetch):
            results, err = app.search_qjjlb_netease('知我', limit=20)

        self.assertIsNone(err)
        self.assertEqual(len(results), 10)

    def test_extract_song_id_handles_music_163_hash_urls(self):
        song_url = 'http://music.163.com/#/song?id=185726'

        self.assertEqual(app.extract_song_id(song_url), '185726')

    def test_get_song_info_routes_music_163_urls_to_netease_provider(self):
        song_url = 'http://music.163.com/#/song?id=185726'
        expected_info = {
            'title': '测试歌曲',
            'artist': '测试歌手',
            'mp3_url': 'https://example.test/song.mp3',
            'source_url': 'qjjlb://netease?id=185726',
            'cover_url': '',
            'lyric_id': '185726',
            'lyrics': [],
        }

        def fake_resolve_qjjlb_song_info(url):
            self.assertEqual(url, 'qjjlb://netease?id=185726')
            return expected_info, None

        with patch.object(app, 'resolve_qjjlb_song_info', side_effect=fake_resolve_qjjlb_song_info):
            info, err = app.get_song_info(song_url)

        self.assertIsNone(err)
        self.assertEqual(info, expected_info)

    def test_resolve_qjjlb_song_info_uses_musicbox_for_netease(self):
        song_url = 'qjjlb://netease?id=1394167216'
        detail_data = [{
            'name': '知我',
            'artist': '国风堂/哦漏',
            'url': 'https://fy-musicbox-api.mu-jie.cc/meting/?server=netease&type=url&id=1394167216',
            'pic': 'https://example.test/cover.jpg',
            'lrc': 'https://fy-musicbox-api.mu-jie.cc/meting/?server=netease&type=lrc&id=1394167216',
            'id': '1394167216',
        }]

        with patch.object(app, 'fetch_musicbox_json', return_value=(detail_data, None)), \
             patch.object(app, 'fetch_musicbox_text', return_value=('[00:00.00]知我', None)):
            info, err = app.resolve_qjjlb_song_info(song_url)

        self.assertIsNone(err)
        self.assertEqual(info['title'], '知我')
        self.assertEqual(info['artist'], '国风堂/哦漏')
        self.assertEqual(info['mp3_url'], 'https://fy-musicbox-api.mu-jie.cc/meting/?server=netease&type=url&id=1394167216')
        self.assertEqual(info['source_url'], 'https://fy-musicbox-api.mu-jie.cc/meting/?server=netease&type=url&id=1394167216')
        self.assertEqual(info['cover_url'], 'https://example.test/cover.jpg')
        self.assertEqual(info['lyric_id'], '1394167216')
        self.assertTrue(info['lyrics'])

    def test_make_musicbox_netease_song_uses_resolvable_url_when_no_direct_mp3(self):
        item = {
            'id': '1394167216',
            'name': '知我',
            'artist': '国风堂 · 哦漏',
            'url': '',
            'lrc': 'https://example.test/lyrics.lrc',
            'pic': 'https://example.test/cover.jpg',
        }

        song = app.make_musicbox_netease_song(item)

        self.assertEqual(song['url'], 'qjjlb://netease?id=1394167216')
        self.assertEqual(song['source_url'], 'qjjlb://netease?id=1394167216')
        self.assertEqual(song['mp3_url'], '')
        self.assertEqual(song['cover_url'], 'https://example.test/cover.jpg')

    def test_api_song_info_falls_back_to_search_for_legacy_qeecc_urls(self):
        client = app.app.test_client()
        legacy_url = 'https://www.qeecc.com/song/legacy-1.html'
        resolved_info = {
            'title': '知我',
            'artist': '国风堂 · 哦漏',
            'mp3_url': 'https://audio.example.test/song.mp3',
            'source_url': 'qjjlb://netease?id=1394167216',
            'cover_url': 'https://example.test/cover.jpg',
            'lyric_id': '1394167216',
            'lyrics': [{'time': 0.0, 'text': '知我'}],
        }

        def fake_get_song_info(url):
            if url == legacy_url:
                return {'error': '该歌曲链接已不再支持，请重新搜索'}, '该歌曲链接已不再支持，请重新搜索'
            if url == 'qjjlb://netease?id=1394167216':
                return resolved_info, None
            self.fail(f'unexpected url: {url}')

        with patch.object(app, 'search_qjjlb', return_value=[{
            'title': '知我',
            'artist': '国风堂 · 哦漏',
            'url': 'qjjlb://netease?id=1394167216',
            'source_url': 'qjjlb://netease?id=1394167216',
            'mp3_url': 'https://audio.example.test/song.mp3',
        }]), patch.object(app, 'get_song_info', side_effect=fake_get_song_info):
            resp = client.get('/api/song-info', query_string={
                'url': legacy_url,
                'title': '知我',
                'artist': '国风堂 · 哦漏',
            })

        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertEqual(data['mp3_url'], 'https://audio.example.test/song.mp3')
        self.assertEqual(data['source_url'], 'qjjlb://netease?id=1394167216')
        self.assertTrue(data['lyrics'])

    def test_api_song_info_recovers_lyrics_for_direct_mp3_entries(self):
        client = app.app.test_client()
        direct_mp3 = 'https://audio.example.test/song.mp3'
        resolved_info = {
            'title': '知我',
            'artist': '国风堂 · 哦漏',
            'mp3_url': 'https://audio.example.test/song.mp3',
            'source_url': 'qjjlb://netease?id=1394167216',
            'cover_url': 'https://example.test/cover.jpg',
            'lyric_id': '1394167216',
            'lyrics': [{'time': 0.0, 'text': '知我'}],
        }
        direct_info = {
            'title': '知我',
            'artist': '国风堂 · 哦漏',
            'mp3_url': direct_mp3,
            'source_url': direct_mp3,
            'cover_url': 'https://example.test/cover.jpg',
            'lyric_id': '',
            'lyrics': [],
        }

        def fake_get_song_info(url):
            if url == direct_mp3:
                return direct_info, None
            if url == 'qjjlb://netease?id=1394167216':
                return resolved_info, None
            self.fail(f'unexpected url: {url}')

        with patch.object(app, 'search_qjjlb', return_value=[{
            'title': '知我',
            'artist': '国风堂 · 哦漏',
            'url': 'qjjlb://netease?id=1394167216',
            'source_url': 'qjjlb://netease?id=1394167216',
            'mp3_url': 'https://audio.example.test/song.mp3',
        }]), patch.object(app, 'get_song_info', side_effect=fake_get_song_info):
            resp = client.get('/api/song-info', query_string={
                'url': direct_mp3,
                'title': '知我',
                'artist': '国风堂 · 哦漏',
            })

        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertEqual(data['mp3_url'], 'https://audio.example.test/song.mp3')
        self.assertEqual(data['source_url'], 'qjjlb://netease?id=1394167216')
        self.assertTrue(data['lyrics'])

    def test_api_proxy_stream_adds_musicbox_headers_for_musicbox_urls(self):
        client = app.app.test_client()
        seen = {}

        class FakeResponse:
            status_code = 200
            headers = {'content-type': 'audio/mpeg'}

            def raise_for_status(self):
                return None

            def iter_content(self, chunk_size=8192):
                yield b'fake-mp3-bytes'

        def fake_get(url, headers=None, stream=None, timeout=None):
            seen['url'] = url
            seen['headers'] = headers
            seen['stream'] = stream
            seen['timeout'] = timeout
            return FakeResponse()

        with patch.object(app.requests, 'get', side_effect=fake_get):
            resp = client.get(
                '/api/proxy-stream',
                query_string={'url': 'https://fy-musicbox-api.mu-jie.cc/meting/?server=netease&type=url&id=1394167216'},
            )

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(seen['url'], 'https://fy-musicbox-api.mu-jie.cc/meting/?server=netease&type=url&id=1394167216')
        self.assertEqual(seen['headers']['Referer'], 'https://mu-jie.cc/musicBox/')
        self.assertEqual(seen['headers']['Origin'], 'https://mu-jie.cc')
        self.assertEqual(seen['headers']['Accept'], '*/*')
        self.assertEqual(seen['headers']['User-Agent'], 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
        self.assertTrue(seen['stream'])
        self.assertEqual(seen['timeout'], 30)

    def test_migu_qjjlb_links_are_not_supported(self):
        info, err = app.get_song_info('qjjlb://migu?kw=test&n=1')

        self.assertEqual(err, '不支持的 qjjlb 来源: migu')
        self.assertEqual(info, {'error': '不支持的 qjjlb 来源: migu'})


if __name__ == '__main__':
    unittest.main()
