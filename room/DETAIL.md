# Room detail pipeline

The 1774 × 887 source panorama is generated artwork. Eighteen overlapping sections have been enhanced to 4096 × 4096 with the user's permission to invent convincing detail. They form a 20,480 × 10,240 texture pyramid. This adds synthesized detail; it does not recover a native photographic 4K source or support unlimited zoom. The room's closest view remains a 40° vertical field of view.

## Status

All 18 enhancement jobs completed within the approved 36-credit budget. All 312 JPEG tiles uploaded with HTTP 200 and were confirmed; asset hashes and byte counts are in `detail/asset-receipt.json`. Browser checks covered maximum zoom with a 3840 × 2160 drawing buffer, ordinary and optional depth views, the camera-free movement preview, a 390 × 844 phone layout, and return navigation from About. Generation records are in `detail/generation-receipt.json`. The homepage loads the `detail-3` implementation.

## Rendering and limits

`detail-room.js` selects visible texture tiles and a suitable pyramid level, applies mipmaps and anisotropy, and retains coarser cached patches while finer tiles load. Texture budgets, including mipmaps and pending reservations, are 160 MiB on desktop and 80 MiB on small screens. The drawing-buffer pixel ratio is capped at 2 and reduced as needed to keep the buffer within 8,388,608 pixels, approximately 4K. Resolution can step down when a device's budget requires it.

Ordinary viewing uses spherical patches. Optional depth follows `depthRoom.depthAt`, omitting triangles across large depth discontinuities. The panorama and Gaussian gap fill render first. A second scene clears only depth and draws the opaque high-resolution patches last, with their own depth testing; the Gaussian color stays beneath uncovered geometry. This prevents soft splats from washing over sharp textures. Complete texture coverage does not imply complete surface geometry, so it must not hide the Gaussian layer. The base panorama remains the last fallback.

## Asset contract and reproduction

The manifest has `version: 1` and a `levels` array. Each level supplies `width`, `height`, `tileSize`, `gutter`, and a complete `tiles` array of `{x, y, url}` records. Current output uses 1024-pixel cores, 2-pixel gutters on every side, and JPEG quality 94 with no chroma subsampling. Each current tile image is 1028 × 1028.

| Panorama dimensions | Tiles |
| --- | ---: |
| 4096 × 2048 | 8 |
| 8192 × 4096 | 32 |
| 12288 × 6144 | 72 |
| 20480 × 10240 | 200 |
| Total | 312 |

`tools/build-room-detail.py` consumes section metadata and the 18 enhanced images. It maps source-space pixel centres without rounding crop boundaries, blends overlapping margins, wraps longitude, and clamps latitude. Scale-aware LANCZOS filtering prevents lower pyramid levels from aliasing. The decoded-image cache holds at most four entries. All 312 upload slots must be supplied before production; each JPEG is produced and uploaded in the same run, with HTTP 200 checkpointed in a resumable receipt. The public manifest is written only after every upload succeeds.

The source is `detail/room-source.jpg`; `room-panorama.png` is retained for rollback. Standard sections use a 6 × 3 grid with 32-source-pixel margins. Pilot section 9 had a source-transfer defect: its `validY` mask fades from full weight at y=472 to zero at y=480. Section 15 uses bounds `[855,440,1214.6666666666667,919]` and core bounds `[887,480,1182.6666666666667,887]` to replace that region. Independent x/y sampling preserves alignment for this taller crop. This repair used the same 18 jobs and required no extra credits.

Depth was rebuilt from the current source; see `depth/README.md`. Preserve room layout and object boundaries when regenerating assets so depth and hotspots remain aligned.

## Validation

```sh
python -m unittest tools/test_build_room_detail.py -v
node --test room/detail-math.test.mjs room/detail-room.test.mjs room/depth-room.test.mjs room/depth-camera.test.mjs room/head-tracking.test.mjs room/room-entry.test.mjs
```

Six Python tests and 60 JavaScript checks pass. Browser validation covered maximum-zoom sharpness, visible seam continuity, neutral and previewed depth movement, phone layout, and navigation back to the room. Actual webcam tracking was not activated during this image-quality pass; its consent, cancellation, and resource-release behavior is covered by the existing automated tests. A full 4K ordinary-view screenshot is in `detail/qa-4k-ordinary.jpg`.
