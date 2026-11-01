/* Maze race: a browser port of my Maze Pathfinding Visualizer.
   The generator, the braid step and the search algorithms follow the Python
   originals step for step; the drawing is one canvas per algorithm.
   Plain JavaScript, no dependencies. */
(() => {
  'use strict';

  const demo = document.querySelector('[data-maze-demo]');
  if (!demo || !window.HTMLCanvasElement) return;
  // Under 480px the CSS swaps the live demo for a GIF, so the demo only starts
  // once the viewport is wide enough (see the end of this file).
  const smallScreen = window.matchMedia('(max-width: 479px)');

  const OPEN = 0;
  const WALL = 1;
  const COLS = 41;
  const ROWS = 25;
  // Up, right, down, left. Fixed so the search order is reproducible.
  const STEPS = [[-1, 0], [0, 1], [1, 0], [0, -1]];

  /* ----- Seedable random numbers (mulberry32) --------------------------- */
  const mulberry32 = (seed) => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /* ----- Grid ------------------------------------------------------------ */
  // Cells are numbered row-major. Node ids are plain integers so the search
  // bookkeeping can live in typed arrays.
  class Grid {
    constructor(cols, rows) {
      this.cols = cols;
      this.rows = rows;
      this.size = cols * rows;
      this.cells = new Uint8Array(this.size);
      this.start = this.id(1, 1);
      this.goal = this.id(rows - 2, cols - 2);
    }

    id(r, c) { return r * this.cols + c; }
    row(id) { return (id / this.cols) | 0; }
    col(id) { return id % this.cols; }
    inBounds(r, c) { return r >= 0 && r < this.rows && c >= 0 && c < this.cols; }
    isOpen(r, c) { return this.inBounds(r, c) && this.cells[this.id(r, c)] === OPEN; }
    isWall(r, c) { return this.inBounds(r, c) && this.cells[this.id(r, c)] === WALL; }

    // Open 4-connected neighbours in up, right, down, left order.
    neighbors(id) {
      const r = this.row(id);
      const c = this.col(id);
      const out = [];
      for (const [dr, dc] of STEPS) {
        if (this.isOpen(r + dr, c + dc)) out.push(this.id(r + dr, c + dc));
      }
      return out;
    }
  }

  /* ----- Maze generation ------------------------------------------------- */
  // A perfect maze by recursive backtracking: corridors on odd coordinates,
  // walls between them. Braiding then knocks down a fraction of the walls that
  // separate two corridors, which adds loops and makes the race interesting:
  // in a perfect maze every algorithm finds the same single path.
  function generate(cols, rows, seed, braidFraction) {
    cols = Math.max(5, cols | 1);
    rows = Math.max(5, rows | 1);
    const rng = mulberry32(seed);
    const grid = new Grid(cols, rows);
    grid.cells.fill(WALL);
    const carve = (r, c) => { grid.cells[grid.id(r, c)] = OPEN; };

    carve(1, 1);
    const stack = [[1, 1]];
    while (stack.length) {
      const [r, c] = stack[stack.length - 1];
      const options = [];
      for (const [dr, dc] of [[-2, 0], [0, 2], [2, 0], [0, -2]]) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr > 0 && nr < rows - 1 && nc > 0 && nc < cols - 1 && grid.isWall(nr, nc)) {
          options.push([nr, nc]);
        }
      }
      if (!options.length) {
        stack.pop();
        continue;
      }
      const [nr, nc] = options[(rng() * options.length) | 0];
      carve((r + nr) / 2, (c + nc) / 2);
      carve(nr, nc);
      stack.push([nr, nc]);
    }

    if (braidFraction > 0) braid(grid, braidFraction, rng);
    return grid;
  }

  // Interior walls with open cells on both sides, vertically or horizontally.
  // Removing one never isolates anything; it only adds a loop.
  function braidCandidates(grid) {
    const out = [];
    for (let r = 1; r < grid.rows - 1; r++) {
      for (let c = 1; c < grid.cols - 1; c++) {
        if (!grid.isWall(r, c)) continue;
        if ((grid.isOpen(r - 1, c) && grid.isOpen(r + 1, c)) ||
            (grid.isOpen(r, c - 1) && grid.isOpen(r, c + 1))) {
          out.push(grid.id(r, c));
        }
      }
    }
    return out;
  }

  // Open `fraction` (0 to 1) of the braid candidates. Returns how many went.
  function braid(grid, fraction, rng) {
    fraction = Math.min(1, Math.max(0, fraction));
    const candidates = braidCandidates(grid);
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0;
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    const count = Math.round(fraction * candidates.length);
    for (let i = 0; i < count; i++) grid.cells[candidates[i]] = OPEN;
    return count;
  }

  /* ----- Search algorithms, as generators -------------------------------- */
  // Every algorithm yields events, exactly like the Python version:
  //   ['discover', node]  the node joined the frontier
  //   ['visit', node]     the node was taken off the frontier and expanded
  //   ['done', path]      the search ended; path is start..goal or null
  // The race advances each generator a few events per animation frame.

  const reconstruct = (parent, goal) => {
    const path = [];
    for (let node = goal; node !== -1; node = parent[node]) path.push(node);
    path.reverse();
    return path;
  };

  // Breadth-first search: a FIFO queue, so the first time the goal is reached
  // it is by a shortest path. Explores in rings around the start.
  function* bfs(grid) {
    const { start, goal } = grid;
    const parent = new Int32Array(grid.size).fill(-2); // -2 unseen, -1 root
    parent[start] = -1;
    const queue = [start];
    let head = 0;
    yield ['discover', start];
    while (head < queue.length) {
      const node = queue[head++];
      yield ['visit', node];
      if (node === goal) {
        yield ['done', reconstruct(parent, goal)];
        return;
      }
      for (const nb of grid.neighbors(node)) {
        if (parent[nb] === -2) {
          parent[nb] = node;
          queue.push(nb);
          yield ['discover', nb];
        }
      }
    }
    yield ['done', null];
  }

  /* ----- Best-first family: the engine behind A* ------------------------- */
  // A binary heap keyed on (f, order). Entries with equal f pop in the order
  // they were pushed, so ties break first-in-first-out like Python's heapq
  // with a counter, and nodes themselves are never compared.
  class MinHeap {
    constructor() { this.items = []; }
    get size() { return this.items.length; }

    less(i, j) {
      const a = this.items[i];
      const b = this.items[j];
      return a.f < b.f || (a.f === b.f && a.order < b.order);
    }

    swap(i, j) {
      const t = this.items[i];
      this.items[i] = this.items[j];
      this.items[j] = t;
    }

    push(f, order, node) {
      const items = this.items;
      items.push({ f, order, node });
      let i = items.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (!this.less(i, p)) break;
        this.swap(i, p);
        i = p;
      }
    }

    pop() {
      const items = this.items;
      const top = items[0];
      const last = items.pop();
      if (items.length) {
        items[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let m = i;
          if (l < items.length && this.less(l, m)) m = l;
          if (r < items.length && this.less(r, m)) m = r;
          if (m === i) break;
          this.swap(i, m);
          i = m;
        }
      }
      return top.node;
    }
  }

  const manhattan = (grid, a, b) =>
    Math.abs(grid.row(a) - grid.row(b)) + Math.abs(grid.col(a) - grid.col(b));

  // Pops the frontier node with the lowest f = gWeight*g + hWeight*h:
  // (1, 0) is Dijkstra, (1, 1) is A*, (0, 1) is Greedy. A closed set is
  // checked on pop; a node found again with a better g is pushed again and
  // the stale entry is skipped later (lazy deletion).
  function* bestFirst(grid, gWeight, hWeight, heuristic) {
    const { start, goal } = grid;
    let order = 0;
    const g = new Float64Array(grid.size).fill(Infinity);
    const parent = new Int32Array(grid.size).fill(-2);
    const closed = new Uint8Array(grid.size);
    const heap = new MinHeap();
    g[start] = 0;
    parent[start] = -1;
    heap.push(hWeight * heuristic(grid, start, goal), order++, start);
    yield ['discover', start];
    while (heap.size) {
      const node = heap.pop();
      if (closed[node]) continue;
      closed[node] = 1;
      yield ['visit', node];
      if (node === goal) {
        yield ['done', reconstruct(parent, goal)];
        return;
      }
      for (const nb of grid.neighbors(node)) {
        if (closed[nb]) continue;
        if (gWeight === 0 && g[nb] !== Infinity) continue; // greedy keeps the first parent
        const ng = g[node] + 1; // unit step cost
        if (ng < g[nb]) {
          g[nb] = ng;
          parent[nb] = node;
          heap.push(gWeight * ng + hWeight * heuristic(grid, nb, goal), order++, nb);
          yield ['discover', nb];
        }
      }
    }
    yield ['done', null];
  }

  // A*: distance so far plus an admissible estimate to the goal. Optimal, and
  // it explores far fewer cells than BFS.
  const astar = (grid) => bestFirst(grid, 1, 1, manhattan);

  const ALGORITHMS = { bfs, astar };

  /* ----- A panel: one canvas showing one algorithm's progress ------------ */
  const STATE = { open: 0, wall: 1, frontier: 2, explored: 3, path: 4 };
  const colours = {};

  const readColours = () => {
    const style = getComputedStyle(demo);
    for (const name of ['open', 'wall', 'frontier', 'explored', 'path', 'start', 'goal']) {
      colours[name] = style.getPropertyValue(`--maze-${name}`).trim() || '#ff00ff';
    }
  };

  class Panel {
    constructor(el) {
      this.el = el;
      this.canvas = el.querySelector('canvas');
      this.ctx = this.canvas.getContext('2d');
      this.exploredEl = el.querySelector('[data-explored]');
      this.pathEl = el.querySelector('[data-path]');
      this.statusEl = el.querySelector('[data-status]');
      this.algo = ALGORITHMS[el.dataset.panel] || null;
      this.px = 8;
      this.grid = null;
      this.gen = null;
      this.done = false;
    }

    setGrid(grid) {
      this.grid = grid;
      this.state = new Uint8Array(grid.cells);
      this.visited = 0;
      this.path = null;
      this.gen = null;
      this.done = false;
      this.fit();
      this.drawAll();
      this.showStats(this.algo ? 'ready' : 'coming soon');
    }

    begin() {
      this.gen = this.algo(this.grid);
      this.done = false;
      this.showStats('searching…');
    }

    // Paint one event. Frontier cells turn amber, visited cells teal-green,
    // and the final path bright teal.
    apply(event) {
      const [kind, payload] = event;
      if (kind === 'discover') {
        if (this.state[payload] === STATE.open) {
          this.state[payload] = STATE.frontier;
          this.drawCell(payload);
        }
      } else if (kind === 'visit') {
        this.state[payload] = STATE.explored;
        this.visited += 1;
        this.drawCell(payload);
      } else if (kind === 'done') {
        this.done = true;
        this.path = payload;
        if (payload) {
          for (const id of payload) {
            this.state[id] = STATE.path;
            this.drawCell(id);
          }
        }
        this.showStats(payload ? 'path found' : 'no path');
      }
    }

    // Advance up to k events.
    step(k) {
      for (let i = 0; i < k && !this.done; i++) {
        const next = this.gen.next();
        this.apply(next.done ? ['done', null] : next.value);
      }
    }

    // Size the backing store to the canvas's on-screen width, with a whole
    // number of device pixels per cell so edges stay crisp.
    fit() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cssWidth = this.canvas.clientWidth || 400;
      this.px = Math.max(2, Math.floor((cssWidth * dpr) / this.grid.cols));
      this.canvas.width = this.px * this.grid.cols;
      this.canvas.height = this.px * this.grid.rows;
    }

    drawCell(id) {
      const { grid, px, ctx } = this;
      let colour;
      if (id === grid.start) colour = colours.start;
      else if (id === grid.goal) colour = colours.goal;
      else colour = [colours.open, colours.wall, colours.frontier, colours.explored, colours.path][this.state[id]];
      ctx.fillStyle = colour;
      ctx.fillRect(grid.col(id) * px, grid.row(id) * px, px, px);
    }

    drawAll() {
      const { grid, px, ctx } = this;
      ctx.fillStyle = colours.open;
      ctx.fillRect(0, 0, grid.cols * px, grid.rows * px);
      for (let id = 0; id < grid.size; id++) {
        if (this.state[id] !== STATE.open) this.drawCell(id);
      }
      this.drawCell(grid.start);
      this.drawCell(grid.goal);
    }

    showStats(status) {
      this.exploredEl.textContent = String(this.visited);
      this.pathEl.textContent = this.path ? String(this.path.length - 1) : '0';
      if (status !== undefined) this.statusEl.textContent = status;
    }
  }

  /* ----- Wiring ---------------------------------------------------------- */
  const panels = Array.from(demo.querySelectorAll('[data-panel]')).map((el) => new Panel(el));
  const braidInput = demo.querySelector('[data-braid]');
  const braidValue = demo.querySelector('[data-braid-value]');
  const newButton = demo.querySelector('[data-action="new"]');
  const raceButton = demo.querySelector('[data-action="race"]');
  const resetButton = demo.querySelector('[data-action="reset"]');
  const speedInput = demo.querySelector('[data-speed]');
  const summary = demo.querySelector('[data-summary]');

  let seed = (Math.random() * 2 ** 31) | 0;
  let grid = null;
  let running = false;
  let raf = 0;

  const braidFraction = () => Number(braidInput.value) / 100;
  const stepsPerFrame = () => Number(speedInput.value) || 8;

  const panelName = (panel) => panel.el.querySelector('h3').textContent;

  // One line comparing the two runners once both have finished.
  const summarise = () => {
    const [a, b] = racers();
    if (!a || !b) return;
    if (!a.path || !b.path) {
      summary.textContent = 'No path this time. Try a new maze.';
      return;
    }
    const la = a.path.length - 1;
    const lb = b.path.length - 1;
    const paths = la === lb
      ? `Both paths are ${la} steps.`
      : `${panelName(la < lb ? a : b)} found the shorter path.`;
    summary.textContent = `${panelName(b)} checked ${b.visited} cells to ${panelName(a)}'s ${a.visited}. ${paths}`;
  };

  /* ----- The race: every runner advances the same number of events a frame */
  const racers = () => panels.filter((panel) => panel.algo);
  const finished = () => racers().every((panel) => panel.done);

  const stopRace = () => {
    running = false;
    cancelAnimationFrame(raf);
    raceButton.textContent = finished() ? 'Race again' : racers().some((panel) => panel.gen) ? 'Resume' : 'Race';
  };

  const frame = () => {
    if (!running) return;
    const k = stepsPerFrame();
    for (const panel of racers()) if (!panel.done) panel.step(k);
    racers().forEach((panel) => panel.showStats());
    if (finished()) {
      stopRace();
      raceButton.textContent = 'Race again';
      summarise();
      return;
    }
    raf = requestAnimationFrame(frame);
  };

  const startRace = () => {
    if (!grid) init(); // a keyboard user can reach Race before the maze is built
    if (finished()) return;
    racers().forEach((panel) => { if (!panel.gen) panel.begin(); });
    running = true;
    raceButton.textContent = 'Pause';
    raf = requestAnimationFrame(frame);
  };

  // Race starts, Pause pauses, Resume resumes; once both have finished the
  // same button clears the search and runs the same maze again.
  raceButton.addEventListener('click', () => {
    if (running) {
      stopRace();
      return;
    }
    if (finished()) {
      panels.forEach((panel) => panel.setGrid(grid));
      summary.textContent = '';
    }
    startRace();
  });

  const build = () => {
    stopRace();
    grid = generate(COLS, ROWS, seed, braidFraction());
    panels.forEach((panel) => panel.setGrid(grid));
    raceButton.textContent = 'Race';
    raceButton.disabled = racers().length === 0;
    summary.textContent = '';
  };

  // Reset clears the search but keeps the maze.
  resetButton.addEventListener('click', () => {
    stopRace();
    panels.forEach((panel) => panel.setGrid(grid));
    raceButton.textContent = 'Race';
    raceButton.disabled = false;
    summary.textContent = '';
  });

  // Pause while the demo is scrolled out of view or the tab is hidden, and
  // pick up where it left off when it is back. A pause the visitor asked for
  // stays a pause.
  let inView = true;
  let pausedByView = false;
  const handleVisible = (visible) => {
    if (!visible && running) {
      stopRace();
      pausedByView = true;
    } else if (visible && pausedByView) {
      pausedByView = false;
      startRace();
    }
  };

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        inView = entry.isIntersecting;
        handleVisible(inView && !document.hidden);
      });
    }, { threshold: 0.1 }).observe(demo);
  }

  document.addEventListener('visibilitychange', () => handleVisible(inView && !document.hidden));

  newButton.addEventListener('click', () => {
    seed = (Math.random() * 2 ** 31) | 0;
    build();
  });

  // The slider keeps the seed, so you can watch the same maze gain loops.
  braidInput.addEventListener('input', () => {
    braidValue.textContent = `${braidInput.value}%`;
    build();
  });

  document.addEventListener('themechange', () => {
    if (!grid) return;
    readColours();
    panels.forEach((panel) => panel.drawAll());
  });

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!grid) return;
      panels.forEach((panel) => {
        panel.fit();
        panel.drawAll();
      });
    }, 120);
  });

  // Build the first maze as soon as the viewport is wide enough for the live
  // demo: now, or later if the page loaded narrow (a rotated phone, a resized
  // window).
  const init = () => {
    if (grid || smallScreen.matches) return;
    readColours();
    braidValue.textContent = `${braidInput.value}%`;
    build();
  };

  // ...and only once the demo is near the viewport, so loading the page does
  // not pay for a maze nobody has scrolled to yet.
  if ('IntersectionObserver' in window) {
    const nearby = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      nearby.disconnect();
      init();
      smallScreen.addEventListener('change', init);
    }, { rootMargin: '200px 0px' });
    nearby.observe(demo);
  } else {
    init();
    smallScreen.addEventListener('change', init);
  }
})();
