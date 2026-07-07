from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class FrontendAlignmentTests(unittest.TestCase):
    def test_playlist_option_uses_separate_name_and_count(self):
        app_js = (ROOT / "static" / "app.js").read_text(encoding="utf-8")
        style_css = (ROOT / "static" / "style.css").read_text(encoding="utf-8")

        self.assertIn('class="pl-option-name"', app_js)
        self.assertIn('class="pl-option-count"', app_js)
        self.assertIn(".pl-option-name", style_css)
        self.assertIn(".pl-option-count", style_css)

    def test_playlist_detail_header_uses_aligned_main_row(self):
        app_js = (ROOT / "static" / "app.js").read_text(encoding="utf-8")
        style_css = (ROOT / "static" / "style.css").read_text(encoding="utf-8")

        self.assertEqual(app_js.count('class="playlist-detail-main"'), 2)
        self.assertNotIn("<h2>${renderPlaylistFolderIcon('inline')}", app_js)
        self.assertIn(".playlist-detail-main", style_css)
        self.assertIn("align-items: center;", style_css)


if __name__ == "__main__":
    unittest.main()
