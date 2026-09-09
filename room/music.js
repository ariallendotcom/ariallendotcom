(() => {
  const view = document.querySelector('#music-experience');
  const viewport = view.querySelector('.collection-viewport');
  const browser = view.querySelector('#music-browser');
  const cover = view.querySelector('#crate-cover');
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let collection, pending, selected = 'overview', album = 0, page = 0, tape = 0, tapes = [], tapeLoading = false, touch, swiped = false;
  function artwork(img, item) {
    img.hidden = !item?.artwork;
    if (item?.artwork) {img.src = item.artwork;img.alt = `${item.title} by ${item.artist}`;}
  }
  async function load() {
    if (!pending) pending = fetch('music.json?v=objects-1').then(response => {
      if (!response.ok) throw new Error('Music collection unavailable');return response.json();
    }).then(data => {collection = data;return data;}).catch(error => {pending = null;throw error;});
    return pending;
  }
  function render() {
    if (!collection) return;
    const record = collection.albums[album];artwork(cover, record);
    view.querySelectorAll('[data-cd]').forEach(button => {
      const i = page * 2 + Number(button.dataset.cd), track = collection.tracks[i];
      button.hidden = !track;
      if (track) {artwork(button.querySelector('img'), track);button.setAttribute('aria-label', selected === 'tracks' ? `Play ${track.title} by ${track.artist}` : 'Open the CD binder');}
    });
    viewport.dataset.source = selected;
    view.querySelector('.crate-art').tabIndex = ['overview','albums'].includes(selected) ? 0 : -1;
    view.querySelectorAll('[data-cd]').forEach(b => {b.tabIndex = ['overview','tracks'].includes(selected) ? 0 : -1;});
    view.querySelector('.tape-label').tabIndex = ['overview','dj'].includes(selected) ? 0 : -1;
    view.querySelectorAll('.object-navigation [data-source]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.source === selected)));
    if (selected === 'overview') {
      browser.innerHTML = '<p class="music-invitation">Pick something up. There’s time.</p>';
    } else if (selected === 'albums') {
      browser.innerHTML = `<div class="record-caption"><span class="eyebrow">Record ${album + 1} / ${collection.albums.length}</span><h2>${escape(record.title)}</h2><p>${escape(record.artist)}</p></div><div class="browse-actions"><button data-flip="-1" aria-label="Previous record">←</button><button data-play-album class="listen-button">▶ Put this record on</button><button data-flip="1" aria-label="Next record">→</button></div><a class="provider-link" href="${escape(record.url)}" target="_blank" rel="noopener">Open album in Spotify ↗</a>`;
    } else if (selected === 'tracks') {
      const tracks = collection.tracks.slice(page * 2, page * 2 + 2);
      browser.innerHTML = `<div class="binder-tracks">${tracks.map((t,i) => `<div><button data-play-track="${page * 2 + i}"><span class="eyebrow">${String(page * 2 + i + 1).padStart(2,'0')} · Play song</span><strong>${escape(t.title)}</strong><span>${escape(t.artist)}</span></button><a class="provider-link" href="${escape(t.url)}" target="_blank" rel="noopener">Full song on Spotify ↗</a></div>`).join('')}</div><div class="browse-actions"><button data-flip="-1" aria-label="Previous CD binder page">←</button><span>Top songs · ${page + 1} / ${Math.ceil(collection.tracks.length / 2)}</span><button data-flip="1" aria-label="Next CD binder page">→</button></div>`;
    } else {
      const mix = tapes[tape];
      view.querySelector('.tape-label').textContent = mix ? mix.title : 'Sounds by Ari';
      browser.innerHTML = `<div class="record-caption"><span class="eyebrow">The DJ archive${mix ? ` · Tape ${tape + 1} / ${tapes.length}` : ''}</span><h2>${escape(mix?.title || 'Sounds by Ari.')}</h2><p>Older mixes from a DJ chapter that’s in a little hibernation.</p></div><div class="browse-actions">${mix ? '<button data-flip="-1" aria-label="Previous DJ tape">←</button>' : ''}<button data-play-tapes class="listen-button">▶ Put this tape on</button>${mix ? '<button data-flip="1" aria-label="Next DJ tape">→</button>' : ''}</div><a class="provider-link" href="${escape(mix?.permalink_url || 'https://soundcloud.com/soundsbyari')}" target="_blank" rel="noopener">${mix ? 'Open mix' : 'Browse all the mixes'} on SoundCloud ↗</a>`;
    }
  }
  function loadTapes() {
    if (tapes.length || tapeLoading || !window.ariSoundtrack) return;
    tapeLoading = true;
    window.ariSoundtrack.prepareTapes().then(items => {tapes = items;tapeLoading = false;if(selected === 'dj')render();}).catch(() => {tapeLoading = false;});
  }
  function choose(source) {selected = source;render();if(selected === 'dj')loadTapes();}
  async function open(source = 'overview') {
    selected = ['overview','albums','tracks','dj'].includes(source) ? source : 'overview';
    browser.innerHTML = '<p class="music-invitation">Opening the collection…</p>';
    try {await load();choose(selected);}
    catch {browser.innerHTML = '<p>The collection couldn’t open. <button data-retry-music>Try again</button> or <a href="https://open.spotify.com/user/121056542" target="_blank" rel="noopener">visit Spotify ↗</a>.</p>';}
  }
  function flip(direction) {
    if (!collection) return;
    if (selected === 'albums') album = (album + direction + collection.albums.length) % collection.albums.length;
    else if (selected === 'tracks') {const n = Math.ceil(collection.tracks.length / 2);page = (page + direction + n) % n;}
    else if (selected === 'dj' && tapes.length) tape = (tape + direction + tapes.length) % tapes.length;
    else return;
    const focusedFlip = document.activeElement?.dataset?.flip;
    render();
    if (focusedFlip) browser.querySelector(`[data-flip="${focusedFlip}"]`)?.focus({preventScroll:true});
    const target = selected === 'albums' ? cover : view.querySelector('.cd-left');
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) target.animate?.([{opacity:.35,transform:`translateY(${direction * 12}px)`},{opacity:1,transform:'translateY(0)'}], {duration:300,easing:'ease-out'});
  }
  function playTrack(i) { if (collection?.tracks[i]) window.ariSoundtrack?.selectTrack(i); }
  function playAlbum() { if (collection) window.ariSoundtrack?.selectAlbum(collection.albums[album]); }
  view.addEventListener('click', event => {
    if (swiped) {swiped = false;event.preventDefault();return;}
    const tab = event.target.closest('[data-source]');if (tab) {choose(tab.dataset.source);}
    const object = event.target.closest('[data-object]');if (object) {
      if (selected === object.dataset.object) {if (selected === 'albums') playAlbum();else window.ariSoundtrack?.playTapes(tape);}
      else {choose(object.dataset.object);}
    }
    const cd = event.target.closest('[data-cd]');if (cd) {if (selected === 'tracks') playTrack(page * 2 + Number(cd.dataset.cd));else {selected = 'tracks';render();}}
    const move = event.target.closest('[data-flip]');if (move) flip(Number(move.dataset.flip));
    if (event.target.closest('[data-play-album]')) playAlbum();
    const track = event.target.closest('[data-play-track]');if (track) playTrack(Number(track.dataset.playTrack));
    if (event.target.closest('[data-play-tapes]')) window.ariSoundtrack?.playTapes(tape);
    if (event.target.closest('[data-retry-music]')) open(selected);
  });
  viewport.addEventListener('pointerdown', event => { swiped = false;if (event.isPrimary) touch = {x:event.clientX,y:event.clientY}; });
  viewport.addEventListener('pointerup', event => {
    if (!touch) return;const dx = event.clientX - touch.x, dy = event.clientY - touch.y;touch = null;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) {swiped = true;flip(dx < 0 ? 1 : -1);}
  });
  viewport.addEventListener('pointercancel', () => {touch = null;});
  view.addEventListener('keydown', event => {if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {event.preventDefault();flip(event.key === 'ArrowRight' ? 1 : -1);}});
  window.ariMusic = {open};
})();
