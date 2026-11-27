import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrackingStart,mountRoomEntry} from './room-entry.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture(options={}){
  const scene=deferred(),module=deferred();
  const calls={load:0,start:0,stop:0,errors:[],pending:[]};
  const tracker={name:'tracker'};
  const request=createTrackingStart({
    ready:scene.promise,
    load:()=>{calls.load++;return module.promise;},
    start:value=>{assert.equal(value,tracker);calls.start++;},
    stop:()=>{calls.stop++;},
    onError:error=>calls.errors.push(error.message),
    onPending:value=>calls.pending.push(value),
    ...options
  });
  return {scene,module,calls,tracker,request};
}

test('showing the invitation and entering without it do not import tracking',async()=>{
  const f=fixture();f.scene.resolve(true);await Promise.resolve();
  assert.equal(f.calls.load,0);assert.equal(f.calls.start,0);
  f.request.cancel();assert.equal(f.calls.load,0);assert.equal(f.calls.start,0);
});
test('the with choice waits for the scene, then imports and starts once',async()=>{
  const f=fixture(),pending=f.request.request();
  assert.equal(f.calls.load,0);f.scene.resolve(true);await Promise.resolve();
  assert.equal(f.calls.load,1);assert.equal(f.calls.start,0);
  f.module.resolve(f.tracker);await pending;
  assert.equal(f.calls.start,1);assert.equal(f.request.pending,false);
});
test('skip or Escape before scene readiness cancels queued camera startup',async()=>{
  const f=fixture(),pending=f.request.request();f.request.cancel();
  f.scene.resolve(true);await pending;
  assert.equal(f.calls.load,0);assert.equal(f.calls.start,0);assert.equal(f.request.pending,false);
});
test('skip while importing never starts the camera when the import finishes',async()=>{
  const f=fixture();f.scene.resolve(true);const pending=f.request.request();await Promise.resolve();
  assert.equal(f.calls.load,1);f.request.cancel();f.module.resolve(f.tracker);await pending;
  assert.equal(f.calls.start,0);assert.deepEqual(f.calls.errors,[]);
});
test('a canceled import error cannot reopen a dialog',async()=>{
  const f=fixture();f.scene.resolve(true);const pending=f.request.request();await Promise.resolve();
  f.request.cancel();f.module.reject(new Error('network failure'));await pending;
  assert.deepEqual(f.calls.errors,[]);assert.equal(f.calls.start,0);
});
test('a failed room can still be entered without loading a camera',async()=>{
  const f=fixture(),pending=f.request.request();f.scene.resolve(false);await pending;
  assert.deepEqual(f.calls.errors,['room-unavailable']);assert.equal(f.calls.load,0);assert.equal(f.calls.start,0);
});
test('hidden or departed pages are checked again after a delayed import',async()=>{
  let allowed=true;const f=fixture({allowed:()=>allowed});f.scene.resolve(true);
  const pending=f.request.request();await Promise.resolve();allowed=false;f.module.resolve(f.tracker);await pending;
  assert.equal(f.calls.start,0);assert.equal(f.request.pending,false);
});
test('canceling an old request cannot swallow a later explicit choice',async()=>{
  const f=fixture();f.scene.resolve(true);const first=f.request.request();await Promise.resolve();
  f.request.cancel();const second=f.request.request();await Promise.resolve();f.module.resolve(f.tracker);
  await Promise.all([first,second]);assert.equal(f.calls.start,1);assert.deepEqual(f.calls.errors,[]);
});

class Element extends EventTarget {
  disabled=false;hidden=false;focusCount=0;textContent='';attributes=new Map();
  focus(){this.focusCount++;}
  setAttribute(key,value){this.attributes.set(key,value);}
}
test('the entrance focuses its heading and Escape dismisses without opting in',()=>{
  const withButton=new Element(),withoutButton=new Element(),status=new Element(),heading=new Element(),room=new Element();
  const dialog=new Element();dialog.open=false;
  dialog.querySelector=selector=>({'[data-enter-with]':withButton,'[data-enter-without]':withoutButton,'[data-entry-status]':status,'[autofocus]':heading}[selector]);
  dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;};
  let optedIn=0,skipped=0;
  const entry=mountRoomEntry({dialog,onWith:()=>optedIn++,onWithout:()=>skipped++,focusTarget:room});
  assert.equal(dialog.open,true);assert.equal(heading.focusCount,1);assert.equal(optedIn,0);
  entry.setPending(true);assert.equal(withButton.disabled,true);assert.equal(withoutButton.disabled,false);
  const escape=new Event('cancel',{cancelable:true});dialog.dispatchEvent(escape);
  assert.equal(escape.defaultPrevented,true);assert.equal(dialog.open,false);assert.equal(skipped,1);assert.equal(optedIn,0);assert.equal(room.focusCount,1);
});
