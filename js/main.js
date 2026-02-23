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
