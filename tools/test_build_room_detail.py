import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

import numpy as np
from PIL import Image

spec = importlib.util.spec_from_file_location("room_detail_export", Path(__file__).with_name("build-room-detail.py"))
export = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = export
spec.loader.exec_module(export)


class DetailExportTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)

    def tearDown(self):
        self.temporary.cleanup()

    def sections(self, repair=False, corrupt=False):
        metadata = []
        for row in range(3):
            for col in range(6):
                index = row * 6 + col
                bounds = [col * 10 - 2, row * 10 - 2, (col + 1) * 10 + 2, (row + 1) * 10 + 2]
                record = {"index": index, "x": col, "y": row, "bounds": bounds, "sourceWidth": 60, "sourceHeight": 30, "inputSize": 14}
                if repair and index == 15:
                    record["bounds"] = bounds = [28, 15, 42, 32]
                    record["coreBounds"] = [30, 16, 40, 30]
                if corrupt and index == 9:
                    record["validY"] = [-1000, -999, 16, 17]
                if corrupt:
                    pixels = np.full((256, 256, 3), 100, dtype=np.uint8)
                    if index == 9:
                        yy = (np.arange(256) + .5) / 256 * (bounds[3] - bounds[1]) + bounds[1]
                        # As in the production repair, fade fully out before
                        # the bad pixels, leaving room for filter support.
                        pixels[yy >= 18] = 255
                else:
                    xx = (np.arange(256) + .5) / 256 * (bounds[2] - bounds[0]) + bounds[0]
                    yy = (np.arange(256) + .5) / 256 * (bounds[3] - bounds[1]) + bounds[1]
                    pixels = np.zeros((256, 256, 3), dtype=np.uint8)
                    pixels[:, :, 0] = np.rint(100 + 60 * np.sin(xx[None, :] / 60 * np.pi * 2)).astype(np.uint8)
                    pixels[:, :, 1] = np.rint(np.clip(yy[:, None], 0, 30) / 30 * 180).astype(np.uint8)
                    pixels[:, :, 2] = 80
                Image.fromarray(pixels).save(self.root / f"enhancement-{index}.png")
                metadata.append(record)
        path = self.root / "sections.json"
        path.write_text(json.dumps(metadata))
        sections, width, height = export.load_sections(path)
        return sections, width, height, export.ImageCache(4, 256)

    def test_extent_pixel_centres_preserve_continuous_world_alignment(self):
        sections, width, height, cache = self.sections()
        x = np.linspace(.5, 59.5, 200)
        y = np.linspace(.5, 29.5, 80)
        result = export.render_region(sections, cache, width, height, x, y)
        expected_r = np.rint(100 + 60 * np.sin(x / 60 * np.pi * 2))
        expected_g = np.rint(y / 30 * 180)
        self.assertLessEqual(np.max(np.abs(result[:, :, 0].astype(float) - expected_r[None, :])), 1)
        self.assertLessEqual(np.max(np.abs(result[:, :, 1].astype(float) - expected_g[:, None])), 1)
        self.assertTrue(np.all(result[:, :, 2] == 80))
        self.assertLessEqual(len(cache.images), 4)

    def test_gutters_wrap_longitude_and_repeat_edge_latitude(self):
        sections, width, height, cache = self.sections()
        whole = export.tile_pixels(sections, cache, width, height, 120, 60, 0, 0, 120, 0)
        tile = export.tile_pixels(sections, cache, width, height, 120, 60, 0, 0, 32, 2)
        xs = np.arange(-2, 34) % 120
        ys = np.clip(np.arange(-2, 34), 0, 59)
        expected = whole[np.ix_(ys, xs)]
        np.testing.assert_array_equal(tile, expected)

    def test_validity_mask_and_taller_repair_remove_bad_strip(self):
        sections, width, height, cache = self.sections(repair=True, corrupt=True)
        result = export.render_region(sections, cache, width, height, np.linspace(29, 41, 300), np.linspace(14, 25, 300))
        self.assertLessEqual(np.max(np.abs(result.astype(float) - 100)), 1)

    def test_uncovered_masked_strip_is_rejected_instead_of_exported(self):
        sections, width, height, cache = self.sections(repair=False, corrupt=True)
        with self.assertRaisesRegex(ValueError, "uncovered pixels"):
            export.render_region(sections, cache, width, height, np.array([35.0]), np.array([17.5]))

    def test_lower_levels_filter_high_frequency_detail_before_sampling(self):
        pixels = np.zeros((256, 256, 3), dtype=np.uint8)
        pixels[:, np.arange(256) % 4 < 2] = 255
        path = self.root / "stripes.png"
        Image.fromarray(pixels).save(path)
        section = export.Section(0, 0, 0, (0, 0, 1, 2), (0, 0, 1, 2), path)
        cache = export.ImageCache(4, 256)
        # This phase aliases to a dark stripe without prefiltering. A twice-
        # as-tall source extent also exercises independent axis scaling.
        result = export.render_region([section], cache, 2, 2,
            (np.arange(8) + .2) / 8, (np.arange(8) + .5) / 8)
        self.assertLessEqual(np.max(np.abs(result[:, 2:-2].astype(float) - 127.5)), 2)
        self.assertEqual(next(iter(cache.images.values())).shape, (16, 8, 3))

    def test_upload_grid_and_public_manifest_have_expected_dimensions(self):
        slots = []
        for width in export.DEFAULT_LEVELS:
            for y in range((width // 2) // 1024):
                for x in range(width // 1024):
                    slots.append({"level": width, "width": width, "height": width // 2, "x": x, "y": y,
                        "media_id": f"{width}-{x}-{y}", "url": f"https://cdn.example/{width}/{x}-{y}.jpg",
                        "upload_url": f"https://upload.example/{width}/{x}-{y}?private=secret", "content_type": "image/jpeg"})
        path = self.root / "uploads.json"
        path.write_text(json.dumps(slots))
        validated = export.load_uploads(path, export.DEFAULT_LEVELS)
        self.assertEqual(len(validated), 312)
        manifest = export.manifest_for(validated, export.DEFAULT_LEVELS, 1024, 2)
        self.assertEqual([len(level["tiles"]) for level in manifest["levels"]], [8, 32, 72, 200])
        self.assertNotIn("private", json.dumps(manifest))
        self.assertNotIn("upload_url", json.dumps(manifest))
        slots.pop()
        path.write_text(json.dumps(slots))
        with self.assertRaisesRegex(ValueError, "incomplete"):
            export.load_uploads(path, export.DEFAULT_LEVELS)


if __name__ == "__main__":
    unittest.main()
