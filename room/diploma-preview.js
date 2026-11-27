import * as THREE from './vendor/three.module.js';
import {panoramaPoint, lookDirection, constrainPanoramaView} from './scene-math.js';
import {createPanoramaSphere} from './panorama.js';
import {createTrackingStart, mountRoomEntry} from './room-entry.js?v=entry-1';

const container = document.querySelector('#scene');
const status = document.querySelector('#scene-status');
const error = document.querySelector('#error');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const places = {
  room: {file:'detail/room-source.jpg', label:'The room', yaw:0, pitch:-3, fov:78,
    spots:[{u:.36,v:.49,label:'Sit at the desk',panel:'words'},{u:.625,v:.47,label:'The reading shelf',panel:'books'},{u:.48,v:.51,label:'The record player',panel:'sounds',source:'albums'},{u:.755,v:.765,label:'A little about me',panel:'about'}]},
  desk: {file:'desk-panorama.png',label:'At the desk',yaw:0,pitch:-5,fov:76,
    spots:[{u:.40,v:.56,label:'A few open questions',panel:'words'},{u:.52,v:.32,label:'The person behind the page',panel:'about'},{u:.63,v:.56,label:'The record player',panel:'sounds',source:'albums'}]},
  chair: {file:'chair-panorama.png',label:'Take a seat',yaw:0,pitch:-3,fov:78,
    spots:[{u:.64,v:.46,label:'Choose an essay',panel:'words'},{u:.52,v:.57,label:'The record player',panel:'sounds',source:'albums'},{u:.78,v:.81,label:'A little about me',panel:'about'}]},
  stereo: {file:'stereo-panorama.png',label:'The stereo',yaw:0,pitch:-8,fov:72,
    spots:[{u:.48,v:.58,label:'The record player',panel:'sounds',source:'albums'},{u:.546,v:.60,label:'The CD binder',panel:'sounds',source:'tracks'},{u:.705,v:.39,label:'The reading shelf',panel:'books'}]}
};
let renderer, camera, scene, sphere, material;
let yaw=0,pitch=-3,fov=78,targetYaw=0,targetPitch=-3,targetFov=78;
let active='room', spots=[], drag=null, request=0, ready=false, dirty=true;
// Opt-in offsets never overwrite the ordinary drag/keyboard camera state.
let headPose=null, headTracker;
const headView={yaw:0,pitch:0,fov:0};
let depthRoom,depthCamera,depthController,depthPending=false,depthEnabled=false,depthTexture,depthDemo=0,depthPreviewIntent=0;
let detailRoom,detailController;
let diplomas,diplomaController;
const depthStatus=document.querySelector('#room-depth-status');
const depthSwitch=document.querySelector('#room-depth-switch');
const depthPreview=document.querySelector('#room-depth-preview');
const depthActive=()=>depthEnabled && !!depthRoom && active==='room';
const pointers=new Map();
let pinchDistance=null;
const textures=new Map();
const clamp=THREE.MathUtils.clamp;
const projected=new THREE.Vector3();
const viewDirection=new THREE.Vector3();
function interact(){ document.body.classList.add('exploring'); }
function rebuildSpots(){
  const root=document.querySelector('#hotspots');root.replaceChildren();
  spots=places[active].spots.map((spot)=>{
    const button=document.createElement('button');button.className='hotspot';button.textContent=spot.label;button.dataset.panel=spot.panel;if(spot.source)button.dataset.source=spot.source;button.type='button';root.append(button);
    return {...spot,button,point:panoramaPoint(spot.u,spot.v,depthActive()?depthRoom.depthAt(spot.u,spot.v):9)};
  });
}
async function texture(file){
  if(!textures.has(file)){
    const pending=new THREE.TextureLoader().loadAsync(new URL(file, import.meta.url).href).then((t)=>{t.colorSpace=THREE.SRGBColorSpace;t.minFilter=THREE.LinearFilter;t.magFilter=THREE.LinearFilter;t.generateMipmaps=false;return t;}).catch((e)=>{textures.delete(file);throw e;});
    textures.set(file,pending);
  }
  return textures.get(file);
}
function resize(){
  if(!renderer)return;
  const width=Math.max(1,container.clientWidth),height=Math.max(1,container.clientHeight);
  camera.aspect=width/height;camera.updateProjectionMatrix();
  // Keep Retina detail while bounding the drawing buffer to roughly 4K.
  renderer.setPixelRatio(Math.min(devicePixelRatio,2,Math.sqrt(8388608/(width*height))));
  renderer.setSize(width,height);dirty=true;
}
function syncRoomDetail(){
  // Splats fill gaps behind the final sharp-surface composition pass.
  depthRoom?.setVisible(depthActive() && !document.hidden);
  const papersVisible=active==='room' && !document.hidden && !document.body.dataset.experience;
  diplomas?.setVisible(papersVisible);
  if(papersVisible)diplomas?.setDepthSampler(depthActive()?depthRoom.depthAt:null);
  if(!detailRoom)return;
  if(active!=='room' || document.hidden){detailRoom.setVisible(false);return;}
  detailRoom.setDepthSampler(depthActive()?depthRoom.depthAt:null);
  detailRoom.setVisible(true);
}
async function openRoomDetail(){
  const controller=new AbortController();detailController=controller;
  try{
    const {createDetailRoom}=await import('./detail-room.js?v=detail-3');
    if(controller.signal.aborted)return;
    const result=await createDetailRoom({renderer,scene,signal:controller.signal,
      manifestUrl:new URL('detail/room-detail.json?v=detail-2',import.meta.url).href,
      mobile:matchMedia('(max-width:760px)').matches,
      onDirty:()=>{dirty=true;},
      onCoverage:()=>{dirty=true;}});
    if(controller.signal.aborted){result.dispose();return;}
    detailRoom=result;syncRoomDetail();dirty=true;
  }catch(failure){if(!controller.signal.aborted)console.warn('Optional room detail unavailable',failure);}
}
async function openRoomDiplomas(){
  const controller=new AbortController();diplomaController=controller;
  try{
    const {createDiplomas}=await import('./diplomas.js?v=diploma-1');
    if(controller.signal.aborted)return;
    const result=await createDiplomas({renderer,signal:controller.signal,onDirty:()=>{dirty=true;}});
    if(controller.signal.aborted){result.dispose();return;}
    diplomas=result;syncRoomDetail();dirty=true;
  }catch(failure){if(!controller.signal.aborted)console.warn('Room diploma lettering unavailable',failure);}
}
async function moveTo(name){
  if(!places[name] || (!ready && name!=='room'))return;
  const id=++request;
  status.textContent=`Opening ${places[name].label.toLowerCase()}…`;
  document.querySelectorAll('[data-place]').forEach((b)=>{b.disabled=true;});
  try{
    const next=await texture(places[name].file);
    if(id!==request)return;
    if(ready && !reduced){
      renderer.domElement.style.transition='opacity .35s';renderer.domElement.style.opacity='.05';
      await new Promise((resolve)=>setTimeout(resolve,350));
    }
    if(id!==request)return;
    active=name;depthDemo=0;material.map=depthActive()?depthTexture:next;material.needsUpdate=true;
    depthRoom?.setVisible(depthActive());
    syncRoomDetail();
    const position=places[name];yaw=targetYaw=position.yaw;pitch=targetPitch=position.pitch;fov=targetFov=position.fov;
    rebuildSpots();ready=true;dirty=true;
    // Draw the new room before revealing its canvas over the opening image.
    animate();document.body.classList.add('ready');error.hidden=true;
    renderer.domElement.style.opacity='1';
    status.textContent='';
    document.querySelectorAll('[data-place]').forEach((b)=>{b.setAttribute('aria-pressed',String(b.dataset.place===name));});
    if(name!=='room')interact();
  }catch(e){
    console.error('Room image could not load',e);
    if(!ready){error.hidden=false;status.textContent='Read and listen using the controls below.';}
    else status.textContent='That view couldn’t open. Try choosing it again.';
  }finally{document.querySelectorAll('[data-place]').forEach((b)=>{b.disabled=false;});}
}
function animate(){
  if(!ready)return;
  const target=constrainPanoramaView(targetYaw,targetPitch,targetFov,camera.aspect);
  targetYaw=target.yaw;targetPitch=target.pitch;targetFov=target.fov;
  const headMotion=headPose ? Math.abs(headPose.yaw-headView.yaw)+Math.abs(headPose.pitch-headView.pitch)+Math.abs(headPose.fov-headView.fov) : 0;
  if(!dirty && !depthDemo && headMotion<.001 && Math.abs(targetYaw-yaw)+Math.abs(targetPitch-pitch)+Math.abs(targetFov-fov)<.0001)return;
  dirty=false;
  const easing=reduced?1:.12;
  yaw+=(targetYaw-yaw)*easing;pitch+=(targetPitch-pitch)*easing;fov+=(targetFov-fov)*easing;
  // Also bound intermediate frames during zoom, tilt, and viewport changes.
  const view=constrainPanoramaView(yaw,pitch,fov,camera.aspect);
  yaw=view.yaw;pitch=view.pitch;fov=view.fov;
  let rendered=view;
  if(headPose){
    for(const key of ['yaw','pitch','fov'])headView[key]+=(headPose[key]-headView[key])*.16;
    rendered=constrainPanoramaView(yaw+headView.yaw,pitch+headView.pitch,fov+headView.fov,camera.aspect);
  }
  if(depthActive()){
    let pose=headPose?headView:null;
    if(depthDemo){
      const t=(performance.now()-depthDemo)/8000;
      if(t>=1){depthDemo=0;dirty=true;}
      else {const ease=Math.sin(Math.PI*t)**2;pose={yaw:22*Math.sin(t*Math.PI*2)*ease,pitch:9*Math.sin(t*Math.PI*4)*ease,fov:-5*Math.sin(t*Math.PI)*ease};}
    }
    depthCamera(camera,{yaw,pitch,fov,aspect:camera.aspect,pose});
  }else{
    camera.position.set(0,0,0);
    camera.lookAt(lookDirection(rendered.yaw,rendered.pitch));camera.fov=rendered.fov;camera.updateProjectionMatrix();camera.updateMatrixWorld();
  }
  try{
    detailRoom?.update(camera,{width:container.clientWidth,height:container.clientHeight,pixelRatio:renderer.getPixelRatio()});
    renderer.render(scene,camera);
    detailRoom?.render(camera);
  }
  catch(failure){
    if(!depthActive() && !detailRoom)throw failure;
    console.warn('Room detail paused; restoring the original view',failure);
    cancelDepthLoad();detailController?.abort();detailRoom?.dispose();detailRoom=null;
    depthRoom?.dispose();depthRoom=null;showDepth(false);
    depthStatus.textContent='Depth paused on this device. The original room is ready to explore.';
    camera.position.set(0,0,0);camera.lookAt(lookDirection(yaw,pitch));camera.fov=fov;camera.updateProjectionMatrix();camera.updateMatrixWorld();
    renderer.render(scene,camera);
  }
  try{diplomas?.render(camera);}
  catch(failure){console.warn('Room diploma lettering paused',failure);diplomaController?.abort();diplomas?.dispose();diplomas=null;}
  camera.getWorldDirection(viewDirection);
  for(const spot of spots){
    projected.copy(spot.point).project(camera);
    const visible=spot.point.dot(viewDirection)>0 && Math.abs(projected.x)<.92 && projected.y>-.62 && projected.y<.78;
    spot.button.hidden=!visible;
    if(visible){spot.button.style.left=`${(projected.x*.5+.5)*container.clientWidth}px`;spot.button.style.top=`${(-projected.y*.5+.5)*container.clientHeight}px`;}
  }
}
function updateDepthControls(message){
  depthSwitch.setAttribute('aria-checked',String(depthEnabled || depthPending));
  depthSwitch.textContent=depthPending?'Cancel room depth':depthEnabled?'Turn room depth off':'Turn room depth on';
  depthPreview.disabled=depthPending;
  if(message)depthStatus.textContent=message;
}
function showDepth(enabled){
  if(!enabled)stopDepthPreview();
  depthEnabled=enabled;depthDemo=0;
  depthRoom?.setVisible(depthActive());
  syncRoomDetail();
  if(ready){
    const ordinary=textures.get(places[active].file);
    if(depthActive())material.map=depthTexture;
    else ordinary?.then(next=>{if(!depthActive() && textures.get(places[active].file)===ordinary){material.map=next;material.needsUpdate=true;dirty=true;}});
    material.needsUpdate=true;rebuildSpots();dirty=true;
  }
  updateDepthControls(enabled?'Depth is on. Try the movement preview, or turn on head tracking.':'Room depth is off.');
}
async function enableDepth(){
  if(depthPending)return false;
  if(depthRoom){showDepth(true);return true;}
  const controller=new AbortController();depthController=controller;depthPending=true;
  const deadline=setTimeout(()=>{if(controller!==depthController || controller.signal.aborted)return;controller.abort();depthPending=false;updateDepthControls('Depth took too long to open. You can try again or explore the original room.');},30000);
  updateDepthControls('Opening a little more dimension…');
  try{
    await controlsReady;
    if(controller.signal.aborted)return false;
    if(!ready)throw new Error('room-unavailable');
    const [{loadDepthRoom},{applyDepthCamera},enhanced]=await Promise.all([
      import('./depth-room.js?v=depth-2'),import('./depth-camera.mjs?v=depth-1'),texture(places.room.file)
    ]);
    if(controller.signal.aborted)return false;
    depthTexture=enhanced;depthCamera=applyDepthCamera;
    const result=await loadDepthRoom({renderer,scene,
      colorUrl:new URL(places.room.file,import.meta.url).href,
      depthUrl:'https://d2ol7oe51mr4n9.cloudfront.net/user_3J1s5NXUJSOKNxW7VLoOfMiwAOh/b4c3475b-15b7-431c-a817-1f5cf2b73051.png',
      signal:controller.signal,detail:matchMedia('(max-width:760px)').matches?'mobile':'high',
      onDirty:()=>{dirty=true;},onProgress:({phase,progress})=>updateDepthControls(phase==='building'?`Adding the details… ${Math.round(progress*100)}%`:'Opening a little more dimension…')});
    if(controller.signal.aborted){result.dispose();return false;}
    depthRoom=result;depthPending=false;showDepth(true);return true;
  }catch(failure){
    if(!controller.signal.aborted){console.warn('Optional room depth unavailable',failure);updateDepthControls('Depth couldn’t open on this device. The original room is ready to explore.');}
    return false;
  }finally{
    clearTimeout(deadline);
    if(depthController===controller){depthPending=false;updateDepthControls();}
  }
}
function cancelDepthLoad(){
  if(depthPending){depthController?.abort();depthPending=false;updateDepthControls('Room depth is off.');}
}
function stopDepthPreview(){depthPreviewIntent++;depthDemo=0;dirty=true;}
depthSwitch.addEventListener('click',()=>{
  if(depthPending)cancelDepthLoad();else if(depthEnabled)showDepth(false);else enableDepth();
});
depthPreview.addEventListener('click',async()=>{
  const intent=++depthPreviewIntent;
  if(!await enableDepth() || intent!==depthPreviewIntent || document.hidden || document.body.dataset.experience)return;
  if(active!=='room')await moveTo('room');
  if(intent!==depthPreviewIntent || !depthActive() || document.hidden || document.body.dataset.experience)return;
  cancelHeadTracking();headDialog.close();
  if(reduced){depthStatus.textContent='Depth is on. Automatic movement is paused for your reduced-motion preference.';return;}
  depthDemo=performance.now();dirty=true;interact();container.focus({preventScroll:true});
});
// Bind the invitation before awaiting the panorama. Its skip path is ready
// immediately; the opt-in path waits for the scene without acquiring a camera.
const headDialog=document.querySelector('#head-tracking-dialog');
const headLaunch=document.querySelector('#head-tracking-launch');
const headSwitch=document.querySelector('#head-tracking-switch');
const headLive=document.querySelector('#head-tracking-live');
let headLoading,entry,resolveControlsReady;
const controlsReady=new Promise(resolve=>{resolveControlsReady=resolve;});
function headState({phase,message}){
  const enabled=!['off','error'].includes(phase);
  headLaunch.textContent=`Head tracking · ${enabled?'on':'off'}`;
  headLaunch.setAttribute('aria-pressed',String(enabled));
  headSwitch.setAttribute('aria-checked',String(enabled));
  headSwitch.textContent=enabled?'Turn head tracking off':'Turn head tracking on';
  document.querySelector('#head-tracking-status').textContent=message;
  document.querySelector('#head-tracking-live-status').textContent=message;
  document.querySelector('#head-tracking-recenter').disabled=phase==='starting';
  if(phase==='error' && !headDialog.open && !document.hidden && !document.body.dataset.experience){
    entry?.close(false);headDialog.showModal();
  }
  headLive.hidden=!enabled || headDialog.open || !!document.querySelector('#room-entry-dialog[open]');
}
async function ensureHeadTracker(){
  if(headTracker)return headTracker;
  // No tracking runtime, WASM, model, or camera before the explicit choice.
  if(!headLoading)headLoading=import('./head-tracking.js?v=head-test-1').catch(e=>{headLoading=null;throw e;});
  const {createHeadTracker}=await headLoading;
  if(!headTracker)headTracker=createHeadTracker({onPose:pose=>{
    headPose=pose;
    if(!pose)headView.yaw=headView.pitch=headView.fov=0;
    dirty=true;
  },onState:headState});
  return headTracker;
}
const headRequest=createTrackingStart({
  ready:controlsReady,
  load:ensureHeadTracker,
  allowed:()=>!document.hidden && !document.body.dataset.experience,
  onPending:pending=>{
    entry?.setPending(pending);
    if(pending)headState({phase:'starting',message:'Getting things ready…'});
  },
  start:tracker=>{
    if(!ready)throw new Error('room-unavailable');
    tracker.setSensitivity(Number(document.querySelector('#head-tracking-sensitivity').value));
    entry?.close();if(headDialog.open)headDialog.close();
    return tracker.start();
  },
  stop:message=>{
    if(headTracker)headTracker.stop(message);
    else headState({phase:'off',message:message || 'Head tracking is off.'});
  },
  onError:failure=>headState({phase:'error',message:failure.message==='room-unavailable'
    ? 'The room couldn’t open for tracking. You can still read, listen, and explore normally.'
    : 'Head tracking couldn’t open. You can try again or explore the room normally.'})
});
function cancelHeadTracking(message){headRequest.cancel(message);}
entry=mountRoomEntry({
  dialog:document.querySelector('#room-entry-dialog'),
  onWith:()=>headRequest.request(),
  onWithout:()=>cancelHeadTracking(),
  focusTarget:container
});
headLaunch.addEventListener('click',()=>{
  headDialog.showModal();headLive.hidden=true;
  if(!ready)document.querySelector('#head-tracking-status').textContent='The room is opening. You can choose tracking now or come back later.';
});
headSwitch.addEventListener('click',()=>{
  if(headRequest.pending || (headTracker && !['off','error'].includes(headTracker.phase)))cancelHeadTracking();
  else headRequest.request();
});
document.querySelector('#head-tracking-close').addEventListener('click',()=>{
  if(headRequest.pending)cancelHeadTracking();
  stopDepthPreview();
  headDialog.close();
});
headDialog.addEventListener('cancel',stopDepthPreview);
headDialog.addEventListener('close',()=>{cancelDepthLoad();headLive.hidden=!headTracker || ['off','error'].includes(headTracker.phase);});
document.querySelector('#head-tracking-stop').addEventListener('click',()=>{cancelHeadTracking();headLaunch.focus({preventScroll:true});});
document.querySelector('#head-tracking-recenter').addEventListener('click',()=>headTracker?.recenter());
document.querySelector('#head-tracking-sensitivity').addEventListener('input',event=>{
  const value=Number(event.target.value);headTracker?.setSensitivity(value);
  document.querySelector('#head-tracking-sensitivity-value').textContent=value<.8?'Subtle':value>1.2?'Lively':'Gentle';
});
document.addEventListener('room:experience',()=>{
  cancelHeadTracking();cancelDepthLoad();stopDepthPreview();diplomas?.setVisible(false);entry.close(false);if(headDialog.open)headDialog.close();
});
// The experience UI updates this attribute for both entry and return, including
// Escape. Keep the paper overlays synchronized without changing its controls.
const experienceObserver=new MutationObserver(syncRoomDetail);
experienceObserver.observe(document.body,{attributes:true,attributeFilter:['data-experience']});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){cancelHeadTracking('Tracking stopped while you were away. Turn it on to try again.');cancelDepthLoad();stopDepthPreview();}
  syncRoomDetail();
});
addEventListener('pagehide',event=>{cancelHeadTracking();cancelDepthLoad();stopDepthPreview();if(!event.persisted){depthRoom?.dispose();detailController?.abort();detailRoom?.dispose();diplomaController?.abort();diplomas?.dispose();experienceObserver.disconnect();}});
addEventListener('keydown',event=>{if(event.key==='Escape'){cancelHeadTracking();stopDepthPreview();}});

try{
  scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(fov,1,.1,30);
  renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'low-power'});
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  container.append(renderer.domElement);
  sphere=createPanoramaSphere();material=sphere.material;scene.add(sphere);
  resize();
  // Browser bars and rotation can change the scene size independently of a
  // window resize, especially on phones.
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(resize).observe(container);
  else addEventListener('resize',resize);
  renderer.setAnimationLoop(animate);
  renderer.domElement.addEventListener('webglcontextlost',(e)=>{e.preventDefault();cancelHeadTracking();cancelDepthLoad();detailController?.abort();detailRoom?.dispose();detailRoom=null;diplomaController?.abort();diplomas?.dispose();diplomas=null;depthRoom?.dispose();depthRoom=null;depthEnabled=false;depthDemo=0;ready=false;document.body.classList.remove('ready');status.textContent='The room paused. Read and listen below, or reload to return.';error.hidden=false;});
  await moveTo('room');
  if(ready){void openRoomDetail();void openRoomDiplomas();}
}catch(e){console.error('Immersive view unavailable',e);error.hidden=false;status.textContent='Read and listen using the controls below.';}
finally{resolveControlsReady(ready);}

container.addEventListener('pointerdown',(e)=>{
  if(!ready || pointers.size>=2)return;
  stopDepthPreview();
  container.focus({preventScroll:true});
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});container.setPointerCapture(e.pointerId);
  drag={x:e.clientX,y:e.clientY,yaw:targetYaw,pitch:targetPitch};
  if(pointers.size===2){const p=[...pointers.values()];pinchDistance=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);}
});
container.addEventListener('pointermove',(e)=>{
  if(!pointers.has(e.pointerId))return;
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointers.size===2){
    const p=[...pointers.values()];const distance=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);
    if(pinchDistance)targetFov=clamp(targetFov+(pinchDistance-distance)*.14,40,90);
    pinchDistance=distance;interact();return;
  }
  if(drag){
    const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
    targetYaw=drag.yaw-dx*.095;targetPitch=clamp(drag.pitch+dy*.095,-65,65);
    if(Math.abs(dx)+Math.abs(dy)>8)interact();
  }
});
function release(e){
  if(!pointers.delete(e.pointerId))return;
  pinchDistance=null;drag=null;
  if(pointers.size===1){
    const remaining=pointers.values().next().value;
    drag={x:remaining.x,y:remaining.y,yaw:targetYaw,pitch:targetPitch};
  }
}
container.addEventListener('pointerup',release);container.addEventListener('pointercancel',release);container.addEventListener('lostpointercapture',release);
container.addEventListener('wheel',(e)=>{if(!ready)return;e.preventDefault();targetFov=clamp(targetFov+e.deltaY*.035,40,90);interact();},{passive:false});
document.querySelectorAll('[data-place]').forEach((button)=>button.addEventListener('click',()=>{stopDepthPreview();if(!['desk','stereo'].includes(button.dataset.place))moveTo(button.dataset.place);}));
document.querySelectorAll('[data-look]').forEach((button)=>button.addEventListener('click',()=>{
  if(button.dataset.look==='home'){targetYaw=0;targetPitch=-3;targetFov=78;}
  else targetYaw+=button.dataset.look==='left'?-22:22;
  interact();
}));
addEventListener('keydown',(e)=>{
  if(document.body.dataset.experience || document.querySelector('dialog[open]') || e.target.closest('button,a,input,textarea'))return;
  const handlers={ArrowLeft:()=>targetYaw-=5,ArrowRight:()=>targetYaw+=5,ArrowUp:()=>targetPitch=clamp(targetPitch+5,-65,65),ArrowDown:()=>targetPitch=clamp(targetPitch-5,-65,65),'+':()=>targetFov=clamp(targetFov-4,40,90),'-':()=>targetFov=clamp(targetFov+4,40,90)};
  if(handlers[e.key]){e.preventDefault();handlers[e.key]();interact();}
});
document.addEventListener('visibilitychange',()=>{if(renderer)renderer.setAnimationLoop(document.hidden?null:animate);});
