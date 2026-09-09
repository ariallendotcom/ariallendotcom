import * as THREE from './vendor/three.module.js';
import {panoramaPoint, lookDirection, constrainPanoramaView} from './scene-math.js';
import {createPanoramaSphere} from './panorama.js';

const container = document.querySelector('#scene');
const status = document.querySelector('#scene-status');
const error = document.querySelector('#error');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const places = {
  room: {file:'room-panorama.png', label:'The room', yaw:0, pitch:-3, fov:78,
    spots:[{u:.36,v:.49,label:'Sit at the desk',panel:'words'},{u:.625,v:.47,label:'The reading shelf',panel:'books'},{u:.48,v:.51,label:'The record player',panel:'sounds',source:'albums'}]},
  desk: {file:'desk-panorama.png',label:'At the desk',yaw:0,pitch:-5,fov:76,
    spots:[{u:.40,v:.56,label:'A few open questions',panel:'words'},{u:.52,v:.32,label:'The person behind the page',panel:'about'},{u:.63,v:.56,label:'The record player',panel:'sounds',source:'albums'}]},
  chair: {file:'chair-panorama.png',label:'Take a seat',yaw:0,pitch:-3,fov:78,
    spots:[{u:.64,v:.46,label:'Choose an essay',panel:'words'},{u:.52,v:.57,label:'The record player',panel:'sounds',source:'albums'},{u:.33,v:.49,label:'Get to know Ari',panel:'about'}]},
  stereo: {file:'stereo-panorama.png',label:'The stereo',yaw:0,pitch:-8,fov:72,
    spots:[{u:.48,v:.58,label:'The record player',panel:'sounds',source:'albums'},{u:.546,v:.60,label:'The CD binder',panel:'sounds',source:'tracks'},{u:.705,v:.39,label:'The reading shelf',panel:'books'}]}
};
let renderer, camera, scene, sphere, material;
let yaw=0,pitch=-3,fov=78,targetYaw=0,targetPitch=-3,targetFov=78;
let active='room', spots=[], drag=null, request=0, ready=false, dirty=true;
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
    return {...spot,button,point:panoramaPoint(spot.u,spot.v)};
  });
}
async function texture(file){
  if(!textures.has(file)){
    const pending=new THREE.TextureLoader().loadAsync(file).then((t)=>{t.colorSpace=THREE.SRGBColorSpace;t.minFilter=THREE.LinearFilter;t.magFilter=THREE.LinearFilter;t.generateMipmaps=false;return t;}).catch((e)=>{textures.delete(file);throw e;});
    textures.set(file,pending);
  }
  return textures.get(file);
}
function resize(){if(!renderer)return;camera.aspect=container.clientWidth/container.clientHeight;camera.updateProjectionMatrix();renderer.setSize(container.clientWidth,container.clientHeight);dirty=true;}
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
    active=name;material.map=next;material.needsUpdate=true;
    const position=places[name];yaw=targetYaw=position.yaw;pitch=targetPitch=position.pitch;fov=targetFov=position.fov;
    rebuildSpots();ready=true;dirty=true;
    // Draw the new room before revealing its canvas over the opening image.
    animate();document.body.classList.add('ready');error.hidden=true;
    renderer.domElement.style.opacity='1';
    status.textContent='Drag to look around · Scroll to look closer';
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
  if(!dirty && Math.abs(targetYaw-yaw)+Math.abs(targetPitch-pitch)+Math.abs(targetFov-fov)<.0001)return;
  dirty=false;
  const easing=reduced?1:.12;
  yaw+=(targetYaw-yaw)*easing;pitch+=(targetPitch-pitch)*easing;fov+=(targetFov-fov)*easing;
  // Also bound intermediate frames during zoom, tilt, and viewport changes.
  const view=constrainPanoramaView(yaw,pitch,fov,camera.aspect);
  yaw=view.yaw;pitch=view.pitch;fov=view.fov;
  camera.lookAt(lookDirection(yaw,pitch));camera.fov=fov;camera.updateProjectionMatrix();camera.updateMatrixWorld();
  renderer.render(scene,camera);
  camera.getWorldDirection(viewDirection);
  for(const spot of spots){
    projected.copy(spot.point).project(camera);
    const visible=spot.point.dot(viewDirection)>0 && Math.abs(projected.x)<.92 && projected.y>-.62 && projected.y<.78;
    spot.button.hidden=!visible;
    if(visible){spot.button.style.left=`${(projected.x*.5+.5)*container.clientWidth}px`;spot.button.style.top=`${(-projected.y*.5+.5)*container.clientHeight}px`;}
  }
}
try{
  scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(fov,1,.1,30);
  renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.outputColorSpace=THREE.SRGBColorSpace;
  container.append(renderer.domElement);
  sphere=createPanoramaSphere();material=sphere.material;scene.add(sphere);
  resize();
  // Browser bars and rotation can change the scene size independently of a
  // window resize, especially on phones.
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(resize).observe(container);
  else addEventListener('resize',resize);
  renderer.setAnimationLoop(animate);
  renderer.domElement.addEventListener('webglcontextlost',(e)=>{e.preventDefault();ready=false;document.body.classList.remove('ready');status.textContent='The room paused. Read and listen below, or reload to return.';error.hidden=false;});
  await moveTo('room');
}catch(e){console.error('Immersive view unavailable',e);error.hidden=false;status.textContent='Read and listen using the controls below.';}

container.addEventListener('pointerdown',(e)=>{
  if(!ready || pointers.size>=2)return;
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
document.querySelectorAll('[data-place]').forEach((button)=>button.addEventListener('click',()=>{if(!['desk','stereo'].includes(button.dataset.place))moveTo(button.dataset.place);}));
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
