import {Vector3} from './vendor/three.module.js';

export const DEPTH_CAMERA_LIMITS = Object.freeze({x: .12, y: .08, z: .12, focalDistance: 4});
const eye = new Vector3(), direction = new Vector3();
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const finiteOr = (value, fallback) => Number.isFinite(value) ? value : fallback;
const headAxis = (value, range, limit) => clamp(finiteOr(value, 0) / range, -1, 1) * limit;

/**
 * Treat the display as a window into the inferred room. Head motion translates
 * the eye; it does not add another camera rotation or ordinary zoom. An
 * asymmetric frustum keeps the plane four units ahead fixed on the display.
 *
 * Apply after FOV/aspect changes and before rendering or projecting hotspots.
 * Calling updateProjectionMatrix() afterward would replace this frustum.
 * The caller uses this only in depth mode; its panorama camera path stays intact.
 */
export function applyDepthCamera(camera, {yaw = 0, pitch = 0, fov = camera.fov, aspect = camera.aspect, pose = null} = {}) {
  if (!camera?.isPerspectiveCamera) throw new TypeError('Depth requires a perspective camera.');
  const radians = Math.PI / 180;
  const y = (finiteOr(yaw, 0) % 360) * radians;
  const p = clamp(finiteOr(pitch, 0), -85, 85) * radians;
  camera.fov = clamp(finiteOr(fov, 78), 40, 90);
  camera.aspect = clamp(finiteOr(aspect, 1), .1, 10);
  camera.zoom = Number.isFinite(camera.zoom) && camera.zoom > 0 ? camera.zoom : 1;
  // Do not accumulate either the preceding translation or an old view offset.
  camera.position.set(0, 0, 0);
  camera.up.set(0, 1, 0);
  direction.set(-Math.cos(y) * Math.cos(p), Math.sin(p), -Math.sin(y) * Math.cos(p));
  camera.lookAt(direction);
  eye.set(headAxis(pose?.yaw, 22, DEPTH_CAMERA_LIMITS.x),
    headAxis(pose?.pitch, 13, DEPTH_CAMERA_LIMITS.y),
    headAxis(pose?.fov, 10, DEPTH_CAMERA_LIMITS.z));
  camera.position.copy(eye).applyQuaternion(camera.quaternion);
  camera.view = null;
  camera.filmOffset = 0;

  if (eye.lengthSq() === 0) {
    camera.updateProjectionMatrix();
  } else {
    // Camera-local +Z points backwards. Moving closer produces negative
    // pose.fov and negative eye.z, reducing the eye-to-window distance.
    const distance = DEPTH_CAMERA_LIMITS.focalDistance;
    const halfHeight = distance * Math.tan(camera.fov * radians * .5) / camera.zoom;
    const halfWidth = halfHeight * camera.aspect;
    const scale = camera.near / (distance + eye.z);
    camera.projectionMatrix.makePerspective(
      (-halfWidth - eye.x) * scale, (halfWidth - eye.x) * scale,
      (halfHeight - eye.y) * scale, (-halfHeight - eye.y) * scale,
      camera.near, camera.far, camera.coordinateSystem, camera.reversedDepth
    );
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }
  camera.updateMatrixWorld(true);
  return camera;
}
