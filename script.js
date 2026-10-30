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

  /* ----- Theme toggle ---------------------------------------------------- */
  const root = document.documentElement;
  const themeButton = $('.theme-toggle');
  const themeMeta = $('meta[name="theme-color"]');
  const lightQuery = window.matchMedia('(prefers-color-scheme: light)');

  const applyTheme = (theme) => {
    root.dataset.theme = theme;
    if (themeMeta) themeMeta.setAttribute('content', theme === 'dark' ? '#0b0f14' : '#f7f9fb');
    if (themeButton) {
      const label = `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`;
      themeButton.setAttribute('aria-label', label);
      themeButton.setAttribute('title', label);
    }
    document.dispatchEvent(new CustomEvent('themechange', { detail: theme }));
  };

  applyTheme(root.dataset.theme === 'light' ? 'light' : 'dark');

  if (themeButton) {
    themeButton.addEventListener('click', () => {
      const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('theme', next); } catch (_) { /* private mode */ }
      applyTheme(next);
    });
  }

  // Follow the OS setting while the visitor has not chosen a theme themselves.
  lightQuery.addEventListener('change', (event) => {
    let saved = null;
    try { saved = localStorage.getItem('theme'); } catch (_) { /* ignore */ }
    if (!saved) applyTheme(event.matches ? 'light' : 'dark');
  });

  /* ----- GitHub: live stats and star counts on the cards ------------------ */
  // The page renders fully without this; it only adds numbers. Unauthenticated
  // calls allow 60 requests an hour per visitor, and the response is cached in
  // sessionStorage so a reload does not spend another one.
  const GH_USER = 'brishabkc24';
  const ghNote = $('#gh-note');
  const number = new Intl.NumberFormat('en');
  const STAR_ICON = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><polygon points="8,1 10.2,5.6 15.2,6.2 11.5,9.7 12.5,14.7 8,12.3 3.5,14.7 4.5,9.7 0.8,6.2 5.8,5.6"/></svg>';
  const FORK_ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="4" cy="3" r="1.6"/><circle cx="12" cy="3" r="1.6"/><circle cx="8" cy="13" r="1.6"/><path d="M4 4.6v1.4a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V4.6M8 8v3.4"/></svg>';

  const setText = (selector, value) => {
    const el = $(selector);
    if (el) el.textContent = value;
  };

  const timeAgo = (iso) => {
    const days = Math.round((Date.now() - new Date(iso).getTime()) / 864e5);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 30) return `${days} days ago`;
    const months = Math.round(days / 30);
    if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
    const years = Math.round(days / 365);
    return `${years} year${years === 1 ? '' : 's'} ago`;
  };

  async function fetchRepos() {
    const key = `gh-repos:${GH_USER}`;
    try {
      const cached = sessionStorage.getItem(key);
      if (cached) return JSON.parse(cached);
    } catch (_) { /* storage unavailable */ }
    const response = await fetch(
      `https://api.github.com/users/${GH_USER}/repos?per_page=100&sort=pushed`,
      { headers: { Accept: 'application/vnd.github+json' } }
    );
    if (!response.ok) throw new Error(`GitHub API ${response.status}`);
    const repos = await response.json();
    try { sessionStorage.setItem(key, JSON.stringify(repos)); } catch (_) { /* ignore */ }
    return repos;
  }

  function renderGitHub(allRepos) {
    const repos = allRepos.filter((repo) => !repo.fork);
    const stars = repos.reduce((sum, repo) => sum + repo.stargazers_count, 0);
    const forks = repos.reduce((sum, repo) => sum + repo.forks_count, 0);
    setText('#stat-repos', number.format(repos.length));
    setText('#stat-stars', number.format(stars));
    setText('#stat-forks', number.format(forks));

    $$('[data-repo]').forEach((el) => {
      const repo = repos.find((r) => r.name.toLowerCase() === el.dataset.repo.toLowerCase());
      if (!repo) return;
      el.innerHTML = `${STAR_ICON}${number.format(repo.stargazers_count)}&nbsp;&nbsp;${FORK_ICON}${number.format(repo.forks_count)}`;
      el.setAttribute('aria-label', `${repo.stargazers_count} stars, ${repo.forks_count} forks`);
    });

    const list = $('#recent-repos');
    if (list) {
      list.textContent = '';
      repos
        .slice()
        .sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at))
        .slice(0, 3)
        .forEach((repo) => {
          const item = document.createElement('li');
          const main = document.createElement('div');
          main.className = 'repos__main';
          const link = document.createElement('a');
          link.href = repo.html_url;
          link.target = '_blank';
          link.rel = 'noopener';
          link.textContent = repo.name;
          const desc = document.createElement('span');
          desc.className = 'repos__desc';
          desc.textContent = repo.description || '';
          main.append(link, desc);
          const time = document.createElement('time');
          time.dateTime = repo.pushed_at;
          time.textContent = `pushed ${timeAgo(repo.pushed_at)}`;
          item.append(main, time);
          list.append(item);
        });
    }
    if (ghNote) ghNote.hidden = true;
  }

  fetchRepos().then(renderGitHub).catch(() => {
    if (ghNote) ghNote.textContent = 'Live stats are unavailable right now. Everything is on my GitHub profile.';
  });
})();
