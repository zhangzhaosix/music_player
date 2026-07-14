from pathlib import Path
import sys
import unittest


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "code" / "backend"))
STATIC_DIR = ROOT / "code" / "frontend" / "static"


class FrontendVolumeLevelingTests(unittest.TestCase):
    def test_audio_pipeline_uses_gain_and_analyser_nodes(self):
        app_js = (STATIC_DIR / "app.js").read_text(encoding="utf-8")

        self.assertIn("createMediaElementSource(audio)", app_js)
        self.assertIn("createAnalyser()", app_js)
        self.assertIn("createGain()", app_js)
        self.assertIn("audioPipeline.source.connect(audioPipeline.analyser)", app_js)
        self.assertIn("audioPipeline.analyser.connect(audioPipeline.gain)", app_js)
        self.assertIn("audioPipeline.gain.connect(audioPipeline.context.destination)", app_js)

    def test_playback_uses_shared_leveling_entrypoint(self):
        app_js = (STATIC_DIR / "app.js").read_text(encoding="utf-8")

        self.assertEqual(app_js.count("await startPlaybackWithLeveling({"), 2)

    def test_switching_tracks_resets_track_gain_before_analysis(self):
        app_js = (STATIC_DIR / "app.js").read_text(encoding="utf-8")

        self.assertIn("playbackState.trackGain = 1;", app_js)
        self.assertIn("applyEffectiveVolume();", app_js)

    def test_analysis_failures_fall_back_to_direct_playback(self):
        app_js = (STATIC_DIR / "app.js").read_text(encoding="utf-8")

        self.assertIn("return startAudioPlayback({ song, shouldPlay, seekTime, saveState });", app_js)
        self.assertIn("const leveled = await analyzeTrackGain(song, audioUrl);", app_js)
        self.assertIn("if (!leveled) {", app_js)


if __name__ == "__main__":
    unittest.main()
