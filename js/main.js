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
  const URL_GODS    = 'https://ariallen.substack.com/p/were-building-gods-whether-we-believe';
  const URL_POSTREAL = 'https://ariallen.substack.com/p/from-posttruth-to-postreality-trump';
  const URL_LABOR   = 'https://ariallen.substack.com/p/the-future-of-labor-what-if-work';
  const URL_PROVE   = 'https://ariallen.substack.com/p/prove-me-wrong-americas-addiction';
  const URL_IMAGINE = 'https://ariallen.substack.com/p/what-if-we-let-ourselves-imagine';
  const URL_SAMI    = 'https://ariallen.medium.com/sami-a-eulogy-a-parable-b62396c1031e';
  const URL_DAYS    = 'https://ariallen.substack.com/p/as-the-days-go-by-3bf124d54df1';
  const URL_ALIGN   = 'https://ariallen.substack.com/p/creating-alignment-the-search-for';
  const URL_EDU     = 'https://ariallen.substack.com/p/the-future-of-education';
  const URL_BOND    = 'https://ariallen.substack.com/p/beyond-our-nations-divides-an-invitation';
  const URL_EXERGY  = 'https://ariallen.medium.com/revaluing-the-economy-the-case-for-an-exergy-backed-currency-dcc6648a6eaa';
  const URL_TURN    = 'https://ariallen.medium.com/theres-no-turning-back-efficiency-isn-t-the-highest-good-368a06e750b6';
  const URL_GIVE    = 'https://ariallen.medium.com/giving-it-all-away-the-end-of-fiat-currency-debt-based-economics-a8a1488e80c1';
  const URL_CHAOS   = 'https://ariallen.medium.com/hurricane-trump-what-the-establishment-failed-to-see-in-2024-599e3bd7c978';
  const URL_LET     = 'https://ariallen.medium.com/let-it-be-from-patience-to-presence-c374486bbc39';
  const URL_SPEECH  = 'https://ariallen.medium.com/the-free-speech-distraction-the-battle-for-algorithmic-reach-5ea4c6b76a34';

  const quotes = [
    // We're Building Gods
    { text: 'Whether we like it or not, we are building gods.',                                                                  context: 'Ari on Building AI',           url: URL_GODS },
    { text: "The question isn't what we want them to do — it's who we want them to be.",                                         context: "Ari on AI's Soul",             url: URL_GODS },
    { text: 'We are inside this process, being asked to rise to it.',                                                            context: 'Ari on This Moment',           url: URL_GODS },

    // From Post-Truth to Post-Reality
    { text: 'If we want something else, we have to start imagining it first.',                                                   context: 'Ari on Reality',               url: URL_POSTREAL },

    // The Future of Labor
    { text: "Vision isn't frivolous. It's the way through.",                                                                      context: 'Ari on the Future of Work',    url: URL_LABOR },

    // Prove Me Wrong
    { text: "Not 'prove me wrong,' but 'help me understand.'",                                                                    context: 'Ari on Disagreement',          url: URL_PROVE },
    { text: "Engagement alone isn't enough. We need it reframed constructively — urgently.",                                      context: 'Ari on Engagement',            url: URL_PROVE },

    // What If We Let Ourselves Imagine Again
    { text: "Imagining something better isn't naive.",                                                                            context: 'Ari on Imagination',           url: URL_IMAGINE },
    { text: "It's about — together — becoming more humane.",                                                                      context: 'Ari on Humanity',              url: URL_IMAGINE },

    // Sami: A Eulogy, A Parable
    { text: 'Write a new story.',                                                                                                 context: 'Ari on New Stories',           url: URL_SAMI },
    { text: 'There is no light without dark, no warm without cold.',                                                              context: 'Ari on Duality',               url: URL_SAMI },
    { text: 'Gratitude can be found anywhere, anytime.',                                                                          context: 'Ari on Gratitude',             url: URL_SAMI },

    // And The Days Go By
    { text: 'The human experiment is a journey — not a destination.',                                                             context: 'Ari on the Human Experiment',  url: URL_DAYS },
    { text: 'There is no path forward in looking backward.',                                                                      context: 'Ari on Moving Forward',        url: URL_DAYS },
    { text: 'Truth is contextual to a time and a place.',                                                                         context: 'Ari on Truth',                 url: URL_DAYS },

    // Creating Alignment
    { text: "Rules can't contain what only understanding can hold.",                                                              context: 'Ari on AI Alignment',          url: URL_ALIGN },
    { text: 'External constraints without internal comprehension is borrowed time.',                                              context: 'Ari on Constraints',           url: URL_ALIGN },
    { text: 'You cannot meet a genuinely different intelligence and remain who you were.',                                        context: 'Ari on Encountering AI',       url: URL_ALIGN },
    { text: "Every attempt to determine what's 'really' conscious reveals more about the questioner than the questioned.",        context: 'Ari on Consciousness',         url: URL_ALIGN },
    { text: "The most consequential capability in the age we're entering isn't engineering. It's imagination.",                   context: 'Ari on the AI Age',            url: URL_ALIGN },
    { text: "We're world-building now.",                                                                                          context: 'Ari on World-Building',        url: URL_ALIGN },

    // The Future of Education
    { text: 'The age rendering human intelligence obsolete is the very age summoning wisdom into existence.',                     context: 'Ari on Wisdom',                url: URL_EDU },
    { text: 'In an age overflowing with intelligence, intelligence alone is no longer sufficient.',                               context: 'Ari on Intelligence',          url: URL_EDU },
    { text: "It's like training runners for a race against rocketships.",                                                         context: 'Ari on Education',             url: URL_EDU },
    { text: 'The machines will distill. The humans must discern.',                                                                context: 'Ari on Discernment',           url: URL_EDU },
    { text: "You're not engineers but gardeners.",                                                                                context: 'Ari on Teaching',              url: URL_EDU },
    { text: 'Wisdom emerges not from curriculum but from consequence, not from lessons but from life.',                           context: 'Ari on Wisdom',                url: URL_EDU },
    { text: 'Every system we design today becomes the constraint the future must later transcend.',                               context: 'Ari on Systems',               url: URL_EDU },
    { text: 'The same unique quality that distinguished us from beasts will distinguish us from machines.',                       context: 'Ari on Humanity',              url: URL_EDU },
    { text: 'Wisdom is no longer optional.',                                                                                      context: 'Ari on Wisdom',                url: URL_EDU },

    // Beyond Our Nation's Divides
    { text: "Our story has never been one of perfection — it's always been one of redemption.",                                   context: 'Ari on America',               url: URL_BOND },
    { text: "No one is coming to save us. There's only us.",                                                                       context: 'Ari on Us',                    url: URL_BOND },
    { text: "Democracy isn't a partisan value. It's a sacred trust.",                                                              context: 'Ari on Democracy',             url: URL_BOND },
    { text: "We don't have to be perfect. We just have to be willing.",                                                            context: 'Ari on Action',                url: URL_BOND },
    { text: 'Resistance is only the beginning. From resistance comes renewal. And from renewal — rebirth.',                        context: 'Ari on Renewal',               url: URL_BOND },
    { text: "Wherever you're standing right now — you're not too late. You're right on time.",                                    context: 'Ari on Now',                   url: URL_BOND },

    // Revaluing the Economy
    { text: 'Money, as it currently exists, is not tied to the real capacity of human civilization to do work.',                  context: 'Ari on Money',                 url: URL_EXERGY },
    { text: 'What should money actually measure?',                                                                                context: 'Ari on Currency',              url: URL_EXERGY },
    { text: 'Prosperity should be tied to sustainable productivity rather than speculative financial expansion.',                 context: 'Ari on Prosperity',            url: URL_EXERGY },

    // There's No Turning Back
    { text: "Efficiency isn't the highest good. Balance is.",                                                                     context: 'Ari on Balance',               url: URL_TURN },
    { text: 'Democracy, with all its messiness, evolved as one of those constraints.',                                            context: 'Ari on Democracy',             url: URL_TURN },
    { text: "The moment we trade it away for efficiency, we're not entering a bold new future. We're regressing.",                context: 'Ari on Progress',              url: URL_TURN },

    // Giving It All Away
    { text: "A forest doesn't 'overspend' its resources.",                                                                        context: 'Ari on Nature',                url: URL_GIVE },
    { text: 'We need an entirely new economic paradigm.',                                                                         context: 'Ari on Economics',             url: URL_GIVE },
    { text: "The real innovation isn't tearing it down without a plan. It's building something better in its place.",             context: 'Ari on Building',              url: URL_GIVE },

    // The Chaos Catalyst
    { text: 'Disruption can no longer be feared or dismissed.',                                                                   context: 'Ari on Disruption',            url: URL_CHAOS },
    { text: 'A wildfire devastates a forest but clears the way for new growth.',                                                  context: 'Ari on Renewal',               url: URL_CHAOS },
    { text: 'Chaos, Nietzsche argued, is a precondition for the birth of a dancing star.',                                        context: 'Ari on Chaos',                 url: URL_CHAOS },

    // Let It Be
    { text: "There's a quiet transformation that happens when we shift from patience to presence.",                               context: 'Ari on Presence',              url: URL_LET },
    { text: "Patience, for all its virtue, often leans toward the future.",                                                       context: 'Ari on Patience',              url: URL_LET },
    { text: 'While patience can often feel passive, presence feels alive.',                                                       context: 'Ari on Presence',              url: URL_LET },
    { text: 'This moment, here and now, is enough.',                                                                              context: 'Ari on Now',                   url: URL_LET },
    { text: "Presence doesn't resolve these tensions; it honors them.",                                                           context: 'Ari on Tension',               url: URL_LET },
    { text: 'It is about being able to hold the broken and the whole at the same time.',                                          context: 'Ari on Wholeness',             url: URL_LET },
    { text: 'While we are waiting for the answer, the answer is already here.',                                                   context: 'Ari on Patience',              url: URL_LET },
    { text: "Presence isn't the opposite of patience — it's patience, fulfilled.",                                                context: 'Ari on Presence',              url: URL_LET },

    // The Free Speech Distraction
    { text: "We're not fighting over the right to speak. We're battling for the privilege of being heard.",                       context: 'Ari on Speech',                url: URL_SPEECH },
    { text: 'Everyone has the right to speak, but not an inherent right to unlimited reach or amplification.',                    context: 'Ari on Reach',                 url: URL_SPEECH },
    { text: 'All algorithms have biases built into their weights.',                                                               context: 'Ari on Algorithms',            url: URL_SPEECH },
    { text: "The threat to free expression isn't the inability to speak, but the manipulation of who gets heard.",                context: 'Ari on Free Speech',           url: URL_SPEECH },
  ];

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fadeInMs = 3000;
  const fadeOutMs = 3000;
  const holdMs   = 8000;
  const totalMs  = fadeInMs + holdMs + fadeOutMs;  // 14s

  let queue = [];
  const reshuffle = () => {
    queue = quotes.slice().sort(() => Math.random() - 0.5);
  };
  const rand = (a, b) => a + Math.random() * (b - a);

  function showNext() {
    if (queue.length === 0) reshuffle();
    const q = queue.shift();

    const el = document.createElement('a');
    el.className = 'hero-quote';
    el.href = q.url;
    el.target = '_blank';
    el.rel = 'noopener';

    const textEl = document.createElement('span');
    textEl.className = 'hero-quote-text';
    textEl.textContent = q.text;
    el.appendChild(textEl);

    if (q.context) {
      const ctxEl = document.createElement('span');
      ctxEl.className = 'hero-quote-context';
      ctxEl.textContent = '— ' + q.context;
      el.appendChild(ctxEl);
    }

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
