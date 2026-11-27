(() => {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const categories = ['All writing', 'AI & possibility', 'Learning & work', 'Democracy', 'Life & loss'];
  const formatDate = value => new Intl.DateTimeFormat('en-US', {month:'short', day:'numeric', year:'numeric', timeZone:'UTC'}).format(new Date(value + 'T12:00:00Z'));
  let items, pending, host, category = 'All writing', selected = '', scroll = 0;
  const filtered = () => items.filter(item => category === 'All writing' || item.category === category);
  const image = (item, eager = false) => item.image ? `<img src="${escape(item.image)}" alt="${escape(item.imageAlt)}" loading="${eager ? 'eager' : 'lazy'}" decoding="async" referrerpolicy="no-referrer" style="object-position:${escape(item.imagePosition || 'center')}">` : `<span class="writing-type-art" aria-hidden="true">What<br>if<span>?</span></span>`;
  const meta = item => `<span>${escape(item.category)}</span><time datetime="${item.date}">${formatDate(item.date)}</time>`;
  function focusHeading() { host.querySelector('h2')?.focus({preventScroll:true}); }
  function renderCollection(restore = false) {
    selected = ''; host.dataset.writingView = 'collection';
    const visible = filtered();
    host.innerHTML = `<div class="writing-intro"><div><p class="writing-kicker">Collected writing · 2020–2026</p><h2 tabindex="-1">A few open<br><em>questions.</em></h2><p class="writing-deck">About the futures we build.<br>And the lives we live along the way.</p></div><button class="writing-surprise" data-writing-surprise><span aria-hidden="true">✳</span>Surprise me</button></div><nav class="writing-filters" aria-label="Filter writing by topic">${categories.map(name => `<button data-writing-filter="${escape(name)}" aria-pressed="${name === category}">${escape(name)}</button>`).join('')}</nav><div class="writing-count" role="status">${visible.length} ${visible.length === 1 ? 'essay' : 'essays'}<span>Newest first</span></div><div class="writing-collection">${visible.map((item,i) => `<article class="writing-card ${i === 0 ? 'writing-featured' : ''}" style="--card-order:${i}"><button data-writing-open="${item.id}" aria-label="Explore ${escape(item.title)}"><span class="writing-art">${image(item,i === 0)}<span class="writing-art-caption">${escape(item.question)}</span></span><span class="writing-card-copy"><span class="writing-meta">${meta(item)}</span><h3>${escape(item.title)}</h3><span class="writing-teaser">${escape(item.summary)}</span><span class="writing-card-action">Open essay notes <span aria-hidden="true">+</span></span></span></button></article>${i === 2 && visible.length > 4 ? `<aside class="writing-interlude"><span class="writing-kicker">A line to sit with</span><blockquote>“${escape(visible[0].quote)}”</blockquote><button data-writing-open="${visible[0].id}">From ${escape(visible[0].title)}</button></aside>` : ''}`).join('')}</div><footer class="writing-footer"><p>Different questions. The same curiosity.</p><a href="https://ariallen.substack.com/" target="_blank" rel="noopener noreferrer">Visit Still Here… on Substack</a><a href="https://ariallen.medium.com/" target="_blank" rel="noopener noreferrer">More on Medium</a></footer>`;
    host.scrollTop = restore ? scroll : 0;
  }
  function renderEssay(id) {
    const item = items.find(entry => entry.id === id); if (!item) return;
    if (!selected) scroll = host.scrollTop;
    selected = id; host.dataset.writingView = 'essay';
    const related = item.related.map(id => items.find(entry => entry.id === id)).filter(Boolean);
    host.innerHTML = `<div class="writing-reader-nav"><button data-writing-back>Back to the collection</button><button data-writing-surprise>Another surprise <span aria-hidden="true">✳</span></button></div><article class="writing-reader"><div class="writing-reader-art">${image(item,true)}</div><div class="writing-reader-copy"><div class="writing-meta">${meta(item)}</div><h2 tabindex="-1">${escape(item.title)}</h2><blockquote>“${escape(item.quote)}”<cite>${escape(item.quoteCredit)}</cite></blockquote><p class="writing-summary">${escape(item.summary)}</p><a class="writing-read-full" href="${escape(item.url)}" target="_blank" rel="noopener noreferrer">Read the full essay on ${item.source}</a><p class="writing-external-note">Opens the original in a new tab. Your place here stays open.</p><div class="writing-reflection"><span class="writing-kicker">A question to carry with you</span><p>${escape(item.question)}</p></div><section class="writing-related" aria-label="Related essays"><h3>Follow the thread.</h3>${related.map(entry => `<button data-writing-open="${entry.id}"><span>${escape(entry.category)}</span><strong>${escape(entry.title)}</strong></button>`).join('')}</section></div></article>`;
    host.scrollTop = 0; focusHeading();
  }
  function surprise() {
    const pool = filtered().filter(item => item.id !== selected);
    const choice = pool[Math.floor(Math.random() * pool.length)] || filtered()[0];
    if (choice) renderEssay(choice.id);
  }
  async function open(element, isCurrent) {
    host = element;
    if (!pending) pending = fetch('/room/essays.json?v=collection-1').then(response => {
      if (!response.ok) throw new Error('Writing unavailable'); return response.json();
    }).then(data => {items = data.sort((a,b) => b.date.localeCompare(a.date));}).catch(error => {pending = null;throw error;});
    await pending;
    if (!isCurrent()) return;
    renderCollection();
  }
  document.addEventListener('click', event => {
    if (!host || host.dataset.folder !== 'writing' || !host.contains(event.target)) return;
    const filter = event.target.closest('[data-writing-filter]');
    if (filter) {category = filter.dataset.writingFilter;renderCollection();host.querySelector(`[data-writing-filter="${CSS.escape(category)}"]`)?.focus({preventScroll:true});}
    const article = event.target.closest('[data-writing-open]');if (article) renderEssay(article.dataset.writingOpen);
    if (event.target.closest('[data-writing-back]')) {const last = selected;renderCollection(true);host.querySelector(`[data-writing-open="${last}"]`)?.focus({preventScroll:true});}
    if (event.target.closest('[data-writing-surprise]')) surprise();
  });
  // An unavailable host image leaves its editorial question in place.
  document.addEventListener('error', event => {
    if (event.target.matches?.('.writing-art img,.writing-reader-art img')) {event.target.hidden = true;event.target.parentElement.classList.add('writing-art-unavailable');}
  }, true);
  window.ariWriting = {open};
})();
