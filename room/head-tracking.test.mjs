import test from 'node:test';
import assert from 'node:assert/strict';
import {createHeadTracker} from './head-tracking.js';
import {measureHead,headOffset} from './head-tracking-math.mjs';
import {constrainPanoramaView,lookDirection} from './scene-math.js';
import {PerspectiveCamera,Vector3} from './vendor/three.module.js';

const deferred = () => {let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function landmarks(x=.5,y=.45,span=.2){const points=[];points[33]={x:x-span/2,y};points[263]={x:x+span/2,y};return points;}
function fixture(overrides={}) {
  let next=0,mediaCalls=0,modelCalls=0,stopped=0,closed=0,removed=0;
  const frames=new Map(),timers=new Map(),states=[],poses=[];
  const track={stop:()=>stopped++,addEventListener(){}};
  const stream={getTracks:()=>[track],getVideoTracks:()=>[track]};
  const video={readyState:4,currentTime:0,play:async()=>{},pause(){},remove:()=>removed++};
  let face=landmarks();
  const model={close:()=>closed++,detectForVideo:()=>({faceLandmarks:face?[face]:[]})};
  const environment={supported:()=>true,getMedia:async()=>{mediaCalls++;return stream;},createVideo:()=>video,loadLandmarker:async()=>{modelCalls++;return model;},requestFrame:cb=>{frames.set(++next,cb);return next;},cancelFrame:id=>frames.delete(id),setTimer:cb=>{timers.set(++next,cb);return next;},clearTimer:id=>timers.delete(id),...overrides};
  const tracker=createHeadTracker({onPose:p=>poses.push(p),onState:s=>states.push(s),environment});
  let clock=0;
  const tick=()=>{clock+=90;video.currentTime+=.09;const cbs=[...frames.values()];frames.clear();cbs.forEach(cb=>cb(clock));};
  return {tracker,stream,model,video,frames,timers,states,poses,tick,setFace:value=>{face=value;},stats:()=>({mediaCalls,modelCalls,stopped,closed,removed})};
}

test('a normal visit loads no model and never requests a camera',()=>{
  const f=fixture();assert.equal(f.tracker.phase,'off');assert.deepEqual(f.stats(),{mediaCalls:0,modelCalls:0,stopped:0,closed:0,removed:0});assert.equal(f.frames.size,0);
});
test('calibration, motion, face loss and stop restore neutral and release resources',async()=>{
  const f=fixture();await f.tracker.start();
  for(let i=0;i<12;i++)f.tick();assert.equal(f.tracker.phase,'tracking');
  f.setFace(landmarks(.3,.3,.3));f.tick();const moved=f.poses.at(-1);
  assert.ok(moved.yaw>0 && moved.pitch>0 && moved.fov<0);
  f.setFace(null);for(let i=0;i<10;i++)f.tick();assert.equal(f.tracker.phase,'waiting');assert.deepEqual(f.poses.at(-1),{yaw:0,pitch:0,fov:0});
  f.tracker.stop();assert.equal(f.poses.at(-1),null);assert.equal(f.frames.size,0);assert.equal(f.video.srcObject,null);assert.deepEqual(f.stats(),{mediaCalls:1,modelCalls:1,stopped:1,closed:1,removed:1});
});
test('recenter calibrates a new neutral position instead of accumulating offsets',async()=>{
  const f=fixture();await f.tracker.start();for(let i=0;i<12;i++)f.tick();
  f.setFace(landmarks(.3,.3,.3));f.tracker.recenter();for(let i=0;i<12;i++)f.tick();
  const pose=f.poses.at(-1);assert.ok(Object.values(pose).every(value=>Math.abs(value)<1e-10));f.tracker.stop();
});
test('denied permission never loads a model and returns to off',async()=>{
  const f=fixture({getMedia:async()=>{throw Object.assign(new Error(),{name:'NotAllowedError'});}});
  await f.tracker.start();assert.equal(f.tracker.phase,'error');assert.match(f.states.at(-1).message,/permission/);assert.equal(f.stats().modelCalls,0);assert.equal(f.poses.at(-1),null);
});
test('stopping during a pending permission request disposes a late stream',async()=>{
  const pending=deferred(),f=fixture({getMedia:()=>pending.promise});const start=f.tracker.start();
  f.tracker.stop();pending.resolve(f.stream);await start;
  assert.equal(f.stats().stopped,1);assert.equal(f.stats().modelCalls,0);assert.equal(f.tracker.phase,'off');
});
test('stopping while the model loads closes its late result',async()=>{
  const pending=deferred(),entered=deferred(),f=fixture({loadLandmarker:()=>{entered.resolve();return pending.promise;}});
  const start=f.tracker.start();await entered.promise;f.tracker.stop();pending.resolve(f.model);await start;
  assert.equal(f.stats().closed,1);assert.equal(f.stats().stopped,1);assert.equal(f.frames.size,0);assert.equal(f.tracker.phase,'off');
});
test('model timeout stops the camera and disposes a model that resolves later',async()=>{
  const pending=deferred(),entered=deferred(),f=fixture({loadLandmarker:()=>{entered.resolve();return pending.promise;}});
  const start=f.tracker.start();await entered.promise;for(const cb of f.timers.values())cb();await start;
  assert.equal(f.stats().stopped,1);assert.equal(f.tracker.phase,'error');pending.resolve(f.model);await Promise.resolve();assert.equal(f.stats().closed,1);
});
test('missing/invalid landmarks stay neutral and extreme movements remain bounded',()=>{
  assert.equal(measureHead([]),null);assert.equal(measureHead(landmarks(NaN)),null);
  const centre={x:.5,y:.5,span:.2};assert.deepEqual(headOffset({x:Infinity,y:0,span:0},centre),{yaw:0,pitch:0,fov:0});
  for(const x of [-100,0,.5,1,100])for(const y of [-100,.5,100])for(const span of [.00001,.2,10]){
    const pose=headOffset({x,y,span},centre,10);assert.ok(Math.abs(pose.yaw)<=22 && Math.abs(pose.pitch)<=13 && pose.fov>=-10 && pose.fov<=8);
  }
});
test('head offsets cannot expose the rear panorama seam, including wide screens',()=>{
  for(const aspect of [.45,1,16/9,4])for(const yaw of [-150,0,150])for(const pitch of [-45,0,45])for(const zoom of [40,78,90])for(const offset of [-1,1]){
    const v=constrainPanoramaView(yaw+22*offset,pitch+13*offset,zoom+10*offset,aspect);
    const camera=new PerspectiveCamera(v.fov,aspect,.1,30);camera.lookAt(lookDirection(v.yaw,v.pitch));camera.updateMatrixWorld();
    for(const x of [-1,0,1])for(const y of [-1,0,1]){const ray=new Vector3(x,y,.5).unproject(camera).normalize();assert.ok(Math.abs(Math.atan2(-ray.z,-ray.x)*180/Math.PI)<=172+1e-8);}
  }
});
