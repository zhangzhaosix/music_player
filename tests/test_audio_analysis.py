from pathlib import Path
import json
import math
import os
import struct
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
import wave

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'code' / 'backend'))
import app
import audio_analysis as analysis


def make_wave(path, amplitude=.2, intro=False, antiphase=False, seconds=12):
    with wave.open(str(path), 'wb') as output:
        output.setnchannels(2)
        output.setsampwidth(2)
        output.setframerate(48000)
        data = bytearray()
        for i in range(seconds * 48000):
            level = amplitude * (.01 if intro and i < 2 * 48000 else 1)
            sample = round(32767 * level * math.sin(2 * math.pi * 1000 * i / 48000))
            data.extend(struct.pack('<hh', sample, -sample if antiphase else sample))
        output.writeframes(data)


class AudioAnalysisTests(unittest.TestCase):
    def setUp(self):
        directory = ROOT / '.cache' / 'audio-tests'
        directory.mkdir(parents=True, exist_ok=True)
        self.temporary = tempfile.TemporaryDirectory(dir=directory)
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)

    def test_gain_obeys_true_peak_even_when_large_attenuation_is_needed(self):
        measured = analysis.parse_loudness('Summary:\nI: -30.0 LUFS\nLRA: 20.0 LU\nTrue peak:\nPeak: 1.0 dBFS')
        self.assertEqual(measured['gain_db'], -3)
        self.assertTrue(measured['peak_limited'])
        self.assertEqual(measured['true_peak_dbtp'] + measured['gain_db'], -2)

    def test_silence_and_incomplete_measurements_never_amplify(self):
        silent = analysis.parse_loudness('Summary:\nI: -70.0 LUFS\nLRA: 0.0 LU\nTrue peak:\nPeak: -inf dBFS')
        self.assertEqual(silent, {'status': 'silent', 'gain_db': -2})
        with self.assertRaises(ValueError):
            analysis.parse_loudness('I: -20 LUFS')

    def test_unregistered_urls_and_local_traversal_are_rejected(self):
        service = analysis.AudioAnalysis(self.directory, self.directory)
        for url in ('/api/stream/../README.md', '/api/proxy-stream?url=https://example.com/a.mp3',
                    'https://example.com/a.mp3', '/etc/passwd'):
            with self.assertRaises(ValueError):
                service.source(url)
        with patch.object(analysis.socket, 'getaddrinfo', return_value=[(2, 1, 6, '', ('127.0.0.1', 80))]):
            with self.assertRaises(ValueError):
                analysis.validate_remote_url('http://example.com/a.mp3')

    def test_remote_versions_are_distinct_and_analysis_removes_range_headers(self):
        service = analysis.AudioAnalysis(self.directory, self.directory)
        url = 'https://example.com/hq.mp3'
        source_url = '/api/proxy-stream?url=' + url
        service.register(url, {'Range': 'bytes=0-100', 'If-Range': 'old', 'User-Agent': 'test'}, 'v1')
        first, source = service.source(source_url)
        self.assertEqual(source['headers'], {'User-Agent': 'test'})
        service.register(url, version='v2')
        second, _ = service.source(source_url)
        self.assertNotEqual(first, second)
        service.register('https://example.com/standard.mp3')
        third, _ = service.source('/api/proxy-stream?url=https://example.com/standard.mp3')
        self.assertNotEqual(second, third)

    @unittest.skipUnless(analysis.binary('ffmpeg', ROOT) and analysis.binary('ffprobe', ROOT), 'FFmpeg/FFprobe required')
    def test_real_audio_reaches_target_without_changing_dynamics_or_channels(self):
        for amplitude in (.08, .4):
            original = self.directory / f'{amplitude}.wav'
            make_wave(original, amplitude)
            before = analysis.measure_audio(original, ROOT)
            self.assertEqual(before['status'], 'ready')
            self.assertFalse(before['peak_limited'])
            scaled = self.directory / 'scaled.wav'
            analysis.run_tool([analysis.binary('ffmpeg', ROOT), '-v', 'error', '-y', '-i', str(original),
                               '-af', f"volume={before['gain_db']}dB", '-c:a', 'pcm_f32le', str(scaled)])
            after = analysis.measure_audio(scaled, ROOT)
            self.assertAlmostEqual(after['integrated_lufs'], -18, delta=1)
            self.assertLessEqual(after['true_peak_dbtp'], -2)
            self.assertAlmostEqual(after['loudness_range_lu'], before['loudness_range_lu'], delta=.2)
            self.assertAlmostEqual(after['true_peak_dbtp'] - before['true_peak_dbtp'], before['gain_db'], delta=.2)
            self.assertEqual(after['audio']['channels'], 2)
            self.assertEqual(after['audio']['sample_rate'], 48000)

    @unittest.skipUnless(analysis.binary('ffmpeg', ROOT) and analysis.binary('ffprobe', ROOT), 'FFmpeg/FFprobe required')
    def test_quiet_intro_antiphase_and_silence_are_measured_as_whole_stereo_audio(self):
        normal, opposite, intro, silent = [self.directory / (name + '.wav') for name in ('normal', 'opposite', 'intro', 'silent')]
        make_wave(normal, .4)
        make_wave(opposite, .4, antiphase=True)
        make_wave(intro, .4, intro=True)
        make_wave(silent, 0)
        measured = analysis.measure_audio(normal, ROOT)
        self.assertAlmostEqual(analysis.measure_audio(opposite, ROOT)['integrated_lufs'], measured['integrated_lufs'], delta=.1)
        intro_result = analysis.measure_audio(intro, ROOT)
        self.assertLess(intro_result['gain_db'], 0)
        self.assertLessEqual(intro_result['true_peak_dbtp'] + intro_result['gain_db'], -2)
        self.assertEqual(analysis.measure_audio(silent, ROOT)['status'], 'silent')

    def test_persistent_cache_survives_restart_and_invalidates_changed_local_file(self):
        original = self.directory / 'a.wav'
        original.write_bytes(b'original')
        service = analysis.AudioAnalysis(self.directory, self.directory)
        key, _ = service.source('/api/stream/a.wav')
        service.directory.mkdir(parents=True)
        (service.directory / (key + '.json')).write_text(json.dumps({'status': 'ready', 'gain_db': -5, 'expires': 0}))
        restarted = analysis.AudioAnalysis(self.directory, self.directory)
        self.assertEqual(restarted.query('/api/stream/a.wav')['gain_db'], -5)
        original.write_bytes(b'a different audio version')
        self.assertEqual(restarted.query('/api/stream/a.wav')['status'], 'unavailable')

    def test_analysis_endpoint_validates_request_and_reports_missing_tools(self):
        path = self.directory / 'a.wav'
        path.write_bytes(b'original')
        service = analysis.AudioAnalysis(self.directory, self.directory)
        with patch.object(app, 'audio_analysis', service), patch.object(analysis, 'binary', return_value=None):
            client = app.app.test_client()
            self.assertEqual(client.post('/api/audio-analysis', json=[]).status_code, 400)
            self.assertEqual(client.post('/api/audio-analysis', json={'audio_url': '/api/stream/a.wav', 'priority': 'bad'}).status_code, 400)
            self.assertEqual(client.post('/api/audio-analysis', json={'audio_url': '/api/stream/a.wav'}).get_json()['status'], 'unavailable')

    def test_worker_merges_requests_prioritizes_current_and_caches_results(self):
        for name in ('a', 'b', 'c', 'd'):
            (self.directory / (name + '.wav')).write_bytes(name.encode())
        service = analysis.AudioAnalysis(self.directory, self.directory)
        started, release = threading.Event(), threading.Event()
        order = []
        def measure(path, root):
            order.append(path.name)
            if path.name == 'a.wav':
                started.set()
                if not release.wait(5):
                    raise RuntimeError('test timeout')
            return {'status': 'ready', 'gain_db': -3}
        with patch.object(analysis, 'binary', return_value='test-tool'), patch.object(analysis, 'measure_audio', side_effect=measure):
            self.assertEqual(service.query('/api/stream/a.wav', start=True)['status'], 'pending')
            self.assertTrue(started.wait(5))
            service.query('/api/stream/a.wav', start=True)
            service.query('/api/stream/d.wav', start=True, priority='current')
            service.query('/api/stream/b.wav', start=True, priority='next')
            service.query('/api/stream/c.wav', start=True, priority='current')
            release.set()
            deadline = time.monotonic() + 5
            while service.query('/api/stream/b.wav')['status'] != 'ready' and time.monotonic() < deadline:
                time.sleep(.01)
            self.assertEqual(order, ['a.wav', 'c.wav', 'b.wav'])
            self.assertEqual(service.query('/api/stream/d.wav')['status'], 'unavailable')
            restarted = analysis.AudioAnalysis(self.directory, self.directory)
            self.assertEqual(restarted.query('/api/stream/a.wav')['gain_db'], -3)

    def test_malformed_cached_metadata_is_ignored_instead_of_breaking_playback(self):
        service = analysis.AudioAnalysis(self.directory, self.directory)
        service.directory.mkdir(parents=True)
        for payload in ([], {'status': 'ready', 'gain_db': 9, 'expires': 0},
                        {'status': 'ready', 'gain_db': -3, 'expires': 'bad'}):
            (service.directory / 'key.json').write_text(json.dumps(payload))
            self.assertIsNone(service.cached('key'))

    def test_remote_download_rejects_partial_audio_and_private_redirects(self):
        class Response:
            status_code = 206
            headers = {}
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def raise_for_status(self): pass
        response = Response()
        with patch.object(analysis, 'validate_remote_url') as validate, patch.object(analysis.requests, 'Session') as session:
            session.return_value.__enter__.return_value.get.return_value = response
            with self.assertRaisesRegex(ValueError, '完整返回'):
                analysis.fetch_audio('https://example.com/audio', self.directory / 'partial.audio')
            response.status_code = 302
            response.headers = {'Location': 'http://127.0.0.1/private'}
            validate.side_effect = [None, ValueError('private address')]
            with self.assertRaisesRegex(ValueError, 'private address'):
                analysis.fetch_audio('https://example.com/audio', self.directory / 'redirect.audio')

    def test_direct_audio_formats_do_not_trigger_an_unrelated_song_search(self):
        for extension in ('.flac', '.m4a', '.aac', '.opus'):
            url = 'https://example.com/song' + extension + '?version=2'
            with patch.object(app, 'search_qjjlb') as search:
                info, error = app.get_song_info(url, include_lyrics=False)
                self.assertIsNone(error)
                self.assertEqual(info['mp3_url'], url)
                search.assert_not_called()

    def test_remote_worker_uses_complete_original_bytes_and_removes_temporary_audio(self):
        service = analysis.AudioAnalysis(self.directory, self.directory)
        url = 'https://example.com/audio.mp3'
        service.register(url)
        payload = b'complete-original-audio'
        class Response:
            status_code = 200
            headers = {'Content-Length': str(len(payload))}
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def raise_for_status(self): pass
            def iter_content(self, size): yield payload
        def measure(path, root):
            self.assertEqual(path.read_bytes(), payload)
            return {'status': 'ready', 'gain_db': -3}
        with patch.object(analysis, 'binary', return_value='test-tool'), patch.object(analysis, 'measure_audio', side_effect=measure), \
             patch.object(analysis, 'validate_remote_url'), patch.object(analysis.requests, 'Session') as session:
            session.return_value.__enter__.return_value.get.return_value = Response()
            service.query('/api/proxy-stream?url=' + url, start=True)
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline:
                result = service.query('/api/proxy-stream?url=' + url)
                if result['status'] == 'ready':
                    break
                time.sleep(.01)
            self.assertEqual(result['status'], 'ready')
            self.assertEqual(list(service.directory.glob('work-*')), [])

    @unittest.skipUnless(analysis.binary('ffmpeg', ROOT) and analysis.binary('ffprobe', ROOT), 'FFmpeg/FFprobe required')
    def test_high_dynamic_audio_is_allowed_below_target_instead_of_compressed(self):
        path = self.directory / 'dynamic.wav'
        with wave.open(str(path), 'wb') as output:
            output.setnchannels(2)
            output.setsampwidth(2)
            output.setframerate(48000)
            data = bytearray()
            for i in range(12 * 48000):
                level = .95 if 3 * 48000 <= i < 3 * 48000 + 48 else .015
                sample = round(32767 * level * math.sin(2 * math.pi * 1000 * i / 48000))
                data.extend(struct.pack('<hh', sample, sample))
            output.writeframes(data)
        before = analysis.measure_audio(path, ROOT)
        self.assertTrue(before['peak_limited'])
        self.assertLess(before['integrated_lufs'] + before['gain_db'], -18)
        scaled = self.directory / 'dynamic-scaled.wav'
        analysis.run_tool([analysis.binary('ffmpeg', ROOT), '-v', 'error', '-i', str(path),
                           '-af', f"volume={before['gain_db']}dB", '-c:a', 'pcm_f32le', str(scaled)])
        after = analysis.measure_audio(scaled, ROOT)
        self.assertLessEqual(after['true_peak_dbtp'], -2)
        self.assertAlmostEqual(after['loudness_range_lu'], before['loudness_range_lu'], delta=.2)

    @unittest.skipUnless(analysis.binary('ffmpeg', ROOT) and analysis.binary('ffprobe', ROOT), 'FFmpeg/FFprobe required')
    def test_download_preserves_flac_bytes_extension_and_mime(self):
        original = self.directory / 'original.wav'
        flac = self.directory / 'original.flac'
        make_wave(original, seconds=1)
        analysis.run_tool([analysis.binary('ffmpeg', ROOT), '-v', 'error', '-i', str(original), str(flac)])
        payload = flac.read_bytes()
        class Response:
            headers = {'Content-Length': str(len(payload))}
            def raise_for_status(self): pass
            def close(self): pass
            def iter_content(self, chunk_size): yield payload
        index = self.directory / 'downloads.json'
        index.write_text('[]')
        with patch.object(app, 'MUSIC_DIR', str(self.directory)), patch.object(app, 'DOWNLOAD_INDEX_FILE', str(index)), \
             patch.object(app, 'find_existing_downloaded_song', return_value=''), \
             patch.object(app, 'resolve_download_target', return_value=('https://example.com/audio', 'source', None)), \
             patch.object(app.requests, 'get', return_value=Response()):
            client = app.app.test_client()
            result = client.post('/api/download', json={'url': 'source', 'title': 'format-test'}).get_json()
            self.assertTrue(result['success'])
            self.assertTrue(result['filename'].endswith('.flac'))
            self.assertEqual((self.directory / result['filename']).read_bytes(), payload)
            response = client.get('/api/stream/' + result['filename'])
            self.assertEqual(response.mimetype, 'audio/flac')
            response.close()
            self.assertIn(result['filename'], [song['filename'] for song in app.get_local_music()])
            self.assertEqual(json.loads(index.read_text())[0]['audio']['codec'], 'flac')


if __name__ == '__main__':
    unittest.main()
