import json
import csv
import sys
import tempfile
import sqlite3
from contextlib import closing
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / 'scripts'), str(ROOT / 'code' / 'backend')]
import audit_gd_favorites as audit


class GDAuditTests(unittest.TestCase):
    def test_preserves_progress_and_checks_existing_netease_id(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / '.cache').mkdir()
            favorites = root / 'favorites.json'
            songs = [
                {'id': 'old', 'title': 'Old', 'artist': 'Artist'},
                {'id': 'new', 'title': 'New', 'artist': 'Singer', 'song_ref': 'qjjlb://netease?id=123'},
            ]
            favorites.write_text(json.dumps(songs), encoding='utf-8')
            report = root / '.cache' / 'gd-favorites-audit.json'
            report.write_text(json.dumps([{'id': 'old', 'title': 'Old', 'artist': 'Artist', 'status': '待确认', 'catalog_count': 3}]), encoding='utf-8')
            before = favorites.read_bytes()
            with patch.object(audit, 'ROOT', root), patch.object(audit.app, 'FAVORITES_FILE', str(favorites)), \
                 patch.object(audit.app, 'hydrate_song_entry', side_effect=lambda song: song), \
                 patch.object(audit.app, 'search_qjjlb_netease', side_effect=AssertionError('direct ID must not search')), \
                 patch.object(audit.app.gd_client, 'request', return_value=({'url': 'https://example.com/song.mp3'}, None)):
                audit.main()
            result = json.loads(report.read_text(encoding='utf-8'))
            self.assertEqual(result[0]['status'], '待确认')
            self.assertEqual(result[1]['status'], '已匹配')
            self.assertTrue(result[1]['direct_id'])
            self.assertEqual(favorites.read_bytes(), before)

    def test_merges_new_favorites_when_data_changes_during_run(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / '.cache').mkdir()
            initial = [{'id': 'a', 'title': 'Old', 'artist': 'Artist'}]
            updated = initial + [{'id': 'b', 'title': 'New', 'artist': 'Singer'}]
            reads = iter([initial, updated])
            with patch.object(audit, 'ROOT', root), patch.object(audit.app, 'FAVORITES_FILE', str(root / 'favorites.json')), \
                 patch.object(audit.app, 'read_json', side_effect=lambda _: next(reads, updated)), \
                 patch.object(audit.app, 'hydrate_song_entry', side_effect=lambda song: song), \
                 patch.object(audit.app, 'search_qjjlb_netease', return_value=([], None)) as search, \
                 patch.object(audit.app.gd_client, 'request') as request:
                audit.main()
            report = json.loads((root / '.cache' / 'gd-favorites-audit.json').read_text(encoding='utf-8'))
            self.assertEqual([entry['id'] for entry in report], ['a', 'b'])
            self.assertEqual([entry['status'] for entry in report], ['待确认', '待确认'])
            self.assertEqual(search.call_count, 2)
            request.assert_not_called()

    def test_budget_wait_stops_at_the_first_available_slot(self):
        with tempfile.TemporaryDirectory() as directory:
            dbpath = str(Path(directory) / 'state.sqlite')
            with closing(sqlite3.connect(dbpath)) as db, db:
                db.execute('CREATE TABLE requests (at REAL NOT NULL)')
                db.executemany('INSERT INTO requests VALUES (?)', [(710,)] * 25)
            with patch.object(audit.app.gd_client, 'state_file', dbpath), patch.object(audit.time, 'time', return_value=1000), \
                 patch.object(audit.time, 'sleep') as sleep:
                audit.wait_for_budget()
            sleep.assert_called_once_with(11)

    def test_changed_source_reference_is_rechecked(self):
        old = {'id': 'a', 'title': 'Song', 'artist': 'Artist', 'url': 'qjjlb://qq?mid=old'}
        previous = audit.entry_for_song(old)
        previous.update(status='已匹配', playback_checked=True)
        updated = {**old, 'url': 'qjjlb://netease?id=new'}
        result = audit.merge_progress([updated], [previous])
        self.assertEqual(result[0]['status'], '暂未核验')

    def test_export_neutralizes_spreadsheet_formulas(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'report.json'
            audit.save(path, [{'title': '=1+1', 'artist': 'Artist', 'status': '待确认'},
                              {'title': 'Matched', 'artist': 'Artist', 'status': '已匹配'}])
            with path.with_suffix('.csv').open(encoding='utf-8-sig', newline='') as output:
                rows = list(csv.DictReader(output))
            self.assertEqual(rows[0]['歌名'], "'=1+1")
            with (path.parent / 'gd-favorites-to-review.csv').open(encoding='utf-8-sig', newline='') as output:
                self.assertEqual(len(list(csv.DictReader(output))), 1)

    def test_followup_page_adds_candidate_for_manual_review(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / '.cache').mkdir()
            favorites = root / 'favorites.json'
            song = {'id': 'old', 'title': 'Song', 'artist': 'Artist'}
            favorites.write_text(json.dumps([song]), encoding='utf-8')
            report = root / '.cache' / 'gd-favorites-audit.json'
            previous = {**audit.entry_for_song(song), 'status': '待确认', 'catalog_count': 50,
                        'reason': '搜索结果达到 50 条，请核对后续结果'}
            report.write_text(json.dumps([previous]), encoding='utf-8')
            candidate = {'title': 'Song', 'artist': 'Artist', 'album': '', 'song_ref': 'qjjlb://netease?id=2'}
            with patch.object(audit, 'ROOT', root), patch.object(audit.app, 'FAVORITES_FILE', str(favorites)), \
                 patch.object(audit.app, 'search_qjjlb_netease', return_value=([candidate], None)) as search, \
                 patch.object(audit.app.gd_client, 'request') as playback:
                audit.main()
            result = json.loads(report.read_text(encoding='utf-8'))[0]
            self.assertEqual(result['status'], '待确认')
            self.assertEqual(result['checked_pages'], 2)
            self.assertEqual(result['candidates'][0]['song_ref'], 'qjjlb://netease?id=2')
            self.assertEqual(search.call_args.kwargs['page'], 2)
            playback.assert_not_called()


if __name__ == '__main__':
    unittest.main()
