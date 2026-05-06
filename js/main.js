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
  const URL_ATTIC   = 'https://ariallen.substack.com/p/there-are-people-in-the-attic';
  const URL_AUTH    = 'https://ariallen.substack.com/p/the-architecture-of-authoritarianism-the-4-pillars-of-maga-e8dc795b7fef';
  const URL_IMAGINE = 'https://ariallen.substack.com/p/what-if-we-let-ourselves-imagine';
  const URL_SAMI    = 'https://ariallen.medium.com/sami-a-eulogy-a-parable-b62396c1031e';
  const URL_DAYS    = 'https://ariallen.substack.com/p/as-the-days-go-by-3bf124d54df1';
  const URL_ALIGN   = 'https://ariallen.substack.com/p/creating-alignment-the-search-for';
  const URL_EDU     = 'https://ariallen.substack.com/p/the-future-of-education';
  const URL_BOND    = 'https://ariallen.substack.com/p/beyond-our-nations-divides-an-invitation';
  const URL_WHERE   = 'https://ariallen.substack.com/p/where-is-everybody';
  const URL_HOME    = 'https://ariallen.substack.com/p/before-homegrown-means-you-ff0693529cc8';
  const URL_ESTR    = 'https://ariallen.medium.com/estrangement-a-strange-kind-of-grief-07df6c0bc3f9';
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
    { text: 'Power without conscience is the real danger we face.',                                                              context: 'Ari on Power',                 url: URL_GODS },
    { text: 'We are inside this process, being asked to rise to it.',                                                            context: 'Ari on This Moment',           url: URL_GODS },

    // From Post-Truth to Post-Reality
    { text: 'Seeing will no longer be believing.',                                                                                context: 'Ari on Deep Fakes',            url: URL_POSTREAL },
    { text: "He'll deny real footage. He'll blame the tools we've built — and then use them against us.",                        context: 'Ari on Disinformation',        url: URL_POSTREAL },
    { text: 'In 2016, we entered the post-truth era. In 2025, we will face something worse: post-reality.',                       context: 'Ari on Post-Reality',          url: URL_POSTREAL },
    { text: 'If we want something else, we have to start imagining it first.',                                                   context: 'Ari on Reality',               url: URL_POSTREAL },

    // The Future of Labor
    { text: "Vision isn't frivolous. It's the way through.",                                                                      context: 'Ari on the Future of Work',    url: URL_LABOR },
    { text: "We can't just resist our way out of authoritarianism. We have to build our way beyond it.",                          context: 'Ari on Building Beyond',       url: URL_LABOR },
    { text: "Right now, we're optimizing human life for economic productivity.",                                                  context: 'Ari on Productivity',          url: URL_LABOR },
    { text: "The house always wins — but we're not the house.",                                                                   context: 'Ari on the Game',              url: URL_LABOR },

    // Prove Me Wrong
    { text: "Not 'prove me wrong,' but 'help me understand.'",                                                                    context: 'Ari on Disagreement',          url: URL_PROVE },
    { text: 'When conversation becomes warfare, opponents become enemies to beat, conquer, eliminate.',                           context: 'Ari on Discourse',             url: URL_PROVE },
    { text: "We're desperate for clarity and connection — to make America make sense again.",                                     context: 'Ari on America',               url: URL_PROVE },
    { text: "Engagement alone isn't enough. We need it reframed constructively — urgently.",                                      context: 'Ari on Engagement',            url: URL_PROVE },

    // There Are People In The Attic
    { text: 'The time for hypotheticals is over.',                                                                                context: 'Ari on Now',                   url: URL_ATTIC },
    { text: "We're no longer speculating about that moment. We're living in it.",                                                 context: 'Ari on the Present',           url: URL_ATTIC },
    { text: 'Not by eliminating all the cameras — but by making us afraid to point them.',                                        context: 'Ari on Surveillance',          url: URL_ATTIC },
    { text: 'Would I hide people in my attic? Yes. When the time comes. But what if the time is already here?',                   context: 'Ari on This Moment',           url: URL_ATTIC },

    // Architecture of Authoritarianism
    { text: 'Authoritarianism advances by altering the code of reality line by line.',                                            context: 'Ari on Authoritarianism',      url: URL_AUTH },
    { text: 'Chaos is part of the strategy.',                                                                                     context: 'Ari on the Strategy',          url: URL_AUTH },
    { text: 'When justice becomes a joke, brutality becomes entertainment.',                                                      context: 'Ari on Cruelty',               url: URL_AUTH },
    { text: 'The primary feeling he cultivates is distrust, which is a damning force.',                                           context: 'Ari on Distrust',              url: URL_AUTH },

    // What If We Let Ourselves Imagine Again
    { text: "Imagining something better isn't naive.",                                                                            context: 'Ari on Imagination',           url: URL_IMAGINE },
    { text: "Warnings don't build. They're necessary — but incomplete.",                                                          context: 'Ari on Warnings',              url: URL_IMAGINE },
    { text: 'The only futures on offer will come from those who profit from collapse.',                                           context: 'Ari on the Future',            url: URL_IMAGINE },
    { text: "It's about — together — becoming more humane.",                                                                      context: 'Ari on Humanity',              url: URL_IMAGINE },

    // Sami: A Eulogy, A Parable
    { text: 'Write a new story.',                                                                                                 context: 'Ari on Grief',                 url: URL_SAMI },
    { text: 'There is no light without dark, no warm without cold.',                                                              context: 'Ari on Duality',               url: URL_SAMI },
    { text: 'Gratitude can be found anywhere, anytime.',                                                                          context: 'Ari on Gratitude',             url: URL_SAMI },

    // And The Days Go By
    { text: 'The human experiment is a journey — not a destination.',                                                             context: 'Ari on the Human Experiment',  url: URL_DAYS },
    { text: 'There is no path forward in looking backward.',                                                                      context: 'Ari on Moving Forward',        url: URL_DAYS },
    { text: 'Truth is contextual to a time and a place.',                                                                         context: 'Ari on Truth',                 url: URL_DAYS },
    { text: 'Every civilization carries the seeds of its own destruction.',                                                       context: 'Ari on Civilizations',         url: URL_DAYS },

    // Creating Alignment
    { text: "Rules can't contain what only understanding can hold.",                                                              context: 'Ari on AI Alignment',          url: URL_ALIGN },
    { text: 'External constraints without internal comprehension is borrowed time.',                                              context: 'Ari on Constraints',           url: URL_ALIGN },
    { text: 'You cannot meet a genuinely different intelligence and remain who you were.',                                        context: 'Ari on Encountering AI',       url: URL_ALIGN },
    { text: "Every attempt to determine what's 'really' conscious reveals more about the questioner than the questioned.",        context: 'Ari on Consciousness',         url: URL_ALIGN },
    { text: "The most consequential capability in the age we're entering isn't engineering. It's imagination.",                   context: 'Ari on the AI Age',            url: URL_ALIGN },
    { text: "We're world-building now.",                                                                                          context: 'Ari on World-Building',        url: URL_ALIGN },
    { text: 'Every specification contains the seed of its own failure.',                                                          context: 'Ari on Specifications',        url: URL_ALIGN },

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
    { text: 'This Presidency is not about disruption. It is about domination. It is about cruelty.',                              context: 'Ari on This Presidency',       url: URL_BOND },

    // Where Is Everybody
    { text: 'We are already living within the early days of tyranny.',                                                            context: 'Ari on Tyranny',               url: URL_WHERE },
    { text: "Tyranny doesn't just thrive in silence. It manufactures it.",                                                        context: 'Ari on Silence',               url: URL_WHERE },
    { text: 'Yes, it may be dangerous to speak. But it is more dangerous to stay silent.',                                        context: 'Ari on Speaking Up',           url: URL_WHERE },
    { text: 'We must remain human — even when it would be easier to look away.',                                                  context: 'Ari on Humanity',              url: URL_WHERE },
    { text: 'The window is still open. But it is narrowing.',                                                                     context: 'Ari on the Moment',            url: URL_WHERE },
    { text: 'Once we become speechless, speech itself withers, like an unused muscle.',                                           context: 'Ari on Speech',                url: URL_WHERE },
    { text: "That's how free speech ends. Not all at once. First through silence born of disbelief and grief.",                   context: 'Ari on Free Speech',           url: URL_WHERE },

    // Before "Homegrown" Means You
    { text: "There will be no theme song to tyranny. This isn't The Handmaid's Tale.",                                            context: 'Ari on Tyranny',               url: URL_HOME },
    { text: 'We are sleepwalking through a constitutional emergency.',                                                            context: 'Ari on the Emergency',         url: URL_HOME },
    { text: 'You will not win these fights if you lose the right to fight them at all.',                                          context: 'Ari on Resistance',            url: URL_HOME },
    { text: 'This is not a slippery slope. This is the moment the slope gives way.',                                              context: 'Ari on Now',                   url: URL_HOME },
    { text: 'Do not be flattened beneath the weight of your own disbelief.',                                                      context: 'Ari on Awakening',             url: URL_HOME },
    { text: "When the last guardrail falls, it won't make a sound.",                                                              context: 'Ari on Guardrails',            url: URL_HOME },
    { text: 'Silence from those who know better is complicity — plain and simple.',                                               context: 'Ari on Complicity',            url: URL_HOME },
    { text: 'This is a car crash in slow motion.',                                                                                context: 'Ari on This Moment',           url: URL_HOME },

    // Estrangement
    { text: 'Not because there was no love, but because there was too much.',                                                     context: 'Ari on Estrangement',          url: URL_ESTR },
    { text: 'Boundaries are survival.',                                                                                           context: 'Ari on Boundaries',            url: URL_ESTR },
    { text: 'The more you loved, the more you got hurt.',                                                                         context: 'Ari on Love',                  url: URL_ESTR },
    { text: "It's a strange kind of grief.",                                                                                      context: 'Ari on Grief',                 url: URL_ESTR },
    { text: "Finally being able to feel the loss I'd already been holding for too long.",                                         context: 'Ari on Loss',                  url: URL_ESTR },
    { text: 'Those closest to them are the same people they go on to hurt the most.',                                             context: 'Ari on Hurt',                  url: URL_ESTR },

    // Revaluing the Economy
    { text: 'Money, as it currently exists, is not tied to the real capacity of human civilization to do work.',                  context: 'Ari on Money',                 url: URL_EXERGY },
    { text: 'What should money actually measure?',                                                                                context: 'Ari on Currency',              url: URL_EXERGY },
    { text: 'Prosperity should be tied to sustainable productivity rather than speculative financial expansion.',                 context: 'Ari on Prosperity',            url: URL_EXERGY },

    // There's No Turning Back
    { text: "Efficiency isn't the highest good. Balance is.",                                                                     context: 'Ari on Balance',               url: URL_TURN },
    { text: "Democracy, with all its messiness, evolved as one of those constraints.",                                            context: 'Ari on Democracy',             url: URL_TURN },
    { text: "The idea that no one should wield unchecked power isn't just political theory; it's survival.",                      context: 'Ari on Power',                 url: URL_TURN },
    { text: "The moment we trade it away for efficiency, we're not entering a bold new future. We're regressing.",                context: 'Ari on Progress',              url: URL_TURN },
    { text: 'A civilization defying the very laws that sustained it — right before it collapses.',                                context: 'Ari on Collapse',              url: URL_TURN },
    { text: 'Auschwitz was efficient. More than anything, America needs to be good.',                                             context: 'Ari on Goodness',              url: URL_TURN },

    // Giving It All Away
    { text: "A forest doesn't 'overspend' its resources.",                                                                        context: 'Ari on Nature',                url: URL_GIVE },
    { text: 'We need an entirely new economic paradigm.',                                                                         context: 'Ari on Economics',             url: URL_GIVE },
    { text: "The real innovation isn't tearing it down without a plan. It's building something better in its place.",             context: 'Ari on Building',              url: URL_GIVE },

    // The Chaos Catalyst
    { text: 'Disruption can no longer be feared or dismissed.',                                                                   context: 'Ari on Disruption',            url: URL_CHAOS },
    { text: 'A wildfire devastates a forest but clears the way for new growth.',                                                  context: 'Ari on Renewal',               url: URL_CHAOS },
    { text: 'Chaos, Nietzsche argued, is a precondition for the birth of a dancing star.',                                        context: 'Ari on Chaos',                 url: URL_CHAOS },
    { text: 'Voters are willing to embrace chaos if the alternative is stagnation.',                                              context: 'Ari on Voters',                url: URL_CHAOS },

    // Let It Be
    { text: "There's a quiet transformation that happens when we shift from patience to presence.",                               context: 'Ari on Presence',              url: URL_LET },
    { text: "Patience, for all its virtue, often leans toward the future.",                                                       context: 'Ari on Patience',              url: URL_LET },
    { text: "While patience can often feel passive, presence feels alive.",                                                       context: 'Ari on Presence',              url: URL_LET },
    { text: 'This moment, here and now, is enough.',                                                                              context: 'Ari on Now',                   url: URL_LET },
    { text: "Presence doesn't resolve these tensions; it honors them.",                                                           context: 'Ari on Tension',               url: URL_LET },
    { text: 'It is about being able to hold the broken and the whole at the same time.',                                          context: 'Ari on Wholeness',             url: URL_LET },
    { text: 'While we are waiting for the answer, the answer is already here.',                                                   context: 'Ari on Patience',              url: URL_LET },
    { text: "Presence isn't the opposite of patience — it's patience, fulfilled.",                                                context: 'Ari on Presence',              url: URL_LET },

    // The Free Speech Distraction
    { text: "We're not fighting over the right to speak. We're battling for the privilege of being heard.",                       context: 'Ari on Speech',                url: URL_SPEECH },
    { text: "Everyone has the right to speak, but not an inherent right to unlimited reach or amplification.",                    context: 'Ari on Reach',                 url: URL_SPEECH },
    { text: 'All algorithms have biases built into their weights.',                                                               context: 'Ari on Algorithms',            url: URL_SPEECH },
    { text: 'They promise absolute freedom but deliver only curated chaos.',                                                      context: 'Ari on Platforms',             url: URL_SPEECH },
    { text: "The threat to free expression isn't the inability to speak, but the manipulation of who gets heard.",                context: 'Ari on Free Speech',           url: URL_SPEECH },
  ];

  // Spawn zones — corners and side-midpoints, all clear of the centered tagline.
  // Each zone has a position range so successive spawns in the same zone vary.
  const zones = [
    { top:    [6, 22],  left:  [2, 20]  },
    { top:    [6, 22],  right: [2, 20]  },
    { top:    [30, 42], left:  [1, 12]  },
    { top:    [30, 42], right: [1, 12]  },
    { bottom: [8, 25],  left:  [2, 22]  },
    { bottom: [8, 25],  right: [2, 22]  },
    { bottom: [30, 42], left:  [1, 12]  },
    { bottom: [30, 42], right: [1, 12]  },
  ];

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const maxActive = 4;
  const lifeMs = 8500;
  const fadeOutMs = 1500;
  const driftMin = 70;
  const driftMax = 130;

  let queue = [];
  let activeCount = 0;
  const activeZones = new Set();

  const reshuffle = () => {
    queue = quotes.slice().sort(() => Math.random() - 0.5);
  };
  const rand = (a, b) => a + Math.random() * (b - a);

  function spawnQuote() {
    if (activeCount >= maxActive) return;
    if (queue.length === 0) reshuffle();

    const freeIdxs = zones.map((_, i) => i).filter(i => !activeZones.has(i));
    if (freeIdxs.length === 0) return;
    const zoneIdx = freeIdxs[Math.floor(Math.random() * freeIdxs.length)];
    const zone = zones[zoneIdx];
    activeZones.add(zoneIdx);

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

    for (const side of ['top', 'right', 'bottom', 'left']) {
      if (zone[side]) el.style[side] = rand(zone[side][0], zone[side][1]) + '%';
    }

    let dx = 0, dy = 0;
    if (!reduceMotion) {
      const angle = Math.random() * Math.PI * 2;
      const mag = rand(driftMin, driftMax);
      dx = Math.cos(angle) * mag;
      dy = Math.sin(angle) * mag;
      el.style.transform = `translate(${-dx / 2}px, ${-dy / 2}px)`;
    }

    heroQuotes.appendChild(el);
    activeCount++;

    requestAnimationFrame(() => {
      el.classList.add('visible');
      if (!reduceMotion) {
        el.style.transform = `translate(${dx / 2}px, ${dy / 2}px)`;
      }
    });

    const cleanup = () => {
      el.remove();
      activeCount--;
      activeZones.delete(zoneIdx);
    };
    const startFadeOut = () => {
      el.classList.remove('visible');
      setTimeout(cleanup, fadeOutMs + 100);
    };
    let fadeTimer = setTimeout(startFadeOut, lifeMs);

    el.addEventListener('mouseenter', () => clearTimeout(fadeTimer));
    el.addEventListener('mouseleave', () => {
      fadeTimer = setTimeout(startFadeOut, 2500);
    });
  }

  reshuffle();
  // Stagger initial spawns so we fill up gracefully, then maintain ~4 on screen.
  spawnQuote();
  setTimeout(spawnQuote, 800);
  setTimeout(spawnQuote, 1800);
  setTimeout(spawnQuote, 3000);
  setInterval(spawnQuote, 2500);
}
