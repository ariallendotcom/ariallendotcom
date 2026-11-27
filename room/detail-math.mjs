const PI = Math.PI;
const TAU = PI * 2;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

function positiveInteger(value, name, max = 65536) {
  if (!Number.isInteger(value) || value < 1 || value > max) throw new TypeError(`Invalid detail ${name}.`);
  return value;
}

function resolveTileUrl(value, baseUrl) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError('Every detail tile needs a URL.');
  const url = value.trim();
  // Tile data is fetched as an image. Keep manifests from introducing an
  // executable URL scheme even if a future consumer uses another loader.
  if (/^[a-z][a-z\d+.-]*:/i.test(url) && !/^https?:/i.test(url)) throw new TypeError('Unsupported detail tile URL.');
  return baseUrl ? new URL(url, baseUrl).href : url;
}

/** Normalize a complete equirectangular tile grid; no network or browser use. */
export function normalizeDetailManifest(manifest, {baseUrl} = {}) {
  if (!manifest || typeof manifest !== 'object') throw new TypeError('A detail manifest is required.');
  if (manifest.version != null && manifest.version !== 1) throw new TypeError('Unsupported detail manifest version.');
  const suppliedLevels = manifest.levels ?? [manifest];
  if (!Array.isArray(suppliedLevels) || !suppliedLevels.length || suppliedLevels.length > 12) throw new TypeError('Invalid detail levels.');
  const widths = new Set();
  const levels = suppliedLevels.map(input => {
    if (!input || typeof input !== 'object') throw new TypeError('Invalid detail level.');
    const width = positiveInteger(input.width, 'width');
    const height = positiveInteger(input.height, 'height');
    const tileSize = positiveInteger(input.tileSize ?? manifest.tileSize, 'tile size', 8192);
    if (Math.abs(width / height - 2) > .01) throw new TypeError('Detail levels must be 2:1 equirectangular panoramas.');
    if (widths.has(width)) throw new TypeError('Duplicate detail level resolution.');
    widths.add(width);
    const columns = Math.ceil(width / tileSize), rows = Math.ceil(height / tileSize);
    if (columns * rows > 4096) throw new TypeError('Too many detail tiles.');
    if (!Array.isArray(input.tiles) || input.tiles.length !== columns * rows) throw new TypeError('Detail tile grid is incomplete.');
    const seen = new Set();
    const tiles = input.tiles.map(record => {
      const x = record?.x, y = record?.y;
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= columns || y >= rows) throw new TypeError('Invalid detail tile coordinate.');
      const key = `${x}:${y}`;
      if (seen.has(key)) throw new TypeError('Duplicate detail tile coordinate.');
      seen.add(key);
      const gutter = record.gutter ?? input.gutter ?? manifest.gutter ?? 0;
      if (!Number.isInteger(gutter) || gutter < 0 || gutter > 64) throw new TypeError('Invalid detail tile gutter.');
      const pixelX = x * tileSize, pixelY = y * tileSize;
      const coreWidth = Math.min(tileSize, width - pixelX), coreHeight = Math.min(tileSize, height - pixelY);
      return {
        id: `${width}:${x}:${y}`, levelWidth: width, levelHeight: height,
        x, y, columns, rows, tileSize, coreWidth, coreHeight, gutter,
        textureWidth: coreWidth + gutter * 2, textureHeight: coreHeight + gutter * 2,
        u0: pixelX / width, v0: pixelY / height,
        u1: (pixelX + coreWidth) / width, v1: (pixelY + coreHeight) / height,
        url: resolveTileUrl(record.url, baseUrl)
      };
    }).sort((a, b) => a.y - b.y || a.x - b.x);
    return {width, height, tileSize, columns, rows, tiles};
  }).sort((a, b) => a.width - b.width);
  return {version: 1, levels};
}

function assertTile(tile) {
  if (!tile || ![tile.u0, tile.v0, tile.u1, tile.v1].every(Number.isFinite)
    || tile.u0 < 0 || tile.u1 > 1 || tile.v0 < 0 || tile.v1 > 1
    || tile.u1 <= tile.u0 || tile.v1 <= tile.v0) throw new TypeError('Invalid detail tile bounds.');
}

function ray(u, v, radius) {
  const longitude = u * TAU, latitude = (.5 - v) * PI, cosLatitude = Math.cos(latitude);
  return [Math.cos(longitude) * cosLatitude * radius, Math.sin(latitude) * radius, Math.sin(longitude) * cosLatitude * radius];
}

/**
 * Conservative sphere for frustum tests before constructing a patch. A radial
 * interval supports uncertain depth surfaces; a scalar is the ordinary sphere.
 * Angular path length bounds even very wide polar tiles without corner guesses.
 */
export function tileBounds(tile, radius = 10) {
  assertTile(tile);
  let near, far;
  if (typeof radius === 'number') near = far = radius;
  else {near = radius?.near; far = radius?.far;}
  if (![near, far].every(Number.isFinite) || near <= 0 || far < near) throw new TypeError('Invalid detail radial bounds.');
  const middle = (near + far) / 2;
  const center = ray((tile.u0 + tile.u1) / 2, (tile.v0 + tile.v1) / 2, middle);
  const angle = Math.min(PI, (tile.u1 - tile.u0) * PI + (tile.v1 - tile.v0) * PI / 2);
  const cosAngle = Math.cos(angle);
  const radiusAt = distance => Math.sqrt(Math.max(0, distance * distance + middle * middle - 2 * distance * middle * cosAngle));
  return {center, radius: Math.max(radiusAt(near), radiusAt(far)) + 1e-6};
}

/**
 * Exact maximum signed plane distance over a spherical equirectangular patch.
 * A loose bounding sphere overestimates wide/high-latitude patches; this tests
 * their actual curved extent without constructing geometry or sampling a grid.
 * `normal` is a three-element array (or typed array), and need not be unit length.
 */
export function maxTilePlaneDistance(tile, normal, constant = 0, radius = 10) {
  assertTile(tile);
  if ((!Array.isArray(normal) && !ArrayBuffer.isView(normal)) || normal.length !== 3
    || ![normal[0], normal[1], normal[2], constant, radius].every(Number.isFinite)
    || radius < 0) throw new TypeError('Invalid detail culling plane.');
  const [nx, ny, nz] = normal;
  const longitudeMin = tile.u0 * TAU, longitudeMax = tile.u1 * TAU;
  const latitudeMin = (.5 - tile.v1) * PI, latitudeMax = (.5 - tile.v0) * PI;
  const longitudes = [longitudeMin, longitudeMax];
  // cos(latitude) is nonnegative throughout an equirectangular image. The
  // longitude optimum therefore always maximizes nx*cos(lon)+nz*sin(lon).
  const peakLongitude = Math.atan2(nz, nx);
  for (let turn = -1; turn <= 1; turn++) {
    const longitude = peakLongitude + turn * TAU;
    if (longitude >= longitudeMin && longitude <= longitudeMax) longitudes.push(longitude);
  }
  let maximum = -Infinity;
  for (const longitude of longitudes) {
    const a = nx * Math.cos(longitude) + nz * Math.sin(longitude);
    const latitudes = [latitudeMin, latitudeMax];
    const peakLatitude = Math.atan2(ny, a);
    if (peakLatitude >= latitudeMin && peakLatitude <= latitudeMax) latitudes.push(peakLatitude);
    for (const latitude of latitudes) maximum = Math.max(maximum, a * Math.cos(latitude) + ny * Math.sin(latitude));
  }
  return radius * maximum + constant;
}

/**
 * Geometry is independent of texture resolution: a 2K or 4K tile can share the
 * same modest grid. UVs use v=0 at the image top (Texture.flipY must be false).
 * Winding faces inward. At depth discontinuities, omit crossing triangles so
 * the caller's panorama/Gaussian fallback fills the newly revealed gap instead
 * of drawing long rubbery strips between foreground and background.
 */
export function buildTileGeometryData(tile, {segments = 64, radius = 9.98, depthAt = null, edgeThreshold = .12} = {}) {
  assertTile(tile);
  if (!Number.isFinite(radius) || radius <= 0) throw new TypeError('Invalid detail radius.');
  if (!Number.isFinite(segments) || segments < 1) throw new TypeError('Invalid detail geometry resolution.');
  if (depthAt != null && typeof depthAt !== 'function') throw new TypeError('Invalid detail depth sampler.');
  if (!Number.isFinite(edgeThreshold) || edgeThreshold <= 0) throw new TypeError('Invalid detail edge threshold.');
  const coreWidth = tile.coreWidth ?? 1, coreHeight = tile.coreHeight ?? 1;
  const longest = Math.max(coreWidth, coreHeight);
  const budget = Math.min(128, Math.max(1, Math.floor(segments)));
  const segmentsX = Math.max(1, Math.round(budget * coreWidth / longest));
  const segmentsY = Math.max(1, Math.round(budget * coreHeight / longest));
  const stride = segmentsX + 1, count = stride * (segmentsY + 1);
  const positions = new Float32Array(count * 3), uvs = new Float32Array(count * 2), radii = new Float32Array(count);
  const validity = new Uint8Array(count), indices = [];
  const gutter = tile.gutter ?? 0;
  const textureWidth = tile.textureWidth ?? coreWidth + gutter * 2;
  const textureHeight = tile.textureHeight ?? coreHeight + gutter * 2;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let y = 0; y <= segmentsY; y++) for (let x = 0; x <= segmentsX; x++) {
    const sx = x / segmentsX, sy = y / segmentsY;
    const u = tile.u0 + (tile.u1 - tile.u0) * sx, v = tile.v0 + (tile.v1 - tile.v0) * sy;
    const sampledRadius = depthAt ? depthAt(u, v) : radius;
    const valid = Number.isFinite(sampledRadius) && sampledRadius > 0;
    // Invalid model samples never reach a position buffer as NaN, but their
    // triangles remain absent instead of inventing a depth measurement.
    const r = valid ? sampledRadius : radius, i = y * stride + x, p = ray(u, v, r);
    radii[i] = r; validity[i] = valid ? 1 : 0;
    for (let axis = 0; axis < 3; axis++) {
      positions[i * 3 + axis] = p[axis];
      min[axis] = Math.min(min[axis], p[axis]); max[axis] = Math.max(max[axis], p[axis]);
    }
    uvs[i * 2] = (gutter + sx * coreWidth) / textureWidth;
    uvs[i * 2 + 1] = (gutter + sy * coreHeight) / textureHeight;
  }
  function triangle(a, b, c) {
    if (!validity[a] || !validity[b] || !validity[c]) return;
    if (depthAt) {
      const nearest = Math.min(radii[a], radii[b], radii[c]);
      const furthest = Math.max(radii[a], radii[b], radii[c]);
      if (furthest - nearest > nearest * edgeThreshold) return;
    }
    // The u-right/v-down derivatives point outward with this panorama's
    // convention. Reverse their cross product for front faces seen from inside.
    indices.push(a, c, b);
  }
  for (let y = 0; y < segmentsY; y++) for (let x = 0; x < segmentsX; x++) {
    const a = y * stride + x, b = a + 1, c = a + stride, d = c + 1;
    triangle(a, b, c); triangle(b, d, c);
  }
  const center = min.map((value, i) => (value + max[i]) / 2);
  let boundingRadius = 0;
  for (let i = 0; i < count; i++) {
    boundingRadius = Math.max(boundingRadius, Math.hypot(positions[i * 3] - center[0], positions[i * 3 + 1] - center[1], positions[i * 3 + 2] - center[2]));
  }
  return {positions, uvs, indices: new Uint32Array(indices), radii, center, boundingRadius: boundingRadius + 1e-6, segmentsX, segmentsY};
}
