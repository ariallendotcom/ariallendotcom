import {BufferAttribute, BufferGeometry, ClampToEdgeWrapping, LinearFilter, LinearMipmapLinearFilter, Mesh, MeshBasicMaterial, Scene, SRGBColorSpace, TextureLoader} from './vendor/three.module.js';

// Paper corners in the 1774 × 887 room artwork: top-left, top-right,
// bottom-right, bottom-left. Only the paper is replaced; frames stay original.
export const DIPLOMA_PANELS = [
  {id:'georgetown',file:'detail/diploma-georgetown.svg?v=diploma-1',quad:[[159.2,262.4],[211,250.8],[211.2,300.9],[159.4,308.9]]},
  {id:'tufts',file:'detail/diploma-tufts.svg?v=diploma-1',quad:[[158.4,330.6],[211,323],[211.2,383],[158.7,385]]}
];
const sourceWidth=1774,sourceHeight=887;
const abortError=()=>new DOMException('Room diplomas were closed.','AbortError');

/** Map an upright paper rectangle into its photographed quadrilateral. */
export function paperProjection(quad) {
  if(!Array.isArray(quad)||quad.length!==4||quad.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)))throw new TypeError('Invalid diploma corners.');
  const [[x0,y0],[x1,y1],[x2,y2],[x3,y3]]=quad;
  const dx1=x1-x2,dx2=x3-x2,dx3=x0-x1+x2-x3;
  const dy1=y1-y2,dy2=y3-y2,dy3=y0-y1+y2-y3;
  let g=0,h=0;
  if(Math.abs(dx3)+Math.abs(dy3)>1e-10){
    const determinant=dx1*dy2-dx2*dy1;
    if(Math.abs(determinant)<1e-10)throw new TypeError('Degenerate diploma corners.');
    g=(dx3*dy2-dx2*dy3)/determinant;h=(dx1*dy3-dx3*dy1)/determinant;
  }
  const a=x1-x0+g*x1,b=x3-x0+h*x3,d=y1-y0+g*y1,e=y3-y0+h*y3;
  return (s,t)=>{
    const denominator=g*s+h*t+1;
    if(!Number.isFinite(denominator)||Math.abs(denominator)<1e-8)throw new TypeError('Invalid diploma projection.');
    return [(a*s+b*t+x0)/denominator,(d*s+e*t+y0)/denominator];
  };
}

export function buildDiplomaGeometry(quad,depthAt=null,segments=24) {
  if(!Number.isInteger(segments)||segments<1||segments>64)throw new TypeError('Invalid diploma geometry resolution.');
  if(depthAt!=null&&typeof depthAt!=='function')throw new TypeError('Invalid diploma depth sampler.');
  const project=paperProjection(quad),positions=[],uvs=[],indices=[];
  const stride=segments+1;
  for(let y=0;y<=segments;y++)for(let x=0;x<=segments;x++){
    const s=x/segments,t=y/segments,[px,py]=project(s,t),u=px/sourceWidth,v=py/sourceHeight;
    const sampled=depthAt?.(u,v),radius=Number.isFinite(sampled)&&sampled>0?sampled*.9997:9.98;
    const longitude=u*Math.PI*2,latitude=(.5-v)*Math.PI,c=Math.cos(latitude);
    positions.push(Math.cos(longitude)*c*radius,Math.sin(latitude)*radius,Math.sin(longitude)*c*radius);
    uvs.push(s,t);
  }
  for(let y=0;y<segments;y++)for(let x=0;x<segments;x++){
    const a=y*stride+x,b=a+1,c=a+stride,d=c+1;
    indices.push(a,c,b,b,c,d);
  }
  const geometry=new BufferGeometry();geometry.setAttribute('position',new BufferAttribute(new Float32Array(positions),3));geometry.setAttribute('uv',new BufferAttribute(new Float32Array(uvs),2));geometry.setIndex(indices);geometry.computeBoundingSphere();
  return geometry;
}

/** Two bounded paper decals, independent of the progressive tile cache. */
export async function createDiplomas({renderer,onDirty=()=>{},signal},environment={loadTexture:url=>new TextureLoader().loadAsync(url)}) {
  if(!renderer)throw new TypeError('Room diplomas need a renderer.');
  if(signal?.aborted)throw abortError();
  const scene=new Scene(),meshes=[];
  let disposed=false,visible=true,sampler=null;
  function dispose(){
    if(disposed)return;disposed=true;signal?.removeEventListener('abort',dispose);
    for(const mesh of meshes){mesh.geometry.dispose();mesh.material.map.dispose();mesh.material.dispose();}
    meshes.length=0;scene.clear();onDirty();
  }
  signal?.addEventListener('abort',dispose,{once:true});
  try{
    await Promise.all(DIPLOMA_PANELS.map(async panel=>{
      const texture=await environment.loadTexture(new URL(panel.file,import.meta.url).href);
      if(disposed){texture.dispose();throw abortError();}
      texture.colorSpace=SRGBColorSpace;texture.flipY=false;texture.wrapS=texture.wrapT=ClampToEdgeWrapping;
      texture.minFilter=LinearMipmapLinearFilter;texture.magFilter=LinearFilter;texture.generateMipmaps=true;
      texture.anisotropy=Math.min(8,renderer.capabilities?.getMaxAnisotropy?.()??1);texture.needsUpdate=true;
      const mesh=new Mesh(buildDiplomaGeometry(panel.quad),new MeshBasicMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false,toneMapped:false}));
      mesh.name=`Room diploma ${panel.id}`;mesh.userData.paperQuad=panel.quad;scene.add(mesh);meshes.push(mesh);onDirty();
    }));
    if(disposed)throw abortError();
  }catch(failure){dispose();throw failure;}
  return {
    render(camera){
      if(disposed||!visible)return;
      // Keep exact lettering above every image LOD and the Gaussian fill.
      // These unobstructed paper interiors do not change either depth buffer.
      const autoClear=renderer.autoClear;
      try{renderer.autoClear=false;renderer.render(scene,camera);}
      finally{renderer.autoClear=autoClear;}
    },
    setVisible(next){if(disposed||visible===!!next)return;visible=!!next;onDirty();},
    setDepthSampler(next){
      if(disposed||next===sampler)return;
      if(next!=null&&typeof next!=='function')throw new TypeError('Invalid diploma depth sampler.');
      sampler=next;
      for(const mesh of meshes){const old=mesh.geometry;mesh.geometry=buildDiplomaGeometry(mesh.userData.paperQuad,sampler);old.dispose();}
      onDirty();
    },
    dispose
  };
}
