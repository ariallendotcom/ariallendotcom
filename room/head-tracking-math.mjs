const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Eye corners give a stable head centre and a rough distance proxy. This is
// head-controlled panorama motion, not eye tracking or a reconstructed 3D room.
export function measureHead(landmarks) {
  const left = landmarks?.[33], right = landmarks?.[263];
  if (!left || !right || ![left.x,left.y,right.x,right.y].every(Number.isFinite)) return null;
  const span = Math.hypot(left.x-right.x, left.y-right.y);
  if (span < .035 || span > .8) return null;
  return {x:(left.x+right.x)/2, y:(left.y+right.y)/2, span};
}

export function averageHeads(samples) {
  if (!samples.length) return null;
  return samples.reduce((mean, sample) => ({x:mean.x+sample.x/samples.length, y:mean.y+sample.y/samples.length, span:mean.span+sample.span/samples.length}), {x:0,y:0,span:0});
}

export function headOffset(head, centre, sensitivity = 1) {
  if (!head || !centre || ![head.x,head.y,head.span,centre.x,centre.y,centre.span].every(Number.isFinite) || head.span <= 0 || centre.span <= 0) return {yaw:0,pitch:0,fov:0};
  const gain = Number.isFinite(sensitivity) ? clamp(sensitivity,.5,1.5) : 1;
  const deadzone = value => Math.abs(value) < .008 ? 0 : value-Math.sign(value)*.008;
  return {
    yaw:clamp(deadzone(centre.x-head.x)*115*gain,-22,22),
    pitch:clamp(deadzone(centre.y-head.y)*85*gain,-13,13),
    fov:clamp(-Math.log(head.span/centre.span)*28*gain,-10,8)
  };
}
