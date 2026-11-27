import test from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera, Vector3} from './vendor/three.module.js';
import {panoramaPoint} from './scene-math.js';
import {buildTileGeometryData, maxTilePlaneDistance, normalizeDetailManifest, tileBounds} from './detail-math.mjs';

const close = (a, b, epsilon = 1e-6) => assert.ok(Math.abs(a - b) <= epsilon, `${a} != ${b}`);
function level(width = 16, height = 8, tileSize = 4, gutter = 0) {
  const tiles = [];
  for (let y = 0; y < Math.ceil(height / tileSize); y++) for (let x = 0; x < Math.ceil(width / tileSize); x++) tiles.push({x, y, url: `${width}/${x}-${y}.jpg`});
  return {width, height, tileSize, gutter, tiles};
}

test('manifest sorts resolution levels and resolves a complete grid with partial edge tiles', () => {
  const manifest = normalizeDetailManifest({version: 1, levels: [level(20, 10, 8, 2), level(8, 4, 4)]}, {baseUrl: 'https://example.com/room/tiles.json'});
  assert.deepEqual(manifest.levels.map(l => l.width), [8, 20]);
  const large = manifest.levels[1], edge = large.tiles.at(-1);
  assert.equal(large.columns, 3); assert.equal(large.rows, 2);
  assert.deepEqual([edge.x, edge.y, edge.coreWidth, edge.coreHeight], [2, 1, 4, 2]);
  assert.deepEqual([edge.textureWidth, edge.textureHeight], [8, 6]);
  assert.deepEqual([edge.u0, edge.v0, edge.u1, edge.v1], [.8, .8, 1, 1]);
  assert.equal(edge.id, '20:2:1');
  assert.equal(edge.url, 'https://example.com/room/20/2-1.jpg');
  assert.equal(normalizeDetailManifest(level()).levels.length, 1);
});

test('malformed grids and executable URL schemes fail before allocating geometry or loading images', () => {
  const incomplete = level(); incomplete.tiles.pop();
  const duplicate = level(); duplicate.tiles[1] = {...duplicate.tiles[0]};
  const badCoordinate = level(); badCoordinate.tiles[0].x = 10;
  const badUrl = level(); badUrl.tiles[0].url = 'javascript:alert(1)';
  const badGutter = level(); badGutter.tiles[0].gutter = -1;
  for (const manifest of [incomplete, duplicate, badCoordinate, badUrl, badGutter, {...level(), height: 9}, {...level(), width: NaN}, {levels: []}, {version: 2, ...level()}, {levels: [level(), level()]}]) assert.throws(() => normalizeDetailManifest(manifest));
});

test('fixed-radius patch vertices and inward winding exactly match the original panorama convention', () => {
  const tiles = normalizeDetailManifest(level(16, 8, 2)).levels[0].tiles;
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), normal = new Vector3();
  for (const tile of tiles) {
    const patch = buildTileGeometryData(tile, {segments: 4, radius: 9.98});
    const stride = patch.segmentsX + 1;
    for (let y = 0; y <= patch.segmentsY; y++) for (let x = 0; x <= patch.segmentsX; x++) {
      const u = tile.u0 + (tile.u1 - tile.u0) * x / patch.segmentsX;
      const v = tile.v0 + (tile.v1 - tile.v0) * y / patch.segmentsY;
      assert.ok(a.fromArray(patch.positions, (y * stride + x) * 3).distanceTo(panoramaPoint(u, v, 9.98)) < 1e-6);
    }
    for (let i = 0; i < patch.indices.length; i += 3) {
      a.fromArray(patch.positions, patch.indices[i] * 3);
      b.fromArray(patch.positions, patch.indices[i + 1] * 3);
      c.fromArray(patch.positions, patch.indices[i + 2] * 3);
      normal.crossVectors(b.sub(a), c.sub(a));
      if (normal.length() > 1e-8) assert.ok(normal.dot(a) < 0, 'surface faces must look inward');
    }
  }
});

test('neighboring patches and the panorama seam share vertices while gutter UVs retain only the image core', () => {
  const tiles = normalizeDetailManifest(level(16, 8, 4, 2)).levels[0].tiles;
  const left = buildTileGeometryData(tiles[0], {segments: 4}), right = buildTileGeometryData(tiles[1], {segments: 4});
  const seam = buildTileGeometryData(tiles[3], {segments: 4});
  for (let y = 0; y <= 4; y++) for (let axis = 0; axis < 3; axis++) {
    close(left.positions[(y * 5 + 4) * 3 + axis], right.positions[y * 5 * 3 + axis]);
    close(left.positions[y * 5 * 3 + axis], seam.positions[(y * 5 + 4) * 3 + axis]);
  }
  close(left.uvs[0], .25); close(left.uvs[1], .25);
  close(left.uvs.at(-2), .75); close(left.uvs.at(-1), .75);
});

test('neutral texture projection stays aligned with hotspots at wide and close fields of view', () => {
  const tile = normalizeDetailManifest(level(16, 8, 4)).levels[0].tiles[1];
  const patch = buildTileGeometryData(tile, {segments: 4});
  const camera = new PerspectiveCamera(78, 16 / 9, .1, 30);
  camera.lookAt(-1, 0, 0); camera.updateMatrixWorld();
  for (const fov of [78, 40]) {
    camera.fov = fov; camera.updateProjectionMatrix();
    for (let y = 0; y <= 4; y++) for (let x = 0; x <= 4; x++) {
      const u = tile.u0 + (tile.u1 - tile.u0) * x / 4, v = tile.v0 + (tile.v1 - tile.v0) * y / 4;
      const actual = new Vector3().fromArray(patch.positions, (y * 5 + x) * 3).project(camera);
      const expected = panoramaPoint(u, v, 9).project(camera);
      // Ignore rays on/behind the projection plane; those are culled by view selection.
      if (!Number.isFinite(expected.x) || Math.abs(expected.x) > 100 || Math.abs(expected.y) > 100) continue;
      close(actual.x, expected.x, 1e-5); close(actual.y, expected.y, 1e-5);
    }
  }
});

test('depth discontinuities leave gaps instead of triangles bridging foreground to the far wall', () => {
  const tile = normalizeDetailManifest(level(16, 8, 4)).levels[0].tiles[1];
  const depthAt = u => u < (tile.u0 + tile.u1) / 2 ? 2.5 : 8;
  const flat = buildTileGeometryData(tile, {segments: 8});
  const depth = buildTileGeometryData(tile, {segments: 8, depthAt});
  assert.ok(depth.indices.length > 0 && depth.indices.length < flat.indices.length);
  for (let i = 0; i < depth.indices.length; i += 3) {
    const radii = [...depth.indices.subarray(i, i + 3)].map(index => depth.radii[index]);
    close(Math.max(...radii), Math.min(...radii));
  }
  const invalid = buildTileGeometryData(tile, {segments: 4, depthAt: () => NaN});
  assert.equal(invalid.indices.length, 0);
  assert.ok([...invalid.positions].every(Number.isFinite));
});

test('precomputed bounds contain dense samples across panorama seams, poles, and depth intervals', () => {
  const tiles = normalizeDetailManifest(level(16, 8, 4)).levels[0].tiles;
  for (const tile of tiles) for (const range of [10, {near: 2.5, far: 8}]) {
    const bounds = tileBounds(tile, range), center = new Vector3().fromArray(bounds.center);
    const radii = typeof range === 'number' ? [range] : [range.near, (range.near + range.far) / 2, range.far];
    for (let y = 0; y <= 12; y++) for (let x = 0; x <= 12; x++) for (const r of radii) {
      const p = panoramaPoint(tile.u0 + (tile.u1 - tile.u0) * x / 12, tile.v0 + (tile.v1 - tile.v0) * y / 12, r);
      assert.ok(center.distanceTo(p) <= bounds.radius);
    }
  }
});

test('geometry memory stays bounded independently of texture resolution and handles partial tiles proportionally', () => {
  const tiles = normalizeDetailManifest(level(20000, 10000, 2048)).levels[0].tiles;
  const full = buildTileGeometryData(tiles[0], {segments: 100000});
  assert.deepEqual([full.segmentsX, full.segmentsY], [128, 128]);
  assert.equal(full.positions.length / 3, 129 * 129);
  const edge = buildTileGeometryData(tiles.at(-1), {segments: 128});
  assert.ok(edge.segmentsX < 128 || edge.segmentsY < 128);
  for (let i = 0; i < edge.positions.length; i += 3) assert.ok(Math.hypot(edge.positions[i] - edge.center[0], edge.positions[i + 1] - edge.center[1], edge.positions[i + 2] - edge.center[2]) <= edge.boundingRadius);
});

test('analytic plane bounds find interior peaks and exact extrema at the seam and poles', () => {
  const aroundFront = {u0: .4, u1: .6, v0: .4, v1: .6};
  close(maxTilePlaneDistance(aroundFront, [-1, 0, 0], -2, 10), 8, 1e-12);
  close(maxTilePlaneDistance(aroundFront, [1, 0, 0], 0, 10), -10 * Math.cos(.2 * Math.PI) * Math.cos(.1 * Math.PI), 1e-12);
  const seamLeft = {u0: 0, u1: .1, v0: .4, v1: .6};
  const seamRight = {u0: .9, u1: 1, v0: .4, v1: .6};
  close(maxTilePlaneDistance(seamLeft, [1, 0, 0]), 10, 1e-12);
  close(maxTilePlaneDistance(seamRight, [1, 0, 0]), 10, 1e-12);
  const north = {u0: .7, u1: .9, v0: 0, v1: .15};
  const south = {u0: .2, u1: .4, v0: .85, v1: 1};
  close(maxTilePlaneDistance(north, [0, 2, 0], 3, 5), 13, 1e-12);
  close(maxTilePlaneDistance(south, [0, -2, 0], 3, 5), 13, 1e-12);
  close(maxTilePlaneDistance(aroundFront, [0, 0, 0], 7, 10), 7, 1e-12);
  close(maxTilePlaneDistance(aroundFront, [1, 2, 3], 7, 0), 7, 1e-12);
});

test('analytic patch bounds dominate dense sampled rays and approach their sampled maxima', () => {
  const tiles = normalizeDetailManifest(level(20, 10, 2)).levels[0].tiles;
  const normals = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [.8, -.3, .2], [-.4, .6, -.7], [2.3, 1.1, -4.7]];
  for (const tile of tiles) for (const normal of normals) {
    const exact = maxTilePlaneDistance(tile, normal, -.23, 8);
    let sampled = -Infinity;
    for (let y = 0; y <= 24; y++) for (let x = 0; x <= 24; x++) {
      const p = panoramaPoint(tile.u0 + (tile.u1 - tile.u0) * x / 24, tile.v0 + (tile.v1 - tile.v0) * y / 24, 8);
      const distance = p.x * normal[0] + p.y * normal[1] + p.z * normal[2] - .23;
      assert.ok(distance <= exact + 1e-10, 'analytic bound must never cull a sampled visible point');
      sampled = Math.max(sampled, distance);
    }
    assert.ok(exact - sampled < .01, 'analytic maximum should be tight, not a bounding-sphere approximation');
  }
});

test('analytic plane bounds validate coordinates and normal data', () => {
  const tile = {u0: .4, u1: .6, v0: .4, v1: .6};
  close(maxTilePlaneDistance(tile, new Float32Array([-1, 0, 0])), 10);
  for (const normal of [null, {}, [1, 2], [1, 2, NaN], [1, 2, Infinity]]) assert.throws(() => maxTilePlaneDistance(tile, normal));
  assert.throws(() => maxTilePlaneDistance(tile, [1, 0, 0], NaN));
  assert.throws(() => maxTilePlaneDistance(tile, [1, 0, 0], 0, -1));
  assert.throws(() => maxTilePlaneDistance({...tile, u1: 2}, [1, 0, 0]));
});
