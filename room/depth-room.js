import {Color, Group, Quaternion, Vector3} from './vendor/three.module.js';
import {DEPTH_FAR, createSplatSample, depthDimensions, radialDepth, sampleRelativeDepth, unpackDepth, writeSplatSample} from './depth-math.mjs?v=depth-2';

// Kept inside an explicit opt-in function: importing this helper loads no
// third-party JavaScript, images, model, camera, or worker.
const SPARK_URL = 'https://sparkjs.dev/releases/spark/2.4.0/spark.module.js';
const abortError = () => new DOMException('The depth room was closed.', 'AbortError');
function checkAbort(signal) { if (signal?.aborted) throw abortError(); }

function withAbort(promise, signal, onLateResult) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const abort = () => { if (!settled) {settled = true; reject(abortError());} };
    signal.addEventListener('abort', abort, {once: true});
    if (signal.aborted) abort();
    Promise.resolve(promise).then(value => {
      signal.removeEventListener('abort', abort);
      if (settled) {onLateResult?.(value); return;}
      settled = true; resolve(value);
    }, error => {
      signal.removeEventListener('abort', abort);
      if (!settled) {settled = true; reject(error);}
    });
  });
}

async function readPixels(url, {signal, detail, packedDepth = false}) {
  checkAbort(signal);
  const response = await fetch(url, {signal, credentials: 'omit'});
  if (!response.ok) throw new Error(`Room image could not load (${response.status}).`);
  const blob = await response.blob();
  checkAbort(signal);
  let bitmap, canvas;
  try {
    bitmap = await withAbort(createImageBitmap(blob, {
      colorSpaceConversion: packedDepth ? 'none' : 'default', premultiplyAlpha: 'none', imageOrientation: 'none'
    }), signal, late => late.close());
    checkAbort(signal);
    const nativeWidth = bitmap.width, nativeHeight = bitmap.height;
    const size = packedDepth ? {width: nativeWidth, height: nativeHeight} : depthDimensions(nativeWidth, nativeHeight, detail);
    canvas = document.createElement('canvas');
    canvas.width = size.width; canvas.height = size.height;
    const context = canvas.getContext('2d', {willReadFrequently: true, colorSpace: 'srgb'});
    if (!context) throw new Error('Room image decoding is unavailable.');
    // Packed depth is read at its original size, before scalar resampling.
    context.imageSmoothingEnabled = !packedDepth;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    const {data} = context.getImageData(0, 0, size.width, size.height);
    return {...size, nativeWidth, nativeHeight, data};
  } finally {
    bitmap?.close();
    if (canvas) {canvas.width = 1; canvas.height = 1;}
  }
}

function yieldToBrowser(signal) {
  return new Promise((resolve, reject) => {
    const abort = () => {clearTimeout(timer); signal.removeEventListener('abort', abort); reject(abortError());};
    const timer = setTimeout(() => {signal.removeEventListener('abort', abort); resolve();}, 0);
    signal.addEventListener('abort', abort, {once: true});
    if (signal.aborted) abort();
  });
}

function browserEnvironment() {
  return {
    loadSpark: () => import(SPARK_URL),
    readPixels,
    yieldToBrowser,
    now: () => performance.now()
  };
}

/**
 * Build actual anisotropic Gaussian splats from RGB and packed 16-bit relative
 * depth. This is an inferred surface shell, not a multiview room capture:
 * unseen surfaces remain unknown, so the caller must bound camera translation.
 *
 * onProgress({phase, progress, splatCount}) uses progress in [0,1]. depthAt(u,v)
 * returns radial scene units, suitable for positioning the existing hotspots.
 * The caller owns its ordinary panorama, camera, renderer, and render loop.
 * Signal cancellation also disposes a successfully returned room. The optional
 * environment argument permits lifecycle tests without a browser or network.
 */
export async function loadDepthRoom({renderer, scene, colorUrl, depthUrl, onDirty = () => {}, onProgress = () => {}, signal, detail = 'high'}, environment = browserEnvironment()) {
  checkAbort(signal);
  if (!renderer || !scene || !colorUrl || !depthUrl) throw new Error('The depth room needs a renderer, scene, and both images.');
  const controller = new AbortController(), workSignal = controller.signal;
  let group, spark, mesh, packed, depthValues, depthWidth = 0, depthHeight = 0;
  let disposed = false, splatCount = 0;
  function notifyDirty() {if (!disposed) onDirty();}
  function dispose() {
    if (disposed) return;
    disposed = true;
    controller.abort();
    signal?.removeEventListener('abort', dispose);
    group?.removeFromParent();
    group?.clear();
    const ownedMesh = mesh, ownedPacked = packed, ownedSpark = spark;
    group = mesh = packed = spark = null;
    depthValues = null;
    // A SplatMesh owns the PackedSplats handed to it; dispose it only once.
    try { if (ownedMesh) ownedMesh.dispose(); else ownedPacked?.dispose(); }
    finally {try {ownedSpark?.dispose();} finally {onDirty();}}
  }
  signal?.addEventListener('abort', dispose, {once: true});
  const report = (phase, progress) => {if (!disposed) onProgress({phase, progress, splatCount});};
  async function chunks(length, process, start, end) {
    let deadline = environment.now() + 8;
    for (let i = 0; i < length; i++) {
      process(i);
      if ((i & 511) === 511 && environment.now() >= deadline) {
        checkAbort(workSignal);
        report('building', start + (end - start) * (i + 1) / length);
        await environment.yieldToBrowser(workSignal);
        checkAbort(workSignal);
        deadline = environment.now() + 8;
      }
    }
    checkAbort(workSignal);
  }
  try {
    report('loading', 0);
    const [library, colorImage, depthImage] = await withAbort(Promise.all([
      environment.loadSpark(),
      environment.readPixels(colorUrl, {signal: workSignal, detail}),
      environment.readPixels(depthUrl, {signal: workSignal, packedDepth: true})
    ]), workSignal);
    checkAbort(workSignal);
    const {SparkRenderer, SplatMesh, PackedSplats} = library;
    const {width, height} = colorImage;
    depthWidth = depthImage.width; depthHeight = depthImage.height;
    if (Math.abs(width / height - depthWidth / depthHeight) > .015) throw new Error('The room color and depth images have different proportions.');
    if (Math.abs(depthWidth / depthHeight - 2) > .025) throw new Error('The depth room needs an equirectangular panorama.');
    depthValues = new Float32Array(depthWidth * depthHeight);
    report('building', .08);
    await chunks(depthValues.length, i => {
      const offset = i * 4, data = depthImage.data;
      if (data[offset + 2] !== 0 || data[offset + 3] !== 255) throw new Error('The room depth image is not packed 16-bit R/G data.');
      depthValues[i] = unpackDepth(data[offset], data[offset + 1]);
    }, .08, .16);
    depthImage.data = null;
    const radii = new Float32Array(width * height);
    await chunks(radii.length, i => {
      radii[i] = radialDepth(sampleRelativeDepth(depthValues, depthWidth, depthHeight, (i % width + .5) / width, (Math.floor(i / width) + .5) / height));
    }, .16, .3);
    packed = new PackedSplats({maxSplats: radii.length, lod: false});
    const sample = createSplatSample(), center = new Vector3(), scales = new Vector3(), quaternion = new Quaternion(), color = new Color();
    await chunks(radii.length, i => {
      const x = i % width, y = Math.floor(i / width), offset = i * 4;
      if (!colorImage.data[offset + 3]) return;
      writeSplatSample(sample, (x + .5) / width, (y + .5) / height, width, height, radii[i],
        radii[y * width + (x + width - 1) % width], radii[y * width + (x + 1) % width],
        radii[Math.max(0, y - 1) * width + x], radii[Math.min(height - 1, y + 1) * width + x]);
      center.fromArray(sample.center); scales.fromArray(sample.scales); quaternion.fromArray(sample.quaternion);
      // Spark's packed RGB is sRGB, unlike a conventional THREE material's
      // linear color. Match Spark's own imageSplats: copy bytes / 255 directly.
      color.r = colorImage.data[offset] / 255;
      color.g = colorImage.data[offset + 1] / 255;
      color.b = colorImage.data[offset + 2] / 255;
      packed.pushSplat(center, scales, quaternion, colorImage.data[offset + 3] / 255, color);
      splatCount++;
    }, .3, .94);
    colorImage.data = null;
    checkAbort(workSignal);
    mesh = new SplatMesh({packedSplats: packed, raycastable: false, enableLod: false});
    await withAbort(mesh.initialized, workSignal);
    checkAbort(workSignal);
    // Documented Spark covariance controls: preserve the source photograph's
    // detail instead of adding its default .3-pixel-variance reconstruction blur.
    // Keep a little anti-aliasing, and discard only sub-byte alpha fringes.
    spark = new SparkRenderer({renderer, onDirty: notifyDirty, enableLod: false,
      preBlurAmount: 0, blurAmount: .05, minAlpha: 1 / 255});
    group = new Group(); group.name = 'Inferred room depth';
    group.add(mesh, spark); scene.add(group);
    notifyDirty(); report('ready', 1);
    return {
      setVisible(visible) {if (!disposed) {group.visible = !!visible; notifyDirty();}},
      dispose,
      depthAt(u, v) {return depthValues ? radialDepth(sampleRelativeDepth(depthValues, depthWidth, depthHeight, u, v)) : DEPTH_FAR;},
      splatCount
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
