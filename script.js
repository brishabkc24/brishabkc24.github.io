/* Brishab KC — portfolio script.
   Plain browser JavaScript, no build step. Each block is independent:
   nav, theme, GitHub stats and the commit chart, hero canvas. */
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
  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

  const applyTheme = (theme) => {
    root.dataset.theme = theme;
    if (themeMeta) themeMeta.setAttribute('content', theme === 'dark' ? '#060403' : '#f7f1e5');
    if (themeButton) {
      const label = `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`;
      themeButton.setAttribute('aria-label', label);
      themeButton.setAttribute('title', label);
    }
    document.dispatchEvent(new CustomEvent('themechange', { detail: theme }));
  };

  applyTheme(root.dataset.theme === 'dark' ? 'dark' : 'light');

  if (themeButton) {
    themeButton.addEventListener('click', () => {
      const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('theme', next); } catch (_) { /* private mode */ }
      applyTheme(next);
    });
  }

  // Follow the OS setting while the visitor has not chosen a theme themselves.
  darkQuery.addEventListener('change', (event) => {
    let saved = null;
    try { saved = localStorage.getItem('theme'); } catch (_) { /* ignore */ }
    if (!saved) applyTheme(event.matches ? 'dark' : 'light');
  });

  /* ----- GitHub: live stats, star counts, and the commit chart ------------ */
  // The page renders fully without this; it only adds numbers. Unauthenticated
  // calls allow 60 requests an hour per visitor; a page load spends at most a
  // handful, and the responses are cached in sessionStorage so a reload does
  // not spend them again.
  const GH_USER = 'brishabkc24';
  const GH_HEADERS = { Accept: 'application/vnd.github+json' };
  const ghNote = $('#gh-note');
  const number = new Intl.NumberFormat('en');
  const STAR_ICON = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><polygon points="8,1 10.2,5.6 15.2,6.2 11.5,9.7 12.5,14.7 8,12.3 3.5,14.7 4.5,9.7 0.8,6.2 5.8,5.6"/></svg>';
  const FORK_ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="4" cy="3" r="1.6"/><circle cx="12" cy="3" r="1.6"/><circle cx="8" cy="13" r="1.6"/><path d="M4 4.6v1.4a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V4.6M8 8v3.4"/></svg>';

  const setText = (selector, value) => {
    const el = $(selector);
    if (el) el.textContent = value;
  };

  // Answers are kept for an hour, so reloading the page does not spend the
  // network's unsigned allowance (60 requests an hour) again.
  const CACHE_MS = 60 * 60 * 1000;
  const cacheGet = (key) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const entry = JSON.parse(raw);
      return entry && Date.now() - entry.at < CACHE_MS ? entry.value : null;
    } catch (_) {
      return null;
    }
  };
  const cacheSet = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), value })); } catch (_) { /* ignore */ }
  };
  let quotaLeft = Infinity; // GitHub says how many unsigned requests this network has left
  const noteQuota = (response) => {
    const left = Number(response.headers.get('x-ratelimit-remaining'));
    if (Number.isFinite(left)) quotaLeft = left;
  };
  const limited = (response) => response.status === 403 || response.status === 429;

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
    const cached = cacheGet(key);
    if (cached) return cached;
    const response = await fetch(
      `https://api.github.com/users/${GH_USER}/repos?per_page=100&sort=pushed`,
      { headers: GH_HEADERS }
    );
    noteQuota(response);
    if (!response.ok) throw new Error(limited(response) ? 'rate-limited' : `GitHub API ${response.status}`);
    const repos = await response.json();
    cacheSet(key, repos);
    return repos;
  }

  // Commits the owner authored in each public repo over the last year, by day.
  async function fetchCommitDays(repos, sinceIso) {
    const key = `gh-commits:${GH_USER}:${sinceIso.slice(0, 10)}`;
    const cached = cacheGet(key);
    if (cached) return cached;
    const counts = {};
    // The chart needs one request per repo (more for a busy one); skip it
    // rather than spend the network's last few requests on it.
    if (quotaLeft < repos.length + 5) throw new Error('rate-limited');
    for (const repo of repos) {
      for (let page = 1; page <= 5; page++) {
        const url = `https://api.github.com/repos/${repo.full_name}/commits?author=${GH_USER}&since=${sinceIso}&per_page=100&page=${page}`;
        const response = await fetch(url, { headers: GH_HEADERS });
        noteQuota(response);
        if (limited(response)) throw new Error('rate-limited');
        if (!response.ok) break; // 409 for an empty repo
        const list = await response.json();
        for (const item of list) {
          const day = ((item.commit && item.commit.author && item.commit.author.date) || '').slice(0, 10);
          if (day) counts[day] = (counts[day] || 0) + 1;
        }
        if (list.length < 100) break;
      }
    }
    cacheSet(key, counts);
    return counts;
  }

  // A year of days as a 53-column grid of weeks, in the theme's own colours.
  function renderCommitChart(counts) {
    const figure = $('.gh-chart');
    const svg = $('#commit-chart');
    if (!figure || !svg) return;
    const NS = 'http://www.w3.org/2000/svg';
    const CELL = 11;
    const STEP = 14;
    const LEFT = 30;
    const TOP = 18;
    const WEEKS = 53;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setUTCDate(start.getUTCDate() - (WEEKS * 7 - 1) - today.getUTCDay());
    const dayKey = (date) => date.toISOString().slice(0, 10);
    const levelOf = (n) => (n === 0 ? 0 : n <= 2 ? 1 : n <= 5 ? 2 : n <= 9 ? 3 : 4);
    const fills = [
      'var(--color-paper-3)',
      'color-mix(in oklab, var(--color-accent) 35%, var(--color-paper-3))',
      'color-mix(in oklab, var(--color-accent) 60%, var(--color-paper-3))',
      'color-mix(in oklab, var(--color-accent) 85%, var(--color-paper-3))',
      'var(--color-accent)',
    ];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const el = (name, attrs, text) => {
      const node = document.createElementNS(NS, name);
      Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
      if (text !== undefined) node.textContent = text;
      return node;
    };

    svg.textContent = '';
    svg.setAttribute('viewBox', `0 0 ${LEFT + WEEKS * STEP} ${TOP + 7 * STEP}`);
    const labels = el('g', { class: 'chart__labels' });
    const cells = el('g', {});
    [['Mon', 1], ['Wed', 3], ['Fri', 5]].forEach(([name, row]) => {
      labels.append(el('text', { x: 0, y: TOP + row * STEP + CELL - 2 }, name));
    });
    let total = 0;
    let lastMonth = -1;
    const date = new Date(start);
    for (let week = 0; week < WEEKS; week++) {
      for (let day = 0; day < 7; day++) {
        if (date > today) break;
        const key = dayKey(date);
        const n = counts[key] || 0;
        total += n;
        if (day === 0 && date.getUTCMonth() !== lastMonth) {
          lastMonth = date.getUTCMonth();
          if (week > 0 && week < WEEKS - 2) labels.append(el('text', { x: LEFT + week * STEP, y: TOP - 6 }, months[lastMonth]));
        }
        const rect = el('rect', {
          x: LEFT + week * STEP,
          y: TOP + day * STEP,
          width: CELL,
          height: CELL,
          style: `fill: ${fills[levelOf(n)]}`,
        });
        rect.append(el('title', {}, `${key}: ${n} commit${n === 1 ? '' : 's'}`));
        cells.append(rect);
        date.setUTCDate(date.getUTCDate() + 1);
      }
    }
    svg.append(labels, cells);
    svg.setAttribute('aria-label', `${number.format(total)} commits over the last year, shown day by day`);
    setText('[data-chart-caption]', `${number.format(total)} commit${total === 1 ? '' : 's'} to my public repos in the last year, counted from the GitHub API.`);
    figure.hidden = false;
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

    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 372);
    since.setUTCHours(0, 0, 0, 0);
    fetchCommitDays(repos, since.toISOString()).then(renderCommitChart).catch(() => { /* the chart stays hidden */ });
  }

  // Without the numbers the tiles would stand empty, so they go, and the note
  // says why and where the numbers are.
  const hideGitHub = (reason) => {
    ['.stats', '.repos__title', '#recent-repos', '.gh-chart'].forEach((selector) => {
      const el = $(selector);
      if (el) el.hidden = true;
    });
    if (!ghNote) return;
    ghNote.hidden = false;
    ghNote.textContent = '';
    const link = document.createElement('a');
    link.href = `https://github.com/${GH_USER}`;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'my GitHub profile';
    const text = reason === 'rate-limited'
      ? 'GitHub allows this network 60 unsigned requests an hour and they are used up, so the live numbers are resting; they are back within the hour. Meanwhile everything is on '
      : 'The live numbers could not be loaded right now. Everything is on ';
    ghNote.append(text, link, '.');
  };

  fetchRepos().then(renderGitHub).catch((error) => hideGitHub(error && error.message));

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ----- Hero: a breadth-first search that answers the cursor -------------- */
  // The canvas is a coarse grid with scattered walls. Every search has a goal:
  // the flood spreads ring by ring (each ring easing in on the clock), and
  // when it reaches the goal the shortest path is traced back in the page's
  // one blue, cell by cell. At rest the canvas shows the last finished search
  // (to begin with, one from the centre). Moving the pointer starts a search
  // from the cell under it towards a fresh goal; a tap adds another. The
  // caption under the canvas says what the search is doing. With reduced
  // motion only the resting picture is drawn.
  const hero = $('.hero');
  const heroCanvas = $('.hero__canvas');
  const heroCaption = $('[data-hero-caption]');

  if (hero && heroCanvas && heroCanvas.getContext) {
    const ctx = heroCanvas.getContext('2d');
    const CELL = 22;          // CSS pixels per cell
    const WALL_CHANCE = 0.16; // fraction of cells that are walls
    const RING_MS = 85;       // a ring eases in over this long, then the next starts
    const PATH_MS = 22;       // the found path is traced at one cell per 22 ms
    const TAU = 650;          // the fade: a lit cell loses 63% of its glow every 650 ms
    const MAX_RINGS = 30;     // how far a search travels before giving up
    const MAX_EXTRA = 2;      // searches started by taps, on top of the one that follows the pointer
    const SETTLED_MS = RING_MS + TAU * 5;

    let cols = 0;
    let rows = 0;
    let dpr = 1;
    let walls = new Uint8Array(0);
    let rest = new Float32Array(0); // the resting picture every cell settles back to
    let litAt = new Float64Array(0); // when each cell was last lit, or -Infinity
    let restResult = null; // the search from the centre: its goal and path
    let lastResult = null; // the last finished live search, shown at rest
    let waves = [];
    let pointerWave = null;
    let ink = 'currentColor';
    let accent = 'currentColor';
    let running = false;
    let onScreen = true;
    let raf = 0;
    let lastLit = -Infinity;
    let lastCell = -1;
    let lastStart = -Infinity;
    let captionAt = 0;
    let resizeTimer = 0;

    const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
    const rowOf = (cell) => (cell / cols) | 0;
    const colOf = (cell) => cell % cols;

    const readColours = () => {
      const style = getComputedStyle(root);
      ink = style.getPropertyValue('--color-ink').trim() || ink;
      accent = style.getPropertyValue('--color-accent').trim() || accent;
    };

    const neighbours = (cell, out) => {
      const r = rowOf(cell);
      const c = colOf(cell);
      out.length = 0;
      if (r > 0) out.push(cell - cols);
      if (c < cols - 1) out.push(cell + 1);
      if (r < rows - 1) out.push(cell + cols);
      if (c > 0) out.push(cell - 1);
      return out;
    };

    // A goal for a search from `start`: an open cell a good walk away, so the
    // flood has room to show its rings before the path appears.
    const pickGoal = (start) => {
      const sr = rowOf(start);
      const sc = colOf(start);
      const span = Math.max(6, Math.min(16, Math.floor(Math.max(cols, rows) * 0.45)));
      for (let tries = 0; tries < 60; tries++) {
        const r = Math.max(0, Math.min(rows - 1, sr + Math.round((Math.random() * 2 - 1) * span)));
        const c = Math.max(0, Math.min(cols - 1, sc + Math.round((Math.random() * 2 - 1) * span)));
        const cell = r * cols + c;
        const distance = Math.abs(r - sr) + Math.abs(c - sc);
        if (distance >= Math.min(8, span) && distance <= span + 4 && !walls[cell] && cell !== start) return cell;
      }
      for (let cell = 0; cell < walls.length; cell++) if (!walls[cell] && cell !== start) return cell;
      return start;
    };

    const makeWave = (start, now) => {
      const wave = {
        start,
        goal: pickGoal(start),
        frontier: [start],
        seen: new Uint8Array(cols * rows),
        parent: new Int32Array(cols * rows).fill(-1),
        rings: 0,
        count: 1,
        next: now + RING_MS,
        path: null,
        pathAt: 0,
        done: false,
      };
      wave.seen[start] = 1;
      return wave;
    };

    // One ring further: every unseen open cell next to the frontier lights up.
    // Reaching the goal ends the search and traces the path back.
    const expand = (wave, now) => {
      const next = [];
      const around = [];
      for (const cell of wave.frontier) {
        for (const nb of neighbours(cell, around)) {
          if (wave.seen[nb] || walls[nb]) continue;
          wave.seen[nb] = 1;
          wave.parent[nb] = cell;
          next.push(nb);
          if (now !== undefined) {
            litAt[nb] = now;
            lastLit = now;
          }
          if (nb === wave.goal && !wave.path) {
            const path = [];
            for (let at = nb; at !== -1; at = wave.parent[at]) path.push(at);
            wave.path = path.reverse();
            wave.pathAt = now === undefined ? 0 : now;
          }
        }
      }
      wave.frontier = wave.path ? [] : next;
      wave.rings += 1;
      wave.count += next.length;
      wave.next += RING_MS;
      if (wave.path || !wave.frontier.length || wave.rings >= MAX_RINGS) wave.done = true;
    };

    // The resting picture: a finished search from the centre, spread across the
    // whole canvas, each ring fainter than the last, with its goal and path.
    const settle = () => {
      rest = new Float32Array(cols * rows);
      const centre = ((rows / 2) | 0) * cols + ((cols / 2) | 0);
      walls[centre] = 0;
      const reach = Math.min(MAX_RINGS, Math.max(cols, rows));
      const wave = makeWave(centre, 0);
      walls[wave.goal] = 0;
      rest[centre] = 1;
      while (!wave.done && wave.rings < reach) {
        expand(wave);
        const level = Math.pow(1 - wave.rings / reach, 1.4) * 0.85;
        for (let cell = 0; cell < rest.length; cell++) {
          if (wave.seen[cell] && rest[cell] === 0 && cell !== centre) rest[cell] = level;
        }
      }
      restResult = { path: wave.path, goal: wave.goal, count: wave.count, rings: wave.rings, pathAt: 0 };
      lastResult = null;
    };

    const cellRect = (i) => [colOf(i) * CELL + 2, rowOf(i) * CELL + 2, CELL - 4, CELL - 4];

    const drawPath = (result, now) => {
      if (!result || !result.path) return;
      const shown = result.pathAt ? Math.min(result.path.length, Math.floor((now - result.pathAt) / PATH_MS) + 1) : result.path.length;
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.95;
      for (let k = 0; k < shown; k++) ctx.fillRect(...cellRect(result.path[k]));
      ctx.globalAlpha = 1;
    };

    const drawGoal = (goal) => {
      const [x, y, w, h] = cellRect(goal);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.95;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
      ctx.globalAlpha = 1;
    };

    const draw = (now) => {
      const width = heroCanvas.width / dpr;
      const height = heroCanvas.height / dpr;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = ink;
      ctx.globalAlpha = 0.1;
      for (let i = 0; i < walls.length; i++) {
        if (!walls[i]) continue;
        ctx.fillRect(colOf(i) * CELL + 3, rowOf(i) * CELL + 3, CELL - 6, CELL - 6);
      }
      const blue = [];
      for (let i = 0; i < rest.length; i++) {
        if (walls[i]) continue;
        const age = now - litAt[i];
        let level = rest[i];
        if (age < RING_MS) {
          blue.push(i, ease(age / RING_MS));
          continue;
        }
        if (Number.isFinite(age)) level = rest[i] + (1 - rest[i]) * Math.exp(-(age - RING_MS) / TAU);
        if (level < 0.02) continue;
        ctx.globalAlpha = level * 0.5;
        ctx.fillRect(...cellRect(i));
      }
      ctx.fillStyle = accent;
      for (let k = 0; k < blue.length; k += 2) {
        ctx.globalAlpha = 0.9 * blue[k + 1];
        ctx.fillRect(...cellRect(blue[k]));
      }
      ctx.globalAlpha = 1;
      // The result on show: live searches first, else the last finished one,
      // else the one from the centre.
      const live = waves.filter((wave) => wave.path || !wave.done);
      if (live.length) {
        for (const wave of live) {
          drawGoal(wave.goal);
          drawPath(wave, now);
        }
      } else {
        const shown = lastResult || restResult;
        if (shown) {
          drawGoal(shown.goal);
          drawPath(shown, now);
        }
      }
    };

    const caption = (text) => {
      if (heroCaption && heroCaption.textContent !== text) heroCaption.textContent = text;
    };

    const describe = (result, origin) => {
      if (!result) return '';
      if (result.path) return `Breadth-first search from ${origin}: the goal is ${plural(result.path.length - 1, 'step')} away, found after ${plural(result.count, 'cell')} in ${plural(result.rings, 'ring')}.`;
      return `Breadth-first search from ${origin}: no path, the walls close the goal off after ${plural(result.count, 'cell')}.`;
    };

    const restCaption = () => caption(`${describe(lastResult || restResult, lastResult ? 'your pointer' : 'the centre')} Move your pointer or tap to search from there.`);

    const frame = (now) => {
      if (!running) return;
      for (const wave of waves) {
        while (!wave.done && now >= wave.next) expand(wave, now);
      }
      // A finished search stays while its path is still being traced.
      waves = waves.filter((wave) => !wave.done || (wave.path && now - wave.pathAt < wave.path.length * PATH_MS + 400));
      for (const wave of waves) if (wave.done && wave.path) lastResult = wave;
      if (pointerWave && !waves.includes(pointerWave)) pointerWave = null;
      draw(now);
      if (now - captionAt > 120) {
        captionAt = now;
        const live = pointerWave || waves[waves.length - 1];
        if (live && !live.done) caption(`Breadth-first search from your pointer: ${plural(live.count, 'cell')} in ${plural(live.rings, 'ring')}, looking for the goal.`);
        else if (live) caption(describe(live, 'your pointer'));
      }
      if (!waves.length && now - lastLit > SETTLED_MS) {
        running = false; // everything has settled: rest until the next pointer move
        restCaption();
        return;
      }
      raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (running || reduceMotion.matches || !onScreen || document.hidden) return;
      running = true;
      raf = requestAnimationFrame(frame);
    };

    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    const startWave = (cell, extra) => {
      if (cell < 0 || cell >= walls.length || walls[cell] || reduceMotion.matches) return;
      const now = performance.now();
      const wave = makeWave(cell, now);
      litAt[cell] = now;
      lastLit = now;
      if (extra) {
        const extras = waves.filter((w) => w !== pointerWave);
        if (extras.length >= MAX_EXTRA) waves.splice(waves.indexOf(extras[0]), 1);
      } else {
        if (pointerWave) {
          if (pointerWave.path) lastResult = pointerWave;
          waves.splice(waves.indexOf(pointerWave), 1);
        }
        pointerWave = wave;
      }
      waves.push(wave);
      start();
    };

    const resize = () => {
      const rect = heroCanvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cols = Math.max(3, Math.ceil(rect.width / CELL));
      rows = Math.max(3, Math.ceil(rect.height / CELL));
      heroCanvas.width = Math.round(rect.width * dpr);
      heroCanvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      walls = new Uint8Array(cols * rows);
      for (let i = 0; i < walls.length; i++) walls[i] = Math.random() < WALL_CHANCE ? 1 : 0;
      litAt = new Float64Array(cols * rows).fill(-Infinity);
      waves = [];
      pointerWave = null;
      settle();
      draw(performance.now());
      restCaption();
    };

    const cellAt = (event) => {
      const rect = heroCanvas.getBoundingClientRect();
      const col = ((event.clientX - rect.left) / CELL) | 0;
      const row = ((event.clientY - rect.top) / CELL) | 0;
      if (col < 0 || row < 0 || col >= cols || row >= rows) return -1;
      return row * cols + col;
    };

    hero.addEventListener('pointermove', (event) => {
      const cell = cellAt(event);
      if (cell < 0) return;
      const now = performance.now();
      // A new search only when the pointer has really moved on, so a search
      // has time to reach its goal.
      const far = !pointerWave || Math.abs(rowOf(cell) - rowOf(pointerWave.start)) + Math.abs(colOf(cell) - colOf(pointerWave.start)) >= 4;
      if (cell !== lastCell && (now - lastStart > 350 || (far && now - lastStart > 160))) {
        lastCell = cell;
        lastStart = now;
        startWave(cell, false);
      }
    });

    hero.addEventListener('pointerdown', (event) => {
      const cell = cellAt(event);
      if (cell < 0) return;
      startWave(cell, true);
    });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          onScreen = entry.isIntersecting;
          if (!onScreen) stop();
          else if (waves.length) start();
        });
      }, { threshold: 0.05 }).observe(hero);
    }

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stop();
      else if (waves.length) start();
    });

    document.addEventListener('themechange', () => {
      readColours();
      draw(performance.now());
    });

    reduceMotion.addEventListener('change', () => {
      stop();
      resize();
    });

    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 120);
    });

    readColours();
    resize();
  }
})();
