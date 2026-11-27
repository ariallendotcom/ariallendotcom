# Room detail pipeline (staged)

The original 1774 × 887 panorama only provides about 197 vertical pixels within a 40° vertical field of view. A 3840 × 2160 display needs roughly a 20K × 10K panorama at that zoom. The existing Gaussian color buffer is also too small to carry this detail by itself.

`detail-room.js` separates image detail from geometry. It selects visible texture tiles and a suitable pyramid level, uploads them with mipmaps and anisotropy, and evicts unused textures within a bounded GPU budget. Ordinary viewing uses spherical patches. Optional depth follows `depthRoom.depthAt`, omitting triangles across large depth discontinuities. Complete tile coverage hides the softer Gaussian layer; the original panorama remains behind any geometric gaps.

## Status

Renderer and integration are staged, not deployed. The higher-resolution image assets and `room/detail/room-detail.json` have **not** been generated. The image generation tool returned 1774 × 887 even when requested to generate 8192 × 4096. A different resolution enhancement tool is awaiting the user's choice. Do not publish the integration as a finished resolution improvement without real high-resolution assets and visual verification at maximum zoom.

## Asset contract

The manifest has `version: 1` and a `levels` array. Each level supplies `width`, `height`, `tileSize`, optional `gutter`, and a complete `tiles` array of `{x, y, url}` records. Dimensions must be 2:1; tiles on the right and bottom edges may be partial. Tile images must match their core dimensions plus two gutters. Recommended pyramid widths are 4096, 8192, 16384, and 20480, with 1024- or 2048-pixel tile cores and 2-pixel gutters. Verify the final tile count and memory behavior using the actual viewport before release.

Proposed generative-detail pass: 18 overlapping source sections (6 × 3), enhanced to 4K per section, aligned and blended back into an approximately 20K panorama, then cut into the pyramid. The quoted alternative enhancer price was 2 credits per section, 36 credits for 18 sections; no enhancement jobs have been submitted. Inspect a central plant/book/portrait section first before submitting the remaining sections.

All source images are illustrative artwork, and newly synthesized details are permitted by the user. Preserve the room layout and major object boundaries so existing depth and hotspots remain aligned. Rebuild depth if the final composition shifts materially.

## Validation

```sh
node --test room/detail-math.test.mjs room/detail-room.test.mjs room/depth-room.test.mjs room/depth-camera.test.mjs room/head-tracking.test.mjs room/room-entry.test.mjs
```

56 checks currently pass. Browser validation still required: max zoom sharpness across tile boundaries; neutral and shifted depth views; desktop and phone memory budgets; cancellation on scene changes; original-view restoration; camera consent remains explicit.
