import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import audit_favorites


class FavoritesAuditTests(unittest.TestCase):
    def fixture(self, root):
        entries = [dict(id=name, title=name, artist='Artist', url=f'qjjlb://qq?mid={name}')
                   for name in ('preview', 'normal', 'unknown')]
        path = root / 'favorites.json'
        path.write_text(json.dumps(entries), encoding='utf-8')
        raw = path.read_bytes()
        rows = [dict(id=s['id'], title=s['title'], artist=s['artist'], song_ref=s['url'],
                     actual_duration=30 if s['id'] == 'preview' else None,
                     expected_duration=200 if s['id'] == 'preview' else None,
                     status='incomplete' if s['id'] == 'preview' else 'unverified') for s in entries]
        return path, raw, {'favorites_sha256': hashlib.sha256(raw).hexdigest(), 'rows': rows}

    def test_only_proven_incomplete_song_removed_and_backup_is_exact(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / '.cache').mkdir()
            path, raw, report = self.fixture(root)
            with patch.object(audit_favorites, 'ROOT', root):
                self.assertEqual(audit_favorites.apply_report(report, path), 1)
            self.assertEqual([s['id'] for s in json.loads(path.read_text())], ['normal', 'unknown'])
            self.assertEqual(next((root / '.cache').glob('favorites-before-audit-*.json')).read_bytes(), raw)

    def test_changed_collection_cannot_be_overwritten_by_old_report(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path, raw, report = self.fixture(root)
            updated = raw + b'\n'
            path.write_bytes(updated)
            with self.assertRaises(ValueError):
                audit_favorites.apply_report(report, path)
            self.assertEqual(path.read_bytes(), updated)

    def test_short_duration_without_full_duration_is_not_deletion_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path, raw, report = self.fixture(root)
            report['rows'][0]['expected_duration'] = None
            with self.assertRaises(ValueError):
                audit_favorites.apply_report(report, path)
            self.assertEqual(path.read_bytes(), raw)

    def test_empty_deletion_list_leaves_collection_byte_for_byte_unchanged(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path, raw, report = self.fixture(root)
            report['rows'][0]['status'] = 'uncertain'
            self.assertEqual(audit_favorites.apply_report(report, path), 0)
            self.assertEqual(path.read_bytes(), raw)


if __name__ == '__main__':
    unittest.main()
