// Elements
const nav = document.querySelector('nav');
const sections = document.querySelectorAll('section');
const navLinks = document.querySelectorAll('.nav-links a');
const menuToggle = document.querySelector('.menu-toggle');
const navMenu = document.querySelector('.nav-links');
const heroTagline = document.querySelector('.hero-tagline');
const reveals = document.querySelectorAll('.reveal');

// Scroll handler
window.addEventListener('scroll', () => {
  const scrollY = window.scrollY;

  // Nav background
  nav.classList.toggle('scrolled', scrollY > 50);

  // Active link
  updateActiveLink(scrollY);

  // Hero parallax — tagline drifts up and fades as you scroll away
  if (heroTagline) {
    const rate = scrollY * 0.4;
    const opacity = Math.max(1 - scrollY / 600, 0);
    heroTagline.style.transform = `translateY(${rate}px)`;
    heroTagline.style.opacity = opacity;
  }

  // Reveal sections on scroll
  reveals.forEach(el => {
    const top = el.getBoundingClientRect().top;
    if (top < window.innerHeight * 0.85) {
      el.classList.add('visible');
    }
  });
});

function updateActiveLink(scrollY) {
  const scrollPos = scrollY + window.innerHeight / 3;

  sections.forEach(section => {
    const top = section.offsetTop;
    const bottom = top + section.offsetHeight;
    const id = section.getAttribute('id');

    if (scrollPos >= top && scrollPos < bottom) {
      navLinks.forEach(link => {
        link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
      });
    }
  });
}

// Mobile menu
menuToggle.addEventListener('click', () => {
  menuToggle.classList.toggle('open');
  navMenu.classList.toggle('open');
});

navLinks.forEach(link => {
  link.addEventListener('click', () => {
    menuToggle.classList.remove('open');
    navMenu.classList.remove('open');
  });
});

// Floating hero quotes — ambient thoughts drifting through the hero
const heroQuotes = document.querySelector('.hero-quotes');
const desktop = window.matchMedia('(min-width: 769px)').matches;

if (heroQuotes && desktop) {
  // Source pieces — title + url. Each quote points at a key here.
  const SOURCES = {
    GODS:     { title: "We're Building Gods",                     url: 'https://ariallen.substack.com/p/were-building-gods-whether-we-believe' },
    POSTREAL: { title: 'Post-Truth to Post-Reality',              url: 'https://ariallen.substack.com/p/from-posttruth-to-postreality-trump' },
    LABOR:    { title: 'The Future of Labor',                     url: 'https://ariallen.substack.com/p/the-future-of-labor-what-if-work' },
    PROVE:    { title: 'Prove Me Wrong',                          url: 'https://ariallen.substack.com/p/prove-me-wrong-americas-addiction' },
    IMAGINE:  { title: 'What If We Let Ourselves Imagine Again',  url: 'https://ariallen.substack.com/p/what-if-we-let-ourselves-imagine' },
    SAMI:     { title: 'Sami: A Eulogy',                          url: 'https://ariallen.medium.com/sami-a-eulogy-a-parable-b62396c1031e' },
    DAYS:     { title: 'And The Days Go By',                      url: 'https://ariallen.substack.com/p/as-the-days-go-by-3bf124d54df1' },
    ALIGN:    { title: 'Creating Alignment',                      url: 'https://ariallen.substack.com/p/creating-alignment-the-search-for' },
    EDU:      { title: 'The Future of Education',                 url: 'https://ariallen.substack.com/p/the-future-of-education' },
    BOND:     { title: "Beyond Our Nation's Divides",             url: 'https://ariallen.substack.com/p/beyond-our-nations-divides-an-invitation' },
    EXERGY:   { title: 'Revaluing the Economy',                   url: 'https://ariallen.medium.com/revaluing-the-economy-the-case-for-an-exergy-backed-currency-dcc6648a6eaa' },
    TURN:     { title: "There's No Turning Back",                 url: 'https://ariallen.medium.com/theres-no-turning-back-efficiency-isn-t-the-highest-good-368a06e750b6' },
    GIVE:     { title: 'Giving It All Away',                      url: 'https://ariallen.medium.com/giving-it-all-away-the-end-of-fiat-currency-debt-based-economics-a8a1488e80c1' },
    CHAOS:    { title: 'The Chaos Catalyst',                      url: 'https://ariallen.medium.com/hurricane-trump-what-the-establishment-failed-to-see-in-2024-599e3bd7c978' },
    LET:      { title: 'Let It Be',                               url: 'https://ariallen.medium.com/let-it-be-from-patience-to-presence-c374486bbc39' },
    SPEECH:   { title: 'The Free Speech Distraction',             url: 'https://ariallen.medium.com/the-free-speech-distraction-the-battle-for-algorithmic-reach-5ea4c6b76a34' },
  };

  const quotes = [
    // We're Building Gods
    { text: 'Whether we like it or not, we are building gods.',                                                              src: 'GODS' },
    { text: "The question isn't what we want them to do — it's who we want them to be.",                                     src: 'GODS' },
    { text: 'We are inside this process, being asked to rise to it.',                                                        src: 'GODS' },
    // From Post-Truth to Post-Reality
    { text: 'If we want something else, we have to start imagining it first.',                                               src: 'POSTREAL' },
    // The Future of Labor
    { text: "Vision isn't frivolous. It's the way through.",                                                                 src: 'LABOR' },
    // Prove Me Wrong
    { text: "Not 'prove me wrong,' but 'help me understand.'",                                                               src: 'PROVE' },
    { text: "Engagement alone isn't enough. We need it reframed constructively — urgently.",                                 src: 'PROVE' },
    // What If We Let Ourselves Imagine Again
    { text: "Imagining something better isn't naive.",                                                                       src: 'IMAGINE' },
    { text: "It's about — together — becoming more humane.",                                                                 src: 'IMAGINE' },
    // Sami: A Eulogy
    { text: 'Write a new story.',                                                                                            src: 'SAMI' },
    { text: 'There is no light without dark, no warm without cold.',                                                         src: 'SAMI' },
    { text: 'Gratitude can be found anywhere, anytime.',                                                                     src: 'SAMI' },
    // And The Days Go By
    { text: 'The human experiment is a journey — not a destination.',                                                        src: 'DAYS' },
    { text: 'There is no path forward in looking backward.',                                                                 src: 'DAYS' },
    // Creating Alignment
    { text: "Rules can't contain what only understanding can hold.",                                                         src: 'ALIGN' },
    { text: 'External constraints without internal comprehension is borrowed time.',                                         src: 'ALIGN' },
    { text: 'You cannot meet a genuinely different intelligence and remain who you were.',                                   src: 'ALIGN' },
    { text: "Every attempt to determine what's 'really' conscious reveals more about the questioner than the questioned.",   src: 'ALIGN' },
    { text: "The most consequential capability in the age we're entering isn't engineering. It's imagination.",              src: 'ALIGN' },
    { text: "We're world-building now.",                                                                                     src: 'ALIGN' },
    // The Future of Education
    { text: 'The age rendering human intelligence obsolete is the very age summoning wisdom into existence.',                src: 'EDU' },
    { text: 'In an age overflowing with intelligence, intelligence alone is no longer sufficient.',                          src: 'EDU' },
    { text: "It's like training runners for a race against rocketships.",                                                    src: 'EDU' },
    { text: 'The machines will distill. The humans must discern.',                                                           src: 'EDU' },
    { text: "You're not engineers but gardeners.",                                                                           src: 'EDU' },
    { text: 'Wisdom emerges not from curriculum but from consequence, not from lessons but from life.',                      src: 'EDU' },
    { text: 'Every system we design today becomes the constraint the future must later transcend.',                          src: 'EDU' },
    { text: 'The same unique quality that distinguished us from beasts will distinguish us from machines.',                  src: 'EDU' },
    { text: 'Wisdom is no longer optional.',                                                                                 src: 'EDU' },
    // Beyond Our Nation's Divides
    { text: "Our story has never been one of perfection — it's always been one of redemption.",                              src: 'BOND' },
    { text: "No one is coming to save us. There's only us.",                                                                 src: 'BOND' },
    { text: "Democracy isn't a partisan value. It's a sacred trust.",                                                        src: 'BOND' },
    { text: "We don't have to be perfect. We just have to be willing.",                                                      src: 'BOND' },
    { text: 'Resistance is only the beginning. From resistance comes renewal. And from renewal — rebirth.',                  src: 'BOND' },
    { text: "Wherever you're standing right now — you're not too late. You're right on time.",                               src: 'BOND' },
    // Revaluing the Economy
    { text: 'Money, as it currently exists, is not tied to the real capacity of human civilization to do work.',             src: 'EXERGY' },
    { text: 'What should money actually measure?',                                                                           src: 'EXERGY' },
    { text: 'Prosperity should be tied to sustainable productivity rather than speculative financial expansion.',            src: 'EXERGY' },
    // There's No Turning Back
    { text: "Efficiency isn't the highest good. Balance is.",                                                                src: 'TURN' },
    { text: 'Democracy, with all its messiness, evolved as one of those constraints.',                                       src: 'TURN' },
    { text: "The moment we trade it away for efficiency, we're not entering a bold new future. We're regressing.",           src: 'TURN' },
    // Giving It All Away
    { text: "A forest doesn't 'overspend' its resources.",                                                                   src: 'GIVE' },
    { text: 'We need an entirely new economic paradigm.',                                                                    src: 'GIVE' },
    { text: "The real innovation isn't tearing it down without a plan. It's building something better in its place.",        src: 'GIVE' },
    // The Chaos Catalyst
    { text: 'Disruption can no longer be feared or dismissed.',                                                              src: 'CHAOS' },
    { text: 'A wildfire devastates a forest but clears the way for new growth.',                                             src: 'CHAOS' },
    { text: 'Chaos, Nietzsche argued, is a precondition for the birth of a dancing star.',                                   src: 'CHAOS' },
    // Let It Be
    { text: "There's a quiet transformation that happens when we shift from patience to presence.",                          src: 'LET' },
    { text: 'Patience, for all its virtue, often leans toward the future.',                                                  src: 'LET' },
    { text: 'While patience can often feel passive, presence feels alive.',                                                  src: 'LET' },
    { text: 'This moment, here and now, is enough.',                                                                         src: 'LET' },
    { text: "Presence doesn't resolve these tensions; it honors them.",                                                      src: 'LET' },
    { text: 'It is about being able to hold the broken and the whole at the same time.',                                     src: 'LET' },
    { text: 'While we are waiting for the answer, the answer is already here.',                                              src: 'LET' },
    { text: "Presence isn't the opposite of patience — it's patience, fulfilled.",                                           src: 'LET' },
    // The Free Speech Distraction
    { text: "We're not fighting over the right to speak. We're battling for the privilege of being heard.",                  src: 'SPEECH' },
    { text: 'Everyone has the right to speak, but not an inherent right to unlimited reach or amplification.',               src: 'SPEECH' },
    { text: 'All algorithms have biases built into their weights.',                                                          src: 'SPEECH' },
    { text: "The threat to free expression isn't the inability to speak, but the manipulation of who gets heard.",           src: 'SPEECH' },
  ];

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fadeInMs = 3000;
  const fadeOutMs = 3000;
  const holdMs   = 8000;
  const totalMs  = fadeInMs + holdMs + fadeOutMs;  // 14s

  let queue = [];
  let lastPos = null;
  const reshuffle = () => {
    queue = quotes.slice().sort(() => Math.random() - 0.5);
  };
  const rand = (a, b) => a + Math.random() * (b - a);

  // Random position across the canvas, skipping the tagline strip and avoiding clumping.
  function pickPosition() {
    for (let i = 0; i < 30; i++) {
      const x = rand(3, 70);    // % from left (top-left anchor)
      const y = rand(15, 85);   // % from top
      // Vertical breathing room around the centered tagline.
      if (y > 36 && y < 64) continue;
      // Don't spawn on top of the previous quote.
      if (lastPos && Math.hypot(x - lastPos.x, y - lastPos.y) < 22) continue;
      lastPos = { x, y };
      return { x, y };
    }
    const fallback = { x: 6, y: 78 };
    lastPos = fallback;
    return fallback;
  }

  function showNext() {
    if (queue.length === 0) reshuffle();
    const q = queue.shift();
    const src = SOURCES[q.src];

    const el = document.createElement('a');
    el.className = 'hero-quote';
    el.href = src.url;
    el.target = '_blank';
    el.rel = 'noopener';

    const textEl = document.createElement('span');
    textEl.className = 'hero-quote-text';
    textEl.textContent = q.text;
    el.appendChild(textEl);

    const ctxEl = document.createElement('span');
    ctxEl.className = 'hero-quote-context';
    ctxEl.textContent = '— ' + src.title;
    el.appendChild(ctxEl);

    const pos = pickPosition();
    el.style.left = pos.x + '%';
    el.style.top  = pos.y + '%';

    // Subtle drift over the full lifetime — random direction, ~50-90px.
    let endX = 0, endY = 0;
    if (!reduceMotion) {
      const angle = Math.random() * Math.PI * 2;
      const mag = rand(50, 90);
      const startX = -Math.cos(angle) * mag * 0.35;
      const startY = -Math.sin(angle) * mag * 0.35;
      endX = Math.cos(angle) * mag * 0.65;
      endY = Math.sin(angle) * mag * 0.65;
      el.style.transform = `translate(${startX}px, ${startY}px)`;
    }

    heroQuotes.appendChild(el);

    requestAnimationFrame(() => {
      el.classList.add('visible');
      if (!reduceMotion) {
        el.style.transform = `translate(${endX}px, ${endY}px)`;
      }
    });

    const fadeOut = () => {
      el.classList.remove('visible');
      setTimeout(() => {
        el.remove();
        showNext();
      }, fadeOutMs + 100);
    };
    let fadeTimer = setTimeout(fadeOut, fadeInMs + holdMs);

    el.addEventListener('mouseenter', () => clearTimeout(fadeTimer));
    el.addEventListener('mouseleave', () => {
      fadeTimer = setTimeout(fadeOut, 3500);
    });
  }

  reshuffle();
  showNext();
}
