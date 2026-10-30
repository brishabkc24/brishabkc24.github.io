/* Maze race: a browser port of my Maze Pathfinding Visualizer.
   The generator, the braid step and the search algorithms follow the Python
   originals step for step; the drawing is one canvas per algorithm.
   Plain JavaScript, no dependencies. */
(() => {
  'use strict';

  const demo = document.querySelector('[data-maze-demo]');
  if (!demo || !window.HTMLCanvasElement) return;
  // Under 480px the CSS swaps the live demo for a GIF, so there is nothing to run.
  if (window.matchMedia('(max-width: 479px)').matches) return;

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
      this.px = 8;
      this.grid = null;
    }

    setGrid(grid) {
      this.grid = grid;
      this.state = new Uint8Array(grid.cells);
      this.visited = 0;
      this.path = null;
      this.fit();
      this.drawAll();
      this.showStats('ready');
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
      this.pathEl.textContent = this.path ? String(this.path.length - 1) : '–';
      if (status !== undefined) this.statusEl.textContent = status;
    }
  }

  /* ----- Wiring ---------------------------------------------------------- */
  const panels = Array.from(demo.querySelectorAll('[data-panel]')).map((el) => new Panel(el));
  const braidInput = demo.querySelector('[data-braid]');
  const braidValue = demo.querySelector('[data-braid-value]');
  const newButton = demo.querySelector('[data-action="new"]');

  let seed = (Math.random() * 2 ** 31) | 0;
  let grid = null;

  const braidFraction = () => Number(braidInput.value) / 100;

  const build = () => {
    grid = generate(COLS, ROWS, seed, braidFraction());
    panels.forEach((panel) => panel.setGrid(grid));
  };

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
    readColours();
    panels.forEach((panel) => panel.drawAll());
  });

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => panels.forEach((panel) => {
      panel.fit();
      panel.drawAll();
    }), 120);
  });

  readColours();
  braidValue.textContent = `${braidInput.value}%`;
  build();
})();
