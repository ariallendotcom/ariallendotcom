import test from 'node:test';
import assert from 'node:assert/strict';
import {Group, PerspectiveCamera, Quaternion, Scene, Vector3} from './vendor/three.module.js';
import {panoramaPoint} from './scene-math.js';
import {DEPTH_FAR, DEPTH_NEAR, createSplatSample, depthDimensions, radialDepth, sampleRelativeDepth, unpackDepth, writeSplatSample} from './depth-math.mjs';
import {loadDepthRoom} from './depth-room.js';

const close = (a, b, epsilon = 1e-10) => assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);
const deferred = () => {let resolve, reject; const promise = new Promise((a, b) => {resolve = a; reject = b;}); return {promise, resolve, reject};};

test('packed depth preserves all 16 bits and maps nearer values to shorter radii', () => {
  assert.equal(unpackDepth(0, 0), 0); assert.equal(unpackDepth(255, 255), 1);
  close(unpackDepth(1, 0) - unpackDepth(0, 255), 1 / 65535);
  assert.equal(radialDepth(0), DEPTH_FAR); assert.equal(radialDepth(1), DEPTH_NEAR);
  assert.equal(radialDepth(-1), DEPTH_FAR); assert.equal(radialDepth(2), DEPTH_NEAR);
  assert.equal(radialDepth(NaN), DEPTH_FAR);
  for (let i = 1; i <= 100; i++) assert.ok(radialDepth(i / 100) < radialDepth((i - 1) / 100));
});

test('resampling wraps the seam, clamps poles, and avoids invented surfaces at a depth edge', () => {
  const values = new Float32Array([0, 0, 1, 1, .01, .01, .99, .99]);
  for (const u of [-1.13, -.01, 0, .1, 1, 2.33]) close(sampleRelativeDepth(values, 4, 2, u, .3), sampleRelativeDepth(values, 4, 2, u + 1, .3));
  assert.equal(sampleRelativeDepth(values, 4, 2, .375, -10), 0);
  close(sampleRelativeDepth(values, 4, 2, .125, 10), values[4]);
  assert.ok([0, 1].includes(sampleRelativeDepth(values, 4, 2, .5, .25)));
  close(sampleRelativeDepth(values, 4, 2, .5, .25, false), .5);
  const carry = new Float32Array([unpackDepth(0, 255), unpackDepth(1, 0)]);
  close(sampleRelativeDepth(carry, 2, 1, .5, .5), (carry[0] + carry[1]) / 2);
});

test('resolution budgets retain aspect and never invent extra color pixels', () => {
  assert.deepEqual(depthDimensions(1774, 887), {width: 1774, height: 887});
  assert.deepEqual(depthDimensions(4096, 2048), {width: 2048, height: 1024});
  assert.deepEqual(depthDimensions(1774, 887, 'mobile'), {width: 768, height: 384});
  assert.deepEqual(depthDimensions(1774, 887, 'medium'), {width: 1024, height: 512});
  assert.deepEqual(depthDimensions(400, 200), {width: 400, height: 200});
  assert.throws(() => depthDimensions(0, 0));
});

test('Gaussian positions and handedness match the current panorama without mirroring', () => {
  const sample = createSplatSample();
  for (const u of [0, .125, .25, .5, .75, .875, 1]) for (const v of [.001, .1, .5, .9, .999]) {
    writeSplatSample(sample, u, v, 1536, 768, 4);
    const center = new Vector3().fromArray(sample.center), ray = panoramaPoint(u, v, 1);
    assert.ok(center.distanceTo(panoramaPoint(u, v, 4)) < 1e-12);
    const quaternion = new Quaternion().fromArray(sample.quaternion);
    close(quaternion.length(), 1);
    assert.ok(new Vector3(0, 0, 1).applyQuaternion(quaternion).distanceTo(ray) < 1e-10);
    const expectedU = new Vector3(-Math.sin(u * Math.PI * 2), 0, Math.cos(u * Math.PI * 2));
    assert.ok(new Vector3(1, 0, 0).applyQuaternion(quaternion).distanceTo(expectedU) < 1e-10);
    assert.ok([...sample.scales].every(value => value > 0 && Number.isFinite(value)));
  }
});

test('surface gradients tilt Gaussian tangents while occlusion edges shrink without stretching', () => {
  const flat = createSplatSample(), gradient = createSplatSample(), edge = createSplatSample();
  writeSplatSample(flat, .5, .5, 1536, 768, 4);
  writeSplatSample(gradient, .5, .5, 1536, 768, 4, 3.995, 4.005, 4, 4);
  writeSplatSample(edge, .5, .5, 1536, 768, 4, 2.5, 8, 4, 4);
  const ray = panoramaPoint(.5, .5, 1);
  const normal = new Vector3(0, 0, 1).applyQuaternion(new Quaternion().fromArray(gradient.quaternion));
  assert.ok(normal.dot(ray) < .99 && normal.dot(ray) > .9);
  assert.equal(edge.edge, true); assert.equal(flat.edge, false);
  assert.ok(edge.scales[0] < flat.scales[0]); close(edge.scales[1], flat.scales[1]);
  assert.ok(new Vector3(0, 0, 1).applyQuaternion(new Quaternion().fromArray(edge.quaternion)).distanceTo(ray) < 1e-10);
});

test('a translated viewpoint produces stronger parallax for nearby surfaces', () => {
  const camera = new PerspectiveCamera(78, 16 / 9, .1, 30);
  camera.lookAt(-1, 0, 0); camera.updateMatrixWorld();
  const near = panoramaPoint(.5, .5, DEPTH_NEAR), far = panoramaPoint(.5, .5, DEPTH_FAR);
  close(near.clone().project(camera).x, far.clone().project(camera).x);
  camera.position.set(0, 0, .1); camera.lookAt(-1, 0, .1); camera.updateMatrixWorld();
  assert.ok(Math.abs(near.clone().project(camera).x) > Math.abs(far.clone().project(camera).x) * 3);
});

function fixture({width = 8, height = 4, loadSpark, meshReady, yieldToBrowser} = {}) {
  const stats = {imports: 0, reads: 0, packed: 0, packedDisposed: 0, meshDisposed: 0, spark: 0, sparkDisposed: 0, dirty: 0, yields: 0, samples: [], progress: []};
  class PackedSplats {
    constructor(options) {stats.packed++; this.options = options; this.isInitialized = true;}
    pushSplat(center, scales, quaternion, opacity, color) {stats.samples.push({center: center.clone(), scales: scales.clone(), quaternion: quaternion.clone(), opacity, color: color.clone()});}
    dispose() {stats.packedDisposed++;}
  }
  class SplatMesh extends Group {
    constructor({packedSplats}) {super(); this.packed = packedSplats; this.initialized = meshReady || Promise.resolve(this);}
    dispose() {stats.meshDisposed++; this.packed.dispose();}
  }
  class SparkRenderer extends Group {
    constructor(options) {super(); stats.spark++; stats.sparkOptions = options;}
    dispose() {stats.sparkDisposed++;}
  }
  const library = {PackedSplats, SplatMesh, SparkRenderer};
  const color = new Uint8ClampedArray(width * height * 4), depth = new Uint8ClampedArray(color.length);
  for (let i = 0; i < width * height; i++) {color.set([128, 64, 200, 255], i * 4); depth.set([128, 0, 0, 255], i * 4);}
  let clock = 0;
  const environment = {
    loadSpark: () => {stats.imports++; return loadSpark ? loadSpark(library) : Promise.resolve(library);},
    readPixels: async (_url, options) => {stats.reads++; return {width, height, data: (options.packedDepth ? depth : color).slice()};},
    now: () => clock += 10,
    yieldToBrowser: async signal => {stats.yields++; await yieldToBrowser?.(signal, stats);}
  };
  const scene = new Scene(), controller = new AbortController();
  const options = {renderer: {}, scene, colorUrl: 'color.jpg', depthUrl: 'depth.png', signal: controller.signal, onDirty: () => stats.dirty++, onProgress: progress => stats.progress.push(progress)};
  return {stats, environment, scene, controller, options, color, depth};
}

test('importing the helper and an already-cancelled request perform no third-party loading', async () => {
  const f = fixture(); f.controller.abort();
  await assert.rejects(loadDepthRoom(f.options, f.environment), {name: 'AbortError'});
  assert.equal(f.stats.imports, 0); assert.equal(f.stats.reads, 0);
});

test('built room keeps original sRGB values, reports real splat count, and owns only its scene group', async () => {
  const f = fixture(), fallback = new Group(); f.scene.add(fallback);
  const room = await loadDepthRoom(f.options, f.environment);
  assert.equal(room.splatCount, 32); assert.equal(f.scene.children.length, 2);
  close(f.stats.samples[0].color.r, 128 / 255); close(f.stats.samples[0].color.g, 64 / 255); close(f.stats.samples[0].color.b, 200 / 255);
  close(room.depthAt(.5, .5), radialDepth(new Float32Array([unpackDepth(128, 0)])[0]));
  assert.deepEqual(f.stats.progress.at(-1), {phase: 'ready', progress: 1, splatCount: 32});
  room.setVisible(false); assert.equal(f.scene.children[1].visible, false); assert.equal(fallback.visible, true);
  room.setVisible(true); assert.equal(f.scene.children[1].visible, true);
  f.controller.abort(); room.dispose();
  assert.deepEqual(f.scene.children, [fallback]);
  assert.equal(f.stats.packedDisposed, 1); assert.equal(f.stats.meshDisposed, 1); assert.equal(f.stats.sparkDisposed, 1);
  const dirty = f.stats.dirty; f.stats.sparkOptions.onDirty(); room.setVisible(true); assert.equal(f.stats.dirty, dirty);
  assert.equal(room.depthAt(.5, .5), DEPTH_FAR);
});

test('cancelling while the remote runtime is pending never constructs scene resources', async () => {
  const pending = deferred(), f = fixture({loadSpark: () => pending.promise});
  const loading = loadDepthRoom(f.options, f.environment); f.controller.abort();
  await assert.rejects(loading, {name: 'AbortError'}); pending.resolve({}); await Promise.resolve();
  assert.equal(f.stats.packed, 0); assert.equal(f.stats.spark, 0); assert.equal(f.scene.children.length, 0);
});

test('chunked construction yields and cancellation frees a partially built splat buffer', async () => {
  let controller;
  const f = fixture({width: 64, height: 32, yieldToBrowser: async (_signal, stats) => {if (stats.packed) controller.abort();}});
  controller = f.controller;
  await assert.rejects(loadDepthRoom(f.options, f.environment), {name: 'AbortError'});
  assert.ok(f.stats.yields > 0); assert.ok(f.stats.samples.length > 0 && f.stats.samples.length < 2048);
  assert.equal(f.stats.packedDisposed, 1); assert.equal(f.stats.meshDisposed, 0); assert.equal(f.stats.spark, 0); assert.equal(f.scene.children.length, 0);
});

test('cancelling mesh initialization disposes its owned splats before a late completion', async () => {
  const pending = deferred(), f = fixture({meshReady: pending.promise});
  const loading = loadDepthRoom(f.options, f.environment);
  for (let i = 0; i < 12; i++) await Promise.resolve();
  f.controller.abort(); await assert.rejects(loading, {name: 'AbortError'}); pending.resolve(); await Promise.resolve();
  assert.equal(f.stats.meshDisposed, 1); assert.equal(f.stats.packedDisposed, 1); assert.equal(f.stats.spark, 0);
});

test('invalid depth encoding fails before allocating Gaussian or GPU resources', async () => {
  const f = fixture(); f.depth[2] = 200;
  await assert.rejects(loadDepthRoom(f.options, f.environment), /packed 16-bit/);
  assert.equal(f.stats.packed, 0); assert.equal(f.scene.children.length, 0);
});
