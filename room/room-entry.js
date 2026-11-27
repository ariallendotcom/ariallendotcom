// A separate intent guard covers the time before the tracking module exists.
// The tracker itself handles cancellation after its camera/model work starts.
export function createTrackingStart({ready,load,start,stop,allowed=()=>true,onPending=()=>{},onError=()=>{}}) {
  let generation=0,pending=false;
  async function request() {
    const id=++generation;
    const current=()=>id===generation && allowed();
    pending=true;onPending(true);
    try {
      const available=await ready;
      if(!current())return;
      if(!available)throw new Error('room-unavailable');
      const tracker=await load();
      if(!current())return;
      pending=false;onPending(false);
      await start(tracker);
    }catch(error){if(current())onError(error);}
    finally{if(id===generation){pending=false;onPending(false);}}
  }
  function cancel(message) {
    ++generation;pending=false;onPending(false);stop(message);
  }
  return {request,cancel,get pending(){return pending;}};
}

export function mountRoomEntry({dialog,onWith,onWithout,focusTarget}) {
  const withButton=dialog.querySelector('[data-enter-with]');
  const withoutButton=dialog.querySelector('[data-enter-without]');
  const status=dialog.querySelector('[data-entry-status]');
  function close(focus=true) {
    if(!dialog.open)return;
    dialog.close();
    if(focus)focusTarget?.focus({preventScroll:true});
  }
  function enterWithout() {onWithout();close();}
  withButton.addEventListener('click',onWith);
  withoutButton.addEventListener('click',enterWithout);
  dialog.addEventListener('cancel',event=>{event.preventDefault();enterWithout();});
  dialog.showModal();
  dialog.querySelector('[autofocus]')?.focus({preventScroll:true});
  return {
    close,
    enterWithout,
    setPending(value) {
      withButton.disabled=value;
      withButton.setAttribute('aria-busy',String(value));
      status.hidden=!value;
      status.textContent=value?'Getting things ready…':'';
    }
  };
}
