(() => {
  const root = document.querySelector('#room-soundtrack');
  const title = root.querySelector('.soundtrack-title');
  const artist = root.querySelector('.soundtrack-artist');
  const label = root.querySelector('.soundtrack-label');
  const toggle = root.querySelector('#soundtrack-toggle');
  const nextButton = root.querySelector('#soundtrack-next');
  const reveal = root.querySelector('#soundtrack-details');
  const player = root.querySelector('#soundtrack-player');
  const link = root.querySelector('#soundtrack-link');
  let queue = [], index = 0, controller, playing = false, initialized = false;
  let userPaused = false, attemptTimer, started = false, advancing = false;

  function state(isPlaying) {
    playing = isPlaying;
    document.body.dataset.soundtrackState = playing ? 'playing' : 'paused';
    toggle.textContent = playing ? 'Ⅱ' : '▶';
    toggle.setAttribute('aria-label', playing ? 'Pause room music' : 'Play room music');
    label.textContent = playing ? 'On the record player' : 'Ready on the record player';
    document.querySelectorAll('[data-soundtrack-toggle]').forEach(button => {
      button.textContent = playing ? 'Pause the record' : 'Play the record';
    });
  }
  function showPlayer(show) {
    player.hidden = !show;
    reveal.setAttribute('aria-expanded', String(show));
  }
  function trackLabel() {
    const track = queue[index];
    title.textContent = track.title;artist.textContent = track.artist;
    link.href = 'https://open.spotify.com/track/' + track.uri.split(':')[2];
  }
  function fallback() {
    if (!playing && !userPaused) {
      label.textContent = 'Press play to start the record';
      showPlayer(true);
    }
  }
  function play() {
    userPaused = false;
    if (!controller || !initialized) {showPlayer(true);return;}
    try {
      controller.play();
      clearTimeout(attemptTimer);
      attemptTimer = setTimeout(fallback, 2500);
    } catch { fallback(); }
  }
  function pause() {
    userPaused = true;clearTimeout(attemptTimer);
    if (controller) controller.pause();
    state(false);
  }
  function next() {
    if (!controller || !queue.length) return;
    advancing = true;started = false;
    index = (index + 1) % queue.length;
    trackLabel();state(false);
    controller.loadEntity(queue[index].uri);
    // loadEntity changes the content on the same persistent player.
    play();
  }
  function stopOtherMusic() {
    const dj = document.querySelector('#music-slot');
    if (dj?.querySelector('iframe')) dj.innerHTML = '<button class="music-toggle" id="load-music">Open the DJ mixes</button>';
    document.querySelector('#selected-player')?.replaceChildren();
    const selected = document.querySelector('#selected-music');if (selected) selected.hidden = true;
  }
  function toggleMusic() {
    if (playing) pause();else {stopOtherMusic();play();}
  }
  toggle.addEventListener('click', toggleMusic);
  nextButton.addEventListener('click', () => {stopOtherMusic();next();});
  reveal.addEventListener('click', () => showPlayer(player.hidden));
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-soundtrack-toggle]')) toggleMusic();
    if (event.target.closest('#load-music, [data-music]')) pause();
  });
  async function start() {
    try {
      const response = await fetch('soundtrack.json');
      if (!response.ok) throw new Error('Soundtrack unavailable');
      queue = (await response.json()).filter(t => /^spotify:track:[A-Za-z0-9]{22}$/.test(t.uri));
      if (!queue.length) throw new Error('No playable Spotify links');
      trackLabel();
      window.onSpotifyIframeApiReady = (api) => {
        api.createController(document.querySelector('#spotify-room-embed'), {uri:queue[index].uri, width:'100%', height:152}, (embed) => {
          controller = embed;
          const iframe = player.querySelector('iframe');
          if (iframe) {iframe.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';iframe.title = 'Room soundtrack on Spotify';}
          embed.addListener('ready', () => {initialized = true;if(!userPaused)play();});
          embed.addListener('playback_started', () => {
            started = true;advancing = false;clearTimeout(attemptTimer);state(true);showPlayer(false);
          });
          embed.addListener('playback_update', (event) => {
            const data = event.data;
            if (data.playingURI && data.playingURI !== queue[index].uri) return;
            state(!data.isPaused && !data.isBuffering);
            if (playing) {started=true;advancing=false;clearTimeout(attemptTimer);}
            // Advance only after a track that actually started reaches its end.
            if (started && !advancing && !userPaused && data.duration > 0 && data.position >= data.duration - 250) next();
          });
        });
      };
      const script = document.createElement('script');
      script.src = 'https://open.spotify.com/embed/iframe-api/v1';script.async = true;
      script.onerror = () => {label.textContent='Open Spotify to start the record';showPlayer(true);};
      document.head.append(script);
      setTimeout(() => {if(!initialized){label.textContent='Spotify is still loading';showPlayer(true);}}, 8000);
    } catch {
      label.textContent = 'Room music is unavailable';title.textContent='Try refreshing the room';artist.textContent='';
      toggle.disabled=true;nextButton.disabled=true;
    }
  }
  start();
})();
