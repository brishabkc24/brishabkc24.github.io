/* Brishab KC — portfolio script.
   Plain browser JavaScript, no build step. Each block is independent:
   nav, theme, scroll reveals, GitHub stats, hero canvas. */
(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  /* ----- Nav: hamburger + active-section highlight ----------------------- */
  const header = $('.site-header');
  const navToggle = $('.nav__toggle');
  const navLinks = $('#nav-links');

  if (header && navToggle && navLinks) {
    const setOpen = (open) => {
      navLinks.classList.toggle('is-open', open);
      navToggle.setAttribute('aria-expanded', String(open));
      navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };
    navToggle.addEventListener('click', () => setOpen(!navLinks.classList.contains('is-open')));
    navLinks.addEventListener('click', (event) => {
      if (event.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && navLinks.classList.contains('is-open')) {
        setOpen(false);
        navToggle.focus();
      }
    });
    document.addEventListener('click', (event) => {
      if (!header.contains(event.target)) setOpen(false);
    });
  }

  const navAnchors = $$('.nav__links a[href^="#"]');
  const navSections = navAnchors.map((a) => $(a.getAttribute('href'))).filter(Boolean);
  if ('IntersectionObserver' in window && navSections.length) {
    const visible = new Set();
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) visible.add(entry.target);
        else visible.delete(entry.target);
      });
      const current = navSections.find((section) => visible.has(section));
      navAnchors.forEach((a) => {
        const active = Boolean(current) && a.getAttribute('href') === `#${current.id}`;
        a.classList.toggle('is-active', active);
        if (active) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      });
    }, { rootMargin: '-35% 0px -60% 0px' });
    navSections.forEach((section) => observer.observe(section));
  }
})();
