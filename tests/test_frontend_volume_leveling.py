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

    def test_playback_starts_before_background_leveling(self):
        app_js = (STATIC_DIR / "app.js").read_text(encoding="utf-8")
        entrypoint = app_js[
            app_js.index("async function startPlaybackWithLeveling"):
            app_js.index("async function playSong")
        ]

        self.assertLess(
            entrypoint.index("await startAudioPlayback("),
            entrypoint.index("void analyzeTrackGain("),
        )
        self.assertNotIn("audio.pause()", entrypoint)
        self.assertIn("linearRampToValueAtTime(targetGain, now + 0.15)", app_js)

    def test_seek_is_committed_once_and_has_delayed_feedback(self):
        app_js = (STATIC_DIR / "app.js").read_text(encoding="utf-8")

        self.assertIn("progressBar.addEventListener('change'", app_js)
        self.assertNotIn("progressBar.addEventListener('pointerup'", app_js)
        self.assertEqual(app_js.count("seekAudio();"), 1)
        self.assertIn("Math.abs(audio.currentTime - targetTime) < 0.25", app_js)
        self.assertIn("progressBar.setAttribute('aria-busy', 'true')", app_js)
        self.assertIn("}, 300);", app_js)

    def test_direct_and_local_audio_urls_skip_song_info_wait(self):
        app_js = (STATIC_DIR / "app.js").read_text(encoding="utf-8")

        self.assertIn("function getImmediateAudioUrl(song)", app_js)
        self.assertIn("if (song.filename) return `/api/stream/", app_js)
        self.assertIn("if (immediateAudioUrl) {", app_js)
        self.assertIn("params.set('playback_only', '1')", app_js)
        self.assertIn("void prefetchNextSong();", app_js)
        self.assertIn("const nextPreloader = new Audio();", app_js)
        self.assertIn("nextPreloader.preload = 'metadata';", app_js)
        self.assertIn("nextPreloader?.src === new URL(audioUrl, window.location.href).href", app_js)


if __name__ == "__main__":
    unittest.main()
