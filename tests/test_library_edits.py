import sys
import tempfile
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'code' / 'backend'))
import app as music


class LibraryEditTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        folder = directory.name
        paths = patch.multiple(
            music, MUSIC_DIR=folder,
            FAVORITES_FILE=str(Path(folder) / 'favorites.json'),
            PLAYLISTS_FILE=str(Path(folder) / 'playlists.json'),
            DOWNLOAD_INDEX_FILE=str(Path(folder) / 'downloads.json'),
        )
        paths.start()
        self.addCleanup(paths.stop)
        self.client = music.app.test_client()

    def test_restore_favorite_preserves_position_and_added_at(self):
        first, second = {'id': 'one', 'title': 'First'}, {'id': 'two', 'title': 'Second'}
        self.client.post('/api/favorites', json=first)
        self.client.post('/api/favorites', json=second)
        removed = self.client.delete('/api/favorites', json={'id': first['id']}).get_json()
        original = removed['favorite']
        for _ in range(2):
            restored = self.client.post('/api/favorites', json={**original, 'restore_position': removed['position']})
            self.assertEqual(restored.status_code, 200)
        favorites = self.client.get('/api/favorites').get_json()['favorites']
        self.assertEqual([song['id'] for song in favorites], ['one', 'two'])
        self.assertEqual(favorites[0]['added_at'], original['added_at'])

    def test_playlist_create_and_merge_concurrent_edits_without_overwriting(self):
        response = self.client.post('/api/playlists', json={'name': 'Night', 'songs': [{'id': 'first'}, {'id': 'second'}]})
        self.assertEqual(response.status_code, 201)
        playlist = response.get_json()['playlist']
        endpoint = f"/api/playlists/{playlist['id']}"

        def append(song_id):
            with music.app.test_client() as client:
                return client.put(endpoint, json={'add_songs': [{'id': 'second'}, {'id': song_id}]}).get_json()

        with ThreadPoolExecutor(max_workers=2) as pool:
            for result in pool.map(append, ['third', 'fourth']):
                self.assertEqual(result['added_count'], 1)

        removal = self.client.put(endpoint, json={'remove_song': 'first'}).get_json()['removed']
        restored = self.client.put(endpoint, json={'add_song': removal['song'], 'song_position': removal['position']}).get_json()
        ids = [song['id'] for song in restored['playlist']['songs']]
        self.assertEqual(ids[:2], ['first', 'second'])
        self.assertCountEqual(ids[2:], ['third', 'fourth'])

    def test_concurrent_download_records_keep_all_updates(self):
        read_index = music.read_download_index

        def read_then_yield():
            records = read_index()
            time.sleep(.01)
            return records

        filenames = ['a.mp3', 'b.mp3', 'c.mp3', 'd.mp3']
        with patch.object(music, 'read_download_index', side_effect=read_then_yield):
            with ThreadPoolExecutor(max_workers=4) as pool:
                list(pool.map(lambda filename: music.save_download_record(filename=filename), filenames))

        self.assertCountEqual([record['filename'] for record in music.read_download_index()], filenames)

    def test_failed_download_index_write_keeps_last_valid_file(self):
        music.save_download_record(filename='existing.mp3')
        path = Path(music.DOWNLOAD_INDEX_FILE)
        original = path.read_bytes()
        with self.assertRaises(TypeError):
            music.save_download_record(filename='invalid.mp3', audio_metadata={'value': object()})
        self.assertEqual(path.read_bytes(), original)
        self.assertEqual(list(path.parent.iterdir()), [path])


if __name__ == '__main__':
    unittest.main()
