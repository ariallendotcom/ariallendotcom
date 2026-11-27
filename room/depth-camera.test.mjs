import test from 'node:test';
import assert from 'node:assert/strict';
import {Matrix4, PerspectiveCamera, Vector3} from './vendor/three.module.js';
import {lookDirection} from './scene-math.js';
import {applyDepthCamera, DEPTH_CAMERA_LIMITS} from './depth-camera.mjs';

const close = (a, b, epsilon = 1e-10) => assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);
const camera = () => new PerspectiveCamera(78, 16 / 9, .1, 30);
function cameraPoint(base, x, y, distance) {return new Vector3(x, y, -distance).applyQuaternion(base.quaternion);}

test('off-axis translation leaves every sampled focal-plane point stationary', () => {
  for (const yaw of [-120, 0, 57]) for (const pitch of [-35, 0, 33]) for (const aspect of [.45, 1, 16 / 9, 4]) {
    const view = {yaw, pitch, aspect, fov: 78}, base = camera(), moved = camera();
    applyDepthCamera(base, view);
    for (const pose of [{yaw: 22, pitch: 13, fov: 10}, {yaw: -22, pitch: -13, fov: -10}, {yaw: 11, pitch: -6, fov: 0}]) {
      applyDepthCamera(moved, {...view, pose});
      for (const x of [-1, 0, 1]) for (const y of [-.8, 0, .8]) {
        const point = cameraPoint(base, x, y, DEPTH_CAMERA_LIMITS.focalDistance);
        const a = point.clone().project(base), b = point.clone().project(moved);
        close(a.x, b.x); close(a.y, b.y);
      }
      assert.ok(base.quaternion.angleTo(moved.quaternion) < 1e-7);
    }
  }
});

test('foreground and background move in opposite directions around the stable plane', () => {
  const base = camera(), moved = camera(), view = {yaw: 29, pitch: -12, fov: 78, aspect: 1.6};
  applyDepthCamera(base, view); applyDepthCamera(moved, {...view, pose: {yaw: 22, pitch: 0, fov: 0}});
  const shifts = [2.5, 4, 8].map(distance => {
    const point = cameraPoint(base, 0, 0, distance);
    return point.clone().project(moved).x - point.clone().project(base).x;
  });
  assert.ok(shifts[0] < -.001); close(shifts[1], 0); assert.ok(shifts[2] > .001);
  assert.notEqual(shifts[0], shifts[2]);
});

test('moving toward the window gives depth-dependent magnification without moving the focal plane', () => {
  const base = camera(), moved = camera();
  applyDepthCamera(base, {yaw: 0, pitch: 0});
  applyDepthCamera(moved, {yaw: 0, pitch: 0, pose: {fov: -10}});
  const ratios = [2.5, 4, 8].map(distance => {
    const point = cameraPoint(base, .8, .2, distance);
    return point.clone().project(moved).x / point.clone().project(base).x;
  });
  assert.ok(ratios[0] > 1); close(ratios[1], 1); assert.ok(ratios[2] < 1);
});

test('neutral pose removes all previous translation and matches the ordinary camera', () => {
  const moved = camera(), ordinary = camera(), view = {yaw: 43, pitch: -16, fov: 63, aspect: 1.2};
  applyDepthCamera(moved, {...view, pose: {yaw: 22, pitch: 13, fov: -10}});
  applyDepthCamera(moved, {...view, pose: null});
  ordinary.fov = view.fov; ordinary.aspect = view.aspect;
  ordinary.lookAt(lookDirection(view.yaw, view.pitch)); ordinary.updateProjectionMatrix(); ordinary.updateMatrixWorld(true);
  assert.equal(moved.position.length(), 0);
  for (const key of ['projectionMatrix', 'projectionMatrixInverse', 'matrixWorldInverse']) {
    moved[key].elements.forEach((value, i) => close(value, ordinary[key].elements[i]));
  }
});

test('extreme and invalid poses remain finite, bounded and non-accumulating', () => {
  const c = camera();
  for (const yaw of [NaN, Infinity, -1e100, -22, 0, 22, 1e100]) for (const pitch of [NaN, -1e100, 0, 1e100]) for (const fov of [NaN, -Infinity, -1e100, 0, 1e100]) {
    const view = {yaw: 72, pitch: -26, fov: 78, aspect: 1.6, pose: {yaw, pitch, fov}};
    applyDepthCamera(c, view);
    const local = c.position.clone().applyQuaternion(c.quaternion.clone().invert());
    assert.ok(Math.abs(local.x) <= .12 + 1e-12 && Math.abs(local.y) <= .08 + 1e-12 && Math.abs(local.z) <= .12 + 1e-12);
    assert.ok(c.projectionMatrix.elements.every(Number.isFinite));
    const before = c.position.clone(); applyDepthCamera(c, view); assert.ok(before.distanceTo(c.position) < 1e-12);
    const inverse = new Matrix4().multiplyMatrices(c.projectionMatrix, c.projectionMatrixInverse);
    inverse.elements.forEach((value, i) => close(value, i % 5 === 0 ? 1 : 0));
  }
});
