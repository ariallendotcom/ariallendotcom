#!/usr/bin/env python3
"""Assemble approved enhanced room sections into a bounded-memory tile pyramid.

This is an exporter, not a generation tool. Upload slots must be acquired before
running it. Each produced JPEG is PUT to its slot by this same process and a
successful HTTP 200 is checkpointed before continuing. Receipts contain public
URLs and hashes only, never presigned upload credentials.

Section bounds are source-image *edge* coordinates, matching PIL EXTENT. Output
pixel centres are inverse-mapped into each enhanced image; overlapping sections
blend with linear margin ramps. Longitude wraps and latitude clamps.
"""
from __future__ import annotations

import argparse
from collections import OrderedDict
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
import sys

import numpy as np
from PIL import Image


RECIPE_VERSION = 2
DEFAULT_LEVELS = (4096, 8192, 12288, 20480)


def timestamp():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    with temporary.open("w", encoding="utf-8") as handle:
        json.dump(value, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)


def file_hash(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def rectangle(value, name):
    if isinstance(value, dict):
        value = [value[key] for key in ("x0", "y0", "x1", "y1")]
    if not isinstance(value, (list, tuple)) or len(value) != 4:
        raise ValueError(f"{name} needs four coordinates")
    result = tuple(float(item) for item in value)
    if not all(math.isfinite(item) for item in result) or result[2] <= result[0] or result[3] <= result[1]:
        raise ValueError(f"Invalid {name}")
    return result


def trapezoid(value, name):
    if value is None:
        return None
    if not isinstance(value, (list, tuple)) or len(value) != 4:
        raise ValueError(f"{name} needs [min, minFadeEnd, maxFadeStart, max]")
    result = tuple(float(item) for item in value)
    if not all(math.isfinite(item) for item in result) or not all(a <= b for a, b in zip(result, result[1:])):
        raise ValueError(f"Invalid {name}")
    return result


@dataclass(frozen=True)
class Section:
    index: int
    column: int
    row: int
    bounds: tuple
    core: tuple
    path: Path
    valid_y: tuple | None = None
    valid_x: tuple | None = None


def load_sections(path, images_dir=None):
    path = Path(path)
    payload = json.loads(path.read_text())
    defaults = payload if isinstance(payload, dict) else {}
    records = defaults.get("sections", []) if isinstance(payload, dict) else payload
    if not isinstance(records, list) or not records:
        raise ValueError("sections.json must be a nonempty list or {sections:[...]}")
    width = float(defaults.get("sourceWidth", defaults.get("source_width", records[0].get("sourceWidth", 1774))))
    height = float(defaults.get("sourceHeight", defaults.get("source_height", records[0].get("sourceHeight", 887))))
    if width <= 0 or height <= 0 or not math.isfinite(width + height):
        raise ValueError("Invalid source dimensions")
    columns = int(defaults.get("columns", max(int(r.get("col", r.get("column", r.get("x", 0)))) for r in records) + 1))
    rows = int(defaults.get("rows", max(int(r.get("row", r.get("y", 0))) for r in records) + 1))
    directory = Path(images_dir) if images_dir else path.parent
    sections, identifiers, coordinates = [], set(), set()
    for order, record in enumerate(records):
        index = int(record.get("index", order))
        column = int(record.get("col", record.get("column", record.get("x", index % columns))))
        row = int(record.get("row", record.get("y", index // columns)))
        if index in identifiers or (column, row) in coordinates or not 0 <= column < columns or not 0 <= row < rows:
            raise ValueError("Duplicate or invalid section index/grid coordinate")
        if float(record.get("sourceWidth", width)) != width or float(record.get("sourceHeight", height)) != height:
            raise ValueError("Sections disagree on source dimensions")
        identifiers.add(index)
        coordinates.add((column, row))
        bounds = rectangle(record.get("bounds", record), f"section {index} bounds")
        core = rectangle(record.get("coreBounds", record.get("core_bounds", [column * width / columns, row * height / rows,
            (column + 1) * width / columns, (row + 1) * height / rows])), f"section {index} core")
        if any((core[0] < bounds[0], core[1] < bounds[1], core[2] > bounds[2], core[3] > bounds[3])):
            raise ValueError(f"Section {index} core lies outside its padded bounds")
        filename = record.get("enhancedPath", record.get("enhanced_path", record.get("path", f"enhancement-{index}.png")))
        image_path = Path(filename)
        if not image_path.is_absolute():
            image_path = directory / image_path
        if not image_path.is_file():
            raise FileNotFoundError(f"Section {index} image is missing: {image_path}")
        sections.append(Section(index, column, row, bounds, core, image_path,
            trapezoid(record.get("validY", record.get("valid_y")), f"section {index} validY"),
            trapezoid(record.get("validX", record.get("valid_x")), f"section {index} validX")))
    if len(coordinates) != columns * rows:
        raise ValueError("Section grid is incomplete")
    return sorted(sections, key=lambda section: section.index), width, height


class ImageCache:
    """At most four decoded RGB inputs (~192 MiB for 4096px squares)."""
    def __init__(self, limit=4, expected_size=4096):
        self.limit = limit
        self.expected_size = expected_size
        self.images = OrderedDict()
        self.decodes = 0

    def get(self, path, sample_size=None):
        # A lower pyramid level needs a low-pass filter before subsampling.
        # Preserve each source extent; changing only its pixel count keeps the
        # same EXTENT centre mapping, including non-square repair sections.
        key = (str(path), tuple(sample_size) if sample_size else None)
        if key in self.images:
            self.images.move_to_end(key)
            return self.images[key]
        # Evict BEFORE decoding, including the temporary Pillow RGB buffer.
        while len(self.images) >= self.limit:
            self.images.popitem(last=False)
        with Image.open(path) as source:
            if self.expected_size and source.size != (self.expected_size, self.expected_size):
                raise ValueError(f"Enhanced input has unexpected dimensions: {Path(path).name} {source.size}")
            converted = source.convert("RGB")
            if sample_size:
                size = tuple(max(1, min(actual, requested)) for actual, requested in zip(converted.size, sample_size))
                if size != converted.size:
                    resized = converted.resize(size, Image.Resampling.LANCZOS)
                    converted.close()
                    converted = resized
            result = np.asarray(converted)
            converted.close()
        self.images[key] = result
        self.decodes += 1
        return result


def interval_weight(values, low, core_low, core_high, high):
    weight = np.ones(values.shape, dtype=np.float32)
    if core_low > low:
        weight = np.minimum(weight, (values - low) / (core_low - low))
    else:
        weight = np.where(values >= low, weight, 0)
    if high > core_high:
        weight = np.minimum(weight, (high - values) / (high - core_high))
    else:
        weight = np.where(values <= high, weight, 0)
    return np.clip(weight, 0, 1).astype(np.float32)


def bilinear(image, x, y):
    """Separable centre coordinates, clamped to the enhanced image's edge."""
    x = np.clip(x, 0, image.shape[1] - 1)
    y = np.clip(y, 0, image.shape[0] - 1)
    x0 = np.floor(x).astype(np.int32)
    y0 = np.floor(y).astype(np.int32)
    x1 = np.minimum(x0 + 1, image.shape[1] - 1)
    y1 = np.minimum(y0 + 1, image.shape[0] - 1)
    tx = (x - x0).astype(np.float32)[None, :, None]
    ty = (y - y0).astype(np.float32)[:, None, None]
    top = image[y0[:, None], x0[None, :]].astype(np.float32)
    top *= 1 - tx
    top += image[y0[:, None], x1[None, :]].astype(np.float32) * tx
    bottom = image[y1[:, None], x0[None, :]].astype(np.float32)
    bottom *= 1 - tx
    bottom += image[y1[:, None], x1[None, :]].astype(np.float32) * tx
    top *= 1 - ty
    top += bottom * ty
    return top


def sample_spacing(values, period=None):
    """Smallest real sample step, ignoring wrapped or clamped gutter repeats."""
    differences = np.abs(np.diff(values))
    if period:
        differences %= period
        differences = np.minimum(differences, period - differences)
    positive = differences[differences > 1e-9]
    return float(positive.min()) if positive.size else None


def render_region(sections, cache, source_width, source_height, world_x, world_y):
    """Render a small rectilinear region in equirectangular source coordinates."""
    world_x = np.asarray(world_x, dtype=np.float64)
    world_y = np.asarray(world_y, dtype=np.float64)
    step_x = sample_spacing(world_x, source_width)
    step_y = sample_spacing(world_y)
    accumulated = np.zeros((len(world_y), len(world_x), 3), dtype=np.float32)
    weights = np.zeros((len(world_y), len(world_x)), dtype=np.float32)
    for section in sections:
        x0, y0, x1, y1 = section.bounds
        cx0, cy0, cx1, cy1 = section.core
        centre_x = (x0 + x1) * .5
        # Select the periodic copy nearest this section's actual padded bounds.
        local_x = world_x - np.floor((world_x - centre_x) / source_width + .5) * source_width
        wx = interval_weight(local_x, x0, cx0, cx1, x1)
        wy = interval_weight(world_y, y0, cy0, cy1, y1)
        if section.valid_x:
            wx *= interval_weight(local_x, *section.valid_x)
        if section.valid_y:
            wy *= interval_weight(world_y, *section.valid_y)
        ix = np.flatnonzero(wx > 0)
        iy = np.flatnonzero(wy > 0)
        if not len(ix) or not len(iy):
            continue
        sample_size = None
        if step_x and step_y:
            # Avoid a floating-point ulp changing the cached image size between
            # adjacent tiles at an exactly integral downsampling ratio.
            sample_size = tuple(math.ceil(span / step * (1 - 1e-10))
                for span, step in ((x1 - x0, step_x), (y1 - y0, step_y)))
        image = cache.get(section.path, sample_size)
        # PIL EXTENT samples at pixel centres. Do not round section boundaries.
        sample_x = (local_x[ix] - x0) / (x1 - x0) * image.shape[1] - .5
        sample_y = (world_y[iy] - y0) / (y1 - y0) * image.shape[0] - .5
        sampled = bilinear(image, sample_x, sample_y)
        weight = wy[iy, None] * wx[None, ix]
        at = np.ix_(iy, ix)
        accumulated[at] += sampled * weight[:, :, None]
        weights[at] += weight
    missing = weights <= 1e-8
    if missing.any():
        y, x = np.argwhere(missing)[0]
        raise ValueError(f"Enhanced sections leave uncovered pixels near source ({world_x[x]:.6f}, {world_y[y]:.6f})")
    accumulated /= weights[:, :, None]
    return np.clip(np.rint(accumulated), 0, 255).astype(np.uint8)


def tile_pixels(sections, cache, source_width, source_height, width, height, x, y, tile_size=1024, gutter=2):
    core_width = min(tile_size, width - x * tile_size)
    core_height = min(tile_size, height - y * tile_size)
    if core_width <= 0 or core_height <= 0:
        raise ValueError("Tile lies outside its level")
    horizontal = np.arange(x * tile_size - gutter, x * tile_size + core_width + gutter)
    vertical = np.arange(y * tile_size - gutter, y * tile_size + core_height + gutter)
    world_x = ((horizontal % width) + .5) * source_width / width
    world_y = (np.clip(vertical, 0, height - 1) + .5) * source_height / height
    return render_region(sections, cache, source_width, source_height, world_x, world_y)


def load_uploads(path, levels, tile_size=1024):
    payload = json.loads(Path(path).read_text())
    records = payload if isinstance(payload, list) else payload.get("uploads", payload.get("slots", payload.get("tiles", [])))
    slots = {}
    for record in records:
        width = int(record.get("width", record.get("level", 0)))
        height = int(record.get("height", width // 2))
        x, y = int(record["x"]), int(record["y"])
        key = f"{width}/{x}/{y}"
        if width not in levels or height != width // 2 or width % 2 or key in slots:
            raise ValueError("Invalid or duplicate upload tile slot")
        if not 0 <= x < math.ceil(width / tile_size) or not 0 <= y < math.ceil(height / tile_size):
            raise ValueError("Upload slot lies outside its level")
        if not all(isinstance(record.get(field), str) and record[field] for field in ("media_id", "url", "upload_url")):
            raise ValueError("Upload slot needs media_id, public url, and upload_url")
        if not record["url"].startswith("https://") or not record["upload_url"].startswith("https://"):
            raise ValueError("Upload slots must use HTTPS")
        if record.get("content_type", "image/jpeg") != "image/jpeg":
            raise ValueError("JPEG slots must be signed for image/jpeg")
        slots[key] = {**record, "width": width, "height": height, "x": x, "y": y, "content_type": "image/jpeg"}
    expected = {f"{width}/{x}/{y}" for width in levels for y in range(math.ceil((width // 2) / tile_size)) for x in range(math.ceil(width / tile_size))}
    if set(slots) != expected:
        raise ValueError(f"Upload grid is incomplete: expected {len(expected)}, received {len(slots)}")
    return slots


def put_tile(path, slot):
    # An identical PUT is idempotent. Curl retries transient transport/server
    # failures; neither generation jobs nor additional upload slots are created.
    command = ["curl", "--fail", "--silent", "--show-error", "--location", "--retry", "2", "--retry-delay", "1",
        "--connect-timeout", "15", "--max-time", "90", "--request", "PUT", "--header", "Content-Type: image/jpeg",
        "--upload-file", str(path), "--output", os.devnull, "--write-out", "%{http_code}", slot["upload_url"]]
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=300)
    except subprocess.TimeoutExpired:
        # TimeoutExpired's default text contains the command and signed URL.
        raise RuntimeError("Tile upload timed out") from None
    code = result.stdout.strip()
    if result.returncode != 0 or code != "200":
        raise RuntimeError(f"Tile upload failed: HTTP {code[-3:] or 'unknown'}, curl exit {result.returncode}")
    return 200


def morton(x, y):
    value = 0
    for bit in range(max(x.bit_length(), y.bit_length())):
        value |= ((x >> bit) & 1) << (bit * 2)
        value |= ((y >> bit) & 1) << (bit * 2 + 1)
    return value


def manifest_for(slots, levels, tile_size, gutter):
    return {"version": 1, "levels": [{"width": width, "height": width // 2, "tileSize": tile_size, "gutter": gutter,
        "tiles": [{"x": slot["x"], "y": slot["y"], "url": slot["url"]} for slot in sorted(slots.values(), key=lambda s: (s["y"], s["x"])) if slot["width"] == width]}
        for width in levels]}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--sections", required=True)
    parser.add_argument("--images-dir")
    parser.add_argument("--output-dir", default="room-detail-export")
    parser.add_argument("--uploads", help="Pre-acquired complete upload slots; required outside preview mode")
    parser.add_argument("--manifest")
    parser.add_argument("--receipt")
    parser.add_argument("--levels", default=",".join(map(str, DEFAULT_LEVELS)))
    parser.add_argument("--tile-size", type=int, default=1024)
    parser.add_argument("--gutter", type=int, default=2)
    parser.add_argument("--quality", type=int, default=94)
    parser.add_argument("--expected-input-size", type=int, default=4096)
    parser.add_argument("--max-tiles", type=int, help="Limit this invocation; rerun with the same receipt to continue")
    parser.add_argument("--preview", metavar="JPEG", help="Internal QA only: write one image and do not upload tiles")
    parser.add_argument("--preview-region", nargs=4, type=float, metavar=("X0", "Y0", "X1", "Y1"))
    parser.add_argument("--preview-size", nargs=2, type=int, default=[1024, 512], metavar=("W", "H"))
    args = parser.parse_args()
    sections, source_width, source_height = load_sections(args.sections, args.images_dir)
    cache = ImageCache(4, args.expected_input_size or None)
    if args.preview:
        pw, ph = args.preview_size
        if min(pw, ph) < 1 or max(pw, ph) > 2048:
            parser.error("Preview dimensions must be between 1 and 2048")
        x0, y0, x1, y1 = rectangle(args.preview_region or [0, 0, source_width, source_height], "preview region")
        wx = ((np.arange(pw) + .5) / pw * (x1 - x0) + x0) % source_width
        wy = np.clip((np.arange(ph) + .5) / ph * (y1 - y0) + y0, 0, source_height)
        image = render_region(sections, cache, source_width, source_height, wx, wy)
        output = Path(args.preview)
        output.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(image).save(output, "JPEG", quality=min(args.quality, 88), subsampling=0)
        print(json.dumps({"preview": str(output), "width": pw, "height": ph, "bytes": output.stat().st_size, "decodes": cache.decodes}))
        return
    if not args.uploads:
        parser.error("--uploads is required for the producing/uploading run")
    levels = sorted({int(value) for value in args.levels.split(",")})
    if any(width < 2 or width > 65536 or width % 2 for width in levels) or not levels:
        parser.error("Levels must be positive even widths up to 65536")
    if not 1 <= args.tile_size <= 2048 or not 0 <= args.gutter <= 16 or not 80 <= args.quality <= 100:
        parser.error("Invalid tile size, gutter, or JPEG quality")
    if args.max_tiles is not None and args.max_tiles < 1:
        parser.error("--max-tiles must be positive")
    slots = load_uploads(args.uploads, levels, args.tile_size)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    receipt_path = Path(args.receipt) if args.receipt else output_dir / "room-detail-receipt.json"
    manifest_path = Path(args.manifest) if args.manifest else output_dir / "room-detail.json"
    recipe = {"version": RECIPE_VERSION, "sourceWidth": source_width, "sourceHeight": source_height,
        "tileSize": args.tile_size, "gutter": args.gutter, "quality": args.quality, "levels": levels,
        "sections": [{"index": s.index, "bounds": s.bounds, "core": s.core, "validY": s.valid_y, "validX": s.valid_x,
            "sha256": file_hash(s.path)} for s in sections],
        "slots": {key: {"media_id": slot["media_id"], "url": slot["url"]} for key, slot in sorted(slots.items())}}
    recipe_hash = hashlib.sha256(json.dumps(recipe, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    if receipt_path.exists():
        receipt = json.loads(receipt_path.read_text())
        if receipt.get("version") != 1 or receipt.get("recipeHash") != recipe_hash:
            raise ValueError("Existing receipt belongs to different inputs/configuration/slots; use a new output directory")
    else:
        receipt = {"version": 1, "recipeHash": recipe_hash, "startedAt": timestamp(), "updatedAt": timestamp(), "complete": False, "tiles": {}}
        atomic_json(receipt_path, receipt)
    produced = 0
    ordered = sorted(slots.items(), key=lambda item: (item[1]["width"], morton(item[1]["x"], item[1]["y"])))
    for key, slot in ordered:
        saved = receipt["tiles"].get(key)
        if saved and saved.get("httpStatus") == 200 and saved.get("media_id") == slot["media_id"] and saved.get("url") == slot["url"]:
            continue
        if args.max_tiles and produced >= args.max_tiles:
            break
        pixels = tile_pixels(sections, cache, source_width, source_height, slot["width"], slot["height"], slot["x"], slot["y"], args.tile_size, args.gutter)
        tile_path = output_dir / str(slot["width"]) / f"{slot['x']}-{slot['y']}.jpg"
        tile_path.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(pixels).save(tile_path, "JPEG", quality=args.quality, subsampling=0)
        del pixels
        code = put_tile(tile_path, slot)
        receipt["tiles"][key] = {"media_id": slot["media_id"], "url": slot["url"], "httpStatus": code,
            "sha256": file_hash(tile_path), "bytes": tile_path.stat().st_size, "uploadedAt": timestamp()}
        receipt["updatedAt"] = timestamp()
        atomic_json(receipt_path, receipt)
        produced += 1
        print(json.dumps({"tile": key, "httpStatus": 200, "completed": len(receipt["tiles"]), "total": len(slots)}), flush=True)
    receipt["complete"] = all(key in receipt["tiles"] and receipt["tiles"][key].get("httpStatus") == 200 for key in slots)
    receipt["updatedAt"] = timestamp()
    atomic_json(receipt_path, receipt)
    if receipt["complete"]:
        atomic_json(manifest_path, manifest_for(slots, levels, args.tile_size, args.gutter))
    print(json.dumps({"complete": receipt["complete"], "completed": len(receipt["tiles"]), "total": len(slots),
        "receipt": str(receipt_path), "manifest": str(manifest_path) if receipt["complete"] else None, "producedThisRun": produced, "decodes": cache.decodes}), flush=True)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, RuntimeError, subprocess.SubprocessError) as failure:
        print(f"Room detail export failed: {failure}", file=sys.stderr, flush=True)
        sys.exit(1)
