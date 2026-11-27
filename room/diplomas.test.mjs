import test from 'node:test';
import assert from 'node:assert/strict';
import {Texture,Vector3} from './vendor/three.module.js';
import {DIPLOMA_PANELS,paperProjection,buildDiplomaGeometry,createDiplomas} from './diplomas.js';

test('paper lettering preserves photographed corners and straight printed lines',()=>{
  for(const panel of DIPLOMA_PANELS){
    const map=paperProjection(panel.quad);
    for(const [i,st] of [[0,[0,0]],[1,[1,0]],[2,[1,1]],[3,[0,1]]]){
      const actual=map(...st);actual.forEach((v,j)=>assert.ok(Math.abs(v-panel.quad[i][j])<1e-8));
    }
    const a=map(0,.4),b=map(1,.4),c=map(.37,.4);
    assert.ok(Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))<1e-8);
  }
});

test('paper geometry shares panorama orientation and follows inferred depth',()=>{
  const panel=DIPLOMA_PANELS[0],geometry=buildDiplomaGeometry(panel.quad,()=>4,4),p=geometry.attributes.position,uv=geometry.attributes.uv;
  assert.deepEqual(Array.from(uv.array.slice(0,2)),[0,0]);
  assert.deepEqual(Array.from(uv.array.slice(-2)),[1,1]);
  for(let i=0;i<p.count;i++)assert.ok(Math.abs(Math.hypot(p.getX(i),p.getY(i),p.getZ(i))-4*.9997)<1e-6);
  const a=new Vector3().fromBufferAttribute(p,geometry.index.getX(0)),b=new Vector3().fromBufferAttribute(p,geometry.index.getX(1)),c=new Vector3().fromBufferAttribute(p,geometry.index.getX(2));
  assert.ok(b.sub(a).cross(c.sub(a)).dot(a)<0,'paper faces the viewer inside the panorama');
  geometry.dispose();
});

test('the lettering pass preserves color and depth, restores renderer state, and releases both papers',async()=>{
  const textures=[],disposed=[];let renders=0;
  const renderer={autoClear:true,render(scene){renders++;assert.equal(scene.children.length,2);assert.equal(this.autoClear,false);for(const mesh of scene.children){assert.equal(mesh.material.depthTest,false);assert.equal(mesh.material.depthWrite,false);}},clear(){assert.fail('must preserve color');},clearDepth(){assert.fail('must preserve existing depth');}};
  const room=await createDiplomas({renderer},{loadTexture:async()=>{const t=new Texture();t.addEventListener('dispose',()=>disposed.push(t));textures.push(t);return t;}});
  room.render({});assert.equal(renders,1);assert.equal(renderer.autoClear,true);
  room.setDepthSampler(()=>3);room.render({});assert.equal(renders,2);
  room.setVisible(false);room.render({});assert.equal(renders,2);
  room.setVisible(true);renderer.render=()=>{throw new Error('GPU failure');};assert.throws(()=>room.render({}),/GPU failure/);assert.equal(renderer.autoClear,true);
  room.dispose();room.dispose();assert.equal(disposed.length,2);assert.equal(new Set(disposed).size,2);
  room.render({});
});

test('leaving while SVGs load discards late textures without attaching overlays',async()=>{
  const controller=new AbortController(),pending=[],disposed=[];
  const promise=createDiplomas({renderer:{},signal:controller.signal},{loadTexture:()=>new Promise(resolve=>pending.push(resolve))});
  controller.abort();
  for(const resolve of pending){const texture=new Texture();texture.addEventListener('dispose',()=>disposed.push(texture));resolve(texture);}
  await assert.rejects(promise,error=>error.name==='AbortError');assert.equal(disposed.length,2);
});
