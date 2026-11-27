# Optional room depth

This preview renders actual anisotropic Gaussian splats from the original room artwork and inferred monocular depth. It is a reconstruction of visible surfaces, not a multiview scan; camera translation is deliberately small because unseen surfaces cannot be recovered from this artwork.

The original panorama remains the default and fallback. Nothing from a visitor's camera is used to generate room geometry. Head tracking remains a separate, explicit opt-in; the eight-second movement preview needs no camera.

## Assets and reproduction

- Color: `../room-panorama.png`, 1774 × 887. The original artwork preserves its detail better than the generated enhancement candidate; `room-enhanced.jpg` is retained for comparison only and is not loaded by the site.
- Depth: [packed 16-bit PNG](https://d2ol7oe51mr4n9.cloudfront.net/user_3J1s5NXUJSOKNxW7VLoOfMiwAOh/8cb5c7a0-6bf5-4830-9a4e-576a6aacac52.png), 1774 × 887. Red is the high byte, green the low byte, blue is zero. Decode before interpolation.
- Depth model: [Depth Anything V2 Small](https://github.com/DepthAnything/Depth-Anything-V2), Apache-2.0. Larger model variants are not used.
- Pipeline: `tools/build-room-depth.py`. Panorama anchor plus six perspective projections; five views passed alignment and contributed to this output. Values are relative inverse depth mapped to artistic scene distances 2.5–8, not measured metres.
- Renderer: [Spark 2.4.0](https://sparkjs.dev/), loaded only after the visitor selects depth. High detail uses 1,573,538 Gaussian splats; small screens use 294,912. Color detail is limited by the source image; this is not native 4K imagery.

Example after installing the model's documented dependencies and downloading the small checkpoint:

```sh
python tools/build-room-depth.py --image room/room-panorama.png --output room/depth/room-depth.png --model-repo /path/to/Depth-Anything-V2 --checkpoint /path/to/depth_anything_v2_vits.pth
node --test room/depth-room.test.mjs room/depth-camera.test.mjs room/head-tracking.test.mjs room/room-entry.test.mjs
```

The static depth PNG is served from the media CDN with CORS enabled. A failed dependency/image load leaves the ordinary room available. Depth and camera consent are never persisted across visits.
