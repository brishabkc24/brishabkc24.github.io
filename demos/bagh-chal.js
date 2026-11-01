/* Bagh Chal in the browser: the board, the controls and the panel. The rules
   and the minimax AI live in bagh-chal-engine.js; the AI searches inside a
   Web Worker (bagh-chal-worker.js) so a deep search never freezes the page,
   and falls back to the main thread where workers are not available. */
(() => {
  'use strict';

  const root = document.querySelector('[data-bagh-chal]');
  const engine = self.BaghChalEngine;
  if (!root || !engine) return;

  const { EMPTY, TIGER, GOAT, Game, AI, evaluate, scoreBreakdown } = engine;

  /* ----- The board on the page -------------------------------------------- */
  const $ = (selector) => root.querySelector(selector);
  const pointsEl = $('[data-points]');
  const statusEl = $('[data-status]');
  const placedEl = $('[data-placed]');
  const capturedEl = $('[data-captured]');
  const scoreEl = $('[data-score]');
  const bannerEl = $('[data-banner]');
  const breakdownEl = $('[data-breakdown]');
  const totalEl = $('[data-total]');
  const nodesEl = $('[data-nodes]');
  const newButton = $('[data-action="new"]');
  const undoButton = $('[data-action="undo"]');
  const hintButton = $('[data-action="hint"]');
  const sideInputs = Array.from(root.querySelectorAll('input[name="bc-side"]'));
  const levelInputs = Array.from(root.querySelectorAll('input[name="bc-level"]'));

  const PIECES = {
    [TIGER]: { src: 'assets/tiger.webp', width: 160, height: 160, name: 'tiger' },
    [GOAT]: { src: 'assets/goat.webp', width: 180, height: 98, name: 'goat' },
  };
  const number = new Intl.NumberFormat('en');
  const sign = (n) => (n > 0 ? `+${number.format(n)}` : number.format(n));

  let game = null;
  let ai = null; // { player } or null in two-player mode
  let depth = 4;
  let selected = null; // [r, c] of the piece picked up
  let targets = []; // legal moves from the selected piece
  let hint = null; // a move to highlight
  let thinking = false;
  let hinting = false;
  let winner = null;
  let lastSearch = null; // { nodes, pruned, score } from the AI's latest move
  let gameToken = 0; // bumped on New game and Undo so a stale search result is dropped

  /* ----- The search, off the main thread when it can be ----------------- */
  let worker = null;
  let requestId = 0;
  const pending = new Map();

  const searchHere = (player, searchDepth) => {
    const searcher = new AI(player, searchDepth);
    const move = searcher.bestMove(game);
    return { move, nodes: searcher.nodes, pruned: searcher.pruned, score: searcher.lastScore };
  };

  try {
    if (window.Worker && location.protocol !== 'file:') {
      worker = new Worker('demos/bagh-chal-worker.js');
      worker.onmessage = (event) => {
        const done = pending.get(event.data.id);
        if (!done) return;
        pending.delete(event.data.id);
        done(event.data);
      };
      worker.onerror = () => {
        // Something is wrong with the worker: answer every open request on
        // the main thread and stop using it.
        worker = null;
        pending.forEach((done, id) => {
          const { player, searchDepth } = pendingArgs.get(id);
          done(searchHere(player, searchDepth));
        });
        pending.clear();
        pendingArgs.clear();
      };
    }
  } catch (_) {
    worker = null;
  }
  const pendingArgs = new Map();

  const search = (player, searchDepth) => new Promise((resolve) => {
    if (!worker) {
      resolve(searchHere(player, searchDepth));
      return;
    }
    const id = ++requestId;
    pending.set(id, resolve);
    pendingArgs.set(id, { player, searchDepth });
    worker.postMessage({ id, snapshot: game.snapshot(), player, depth: searchDepth });
  });

  // 25 buttons laid over the drawn lines; one per point.
  const points = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'bc__point';
      button.style.left = `${10 + c * 20}%`;
      button.style.top = `${10 + r * 20}%`;
      const img = document.createElement('img');
      img.alt = '';
      img.hidden = true;
      img.decoding = 'async';
      button.append(img);
      button.addEventListener('click', () => onPoint(r, c));
      pointsEl.append(button);
      points.push({ button, img, piece: EMPTY });
    }
  }

  const checked = (inputs) => (inputs.find((input) => input.checked) || inputs[0]).value;
  const aiPlayer = () => {
    const side = checked(sideInputs);
    if (side === 'goat') return TIGER;
    if (side === 'tiger') return GOAT;
    return null;
  };
  const playerName = (player) => (player === TIGER ? 'Tigers' : 'Goats');
  const isHumanTurn = () => !thinking && !winner && (!ai || game.turn !== ai.player);

  function render() {
    const hintFrom = hint && hint[0] !== 'PLACE' ? [hint[1], hint[2]] : null;
    const hintTo = hint ? (hint[0] === 'PLACE' ? [hint[1], hint[2]] : [hint[3], hint[4]]) : null;
    const same = (a, r, c) => Boolean(a) && a[0] === r && a[1] === c;

    points.forEach((point, index) => {
      const r = (index / 5) | 0;
      const c = index % 5;
      const piece = game.grid[r][c];
      if (piece !== point.piece) {
        point.piece = piece;
        if (piece === EMPTY) {
          point.img.hidden = true;
        } else {
          const art = PIECES[piece];
          point.img.src = art.src;
          point.img.width = art.width;
          point.img.height = art.height;
          point.img.hidden = false;
        }
      }
      const isTarget = targets.some((move) => move[3] === r && move[4] === c);
      point.button.classList.toggle('has-piece', piece !== EMPTY);
      point.button.classList.toggle('is-selected', same(selected, r, c));
      point.button.classList.toggle('is-target', isTarget);
      point.button.classList.toggle('is-hint', same(hintFrom, r, c) || same(hintTo, r, c));
      point.button.setAttribute('aria-pressed', String(same(selected, r, c)));
      const what = piece === EMPTY ? 'empty' : PIECES[piece].name;
      point.button.setAttribute('aria-label', `Row ${r + 1}, column ${c + 1}: ${what}${isTarget ? ', legal move' : ''}`);
      point.button.disabled = !isHumanTurn();
    });

    let status;
    if (winner === 'DRAW') status = 'Draw by repetition';
    else if (winner) status = `${playerName(winner)} win`;
    else if (thinking) status = `${playerName(game.turn)} (AI) thinking…`;
    else if (game.turn === GOAT && game.phase === 'PLACEMENT') status = 'Goats to place';
    else status = `${playerName(game.turn)} to move`;
    statusEl.textContent = status;

    placedEl.textContent = `${game.goatsPlaced} / 20`;
    capturedEl.textContent = `${game.goatsCaptured} / 5`;
    scoreEl.textContent = sign(evaluate(game));

    const { rows, total } = scoreBreakdown(game);
    breakdownEl.textContent = '';
    rows.forEach((row) => {
      const tr = document.createElement('tr');
      [row.label, number.format(row.count), sign(row.weight), sign(row.points)].forEach((text, i) => {
        const cell = document.createElement(i === 0 ? 'th' : 'td');
        if (i === 0) cell.scope = 'row';
        cell.textContent = text;
        tr.append(cell);
      });
      breakdownEl.append(tr);
    });
    totalEl.textContent = sign(total);
    if (lastSearch) {
      nodesEl.textContent = `Last AI move: searched ${number.format(lastSearch.nodes)} positions at depth ${depth}, pruned ${number.format(lastSearch.pruned)} branches, expects ${sign(lastSearch.score)}.`;
    }

    if (winner === 'DRAW') bannerEl.textContent = 'Draw: the same position three times';
    else if (winner === TIGER) bannerEl.textContent = game.goatsCaptured >= 5 ? 'Tigers win: five goats captured' : 'Tigers win: the goats cannot move';
    else if (winner === GOAT) bannerEl.textContent = 'Goats win: every tiger is trapped';
    bannerEl.hidden = !winner;

    undoButton.disabled = thinking || !game.history.length;
    hintButton.disabled = hinting || !isHumanTurn();
  }

  function afterMove() {
    winner = game.checkWinner();
    render();
    if (!winner) maybeAI();
  }

  function play(move) {
    game.applyMove(move);
    selected = null;
    targets = [];
    hint = null;
    afterMove();
  }

  function maybeAI() {
    if (!ai || winner || game.turn !== ai.player) return;
    thinking = true;
    render();
    const token = gameToken;
    search(ai.player, depth).then(({ move, nodes, pruned, score }) => {
      if (token !== gameToken) return; // the game changed under the search
      thinking = false;
      if (move) {
        game.applyMove(move);
        lastSearch = { nodes, pruned, score };
      }
      afterMove();
    });
  }

  function onPoint(r, c) {
    if (!isHumanTurn()) return;
    const piece = game.grid[r][c];
    if (game.turn === GOAT && game.phase === 'PLACEMENT') {
      if (piece === EMPTY) play(['PLACE', r, c]);
      return;
    }
    if (selected) {
      const move = targets.find((m) => m[3] === r && m[4] === c);
      if (move) {
        play(move);
        return;
      }
    }
    if (piece === game.turn) {
      selected = [r, c];
      targets = game.legalMoves(game.turn).filter((m) => m[1] === r && m[2] === c);
      hint = null;
    } else {
      selected = null;
      targets = [];
    }
    render();
  }

  function newGame() {
    gameToken += 1;
    game = new Game();
    depth = Number(checked(levelInputs));
    const player = aiPlayer();
    ai = player === null ? null : { player };
    selected = null;
    targets = [];
    hint = null;
    thinking = false;
    hinting = false;
    winner = null;
    lastSearch = null;
    nodesEl.textContent = ai ? 'Make a move and the AI will show how many positions it searched.' : 'Two players: the AI only answers the Hint button.';
    render();
    maybeAI();
  }

  // Against the AI, Undo takes back its reply and your move together.
  function undo() {
    if (thinking || !game.history.length) return;
    gameToken += 1;
    game.undo();
    while (ai && game.turn === ai.player && game.history.length) game.undo();
    selected = null;
    targets = [];
    hint = null;
    winner = null;
    render();
    maybeAI();
  }

  function showHint() {
    if (!isHumanTurn() || hinting) return;
    hinting = true;
    render();
    const token = gameToken;
    search(game.turn, depth).then(({ move }) => {
      hinting = false;
      if (token !== gameToken || !isHumanTurn()) {
        render();
        return;
      }
      hint = move;
      selected = null;
      targets = [];
      render();
    });
  }

  newButton.addEventListener('click', newGame);
  undoButton.addEventListener('click', undo);
  hintButton.addEventListener('click', showHint);
  sideInputs.forEach((input) => input.addEventListener('change', newGame));
  levelInputs.forEach((input) => input.addEventListener('change', () => {
    depth = Number(checked(levelInputs));
  }));

  newGame();
})();
