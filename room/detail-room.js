import {BufferAttribute, BufferGeometry, ClampToEdgeWrapping, Frustum, Group, LinearFilter, LinearMipmapLinearFilter, Matrix4, Mesh, MeshBasicMaterial, Sphere, SRGBColorSpace, Texture, Vector3} from './vendor/three.module.js';
import {buildTileGeometryData, maxTilePlaneDistance, normalizeDetailManifest, tileBounds} from './detail-math.mjs?v=detail-2';

const abortError = () => new DOMException('Room detail was closed.', 'AbortError');
const checkAbort = signal => {if (signal?.aborted) throw abortError();};
const MiB = 1024 * 1024;

export function textureByteSize(width, height) {
  let total = 0;
  do {total += width * height * 4; if (width === 1 && height === 1) break; width = Math.max(1, width >> 1); height = Math.max(1, height >> 1);} while (true);
  return total;
}

async function loadImage(url, {signal}) {
  const response = await fetch(url, {signal, credentials:'omit'});
  if (!response.ok) throw new Error(`Room detail could not load (${response.status}).`);
  const blob = await response.blob(); checkAbort(signal);
  const bitmap = await createImageBitmap(blob, {imageOrientation:'none', premultiplyAlpha:'none', colorSpaceConversion:'none'});
  if (signal.aborted) {bitmap.close(); throw abortError();}
  return bitmap;
}

function defaultEnvironment() {
  return {loadImage, now:()=>performance.now(),
    loadManifest:async (url, {signal})=>{const response=await fetch(url,{signal,credentials:'omit'});if(!response.ok)throw new Error('Room detail manifest could not load.');return response.json();}};
}

/**
 * Texture detail is independent of geometry resolution. An ordinary visit uses
 * spherical patches; setDepthSampler(depthRoom.depthAt) makes the same patches
 * follow the inferred room surface. The caller owns the original panorama and
 * Gaussian fallback. Nothing here requests a camera or changes its projection.
 *
 * update(camera,{width,height,pixelRatio}) accepts CSS viewport dimensions.
 * onCoverage reports whether every selected-view tile at the chosen level is
 * ready. Gaps at depth discontinuities deliberately retain the caller's fallback.
 */
export async function createDetailRoom({renderer, scene, manifest, manifestUrl, baseUrl, onDirty=()=>{}, onStatus=()=>{}, onCoverage=()=>{}, signal, depthAt=null, depthRange=[2.5,8], mobile=false, maxTextureBytes=(mobile?80:160)*MiB, maxConcurrent=2}, environment=defaultEnvironment()) {
  if (!renderer || !scene) throw new TypeError('Room detail needs a renderer and scene.');
  if (!manifest && !manifestUrl) throw new TypeError('Room detail needs a manifest.');
  if (depthAt != null && typeof depthAt !== 'function') throw new TypeError('Invalid detail depth sampler.');
  if(!Array.isArray(depthRange)||depthRange.length!==2||!depthRange.every(Number.isFinite)||depthRange[0]<=0||depthRange[1]<depthRange[0])throw new TypeError('Invalid detail depth range.');
  if (!Number.isFinite(maxTextureBytes) || maxTextureBytes < 4 || !Number.isInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 4) throw new TypeError('Invalid room detail budget.');
  checkAbort(signal);
  const controller = new AbortController();
  let group, disposed=false, visible=true, sampler=depthAt, bytes=0, reserved=0, tick=0, levelWidth=0, coverage=false;
  let wanted=[], wantedIds=new Set(), allVisibleCount=0;
  const records=new Map(), inFlight=new Map();
  const frustum=new Frustum(), matrix=new Matrix4(), direction=new Vector3(), center=new Vector3();
  const maxSize=renderer.capabilities?.maxTextureSize ?? 4096;
  const anisotropy=Math.min(8,renderer.capabilities?.getMaxAnisotropy?.() ?? 1);
  const state=()=>({visible,levelWidth,ready:wanted.filter(r=>r.state==='ready').length,retained:visible?[...records.values()].filter(r=>r.state==='ready'&&r.mesh.visible&&!wantedIds.has(r.tile.id)).length:0,requested:wanted.length,visibleTiles:allVisibleCount,loading:inFlight.size,textureBytes:bytes,reservedBytes:reserved,maxTextureBytes,complete:coverage});
  function announce() {
    if(disposed)return;
    const next=visible && wanted.length>0 && wanted.length===allVisibleCount && wanted.every(r=>r.state==='ready');
    if(next!==coverage){coverage=next;onCoverage(next,state());}
    onStatus(state());
  }
  function release(record) {
    if(record.state!=='ready')return;
    record.mesh.removeFromParent();record.mesh.geometry.dispose();record.mesh.material.dispose();record.texture.dispose();
    record.bitmap?.close();record.bitmap=null;record.mesh=record.texture=null;record.state='idle';
    bytes-=record.bytes;record.bytes=0;
  }
  function cancel(record) {
    const pending=inFlight.get(record.tile.id);if(!pending)return;
    inFlight.delete(record.tile.id);reserved-=pending.bytes;pending.controller.abort();
    if(record.state==='loading')record.state='idle';
  }
  function dispose() {
    if(disposed)return;disposed=true;controller.abort();signal?.removeEventListener('abort',dispose);
    for(const record of records.values()){cancel(record);release(record);}
    group?.removeFromParent();group?.clear();wanted=[];wantedIds.clear();records.clear();coverage=false;
    onDirty();
  }
  signal?.addEventListener('abort',dispose,{once:true});
  function overlaps(a,b) {
    const epsilon=1e-10;
    return Math.min(a.u1,b.u1)-Math.max(a.u0,b.u0)>epsilon && Math.min(a.v1,b.v1)-Math.max(a.v0,b.v0)>epsilon;
  }
  function refreshVisibility() {
    const drawn=wanted.filter(record=>record.state==='ready');
    const cached=[...records.values()].filter(record=>record.state==='ready'&&!wantedIds.has(record.tile.id)
      &&record.tile.levelWidth!==levelWidth&&wanted.some(next=>overlaps(record.tile,next.tile)))
      .sort((a,b)=>b.tile.levelWidth-a.tile.levelWidth);
    // Keep the previous detail during a level change. As soon as any new
    // patch overlaps an old one, hide that whole old patch: no coincident
    // surfaces or depth bias can make their different meshes fight in Z.
    // The ordinary panorama fills siblings that have not finished loading.
    for(const record of cached)if(!drawn.some(next=>overlaps(record.tile,next.tile)))drawn.push(record);
    const drawnIds=new Set(drawn.map(record=>record.tile.id));
    for(const record of records.values())if(record.state==='ready'){
      record.mesh.visible=visible&&drawnIds.has(record.tile.id);
      if(record.mesh.visible)record.used=++tick;
    }
  }
  function evictFor(required) {
    // Retained visible patches are expendable when necessary, but cached
    // invisible textures go first. Reservations always count toward the cap.
    const cached=[...records.values()].filter(r=>r.state==='ready'&&!wantedIds.has(r.tile.id)).sort((a,b)=>Number(a.mesh.visible)-Number(b.mesh.visible)||a.used-b.used);
    while(bytes+reserved+required>maxTextureBytes && cached.length)release(cached.shift());
    refreshVisibility();
    return bytes+reserved+required<=maxTextureBytes;
  }
  function geometry(tile) {
    const data=buildTileGeometryData(tile,{segments:Math.min(128,Math.max(32,Math.ceil(tile.tileSize/16))),radius:9.98,
      depthAt:sampler ? (u,v)=>sampler(u,v)*.9997 : null});
    const result=new BufferGeometry();result.setAttribute('position',new BufferAttribute(data.positions,3));result.setAttribute('uv',new BufferAttribute(data.uvs,2));result.setIndex(new BufferAttribute(data.indices,1));
    result.boundingSphere=new Sphere(new Vector3().fromArray(data.center),data.boundingRadius);
    return result;
  }
  async function start(record) {
    const pending={controller:new AbortController(),bytes:record.estimated};
    inFlight.set(record.tile.id,pending);reserved+=pending.bytes;record.state='loading';
    let bitmap,texture,mesh;
    try {
      bitmap=await environment.loadImage(record.tile.url,{signal:pending.controller.signal});
      if(disposed || pending.controller.signal.aborted || inFlight.get(record.tile.id)!==pending){bitmap.close();return;}
      if(bitmap.width!==record.tile.textureWidth || bitmap.height!==record.tile.textureHeight)throw new Error('Room detail tile dimensions do not match its manifest.');
      texture=new Texture(bitmap);texture.colorSpace=SRGBColorSpace;texture.flipY=false;
      texture.wrapS=texture.wrapT=ClampToEdgeWrapping;texture.minFilter=LinearMipmapLinearFilter;texture.magFilter=LinearFilter;texture.generateMipmaps=true;texture.anisotropy=anisotropy;texture.needsUpdate=true;
      mesh=new Mesh(geometry(record.tile),new MeshBasicMaterial({map:texture}));mesh.name=`Room detail ${record.tile.id}`;
      // Upload before releasing decoded pixels. The site handles context loss
      // by returning to its static fallback and requiring a fresh room load.
      renderer.initTexture?.(texture);
      bitmap.close();bitmap=null;
      record.texture=texture;record.mesh=mesh;record.bytes=pending.bytes;record.bitmap=null;record.used=++tick;record.state='ready';
      bytes+=pending.bytes;group.add(mesh);refreshVisibility();onDirty();
    } catch(error) {
      bitmap?.close();texture?.dispose();mesh?.geometry.dispose();mesh?.material.dispose();
      if(inFlight.get(record.tile.id)===pending){record.state=pending.controller.signal.aborted?'idle':'error';record.retryAfter=environment.now()+30000;}
    } finally {
      if(inFlight.get(record.tile.id)===pending){inFlight.delete(record.tile.id);reserved-=pending.bytes;}
      if(!disposed){announce();pump();}
    }
  }
  function pump() {
    if(disposed||!visible)return;
    for(const record of wanted){
      if(inFlight.size>=maxConcurrent)break;
      if(record.state==='ready'||record.state==='loading'||(record.state==='error'&&record.retryAfter>environment.now()))continue;
      if(evictFor(record.estimated))void start(record);
    }
  }
  let normalized;
  try {
    const source=manifest ?? await environment.loadManifest(manifestUrl,{signal:controller.signal});checkAbort(controller.signal);
    const sourceBase=baseUrl ?? manifestUrl;
    const absoluteBase=sourceBase ? new URL(sourceBase,typeof document==='undefined'?import.meta.url:document.baseURI).href : undefined;
    normalized=normalizeDetailManifest(source,{baseUrl:absoluteBase});
    normalized.levels=normalized.levels.filter(level=>level.tiles.every(tile=>tile.textureWidth<=maxSize&&tile.textureHeight<=maxSize));
    if(!normalized.levels.length)throw new Error('Room detail exceeds this device’s texture size.');
    for(const level of normalized.levels)for(const tile of level.tiles){const bounds=tileBounds(tile,10);records.set(tile.id,{tile,bounds,state:'idle',estimated:textureByteSize(tile.textureWidth,tile.textureHeight),bytes:0,used:0,retryAfter:0});}
    group=new Group();group.name='Progressive room detail';scene.add(group);
  } catch(error) {dispose();throw error;}
  return {
    update(camera,{width=1080*camera.aspect,height=1080,pixelRatio=1}={}) {
      if(disposed||!visible)return;
      if(!camera?.isPerspectiveCamera||![width,height,pixelRatio].every(value=>Number.isFinite(value)&&value>0))return;
      camera.updateMatrixWorld();matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(matrix,camera.coordinateSystem,camera.reversedDepth);camera.getWorldDirection(direction);
      const projectedHeight=height*pixelRatio;
      // Central texel density at the narrowest current view. A small bias keeps
      // oblique rays crisp without eagerly loading the largest level at all zooms.
      const requestedWidth=Math.PI*projectedHeight/Math.tan(camera.fov*Math.PI/360)*1.05;
      let index=normalized.levels.findIndex(level=>level.width>=requestedWidth);if(index<0)index=normalized.levels.length-1;
      function candidates(level){return level.tiles.map(tile=>records.get(tile.id)).filter(record=>{
        // Exact extrema over the spherical patch avoid broad bounding spheres
        // selecting half the room and unnecessarily forcing a lower detail level.
        // A plane is linear in radius. Checking both depth endpoints includes
        // every surface between them even when the eye has moved diagonally.
        return frustum.planes.every(plane=>{
          const normal=[plane.normal.x,plane.normal.y,plane.normal.z];
          const maximum=sampler?Math.max(...depthRange.map(radius=>maxTilePlaneDistance(record.tile,normal,plane.constant,radius))):maxTilePlaneDistance(record.tile,normal,plane.constant,9.98);
          return maximum>=-.04;
        });
      }).sort((a,b)=>center.fromArray(b.bounds.center).normalize().dot(direction)-center.fromArray(a.bounds.center).normalize().dot(direction));}
      let selected=candidates(normalized.levels[index]);
      while(index>0&&selected.reduce((sum,r)=>sum+r.estimated,0)>maxTextureBytes){index--;selected=candidates(normalized.levels[index]);}
      const desired=[];let required=0;allVisibleCount=selected.length;
      for(const record of selected)if(required+record.estimated<=maxTextureBytes){desired.push(record);required+=record.estimated;}
      wanted=desired;wantedIds=new Set(wanted.map(record=>record.tile.id));levelWidth=normalized.levels[index].width;
      for(const record of records.values()){
        if(record.state==='loading'&&!wantedIds.has(record.tile.id))cancel(record);
      }
      refreshVisibility();
      announce();pump();
    },
    setVisible(value) {
      if(disposed)return;visible=!!value;group.visible=visible;
      if(!visible){for(const record of records.values())cancel(record);wanted=[];wantedIds.clear();}
      announce();onDirty();
    },
    setDepthSampler(next) {
      if(disposed||next===sampler)return;
      if(next!=null&&typeof next!=='function')throw new TypeError('Invalid detail depth sampler.');
      sampler=next;
      for(const record of records.values())if(record.state==='ready'){const previous=record.mesh.geometry;record.mesh.geometry=geometry(record.tile);previous.dispose();}
      onDirty();
    },
    dispose,
    get stats(){return state();}
  };
}
