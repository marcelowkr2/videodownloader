import importlib.util
import unittest
from pathlib import Path

AGENT_PATH = Path(__file__).resolve().parents[1] / "public" / "agent" / "yt-dlp-agent.py"
spec = importlib.util.spec_from_file_location("ytdlp_agent", AGENT_PATH)
agent = importlib.util.module_from_spec(spec)
spec.loader.exec_module(agent)


class FormatTests(unittest.TestCase):
    def args(self, mode="video", resolution="best", fmt="mp4", playlist=False):
        return agent.build_args(
            "yt-dlp", {"dir": Path("/tmp")}, "https://youtu.be/6JnGBs88sL0",
            mode, resolution, fmt, playlist,
        )

    def test_mp4_uses_compatible_codecs(self):
        args = self.args()
        self.assertEqual(
            args[args.index("-f") + 1],
            "bv[vcodec^=avc1]+ba[acodec^=mp4a]/b[vcodec^=avc1][acodec^=mp4a]",
        )
        self.assertIn("--no-playlist", args)

    def test_mp4_applies_resolution_to_both_video_choices(self):
        args = self.args(resolution="720", playlist=True)
        self.assertEqual(
            args[args.index("-f") + 1],
            "bv[vcodec^=avc1][height<=720]+ba[acodec^=mp4a]"
            "/b[vcodec^=avc1][acodec^=mp4a][height<=720]",
        )
        self.assertIn("--yes-playlist", args)

    def test_mkv_and_audio_keep_existing_selection(self):
        args = self.args(resolution="480", fmt="mkv")
        self.assertEqual(args[args.index("-f") + 1], "bv*[height<=480]+ba/b[height<=480]")
        audio = self.args(mode="audio", fmt="mp3")
        self.assertIn("-x", audio)
        self.assertEqual(audio[audio.index("--audio-format") + 1], "mp3")
        self.assertNotIn("-f", audio)

    def test_unavailable_format_is_explained(self):
        self.assertIn("compatível", agent.friendly_error("Requested format is not available"))


if __name__ == "__main__":
    unittest.main()
