# Optional room depth

This preview renders anisotropic Gaussian splats from room artwork and inferred monocular depth. It reconstructs visible surfaces rather than a multiview scan; camera translation is deliberately small because unseen surfaces cannot be recovered from this artwork. The artwork includes newly synthesized detail from 18 overlapping 4096 × 4096 enhancements, assembled into a 20,480 × 10,240 texture pyramid. It is not a native photographic 4K capture, and zoom is limited to a 40° vertical field of view.

The ordinary panorama remains the default and fallback. Nothing from a visitor's camera is used to generate room geometry. Head tracking remains a separate, explicit opt-in; the eight-second movement preview needs no camera. Enhancement generation, all 312 tile uploads, and browser preview checks are complete. The homepage enables the progressive high-resolution imagery; depth and camera tracking remain explicit opt-ins.

## Assets and reproduction

- Base color: `../detail/room-source.jpg`, 1774 × 887. This supplies the fallback panorama and Gaussian color samples. The original `../room-panorama.png` is retained for rollback; `room-enhanced.jpg` is an earlier comparison asset and is not loaded.
- High-resolution color: 312 JPEG tiles at quality 94, with 1024-pixel cores and 2-pixel gutters. Pyramid widths are 4096, 8192, 12288, and 20480, each with half-height. See `../DETAIL.md` for generation and assembly records.
- Depth: [packed 16-bit PNG](https://d2ol7oe51mr4n9.cloudfront.net/user_3J1s5NXUJSOKNxW7VLoOfMiwAOh/b4c3475b-15b7-431c-a817-1f5cf2b73051.png), 1774 × 887, rebuilt from `../detail/room-source.jpg`. Red is the high byte, green the low byte, blue is zero. Decode before interpolation.
- Depth model: [Depth Anything V2 Small](https://github.com/DepthAnything/Depth-Anything-V2), Apache-2.0. Larger model variants are not used.
- Pipeline: `tools/build-room-depth.py`. A panorama anchor and aligned perspective projections infer relative inverse depth, mapped to artistic scene distances 2.5–8 rather than measured metres.
- Renderer: [Spark 2.4.0](https://sparkjs.dev/), loaded only after the visitor selects depth. The 1774 × 887 high-detail color buffer produces 1,573,538 Gaussian splats; small screens use 294,912. The panorama and splats render first. High-resolution texture patches render last in a separate scene after clearing only depth, preserving their sharpness and mutual occlusion. The existing color remains underneath their geometry gaps.
- Texture memory: 160 MiB on desktop, 80 MiB on small screens, with lower levels selected when necessary. Device pixel ratio is capped at 2 and further bounded to an approximately 4K drawing buffer (8,388,608 pixels).

Example after installing the model's documented dependencies and downloading the small checkpoint:

```sh
python tools/build-room-depth.py --image room/detail/room-source.jpg --output room/depth/room-depth.png --model-repo /path/to/Depth-Anything-V2 --checkpoint /path/to/depth_anything_v2_vits.pth
node --test room/depth-room.test.mjs room/depth-camera.test.mjs room/head-tracking.test.mjs room/room-entry.test.mjs
```

The static depth PNG is served from the media CDN with CORS enabled. A failed dependency/image load leaves the ordinary room available. Depth and camera consent are never persisted across visits.
