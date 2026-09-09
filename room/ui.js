(() => {
  const experience = document.querySelector('#experience');
  const screen = document.querySelector('#computer-content');
  const help = document.querySelector('#instructions');
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let mode = '', origin, request = 0, essays;
  const background = [...document.querySelectorAll('#scene, #hotspots, .room-header, .places, .look-controls')];
  async function collection() {
    if (!essays) {
      const response = await fetch('essays.json');
      if (!response.ok) throw new Error('Writing unavailable');
      essays = await response.json();
    }
    return essays;
  }
  function enter(name) {
    if (!mode) origin = document.activeElement;
    mode = name;
    document.body.dataset.experience = name;
    document.body.classList.add('exploring');
    experience.hidden = false;
    experience.querySelectorAll('.experience-view').forEach(view => { view.hidden = view.id !== name + '-experience'; });
    background.forEach(el => { el.inert = true; });
    document.querySelector('#experience-name').textContent = {desk:'At the desk',music:'At the stereo',books:'The reading shelf',about:'At the coffee table'}[name];
    document.querySelector('#back-to-room').focus({preventScroll:true});
  }
  function leave() {
    ++request;mode = '';experience.hidden = true;delete document.body.dataset.experience;
    background.forEach(el => { el.inert = el.id === 'hotspots' && document.body.classList.contains('quiet'); });
    if (origin?.isConnected && !origin.closest('[hidden]')) origin.focus({preventScroll:true});
  }
  const about = '<h2 tabindex="-1">A few threads, one life.</h2><p>I keep coming back to the ways we make sense of the world—and of each other.</p><p>That thread runs through my work at the <a href="https://constructivedialogue.org/" target="_blank" rel="noopener">Constructive Dialogue Institute</a>, nearly a decade building learning experiences at <a href="https://amplify.com/" target="_blank" rel="noopener">Amplify</a>, and <a href="https://thereconstitution.com/" target="_blank" rel="noopener">The Reconstitution Project</a>.</p><ul class="background-list"><li><strong>Political philosophy</strong><span>Tufts University</span></li><li><strong>Public policy</strong><span>Georgetown Law</span></li><li><strong>Integral Psychology</strong><span>California Institute for Integral Studies</span></li></ul><p>Today, I’m VP of Product at the Constructive Dialogue Institute.</p><p><a href="mailto:ari@ariallen.com">Say hi ↗</a></p>';
  async function folder(name) {
    const id = ++request;
    document.querySelectorAll('[data-folder]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.folder === name)));
    screen.scrollTop = 0;
    if (name === 'about') screen.innerHTML = about;
    else if (name === 'resume') screen.innerHTML = '<h2 tabindex="-1">My résumé.</h2><p>Work, study, and the threads between them.</p><p><a href="../assets/ari-allen-resume.pdf" target="_blank" rel="noopener">Open the full résumé ↗</a></p><object class="computer-resume" data="../assets/ari-allen-resume.pdf#toolbar=0" type="application/pdf" aria-label="Ari Allen’s résumé"><p><a href="../assets/ari-allen-resume.pdf" target="_blank" rel="noopener">Read the résumé as a PDF ↗</a></p></object>';
    else {
      screen.innerHTML = '<h2 tabindex="-1">A few open questions.</h2><p>Opening the writing folder…</p>';
      try {
        const items = await collection();
        if (id !== request || mode !== 'desk') return;
        screen.innerHTML = '<div class="folder-heading"><span class="eyebrow">Writing</span><h2 tabindex="-1">A few open questions.</h2></div><div class="computer-files">' + items.map(item => `<button class="essay-file" data-essay="${escape(item.id)}"><span class="file-meta">${escape(item.theme)}</span><strong>${escape(item.title)}</strong><span>${escape(item.subtitle)}</span><span class="file-open">Read essay ↗</span></button>`).join('') + '</div><p><a href="https://ariallen.substack.com/" target="_blank" rel="noopener">More on Substack ↗</a></p>';
      } catch {
        if (id === request) screen.innerHTML = '<h2 tabindex="-1">The writing folder couldn’t open.</h2><p><a href="https://ariallen.substack.com/" target="_blank" rel="noopener">Read the essays on Substack ↗</a></p>';
      }
    }
    if (id === request && mode === 'desk') screen.querySelector('h2')?.focus({preventScroll:true});
  }
  async function readEssay(id) {
    const req = ++request;
    try {
      const item = (await collection()).find(e => e.id === id);
      if (!item || req !== request || mode !== 'desk') return;
      screen.innerHTML = `<button class="back-reading" data-folder="writing">← Writing folder</button><span class="file-meta">${escape(item.theme)}</span><h2 tabindex="-1">${escape(item.title)}</h2><p class="essay-subtitle">${escape(item.subtitle)}</p><p class="essay-meta">Ari Allen · ${escape(item.date)}</p><article class="essay-body">${item.html}</article><a class="essay-source" href="${escape(item.url)}" target="_blank" rel="noopener">Originally published on Substack ↗</a>`;
      screen.scrollTop = 0;screen.querySelector('h2').focus({preventScroll:true});
    } catch { screen.innerHTML = '<p>This essay couldn’t open. <a href="https://ariallen.substack.com/" target="_blank" rel="noopener">Read it on Substack ↗</a></p>'; }
  }
  async function bookshelf() {
    const req = ++request, host = document.querySelector('#book-browser');
    host.innerHTML = '<p>Opening the reading shelf…</p>';
    try {
      const response = await fetch('books.json');if (!response.ok) throw new Error();
      const books = await response.json();if (req !== request || mode !== 'books') return;
      host.innerHTML = books.length ? '<div class="book-stack">' + books.map((b,i) => `<details class="reading-book"><summary>${b.cover ? `<img src="${escape(b.cover)}" alt="" loading="lazy">` : ''}<span><strong>${escape(b.title)}</strong><span>${escape(b.author)}</span></span></summary><p>${escape(b.note || '')}</p>${b.url ? `<a href="${escape(b.url)}" target="_blank" rel="noopener">About this book ↗</a>` : ''}</details>`).join('') + '</div>' : '<p class="shelf-empty">Book list coming soon.</p><button data-panel="words" class="shelf-writing">Read something by Ari at the desk ↗</button>';
    } catch { host.innerHTML = '<p>The reading shelf couldn’t open. Try visiting again in a moment.</p>'; }
  }
  const aboutView = document.querySelector('#about-experience');
  const aboutPages = [...aboutView.querySelectorAll('.about-book-page')];
  const aboutMobile = matchMedia('(max-width: 760px)');
  let aboutPage = 0;
  function showAboutPage(index, focus = false) {
    aboutPage = index === 1 ? 1 : 0;
    aboutView.querySelector('.about-book-stage').dataset.page = String(aboutPage);
    aboutPages.forEach((page,i) => {page.hidden = aboutMobile.matches && i !== aboutPage;});
    aboutView.querySelector('.about-page-navigation').hidden = !aboutMobile.matches;
    aboutView.querySelectorAll('[data-about-page]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.aboutPage) === aboutPage)));
    if (focus) aboutPages[aboutMobile.matches ? aboutPage : 0].querySelector('h2,h3').focus({preventScroll:true});
  }
  aboutMobile.addEventListener?.('change', () => showAboutPage(aboutPage));
  aboutView.addEventListener('click', event => {
    const page = event.target.closest('[data-about-page]');
    if (page) showAboutPage(Number(page.dataset.aboutPage), true);
  });
  aboutView.addEventListener('keydown', event => {
    if (aboutMobile.matches && ['ArrowLeft','ArrowRight'].includes(event.key)) {
      event.preventDefault();showAboutPage(event.key === 'ArrowRight' ? 1 : 0, true);
    }
  });
  function open(name, source) {
    if (name === 'sounds') { enter('music');window.ariMusic?.open(source || 'overview'); }
    else if (name === 'books') { enter('books');bookshelf(); }
    else if (name === 'about') { ++request;enter('about');aboutPages.forEach(page => {page.scrollTop = 0;});showAboutPage(0, true); }
    else { enter('desk');folder(name === 'resume' ? 'resume' : 'writing'); }
  }
  window.ariExperience = {open, leave};
  document.addEventListener('click', event => {
    const launch = event.target.closest('[data-panel]');if (launch) open(launch.dataset.panel, launch.dataset.source);
    const place = event.target.closest('[data-place]');
    if (place?.dataset.place === 'desk') open('words');
    if (place?.dataset.place === 'stereo') open('sounds');
    const dir = event.target.closest('[data-folder]');if (dir) folder(dir.dataset.folder);
    const essay = event.target.closest('[data-essay]');if (essay) readEssay(essay.dataset.essay);
  });
  document.querySelector('#back-to-room').addEventListener('click', leave);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && mode && !help.open) { event.preventDefault();leave(); }
  });
  document.querySelector('#help-toggle').addEventListener('click', () => help.showModal());
  help.querySelectorAll('button').forEach(button => button.addEventListener('click', () => help.close()));
  document.querySelector('#quiet').addEventListener('click', event => {
    const quiet = document.body.classList.toggle('quiet');
    document.querySelector('#hotspots').inert = quiet;
    event.currentTarget.setAttribute('aria-pressed', String(quiet));
    event.currentTarget.textContent = quiet ? 'Show labels' : 'Hide labels';
  });
  const full = document.querySelector('#fullscreen');
  if (!document.fullscreenEnabled) full.hidden = true;
  full.addEventListener('click', async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen();else await document.documentElement.requestFullscreen(); }
    catch { document.querySelector('#scene-status').textContent = 'Fullscreen isn’t available in this browser.'; }
  });
  document.addEventListener('fullscreenchange', () => full.setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen'));
  document.querySelector('#retry').addEventListener('click', () => location.reload());
})();
