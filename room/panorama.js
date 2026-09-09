import {BackSide, Mesh, MeshBasicMaterial, SphereGeometry} from './vendor/three.module.js';

export function createPanoramaSphere() {
  // A mirrored object still has outward-facing fronts: Three.js compensates
  // for the negative scale during culling. The camera needs the back faces.
  const sphere = new Mesh(
    new SphereGeometry(10, 96, 64),
    new MeshBasicMaterial({side: BackSide})
  );
  sphere.scale.x = -1;
  return sphere;
}
