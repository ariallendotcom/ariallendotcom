// Artistic scene units, not metric measurements. The source is monocular
// inverse depth: it describes the visible surfaces, not the room behind them.
export const DEPTH_NEAR = 2.5;
export const DEPTH_FAR = 8;
const TAU = Math.PI * 2;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export function unpackDepth(red, green) {
  return (red * 256 + green) / 65535;
}

export function radialDepth(relative) {
  const q = Number.isFinite(relative) ? clamp(relative, 0, 1) : 0;
  return 1 / (1 / DEPTH_FAR + q * (1 / DEPTH_NEAR - 1 / DEPTH_FAR));
}

export function depthDimensions(width, height, detail = 'high') {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 1) {
    throw new Error('Invalid room image dimensions.');
  }
  // Preserve every original panorama pixel on desktop; only larger future
  // sources are capped. Smaller devices retain their existing memory budget.
  const limit = detail === 'high' ? 2048 : detail === 'medium' ? 1024 : 768;
  const scaledWidth = Math.min(width, limit);
  return {width: scaledWidth, height: Math.max(1, Math.round(height * scaledWidth / width))};
}

// Sample decoded scalar values, never the packed R/G bytes: filtering the
// two channels independently corrupts depth at an 8-bit carry boundary.
// Across a depth discontinuity retain the nearest surface instead of making
// a floating strip halfway between foreground and background.
export function sampleRelativeDepth(values, width, height, u, v, edgeAware = true) {
  if (!values || !Number.isFinite(u) || !Number.isFinite(v)) return 0;
  const x = ((u % 1 + 1) % 1) * width - .5;
  const y = clamp(v * height - .5, 0, height - 1);
  const floorX = Math.floor(x), floorY = Math.floor(y);
  const x0 = (floorX + width) % width, x1 = (x0 + 1) % width;
  const y1 = Math.min(floorY + 1, height - 1);
  const tx = x - floorX, ty = y - floorY;
  const a = values[floorY * width + x0], b = values[floorY * width + x1];
  const c = values[y1 * width + x0], d = values[y1 * width + x1];
  const nearest = ty < .5 ? (tx < .5 ? a : b) : (tx < .5 ? c : d);
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c) || !Number.isFinite(d)) return Number.isFinite(nearest) ? nearest : 0;
  if (edgeAware && Math.max(a, b, c, d) - Math.min(a, b, c, d) > .075) return nearest;
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}

export function createSplatSample() {
  return {center: new Float64Array(3), scales: new Float64Array(3), quaternion: new Float64Array(4), edge: false};
}

// Write a local surface frame without allocating per pixel. The radial ray
// agrees exactly with scene-math.js panoramaPoint; no extra reflection or
// OpenCV rotation belongs here. Quaternion component order is x,y,z,w.
export function writeSplatSample(out, u, v, width, height, radius, left = radius, right = radius, up = radius, down = radius) {
  const longitude = u * TAU, latitude = (.5 - v) * Math.PI;
  const sinLon = Math.sin(longitude), cosLon = Math.cos(longitude);
  const sinLat = Math.sin(latitude), cosLat = Math.cos(latitude);
  const nx = cosLon * cosLat, ny = sinLat, nz = sinLon * cosLat;
  out.center[0] = nx * radius; out.center[1] = ny * radius; out.center[2] = nz * radius;
  const stepU = Math.max(1e-5, radius * cosLat * TAU / width);
  const stepV = Math.max(1e-5, radius * Math.PI / height);
  // This is local geometric consistency, not model-produced confidence.
  const edgeU = Math.max(Math.abs(left - radius), Math.abs(right - radius)) > radius * .075;
  const edgeV = Math.max(Math.abs(up - radius), Math.abs(down - radius)) > radius * .075;
  const drU = edgeU ? 0 : clamp((right - left) * .5, -stepU * 1.5, stepU * 1.5);
  const drV = edgeV ? 0 : clamp((down - up) * .5, -stepV * 1.5, stepV * 1.5);
  // Local derivatives include reliable depth gradients. Cap their stretch
  // and shrink footprints at occlusion edges to avoid long fuzzy bridges.
  let ux = -sinLon * stepU + nx * drU, uy = ny * drU, uz = cosLon * stepU + nz * drU;
  const bx = cosLon * sinLat * stepV + nx * drV;
  const by = -cosLat * stepV + ny * drV;
  const bz = sinLon * sinLat * stepV + nz * drV;
  const lengthU = Math.hypot(ux, uy, uz);
  ux /= lengthU; uy /= lengthU; uz /= lengthU;
  let zx = uy * bz - uz * by, zy = uz * bx - ux * bz, zz = ux * by - uy * bx;
  const lengthZ = Math.hypot(zx, zy, zz);
  zx /= lengthZ; zy /= lengthZ; zz /= lengthZ;
  const vx = zy * uz - zz * uy, vy = zz * ux - zx * uz, vz = zx * uy - zy * ux;
  const lengthV = Math.abs(bx * vx + by * vy + bz * vz);
  // A .62-pixel sigma retains overlap without washing neighboring photo
  // details together. The original panorama fills any remaining transparency.
  out.scales[0] = Math.max(1e-5, lengthU * (edgeU ? .5 : .62));
  out.scales[1] = Math.max(1e-5, lengthV * (edgeV ? .5 : .62));
  out.scales[2] = Math.max(1e-5, Math.min(stepU, stepV) * .06);
  out.edge = edgeU || edgeV;
  // Quaternion from the right-handed matrix [U V normal].
  const q = out.quaternion, trace = ux + vy + zz;
  if (trace > 0) {
    const s = 2 * Math.sqrt(trace + 1);
    q[0] = (vz - zy) / s; q[1] = (zx - uz) / s; q[2] = (uy - vx) / s; q[3] = s * .25;
  } else if (ux > vy && ux > zz) {
    const s = 2 * Math.sqrt(1 + ux - vy - zz);
    q[0] = s * .25; q[1] = (vx + uy) / s; q[2] = (zx + uz) / s; q[3] = (vz - zy) / s;
  } else if (vy > zz) {
    const s = 2 * Math.sqrt(1 + vy - ux - zz);
    q[0] = (vx + uy) / s; q[1] = s * .25; q[2] = (zy + vz) / s; q[3] = (zx - uz) / s;
  } else {
    const s = 2 * Math.sqrt(1 + zz - ux - vy);
    q[0] = (zx + uz) / s; q[1] = (zy + vz) / s; q[2] = s * .25; q[3] = (uy - vx) / s;
  }
  return out;
}
