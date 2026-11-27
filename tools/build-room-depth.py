"""Infer a conservative radial depth field for the room's Gaussian preview.

Depth Anything V2 Small (Apache-2.0), CPU. The source is a generated panorama,
not a measured room: output distances are artistic units, and unseen geometry
cannot be reconstructed. Perspective views improve local object boundaries;
the global panorama estimate anchors their otherwise ambiguous depth scales.
"""
import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np
import torch


def rays(width, height):
    u, v = np.meshgrid((np.arange(width)+.5)/width, (np.arange(height)+.5)/height)
    longitude, latitude = 2*np.pi*u, np.pi*(.5-v)
    return np.stack([np.cos(longitude)*np.cos(latitude), np.sin(latitude), np.sin(longitude)*np.cos(latitude)], -1).astype(np.float32)


def basis(yaw, pitch):
    longitude, latitude = np.radians(yaw+180), np.radians(pitch)
    forward = np.array([np.cos(longitude)*np.cos(latitude), np.sin(latitude), np.sin(longitude)*np.cos(latitude)], np.float32)
    right = np.array([-np.sin(longitude), 0, np.cos(longitude)], np.float32)
    up = np.cross(right, forward)
    return forward, right, up


def perspective(image, yaw, pitch, size=672, fov=110):
    forward, right, up = basis(yaw, pitch)
    t = np.tan(np.radians(fov/2))
    x, y = np.meshgrid(np.linspace(-t,t,size), np.linspace(t,-t,size))
    direction = forward + x[...,None]*right + y[...,None]*up
    direction /= np.linalg.norm(direction,axis=-1,keepdims=True)
    u = (np.arctan2(direction[...,2],direction[...,0])/(2*np.pi))%1
    v = .5-np.arcsin(direction[...,1])/np.pi
    h,w = image.shape[:2]
    return cv2.remap(image,(u*w-.5).astype(np.float32),(v*h-.5).astype(np.float32),cv2.INTER_CUBIC,borderMode=cv2.BORDER_WRAP)


def normalize(raw):
    lo, hi = np.percentile(raw,[2,98])
    return np.clip((raw-lo)/max(hi-lo,1e-6),0,1).astype(np.float32)


def build(args):
    sys.path.insert(0,str(Path(args.model_repo).resolve()))
    from depth_anything_v2.dpt import DepthAnythingV2
    torch.set_num_threads(2)
    model = DepthAnythingV2(encoder='vits',features=64,out_channels=[48,96,192,384])
    model.load_state_dict(torch.load(args.checkpoint,map_location='cpu',weights_only=True))
    model.eval()
    image = cv2.imread(args.image)
    if image is None: raise ValueError('Source image could not load')
    h,w = image.shape[:2]
    output = Path(args.output); output.parent.mkdir(parents=True,exist_ok=True)
    with torch.inference_mode():
        print('Inferring panoramic anchor',flush=True)
        anchor = normalize(model.infer_image(image,518))
        # Keep the uncertain room envelope bounded; do not interpret estimates
        # as metres or claim metric reconstruction accuracy.
        anchor_inv = 1/8 + anchor*(1/2.5-1/8)
        direction = rays(w,h)
        weighted = anchor_inv*.18
        weights = np.full((h,w),.18,np.float32)
        stats=[]
        for yaw,pitch in [(0,0),(90,0),(180,0),(-90,0),(0,75),(0,-75)]:
            print(f'Inferring perspective {yaw}, {pitch}',flush=True)
            view=perspective(image,yaw,pitch)
            raw=model.infer_image(view,518)
            forward,right,up=basis(yaw,pitch)
            cosine=direction@forward
            safe=np.maximum(cosine,1e-6)
            t=np.tan(np.radians(55))
            px=(direction@right)/safe/t
            py=-(direction@up)/safe/t
            mask=(cosine>0)&(np.abs(px)<.97)&(np.abs(py)<.97)
            projected=cv2.remap(raw,((px+1)*.5*(raw.shape[1]-1)).astype(np.float32),((py+1)*.5*(raw.shape[0]-1)).astype(np.float32),cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
            # Perspective estimates are inverse-z. Their affine alignment is
            # solved before multiplying by cos(theta) to get inverse-radius.
            fit=mask&(cosine>.65)
            a=np.stack([projected[fit]*cosine[fit],cosine[fit]],axis=-1)[::7]
            b=anchor_inv[fit][::7]
            solution=np.linalg.lstsq(a,b,rcond=None)[0]
            for _ in range(3):
                residual=np.abs(a@solution-b)
                keep=residual<np.percentile(residual,85)
                solution=np.linalg.lstsq(a[keep],b[keep],rcond=None)[0]
            scale,offset=solution
            if not np.isfinite(scale) or scale<=0: continue
            radial=np.clip((projected*scale+offset)*cosine,1/8,1/2.5)
            weight=np.maximum(0,1-np.maximum(np.abs(px),np.abs(py))/.97)**2
            weight*=mask.astype(np.float32)*cosine**2
            weighted+=radial*weight;weights+=weight
            stats.append({'yaw':yaw,'pitch':pitch,'scale':float(scale),'offset':float(offset)})
        inverse=weighted/weights
    # Edge-preserving denoise avoids shimmer without softening colour detail.
    inverse=cv2.bilateralFilter(inverse.astype(np.float32),5,.008,2)
    q=np.clip((inverse-1/8)/(1/2.5-1/8),0,1)
    # Round-trip packed RG retains 16-bit precision through an HTML canvas.
    values=np.rint(q*65535).astype(np.uint16)
    packed=np.stack([values>>8,values&255,np.zeros_like(values)],axis=-1).astype(np.uint8)
    cv2.imwrite(str(output),cv2.cvtColor(packed,cv2.COLOR_RGB2BGR),[cv2.IMWRITE_PNG_COMPRESSION,9])
    check=cv2.cvtColor(cv2.imread(str(output)),cv2.COLOR_BGR2RGB)
    decoded=(check[:,:,0].astype(np.uint16)<<8)|check[:,:,1]
    assert np.array_equal(decoded,values)
    # Internal visual QA only: warmer pixels are nearer.
    preview=cv2.applyColorMap((q*255).astype(np.uint8),cv2.COLORMAP_TURBO)
    cv2.imwrite(str(output.with_name('depth-preview.jpg')),cv2.resize(preview,(1000,500)),[cv2.IMWRITE_JPEG_QUALITY,82])
    metadata={'method':'Depth Anything V2 Small + six aligned perspective projections','license':'Apache-2.0','source':args.image,'width':w,'height':h,'near':2.5,'far':8.0,'distance_units':'artistic, not measured metres','packed_channels':'R high byte, G low byte, B unused','views':stats,'depth_percentiles':np.percentile(1/inverse,[0,10,50,90,100]).tolist()}
    output.with_suffix('.json').write_text(json.dumps(metadata,indent=2)+'\n')
    print(json.dumps({'output':str(output),'bytes':output.stat().st_size,'views':len(stats),'depth_percentiles':metadata['depth_percentiles']}),flush=True)


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--image',required=True);p.add_argument('--output',required=True);p.add_argument('--model-repo',required=True);p.add_argument('--checkpoint',required=True)
    build(p.parse_args())
