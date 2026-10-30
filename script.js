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

  /* ----- Scroll reveals -------------------------------------------------- */
  // A subtle fade-up the first time a block scrolls into view. Skipped
  // entirely when the visitor prefers reduced motion.
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const revealTargets = $$('.reveal');

  if (reduceMotion.matches || !('IntersectionObserver' in window)) {
    revealTargets.forEach((el) => el.classList.add('is-visible'));
  } else {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -6% 0px' });
    revealTargets.forEach((el) => revealObserver.observe(el));
  }

  /* ----- Hero: a BFS flood that ripples out from the cursor --------------- */
  // The background is a coarse grid with a few scattered walls. Moving the
  // pointer starts a breadth-first search from the cell under it; every few
  // milliseconds each search grows by one ring, and lit cells fade. When the
  // pointer is idle (or on touch screens) a search starts from a random cell
  // now and then. With reduced motion, one finished search is drawn once.
  const hero = $('.hero');
  const heroCanvas = $('.hero__canvas');

  if (hero && heroCanvas && heroCanvas.getContext) {
    const ctx = heroCanvas.getContext('2d');
    const CELL = 22;          // CSS pixels per cell
    const WALL_CHANCE = 0.14; // fraction of cells that are walls
    const RING_MS = 60;       // one BFS ring per wave every 60 ms
    const MAX_RINGS = 22;     // how far a wave travels
    const MAX_WAVES = 6;
    const FADE = 0.965;       // per-frame decay of a lit cell

    let cols = 0;
    let rows = 0;
    let dpr = 1;
    let walls = new Uint8Array(0);
    let glow = new Float32Array(0);
    let waves = [];
    let accent = [45, 212, 191];
    let wallRgb = [230, 237, 243];
    let running = false;
    let onScreen = true;
    let raf = 0;
    let lastRing = 0;
    let lastPointer = 0;
    let lastStart = 0;
    let lastAuto = 0;
    let lastCell = -1;

    const readColours = () => {
      const value = getComputedStyle(root).getPropertyValue('--accent').trim();
      const match = /^#([0-9a-f]{6})$/i.exec(value);
      if (match) accent = [0, 2, 4].map((i) => parseInt(match[1].slice(i, i + 2), 16));
      wallRgb = root.dataset.theme === 'light' ? [22, 32, 43] : [230, 237, 243];
    };

    const startWave = (cell) => {
      if (cell < 0 || cell >= walls.length || walls[cell]) return;
      if (waves.length >= MAX_WAVES) waves.shift();
      const seen = new Uint8Array(cols * rows);
      seen[cell] = 1;
      glow[cell] = 1;
      waves.push({ frontier: [cell], seen, rings: 0 });
    };

    const expand = (wave) => {
      const next = [];
      for (const cell of wave.frontier) {
        const r = (cell / cols) | 0;
        const c = cell % cols;
        const around = [];
        if (r > 0) around.push(cell - cols);
        if (c < cols - 1) around.push(cell + 1);
        if (r < rows - 1) around.push(cell + cols);
        if (c > 0) around.push(cell - 1);
        for (const nb of around) {
          if (wave.seen[nb] || walls[nb]) continue;
          wave.seen[nb] = 1;
          glow[nb] = 1;
          next.push(nb);
        }
      }
      wave.frontier = next;
      wave.rings += 1;
    };

    const draw = () => {
      const width = heroCanvas.width / dpr;
      const height = heroCanvas.height / dpr;
      ctx.clearRect(0, 0, width, height);
      const [wr, wg, wb] = wallRgb;
      const [ar, ag, ab] = accent;
      ctx.fillStyle = `rgba(${wr},${wg},${wb},0.06)`;
      for (let i = 0; i < walls.length; i++) {
        if (!walls[i]) continue;
        ctx.fillRect((i % cols) * CELL + 3, ((i / cols) | 0) * CELL + 3, CELL - 6, CELL - 6);
      }
      for (let i = 0; i < glow.length; i++) {
        if (glow[i] < 0.02 || walls[i]) continue;
        ctx.fillStyle = `rgba(${ar},${ag},${ab},${(glow[i] * 0.55).toFixed(3)})`;
        ctx.fillRect((i % cols) * CELL + 2, ((i / cols) | 0) * CELL + 2, CELL - 4, CELL - 4);
      }
    };

    const drawStatic = () => {
      // One finished search from the centre, brightness falling with distance.
      glow.fill(0);
      const centre = ((rows / 2) | 0) * cols + ((cols / 2) | 0);
      const wave = { frontier: [centre], seen: new Uint8Array(cols * rows), rings: 0 };
      wave.seen[centre] = 1;
      glow[centre] = 1;
      while (wave.frontier.length && wave.rings < MAX_RINGS) {
        expand(wave);
        const level = 1 - wave.rings / MAX_RINGS;
        for (const cell of wave.frontier) glow[cell] = level;
      }
      draw();
    };

    const frame = (now) => {
      if (!running) return;
      if (now - lastRing >= RING_MS) {
        lastRing = now;
        waves = waves.filter((wave) => wave.frontier.length && wave.rings < MAX_RINGS);
        waves.forEach(expand);
      }
      for (let i = 0; i < glow.length; i++) if (glow[i] > 0) glow[i] *= FADE;
      if (now - lastPointer > 2500 && now - lastAuto > 1600) {
        lastAuto = now;
        startWave((Math.random() * glow.length) | 0);
      }
      draw();
      raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (running || reduceMotion.matches || !onScreen || document.hidden) return;
      running = true;
      lastRing = performance.now();
      raf = requestAnimationFrame(frame);
    };

    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    const resize = () => {
      const rect = hero.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cols = Math.max(1, Math.ceil(rect.width / CELL));
      rows = Math.max(1, Math.ceil(rect.height / CELL));
      heroCanvas.width = Math.round(rect.width * dpr);
      heroCanvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      walls = new Uint8Array(cols * rows);
      for (let i = 0; i < walls.length; i++) walls[i] = Math.random() < WALL_CHANCE ? 1 : 0;
      glow = new Float32Array(cols * rows);
      waves = [];
      if (reduceMotion.matches) drawStatic();
      else draw();
    };

    hero.addEventListener('pointermove', (event) => {
      const rect = hero.getBoundingClientRect();
      const col = ((event.clientX - rect.left) / CELL) | 0;
      const row = ((event.clientY - rect.top) / CELL) | 0;
      const cell = row * cols + col;
      const now = performance.now();
      lastPointer = now;
      if (cell !== lastCell && now - lastStart > 70) {
        lastCell = cell;
        lastStart = now;
        startWave(cell);
      }
    });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          onScreen = entry.isIntersecting;
          if (onScreen) start();
          else stop();
        });
      }, { threshold: 0.05 }).observe(hero);
    } else {
      start();
    }

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stop();
      else start();
    });

    document.addEventListener('themechange', () => {
      readColours();
      if (reduceMotion.matches) drawStatic();
      else draw();
    });

    reduceMotion.addEventListener('change', () => {
      stop();
      resize();
      start();
    });

    let resizeTimer = 0;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 120);
    });

    readColours();
    resize();
  }
})();
