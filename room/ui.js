(() => {
  const panel = document.querySelector('#panel');
  const body = document.querySelector('#panel-body');
  const kicker = document.querySelector('#panel-kicker');
  const help = document.querySelector('#instructions');
  let essays;
  let musicFrame;
  const musicPanel = document.createElement('dialog');
  musicPanel.id = 'music-panel';
  musicPanel.setAttribute('aria-labelledby', 'music-title');
  document.body.append(musicPanel);
  let request = 0;
  const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function collection() {
    if (!essays) {
      const response = await fetch('essays.json');
      if (!response.ok) throw new Error('Reading collection unavailable');
      essays = await response.json();
    }
    return essays;
  }

  function show() {
    document.body.classList.add('exploring');
    if (!panel.open) panel.showModal();
    panel.scrollTop = 0;
  }
  async function openPanel(name) {
    const id = ++request;
    if (name !== 'sounds' && musicPanel.open) musicPanel.close();
    if (name === 'words') {
      kicker.textContent = 'From the bookshelf';
      body.innerHTML = '<h2 id="panel-title">A few open questions.</h2><p class="panel-intro">Pull up a chair. There’s time to read.</p><div id="collection"><p>Opening the bookshelf…</p></div>';
      show();
      try {
        const items = await collection();
        if (request !== id) return;
        document.querySelector('#collection').innerHTML = items.map((item) => `<button class="shelf-item" data-essay="${escape(item.id)}"><span class="eyebrow">${escape(item.theme)}</span><h3>${escape(item.title)}</h3><p>${escape(item.subtitle)}</p></button>`).join('') + '<p><a href="https://ariallen.substack.com/" target="_blank" rel="noopener">More on Substack ↗</a></p>';
      } catch {
        if (request === id) document.querySelector('#collection').innerHTML = '<p>The bookshelf couldn’t open. <a href="https://ariallen.substack.com/" target="_blank" rel="noopener">You can find the essays on Substack.</a></p>';
      }
    } else if (name === 'sounds') {
      if (panel.open) panel.close();
      if (!musicPanel.childElementCount) {
        musicPanel.innerHTML = '<div class="panel-top"><span class="eyebrow">At the stereo</span><button id="close-music" aria-label="Close music and return to the room">×</button></div><div class="music-body"><h2 id="music-title">A different way<br>to feel things.</h2><p>For years, I DJed as Sounds by Ari. That part of my life is in a little hibernation at the moment. These mixes are from earlier years—still here for anyone who wants to listen.</p><div id="music-slot"><button class="music-toggle" id="load-music">Open the DJ mixes</button></div><div class="music-links"><a href="https://soundcloud.com/soundsbyari" target="_blank" rel="noopener">SoundCloud ↗</a><a href="https://open.spotify.com/user/121056542" target="_blank" rel="noopener">Find me on Spotify ↗</a><a href="mailto:ari@ariallen.com?subject=Music">Talk music ↗</a></div><p style="font-size:12px">Music keeps playing when you return to the room. Come back here to pause.</p></div>';
        musicPanel.querySelector('#close-music').addEventListener('click', () => musicPanel.close());
      }
      document.body.classList.add('exploring');
      if (!musicPanel.open) musicPanel.showModal();
    } else if (name === 'about') {
      kicker.textContent = 'The person behind the room';
      body.innerHTML = '<h2 id="panel-title">A few threads,<br>one life.</h2><p>I keep coming back to the ways we make sense of the world—and of each other.</p><p>That thread runs through my work at the <a href="https://constructivedialogue.org/" target="_blank" rel="noopener">Constructive Dialogue Institute</a>, nearly a decade building learning experiences at <a href="https://amplify.com/" target="_blank" rel="noopener">Amplify</a>, and <a href="https://thereconstitution.com/" target="_blank" rel="noopener">The Reconstitution Project</a>.</p><ul class="background-list"><li><strong>Political philosophy</strong><span>Tufts University</span></li><li><strong>Public policy</strong><span>Georgetown Law</span></li><li><strong>Integral Psychology</strong><span>California Institute for Integral Studies</span></li></ul><p>Today, I’m VP of Product at the Constructive Dialogue Institute.</p><a class="resume-link" href="../assets/ari-allen-resume.pdf" target="_blank" rel="noopener">Open my résumé ↗</a><div class="music-links"><a href="mailto:ari@ariallen.com">Say hi ↗</a></div>';
      show();
    }
  }
  document.addEventListener('click', async (event) => {
    const launch = event.target.closest('[data-panel]');
    if (launch) openPanel(launch.dataset.panel);
    const essay = event.target.closest('[data-essay]');
    if (essay) {
      const item = (await collection()).find((entry) => entry.id === essay.dataset.essay);
      if (!item) return;
      kicker.textContent = item.theme;
      body.innerHTML = `<button class="back-reading" data-panel="words">← Back to the bookshelf</button><h2 id="panel-title">${escape(item.title)}</h2><p class="essay-subtitle">${escape(item.subtitle)}</p><p class="essay-meta">Ari Allen · ${escape(item.date)}</p><article class="essay-body">${item.html}</article><a class="essay-source" href="${escape(item.url)}" target="_blank" rel="noopener">Originally published on Substack ↗</a>`;
      panel.scrollTop = 0;
      body.querySelector('.back-reading').focus({preventScroll:true});
    }
    if (event.target.closest('#load-music')) {
      musicFrame = document.createElement('iframe');
      musicFrame.className = 'music-frame';
      musicFrame.title = 'Sounds by Ari — DJ mixes on SoundCloud';
      musicFrame.src = 'https://w.soundcloud.com/player/?url=https%3A//soundcloud.com/soundsbyari&color=%23856c43&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&visual=false';
      musicFrame.allow = 'autoplay';
      document.querySelector('#music-slot').replaceChildren(musicFrame);
    }
  });
  document.querySelector('#close-panel').addEventListener('click', () => panel.close());
  panel.addEventListener('click', (event) => { if (event.target === panel) { const r=panel.getBoundingClientRect(); if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom) panel.close(); } });
  document.querySelector('#help-toggle').addEventListener('click', () => help.showModal());
  help.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => help.close()));
  document.querySelector('#quiet').addEventListener('click', (event) => {
    const quiet = document.body.classList.toggle('quiet');
    document.querySelector('#hotspots').inert = quiet;
    event.currentTarget.setAttribute('aria-pressed', String(quiet));
    event.currentTarget.textContent = quiet ? 'Show labels' : 'Hide labels';
  });
  const full = document.querySelector('#fullscreen');
  if (!document.fullscreenEnabled) full.hidden = true;
  full.addEventListener('click', async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
    catch { document.querySelector('#scene-status').textContent = 'Fullscreen isn’t available in this browser.'; }
  });
  document.addEventListener('fullscreenchange', () => full.setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen'));
  document.querySelector('#retry').addEventListener('click', () => location.reload());
})();
