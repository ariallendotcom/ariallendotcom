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
  const quotes = [
    { text: 'Whether we like it or not, we are building gods.', url: 'https://ariallen.substack.com/p/were-building-gods-whether-we-believe' },
    { text: 'Seeing will no longer be believing.', url: 'https://ariallen.substack.com/p/from-posttruth-to-postreality-trump' },
    { text: "Vision isn't frivolous. It's the way through.", url: 'https://ariallen.substack.com/p/the-future-of-labor-what-if-work' },
    { text: "Not 'prove me wrong,' but 'help me understand.'", url: 'https://ariallen.substack.com/p/prove-me-wrong-americas-addiction' },
    { text: "The question isn't what we want them to do — it's who we want them to be.", url: 'https://ariallen.substack.com/p/were-building-gods-whether-we-believe' },
    { text: 'Authoritarianism advances by altering the code of reality line by line.', url: 'https://ariallen.substack.com/p/the-architecture-of-authoritarianism-the-4-pillars-of-maga-e8dc795b7fef' },
    { text: 'If we want something else, we have to start imagining it first.', url: 'https://ariallen.substack.com/p/from-posttruth-to-postreality-trump' },
    { text: 'The human experiment is a journey — not a destination.', url: 'https://ariallen.substack.com/p/as-the-days-go-by-3bf124d54df1' },
    { text: "Imagining something better isn't naive.", url: 'https://ariallen.substack.com/p/what-if-we-let-ourselves-imagine' },
    { text: 'Write a new story.', url: 'https://ariallen.medium.com/sami-a-eulogy-a-parable-b62396c1031e' },
  ];

  const positions = [
    { top: '110px',  left:  '5%' },
    { top: '130px',  right: '6%' },
    { bottom: '90px', left:  '7%' },
    { bottom: '70px', right: '5%' },
  ];

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let queue = [];
  let posIdx = 0;
  let activeCount = 0;
  const maxActive = 2;

  const reshuffle = () => {
    queue = quotes.slice().sort(() => Math.random() - 0.5);
  };

  function spawnQuote() {
    if (activeCount >= maxActive) return;
    if (queue.length === 0) reshuffle();

    const q = queue.shift();
    const pos = positions[posIdx % positions.length];
    posIdx++;

    const el = document.createElement('a');
    el.className = 'hero-quote';
    el.href = q.url;
    el.target = '_blank';
    el.rel = 'noopener';
    el.textContent = q.text;
    Object.assign(el.style, pos);

    let driftPause = null;
    if (!reduceMotion) {
      const startY = (Math.random() < 0.5 ? -1 : 1) * 14;
      el.style.transform = `translateY(${startY}px)`;
    }

    heroQuotes.appendChild(el);
    activeCount++;

    requestAnimationFrame(() => {
      el.classList.add('visible');
      if (!reduceMotion) {
        el.style.transform = 'translateY(0px)';
      }
    });

    const lifeMs = 9000;
    const fadeOutMs = 1500;

    const startFadeOut = () => {
      el.classList.remove('visible');
      setTimeout(() => {
        el.remove();
        activeCount--;
      }, fadeOutMs + 100);
    };

    let fadeTimer = setTimeout(startFadeOut, lifeMs);

    el.addEventListener('mouseenter', () => {
      clearTimeout(fadeTimer);
    });
    el.addEventListener('mouseleave', () => {
      fadeTimer = setTimeout(startFadeOut, 2500);
    });
  }

  reshuffle();
  spawnQuote();
  setTimeout(spawnQuote, 3500);
  setInterval(spawnQuote, 5000);
}
