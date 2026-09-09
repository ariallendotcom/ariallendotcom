(() => {
  let collection;
  let selected = 'tracks';
  let host;
  let loaded = false;
  const escape = (v) => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const heading = {albums:['At the record player','Albums to settle into.'],tracks:['On the iPod','Top songs.'],dj:['The DJ archive','Sounds by Ari.']};
  async function initMusic(){
    const dialog = document.querySelector('#music-panel');
    if (!dialog || dialog.dataset.collectionReady) return;
    dialog.dataset.collectionReady='true';
    host = dialog.querySelector('.music-body');
    if (!host) return;
    // Each player stays in its original DOM position so opening an essay doesn't reload it.
    host.innerHTML = '<nav class="music-sources" aria-label="Music collection"><button data-source="tracks" aria-pressed="true">iPod</button><button data-source="albums" aria-pressed="false">Record player</button><button data-source="dj" aria-pressed="false">DJ archive</button></nav><section id="album-collection" hidden><h2 id="music-title">Albums to settle into.</h2><p class="collection-note">Some records have a way of staying with you.</p><div id="record-grid"><p>Opening the record shelf…</p></div></section><section id="track-collection"><h2 id="tracks-title">Top songs.</h2><p class="collection-note">Songs I keep finding my way back to.</p><div id="track-list"><p>Opening your top songs…</p></div></section><section id="dj-collection" hidden><h2 id="dj-title">Sounds by Ari.</h2><p>For years, I DJed as Sounds by Ari. That part of my life is in a little hibernation at the moment. These mixes are from earlier years—still here for anyone who wants to listen.</p><div id="music-slot"><button class="music-toggle" id="load-music">Open the DJ mixes</button></div><div class="music-links"><a href="https://soundcloud.com/soundsbyari" target="_blank" rel="noopener">SoundCloud ↗</a><a href="mailto:ari@ariallen.com?subject=Music">Talk music ↗</a></div></section><div id="selected-music" hidden><div class="now-playing-header"><span class="eyebrow" id="selected-label"></span><button id="stop-music">Close player ×</button></div><div id="selected-player"></div></div><div class="music-links collection-footer"><a href="https://open.spotify.com/user/121056542" target="_blank" rel="noopener">More on Spotify ↗</a></div>';
    source(selected);
    try {
      const response=await fetch('music.json');if(!response.ok)throw new Error('Music unavailable');
      collection=await response.json();render();loaded=true;
    } catch {
      host.querySelectorAll('#record-grid, #track-list').forEach(list => { list.innerHTML='<p>The collection couldn’t load. The DJ archive is still available.</p>'; });
    }
  }
  function render(){
    document.querySelector('#record-grid').innerHTML=collection.albums.map((r,i)=>`<button class="record-card" data-music="albums:${i}">${r.artwork?`<img src="${escape(r.artwork)}" alt="${escape(r.title)} album artwork" loading="lazy">`:`<div class="record-label tone-${i%5}"><span>${escape(r.artist)}</span><strong>${escape(r.title)}</strong></div>`}<span class="record-title">${escape(r.title)}</span><span class="record-artist">${escape(r.artist)}</span></button>`).join('');
    document.querySelector('#track-list').innerHTML=collection.tracks.map((r,i)=>`<button class="track-row" data-music="tracks:${i}"><span class="track-number">${String(i+1).padStart(2,'0')}</span><span><strong>${escape(r.title)}</strong><span>${escape(r.artist)}</span></span><span class="track-play" aria-hidden="true">↗</span></button>`).join('');
  }
  function source(name){
    if(!host)return;selected=name;
    document.querySelector('#music-panel').setAttribute('aria-labelledby',name==='albums'?'music-title':name==='tracks'?'tracks-title':'dj-title');
    document.querySelector('#album-collection').hidden=name!=='albums';document.querySelector('#track-collection').hidden=name!=='tracks';document.querySelector('#dj-collection').hidden=name!=='dj';
    host.querySelectorAll('[data-source]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.source===name)));
    document.querySelector('#music-panel .panel-top .eyebrow').textContent=heading[name][0];
    document.querySelector('#music-panel').scrollTop=0;
  }
  async function selectMusic(kind,index){
    const item=collection[kind][index];if(!item)return;
    const djSlot=document.querySelector('#music-slot');
    if(djSlot.querySelector('iframe'))djSlot.innerHTML='<button class="music-toggle" id="load-music">Open the DJ mixes</button>';
    const section=document.querySelector('#selected-music');section.hidden=false;
    document.querySelector('#selected-label').textContent=`${item.artist} · ${item.title}`;
    const player=document.querySelector('#selected-player');player.replaceChildren();
    if(item.embed){
      const frame=document.createElement('iframe');frame.title=`${item.title} by ${item.artist}`;frame.src=item.embed;frame.className='collection-player';frame.allow='autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';player.append(frame);
    }
    const a=document.createElement('a');a.href=item.url;a.target='_blank';a.rel='noopener';a.className='open-album';a.textContent=item.embed?'Open in music app ↗':'Find on Spotify ↗';player.append(a);
    section.scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  }
  document.addEventListener('click',async e=>{
    if(e.target.closest('#load-music')){document.querySelector('#selected-player')?.replaceChildren();const selection=document.querySelector('#selected-music');if(selection)selection.hidden=true;}
    const open=e.target.closest('[data-panel="sounds"]');if(open){await initMusic();source(open.dataset.source || 'tracks');}
    const tab=e.target.closest('[data-source]');if(tab && tab.closest('.music-sources'))source(tab.dataset.source);
    const item=e.target.closest('[data-music]');if(item && collection){const [kind,i]=item.dataset.music.split(':');selectMusic(kind,Number(i));}
    if(e.target.closest('#stop-music')){document.querySelector('#selected-player').replaceChildren();document.querySelector('#selected-music').hidden=true;}
  });
})();
