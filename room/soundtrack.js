(() => {
  const root = document.querySelector('#room-soundtrack');
  const title = root.querySelector('.soundtrack-title'), artist = root.querySelector('.soundtrack-artist');
  const label = root.querySelector('.soundtrack-label'), toggle = root.querySelector('#soundtrack-toggle');
  const nextButton = root.querySelector('#soundtrack-next'), reveal = root.querySelector('#soundtrack-details');
  const player = root.querySelector('#soundtrack-player'), link = root.querySelector('#soundtrack-link');
  const note = root.querySelector('#soundtrack-note'), progress = root.querySelector('.soundtrack-progress');
  const spotifyHolder = root.querySelector('#spotify-room-holder'), tapeHolder = root.querySelector('#soundcloud-room-embed');
  let queue = [], index = 0, controller, initialized = false, playing = false;
  // Arrival is quiet; play() records the visitor's request, even before the embed is ready.
  let userPaused = true, attemptTimer, started = false, advancing = false, previewOnly = false;
  let selectedAlbum = null, provider = 'spotify', activeURI = '', pendingURI = '';
  let tapeWidget, tapePromise, tapes = [], tapeIndex = 0;
  function state(isPlaying) {
    playing = isPlaying;
    document.body.dataset.soundtrackState = playing ? 'playing' : 'paused';
    document.body.dataset.soundtrackProvider = provider;
    const symbol = root.querySelector('#soundtrack-symbol'), action = root.querySelector('#soundtrack-action');
    if (symbol && action) {symbol.textContent = playing ? 'Ⅱ' : '▶';action.textContent = playing ? 'Pause' : 'Play';}
    else toggle.textContent = playing ? 'Ⅱ' : '▶';
    toggle.setAttribute('aria-label', playing ? 'Pause room music' : 'Play room music');
    label.textContent = provider === 'soundcloud' ? (playing ? 'Playing · DJ archive' : 'Paused · DJ archive') : previewOnly ? (playing ? 'Playing · Spotify preview' : 'Paused · Spotify preview') : selectedAlbum ? (playing ? 'Playing album · Spotify' : 'Album · Spotify') : (playing ? 'Playing · Spotify' : 'Ready on the record player');
  }
  function showPlayer(show) {player.hidden = !show;reveal.setAttribute('aria-expanded', String(show));reveal.setAttribute('aria-label', `${show ? 'Hide' : 'Show'} ${provider === 'soundcloud' ? 'SoundCloud' : 'Spotify'} player`);}
  function position(now, duration) {
    if (!progress) return;
    const value = duration > 0 ? Math.min(100,Math.max(0,now / duration * 100)) : 0;
    progress.setAttribute('aria-valuenow', String(Math.round(value)));progress.querySelector('span').style.width = value + '%';
  }
  function metadata(item) {
    previewOnly = false;note.hidden = true;note.textContent = '';position(0,0);
    title.textContent = item.title;artist.textContent = item.artist;
    link.href = item.url || 'https://open.spotify.com/track/' + item.uri.split(':')[2];
    link.textContent = provider === 'soundcloud' ? 'Open mix on SoundCloud ↗' : 'Open in Spotify ↗';
    nextButton.textContent = selectedAlbum ? '≡' : '›';
    nextButton.setAttribute('aria-label', selectedAlbum ? 'Choose a track from this album' : provider === 'soundcloud' ? 'Next DJ mix' : `Next song (currently ${index + 1} of ${queue.length})`);
    root.setAttribute('aria-label', `Music: ${item.title} by ${item.artist}`);
  }
  function trackLabel() {metadata(queue[index]);}
  function previewMode(preview) {
    if (previewOnly === preview) return;
    previewOnly = preview;note.hidden = !preview;
    note.textContent = preview ? 'Spotify is playing a short preview here. Open Spotify to hear the full song.' : '';
    link.textContent = preview ? 'Hear the full song on Spotify ↗' : 'Open in Spotify ↗';
  }
  function fallback() {
    if (!playing && !userPaused) {label.textContent = 'Press play below to start';showPlayer(true);}
  }
  function play() {
    userPaused = false;
    if (provider === 'soundcloud') {if(tapeWidget)tapeWidget.play();else showPlayer(true);}
    else if (!controller || !initialized) {showPlayer(true);return;}
    else {try {controller.play();} catch {fallback();}}
    clearTimeout(attemptTimer);attemptTimer = setTimeout(fallback,2500);
  }
  function pause() {
    userPaused = true;clearTimeout(attemptTimer);
    if (provider === 'soundcloud') tapeWidget?.pause();else controller?.pause();
    state(false);
  }
  function selectSpotify(item) {
    provider = 'spotify';tapeWidget?.pause();
    if (spotifyHolder) spotifyHolder.hidden = false;if(tapeHolder)tapeHolder.hidden = true;
    started = false;advancing = true;activeURI = '';pendingURI = item.uri || item.spotifyUri;
    metadata(item);state(false);
    if (controller && initialized) {controller.loadEntity(pendingURI);pendingURI = '';}
    play();
  }
  function selectTrack(i) {if (!Number.isInteger(i) || !queue[i]) return;index = i;selectedAlbum = null;selectSpotify(queue[index]);}
  function selectAlbum(album) {
    if (!/^spotify:album:[A-Za-z0-9]{22}$/.test(album?.spotifyUri)) return;
    selectedAlbum = album;selectSpotify(album);showPlayer(true);
  }
  function next() {
    if (provider === 'soundcloud') {if(tapes.length)playTapes((tapeIndex + 1) % tapes.length);else showPlayer(true);return;}
    if (selectedAlbum) {showPlayer(true);return;}
    if (queue.length) selectTrack((index + 1) % queue.length);
  }
  function prepareTapes() {
    if (tapePromise) return tapePromise;
    tapePromise = new Promise((resolve,reject) => {
      if (!tapeHolder) {reject(new Error('Tape player unavailable'));return;}
      const frame = document.createElement('iframe');frame.title = 'Sounds by Ari — DJ archive';frame.allow = 'autoplay';frame.height = '290';
      frame.src = 'https://w.soundcloud.com/player/?url=https%3A//soundcloud.com/soundsbyari&color=%23856c43&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&visual=false';
      tapeHolder.replaceChildren(frame);
      let settled = false;
      const timeout = setTimeout(() => {if (!settled) {settled=true;reject(new Error('The tape archive is taking a moment'));}},12000);
      function connect() {
        tapeWidget = window.SC.Widget(frame);const events = window.SC.Widget.Events;
        tapeWidget.bind(events.READY, () => {
          tapeWidget.getSounds(sounds => {tapes = Array.isArray(sounds) ? sounds : [];clearTimeout(timeout);settled = true;resolve(tapes);});
        });
        tapeWidget.bind(events.PLAY, () => {
          if (provider !== 'soundcloud') {tapeWidget.pause();return;}
          controller?.pause();clearTimeout(attemptTimer);state(true);
          tapeWidget.getCurrentSound(sound => {if(provider==='soundcloud' && sound) {title.textContent=sound.title;artist.textContent='Sounds by Ari';link.href=sound.permalink_url || 'https://soundcloud.com/soundsbyari';}});
          tapeWidget.getCurrentSoundIndex(i => {tapeIndex = i;});
        });
        tapeWidget.bind(events.PAUSE, () => {if(provider==='soundcloud')state(false);});
        tapeWidget.bind(events.FINISH, () => {if(provider==='soundcloud')state(false);});
        tapeWidget.bind(events.PLAY_PROGRESS, data => {if(provider==='soundcloud'){state(true);position(data.relativePosition,1);}});
        tapeWidget.bind(events.ERROR, () => {if(provider==='soundcloud'){state(false);label.textContent='Open SoundCloud to listen';showPlayer(true);}if(!settled){settled=true;clearTimeout(timeout);reject(new Error('Tape archive unavailable'));}});
      }
      if (window.SC?.Widget) connect();
      else {const script = document.createElement('script');script.src='https://w.soundcloud.com/player/api.js';script.onload=connect;script.onerror=()=>{clearTimeout(timeout);settled=true;reject(new Error('SoundCloud unavailable'));};document.head.append(script);}
    }).catch(error => {tapePromise = null;throw error;});
    return tapePromise;
  }
  async function playTapes(i = 0) {
    pause();provider = 'soundcloud';selectedAlbum = null;started = false;userPaused = false;
    if (spotifyHolder) spotifyHolder.hidden = true;if(tapeHolder)tapeHolder.hidden = false;
    metadata({title:'Sounds by Ari',artist:'The DJ archive',url:'https://soundcloud.com/soundsbyari'});state(false);showPlayer(true);
    try {
      await prepareTapes();if(provider !== 'soundcloud' || userPaused)return;
      tapeIndex = tapes[i] ? i : 0;
      if (tapes[tapeIndex]) metadata({title:tapes[tapeIndex].title,artist:'Sounds by Ari',url:tapes[tapeIndex].permalink_url});
      tapeWidget.skip(tapeIndex);play();
    } catch {if(provider==='soundcloud'){label.textContent='Open SoundCloud to listen';showPlayer(true);}}
  }
  function toggleMusic() {if (playing) pause();else play();}
  toggle.addEventListener('click',toggleMusic);nextButton.addEventListener('click',next);reveal.addEventListener('click',()=>showPlayer(player.hidden));
  window.ariSoundtrack = {selectTrack,selectAlbum,pause,toggle:toggleMusic,prepareTapes,playTapes};
  async function start() {
    try {
      const response = await fetch('soundtrack.json');if (!response.ok) throw new Error('Soundtrack unavailable');
      queue = (await response.json()).filter(t=>/^spotify:track:[A-Za-z0-9]{22}$/.test(t.uri));
      if (!queue.length) throw new Error('No playable Spotify links');
      trackLabel();state(false);
      window.onSpotifyIframeApiReady = api => {
        api.createController(document.querySelector('#spotify-room-embed'),{uri:pendingURI || queue[index].uri,width:'100%',height:152},embed=>{
          controller=embed;pendingURI='';
          const iframe = player.querySelector('iframe');if(iframe){iframe.allow='autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';iframe.title='Room soundtrack on Spotify';}
          embed.addListener('ready',()=>{initialized=true;if(pendingURI){embed.loadEntity(pendingURI);pendingURI='';}if(!userPaused && provider==='spotify')play();});
          embed.addListener('playback_started',event=>{
            const uri = event?.data?.playingURI;
            if(provider!=='spotify'){embed.pause();return;}
            if(!selectedAlbum && uri!==queue[index].uri)return;
            activeURI=uri;started=true;advancing=false;userPaused=false;clearTimeout(attemptTimer);state(true);
            if(!previewOnly && !selectedAlbum)showPlayer(false);
          });
          embed.addListener('playback_update',event=>{
            if(provider!=='spotify')return;
            const data=event.data;
            if(!selectedAlbum && data.playingURI && data.playingURI!==queue[index].uri)return;
            if(selectedAlbum && (!started || data.playingURI && data.playingURI!==activeURI))return;
            if(!data.playingURI && !started)return;
            const duration=Number(data.duration), now=Number(data.position);
            const known=selectedAlbum ? queue.find(t=>t.uri===data.playingURI) : queue[index];
            const fullDuration=Number(known?.durationMs);
            if(duration>0 && fullDuration>0)previewMode(duration<=35000 && fullDuration>duration+5000);
            position(now,duration);state(!data.isPaused && !data.isBuffering);
            if(playing){started=true;advancing=false;clearTimeout(attemptTimer);}
            if(started && !advancing && !userPaused && data.isPaused && !data.isBuffering && duration>0 && now>=duration){
              if(previewOnly){started=false;clearTimeout(attemptTimer);showPlayer(true);}
              else if(!selectedAlbum)next();
            }
          });
        });
      };
      const script=document.createElement('script');script.src='https://open.spotify.com/embed/iframe-api/v1';script.async=true;
      script.onerror=()=>{if(provider==='spotify'){label.textContent='Open Spotify to start the record';if(!userPaused)showPlayer(true);}};document.head.append(script);
      setTimeout(()=>{if(!initialized && !userPaused && provider==='spotify'){label.textContent='Spotify is still loading';showPlayer(true);}},8000);
    } catch {label.textContent='Room music is unavailable';title.textContent='Try refreshing the room';artist.textContent='';}
  }
  start();
})();
