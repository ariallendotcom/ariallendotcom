import {measureHead, averageHeads, headOffset} from './head-tracking-math.mjs';

async function loadLandmarker() {
  const {FaceLandmarker, FilesetResolver} = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs');
  const files = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
  const options = {baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',delegate:'GPU'},runningMode:'VIDEO',numFaces:1,minFaceDetectionConfidence:.6,minFacePresenceConfidence:.6,minTrackingConfidence:.6};
  try {return await FaceLandmarker.createFromOptions(files,options);}
  catch {options.baseOptions.delegate = 'CPU';return FaceLandmarker.createFromOptions(files,options);}
}

function browserEnvironment() {
  return {
    supported:() => window.isSecureContext && !!navigator.mediaDevices?.getUserMedia,
    getMedia:() => navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:'user',width:{ideal:640},height:{ideal:480},frameRate:{ideal:20,max:24}}}),
    createVideo:() => {
      const video = document.createElement('video');
      video.muted = true;video.playsInline = true;video.autoplay = true;
      video.setAttribute('aria-hidden','true');video.tabIndex = -1;
      video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:0;top:0';
      document.body.append(video);return video;
    },
    loadLandmarker,
    requestFrame:callback => requestAnimationFrame(callback),
    cancelFrame:id => cancelAnimationFrame(id),
    setTimer:(callback,ms) => setTimeout(callback,ms),
    clearTimer:id => clearTimeout(id)
  };
}

const stopTracks = stream => stream?.getTracks().forEach(track => track.stop());
const closeModel = model => {try {model?.close();} catch { /* Already disposed. */ }};

// All camera/model work lives behind start(). Generation checks also dispose
// resources that finish loading after a stop, navigation, or denied request.
export function createHeadTracker({onPose, onState, environment = browserEnvironment()}) {
  let generation = 0, phase = 'off', stream, video, model, frame;
  let samples = [], centre = null, lastFrame = -Infinity, lastVideo = -1, lastFace = 0, sensitivity = 1;
  const notify = (next,message) => {phase = next;onState({phase:next,message});};
  function stop(message = 'Head tracking is off.', error = false) {
    ++generation;
    if (frame !== undefined) environment.cancelFrame(frame);
    frame = undefined;stopTracks(stream);stream = null;
    if (video) {video.pause();video.srcObject = null;video.remove();video = null;}
    closeModel(model);model = null;samples = [];centre = null;
    onPose(null);notify(error ? 'error' : 'off',message);
  }
  function deadline(promise,ms) {
    return new Promise((resolve,reject) => {
      const timer = environment.setTimer(() => reject(new Error('timeout')),ms);
      promise.then(value => {environment.clearTimer(timer);resolve(value);}, error => {environment.clearTimer(timer);reject(error);});
    });
  }
  function current(id) {return id === generation;}
  function loop(id,time) {
    if (!current(id)) return;
    frame = environment.requestFrame(next => loop(id,next));
    if (!video || video.readyState < 2 || time-lastFrame < 80 || video.currentTime === lastVideo) return;
    lastFrame = time;lastVideo = video.currentTime;
    try {
      const result = model.detectForVideo(video,time);
      const head = measureHead(result.faceLandmarks?.[0]);
      if (!head) {
        if (!centre) samples = [];
        if (time-lastFace > 700) {
          onPose({yaw:0,pitch:0,fov:0});
          if (phase !== 'waiting') notify('waiting','Move into view and look toward the screen.');
        }
        return;
      }
      lastFace = time;
      if (!centre) {
        samples.push(head);
        if (samples.length < 12) {
          if (phase !== 'calibrating') notify('calibrating','Sit comfortably and hold still for a moment…');
          return;
        }
        centre = averageHeads(samples);
      }
      if (phase !== 'tracking') notify('tracking','Lean gently to look around. Move closer to look closer.');
      onPose(headOffset(head,centre,sensitivity));
    } catch {stop('Tracking paused. You can try again; the ordinary room still works.',true);}
  }
  async function start() {
    stop();const id = generation;
    if (!environment.supported()) {notify('error','Camera access isn’t available here. Try this page in an up-to-date browser over HTTPS.');return;}
    notify('starting','Allow camera access to try head tracking.');
    try {
      const nextStream = await deadline(environment.getMedia().then(value => {
        if (!current(id)) {stopTracks(value);throw new Error('cancelled');}return value;
      }),45000);
      if (!current(id)) {stopTracks(nextStream);return;}
      stream = nextStream;
      stream.getVideoTracks().forEach(track => track.addEventListener('ended',() => {
        if (current(id)) stop('The camera stopped. Turn tracking on to try again.');
      },{once:true}));
      video = environment.createVideo();video.srcObject = stream;
      await deadline(Promise.resolve(video.play()),10000);
      if (!current(id)) return;
      notify('starting','Loading the head tracker. This can take a moment the first time…');
      const nextModel = await deadline(environment.loadLandmarker().then(value => {
        if (!current(id)) {closeModel(value);throw new Error('cancelled');}return value;
      }),45000);
      if (!current(id)) {closeModel(nextModel);return;}
      model = nextModel;lastFrame = -Infinity;lastVideo = -1;lastFace = 0;
      notify('calibrating','Sit comfortably and hold still for a moment…');
      frame = environment.requestFrame(time => loop(id,time));
    } catch (error) {
      if (!current(id)) return;
      const message = error.name === 'NotAllowedError' ? 'Camera permission wasn’t granted. You can keep exploring normally.'
        : error.name === 'NotFoundError' ? 'No camera was found. The ordinary room is ready to explore.'
        : error.name === 'NotReadableError' ? 'The camera may be in use by another app. Close it there, then try again.'
        : error.message === 'timeout' ? 'The camera or tracker took too long to open. Please try again.'
        : 'Head tracking couldn’t start. Please try again; the ordinary room still works.';
      stop(message,true);
    }
  }
  function recenter() {
    if (!model) return;
    centre = null;samples = [];onPose({yaw:0,pitch:0,fov:0});
    notify('calibrating','Hold still in your comfortable position…');
  }
  return {start,stop,recenter,setSensitivity:value => {sensitivity = value;},get phase(){return phase;}};
}
