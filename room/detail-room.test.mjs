import test from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera, Scene, SRGBColorSpace, Vector3} from './vendor/three.module.js';
import {createDetailRoom, textureByteSize} from './detail-room.js';
import {applyDepthCamera} from './depth-camera.mjs';

function manifest(width=128,tileSize=16) {
  const height=width/2,tiles=[];
  for(let y=0;y<Math.ceil(height/tileSize);y++)for(let x=0;x<Math.ceil(width/tileSize);x++)tiles.push({x,y,url:`https://example.com/${width}/${x}-${y}.png`});
  return {version:1,width,height,tileSize,tiles};
}
const camera=(yaw=0,fov=40)=>{const c=new PerspectiveCamera(fov,16/9,.1,30);c.lookAt(new Vector3(-Math.cos(yaw),0,-Math.sin(yaw)));c.updateMatrixWorld();return c;};
const view={width:3840,height:2160,pixelRatio:1};
const flush=async()=>{for(let i=0;i<100;i++)await Promise.resolve();};
function fixture({held=false,width=128,tileSize=16,budget=1024*1024}={}) {
  const scene=new Scene(),source=manifest(width,tileSize),pending=[],calls=[],uploads=[],closed=[],coverage=[];
  const image=url=>({width:Math.min(tileSize,width-Number(url.split('/').at(-1).split('-')[0])*tileSize),height:tileSize,close:()=>closed.push(url)});
  const renderer={capabilities:{maxTextureSize:4096,getMaxAnisotropy:()=>16},initTexture:texture=>uploads.push(texture)};
  const environment={now:()=>0,loadImage:(url,{signal})=>{calls.push({url,signal});return held?new Promise((resolve,reject)=>pending.push({url,signal,resolve:()=>resolve(image(url)),reject})):Promise.resolve(image(url));}};
  return {scene,source,pending,calls,uploads,closed,coverage,environment,
    options:{scene,renderer,manifest:source,maxTextureBytes:budget,onCoverage:complete=>coverage.push(complete)}};
}

test('texture budgets include the complete mip chain',()=>{
  assert.equal(textureByteSize(1,1),4);
  assert.equal(textureByteSize(4,2),32+8+4);
  assert.equal(textureByteSize(2048,2048),22369620);
});

test('ordinary creation loads no images until a view needs them',async()=>{
  const f=fixture();const room=await createDetailRoom(f.options,f.environment);
  assert.equal(f.calls.length,0);assert.equal(f.scene.children.length,1);
  room.update(camera(),view);await flush();
  assert.ok(f.calls.length>0&&f.calls.length<32,'only a subset of the panorama is requested');
  assert.equal(room.stats.complete,true);
  assert.ok(f.uploads.every(texture=>texture.colorSpace===SRGBColorSpace&&texture.flipY===false&&texture.generateMipmaps&&texture.anisotropy===8));
  assert.ok(f.scene.children[0].children.every(mesh=>mesh.material.depthTest&&mesh.material.depthWrite&&!mesh.material.transparent),'sharp patches occupy the opaque depth buffer before Gaussian fallback');
  assert.equal(f.closed.length,f.uploads.length,'decoded pixels are released after GPU upload');
  let released=0;for(const texture of f.uploads)texture.addEventListener('dispose',()=>released++);
  room.dispose();assert.equal(f.scene.children.length,0);assert.equal(room.stats.textureBytes,0);
  assert.equal(released,f.uploads.length,'every uploaded texture is disposed once');
});

test('loading concurrency and texture reservation stay bounded',async()=>{
  const f=fixture({held:true,budget:textureByteSize(16,16)*3});const room=await createDetailRoom(f.options,f.environment);
  room.update(camera(),view);assert.equal(f.pending.length,2);
  assert.ok(room.stats.textureBytes+room.stats.reservedBytes<=room.stats.maxTextureBytes);
  f.pending[0].resolve();f.pending[1].resolve();await flush();
  assert.ok(f.pending.length<=3);assert.ok(room.stats.textureBytes+room.stats.reservedBytes<=room.stats.maxTextureBytes);
  for(const pending of f.pending.slice(2))pending.resolve();await flush();
  assert.equal(room.stats.complete,false,'an insufficient budget never reports full coverage');
  room.dispose();assert.equal(room.stats.textureBytes+room.stats.reservedBytes,0);
});

test('rotating the view evicts old textures instead of growing GPU memory',async()=>{
  const f=fixture({budget:textureByteSize(16,16)*6});const room=await createDetailRoom(f.options,f.environment);
  room.update(camera(),view);await flush();const firstCalls=f.calls.length,firstTextures=f.uploads.slice();let disposedTextures=0;
  for(const texture of firstTextures)texture.addEventListener('dispose',()=>disposedTextures++);
  room.update(camera(Math.PI),view);await flush();
  assert.ok(f.calls.length>firstCalls);assert.ok(disposedTextures>0);
  assert.ok(room.stats.textureBytes+room.stats.reservedBytes<=room.stats.maxTextureBytes);
  room.dispose();
});

test('leaving during a pending image read discards late results without attaching geometry',async()=>{
  const f=fixture({held:true});const controller=new AbortController();
  const room=await createDetailRoom({...f.options,signal:controller.signal},f.environment);
  room.update(camera(),view);controller.abort();for(const pending of f.pending)pending.resolve();await flush();
  assert.ok(f.calls.every(call=>call.signal.aborted));assert.equal(f.uploads.length,0);
  assert.equal(f.closed.length,f.pending.length);assert.equal(f.scene.children.length,0);assert.equal(room.stats.textureBytes,0);
  room.dispose();
});

test('replacing a view while old requests finish cannot overwrite its new state',async()=>{
  const f=fixture({held:true});const room=await createDetailRoom(f.options,f.environment);
  room.update(camera(),view);const old=f.pending.slice();room.update(camera(Math.PI),view);
  assert.ok(old.every(p=>p.signal.aborted));for(const pending of old)pending.resolve();await flush();
  assert.equal(f.uploads.length,0);assert.equal(room.stats.loading,2);
  room.dispose();for(const pending of f.pending.slice(old.length))pending.resolve();await flush();
});

test('switching depth changes geometry while preserving its sharp texture and neutral UVs',async()=>{
  const f=fixture();const room=await createDetailRoom(f.options,f.environment);
  room.update(camera(),view);await flush();const group=f.scene.children[0],mesh=group.children[0],texture=mesh.material.map,oldGeometry=mesh.geometry;
  let released=false;oldGeometry.addEventListener('dispose',()=>released=true);
  room.setDepthSampler(()=>4);assert.equal(released,true);assert.equal(mesh.material.map,texture);
  const p=mesh.geometry.attributes.position;
  for(let i=0;i<p.count;i++)assert.ok(Math.abs(Math.hypot(p.getX(i),p.getY(i),p.getZ(i))-4*.9997)<1e-5);
  room.setDepthSampler(null);
  assert.ok(Math.abs(Math.hypot(p.getX(0),p.getY(0),p.getZ(0))-4*.9997)<1e-5,'old geometry is not modified in place');
  assert.ok(Math.abs(new Vector3().fromBufferAttribute(mesh.geometry.attributes.position,0).length()-9.98)<1e-5);
  room.dispose();
});

test('wrong-size or failed tiles leave the original scene and permit other detail to load',async()=>{
  const f=fixture();let attempts=0;
  f.environment.loadImage=async()=>{attempts++;return {width:1,height:1,close(){}};};
  const ordinary={name:'ordinary panorama'};f.scene.userData.ordinary=ordinary;
  const room=await createDetailRoom(f.options,f.environment);room.update(camera(),view);await flush();
  assert.ok(attempts>0);assert.equal(room.stats.ready,0);assert.equal(room.stats.complete,false);assert.equal(room.stats.textureBytes,0);
  const before=attempts;room.update(camera(),view);await flush();assert.equal(attempts,before,'failed images are not retried every frame');
  assert.equal(f.scene.userData.ordinary,ordinary);room.dispose();
});

test('hidden detail aborts loading but retains an already uploaded bounded cache',async()=>{
  const f=fixture();const room=await createDetailRoom(f.options,f.environment);room.update(camera(),view);await flush();const count=f.calls.length;
  room.setVisible(false);assert.equal(room.stats.complete,false);assert.equal(f.scene.children[0].visible,false);
  room.update(camera(Math.PI),view);await flush();assert.equal(f.calls.length,count);
  room.setVisible(true);room.update(camera(),view);await flush();assert.equal(f.calls.length,count);assert.equal(room.stats.complete,true);
  room.dispose();
});

test('close views select true 16K detail while a wide view fits a lower level within budget',async()=>{
  const f=fixture({width:16384,tileSize:2048});
  const room=await createDetailRoom({...f.options,manifest:{version:1,levels:[manifest(8192,2048),f.source]},maxTextureBytes:160*1024*1024},f.environment);
  room.update(camera(0,40),{width:1920,height:1080,pixelRatio:2});await flush();
  assert.equal(room.stats.levelWidth,16384);assert.equal(room.stats.requested,4);assert.equal(room.stats.complete,true);
  assert.ok(room.stats.textureBytes<=160*1024*1024);
  room.update(camera(0,78),{width:1920,height:1080,pixelRatio:2});await flush();
  assert.equal(room.stats.levelWidth,8192);assert.equal(room.stats.requested,4);
  assert.ok(room.stats.textureBytes+room.stats.reservedBytes<=160*1024*1024);
  room.dispose();
});

test('coarse patches remain until overlapping fine tiles are ready, without drawing overlapping levels',async()=>{
  const f=fixture({width:16384,tileSize:2048});
  const room=await createDetailRoom({...f.options,manifest:{version:1,levels:[manifest(8192,2048),f.source]},maxTextureBytes:256*1024*1024},f.environment);
  room.update(camera(0,78),{width:1920,height:1080,pixelRatio:1});await flush();
  assert.equal(room.stats.levelWidth,8192);assert.equal(room.stats.complete,true);
  const group=f.scene.children[0],coarse=group.children.filter(mesh=>mesh.visible);
  assert.equal(coarse.length,4);
  const pending=[];
  f.environment.loadImage=(url,{signal})=>new Promise(resolve=>pending.push({url,signal,resolve:()=>resolve({width:2048,height:2048,close(){}})}));
  room.update(camera(0,40),{width:1920,height:1080,pixelRatio:2});
  assert.equal(room.stats.levelWidth,16384);assert.equal(room.stats.retained,4);assert.equal(room.stats.complete,false);
  assert.ok(coarse.every(mesh=>mesh.visible),'zoom does not immediately expose the blurred base');
  pending[0].resolve();await flush();
  assert.equal(room.stats.ready,1);assert.equal(room.stats.retained,3);
  assert.equal(coarse.filter(mesh=>mesh.visible).length,3,'only the ancestor of the ready tile is hidden');
  function bounds(mesh){const [width,x,y]=mesh.name.replace('Room detail ','').split(':').map(Number);return {u0:x*2048/width,u1:(x+1)*2048/width,v0:y*4096/width,v1:(y+1)*4096/width};}
  function assertNoOverlap(){const drawn=group.children.filter(mesh=>mesh.visible).map(bounds);for(let a=0;a<drawn.length;a++)for(let b=a+1;b<drawn.length;b++)assert.ok(Math.min(drawn[a].u1,drawn[b].u1)-Math.max(drawn[a].u0,drawn[b].u0)<=1e-10||Math.min(drawn[a].v1,drawn[b].v1)-Math.max(drawn[a].v0,drawn[b].v0)<=1e-10);}
  assertNoOverlap();
  for(let i=1;i<pending.length;i++){pending[i].resolve();await flush();assertNoOverlap();}
  assert.equal(room.stats.complete,true);assert.equal(room.stats.retained,0);assert.ok(coarse.every(mesh=>!mesh.visible));
  room.dispose();
});

test('retained coarse detail yields to pending fine tiles when the texture budget is tight',async()=>{
  const f=fixture({width:16384,tileSize:2048}),budget=textureByteSize(2048,2048)*5;
  const room=await createDetailRoom({...f.options,manifest:{version:1,levels:[manifest(8192,2048),f.source]},maxTextureBytes:budget},f.environment);
  room.update(camera(0,78),{width:1920,height:1080,pixelRatio:1});await flush();
  assert.equal(room.stats.ready,4);
  const pending=[];
  f.environment.loadImage=(url,{signal})=>new Promise(resolve=>pending.push({url,signal,resolve:()=>resolve({width:2048,height:2048,close(){}})}));
  room.update(camera(0,40),{width:1920,height:1080,pixelRatio:2});
  assert.ok(room.stats.retained>0&&room.stats.retained<4,'some coarse coverage survives within the strict budget');
  assert.equal(pending.length,2);
  assert.ok(room.stats.textureBytes+room.stats.reservedBytes<=budget);
  for(let i=0;i<pending.length;i++){pending[i].resolve();await flush();assert.ok(room.stats.textureBytes+room.stats.reservedBytes<=budget);}
  assert.equal(room.stats.ready,4);assert.equal(room.stats.complete,true);assert.equal(room.stats.retained,0);
  room.dispose();assert.equal(room.stats.textureBytes+room.stats.reservedBytes,0);
});

test('the production 20K pyramid stays at full detail across a 4K viewport and bounded head movement',async()=>{
  const f=fixture({width:20480,tileSize:1024});
  const levels=[4096,8192,12288,20480].map(width=>({...manifest(width,1024),gutter:2}));
  f.environment.loadImage=async()=>({width:1028,height:1028,close(){}});
  const room=await createDetailRoom({...f.options,manifest:{version:1,levels},maxTextureBytes:160*1024*1024,depthAt:()=>4},f.environment);
  for(const pitch of [0,30,45])for(const yaw of [0,22,44,70,110]){
    const c=camera();applyDepthCamera(c,{yaw,pitch,fov:40,aspect:16/9,pose:{yaw:22,pitch:13,fov:10}});
    room.update(c,{width:3840,height:2160,pixelRatio:1});await flush();
    assert.equal(room.stats.levelWidth,20480,`full detail at yaw ${yaw}, pitch ${pitch}`);
    assert.equal(room.stats.complete,true);
    assert.ok(room.stats.requested<=24,'only the current viewing direction occupies GPU detail memory');
    assert.ok(room.stats.textureBytes+room.stats.reservedBytes<=160*1024*1024);
  }
  room.dispose();assert.equal(room.stats.textureBytes+room.stats.reservedBytes,0);
});
