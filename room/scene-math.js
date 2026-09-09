import {Vector3, MathUtils} from './vendor/three.module.js';

// Image coordinates start at the upper left. The inward-facing sphere is
// reflected on X so text and furniture appear in their original orientation.
export function panoramaPoint(u, v, radius = 9) {
  const longitude = u * Math.PI * 2;
  const latitude = (.5 - v) * Math.PI;
  return new Vector3(
    Math.cos(longitude) * Math.cos(latitude),
    Math.sin(latitude),
    Math.sin(longitude) * Math.cos(latitude)
  ).multiplyScalar(radius);
}

export function lookDirection(yaw, pitch) {
  const y = MathUtils.degToRad(yaw), p = MathUtils.degToRad(pitch);
  return new Vector3(-Math.cos(y)*Math.cos(p), Math.sin(p), -Math.sin(y)*Math.cos(p));
}

// Keep every visible ray clear of the generated image's unfinished rear join.
// Looking up/down widens the longitude range at the top/bottom of the viewport.
export function constrainPanoramaView(yaw, pitch, fov, aspect) {
  fov = MathUtils.clamp(fov, 40, 90);
  const pitchLimit = Math.min(45, 85 - fov / 2);
  pitch = MathUtils.clamp(pitch, -pitchLimit, pitchLimit);
  const verticalExtent = Math.tan(MathUtils.degToRad(fov / 2));
  const tilt = MathUtils.degToRad(Math.abs(pitch));
  const nearestForward = Math.cos(tilt) - verticalExtent * Math.sin(tilt);
  const horizontalExtent = MathUtils.radToDeg(Math.atan2(verticalExtent * aspect, nearestForward));
  const yawLimit = 180 - horizontalExtent - 8;
  return {yaw: MathUtils.clamp(yaw, -yawLimit, yawLimit), pitch, fov};
}
