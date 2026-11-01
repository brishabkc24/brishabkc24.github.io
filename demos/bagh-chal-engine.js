/* Bagh Chal engine: the rules and the minimax AI, ported from my Python game
   (github.com/brishabkc24/Bagh-Chal). This file has no DOM in it, so the page
   loads it as a script and the AI worker loads it with importScripts. */
(() => {
  'use strict';

  const EMPTY = 0;
  const TIGER = 1;
  const GOAT = 2;

  /* ----- Board geometry ---------------------------------------------- */
  // Which points are joined by lines. Every point has its four straight
  // neighbours; diagonals only exist on points whose row + column is even.
  // Each entry also carries the landing point of a jump over that neighbour,
  // or null when the jump would leave the board.
  const NEIGHBOURS = (() => {
    const table = [];
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        if ((r + c) % 2 === 0) directions.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
        const entries = [];
        for (const [dr, dc] of directions) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 0 || nr > 4 || nc < 0 || nc > 4) continue;
          const jr = r + 2 * dr;
          const jc = c + 2 * dc;
          const jump = jr >= 0 && jr <= 4 && jc >= 0 && jc <= 4 ? [jr, jc] : null;
          entries.push({ to: [nr, nc], jump });
        }
        table[r * 5 + c] = entries;
      }
    }
    return table;
  })();

  /* ----- Rules engine ------------------------------------------------- */
  // Moves are arrays like the Python tuples:
  //   ['PLACE', r, c]  |  ['MOVE', r1, c1, r2, c2]  |  ['JUMP', r1, c1, r2, c2]
  class Game {
    constructor() {
      this.grid = Array.from({ length: 5 }, () => new Array(5).fill(EMPTY));
      this.grid[0][0] = TIGER;
      this.grid[0][4] = TIGER;
      this.grid[4][0] = TIGER;
      this.grid[4][4] = TIGER;
      this.turn = GOAT; // goats always move first
      this.goatsPlaced = 0;
      this.goatsCaptured = 0;
      this.phase = 'PLACEMENT'; // goats cannot move until all 20 are placed
      this.positionCounts = new Map(); // threefold-repetition draw rule
      this.repetitionDraw = false;
      this.simRepetition = [];
      this.history = [];
    }

    // A plain object that survives postMessage, and its inverse.
    snapshot() {
      return {
        grid: this.grid.map((row) => row.slice()),
        turn: this.turn,
        phase: this.phase,
        goatsPlaced: this.goatsPlaced,
        goatsCaptured: this.goatsCaptured,
        positionCounts: Array.from(this.positionCounts.entries()),
        repetitionDraw: this.repetitionDraw,
      };
    }

    static fromSnapshot(snap) {
      const game = new Game();
      game.grid = snap.grid.map((row) => row.slice());
      game.turn = snap.turn;
      game.phase = snap.phase;
      game.goatsPlaced = snap.goatsPlaced;
      game.goatsCaptured = snap.goatsCaptured;
      game.positionCounts = new Map(snap.positionCounts);
      game.repetitionDraw = snap.repetitionDraw;
      return game;
    }

    // -- real moves (saved for undo, counted for repetition) --------------

    applyMove(move) {
      this.saveState();
      this.apply(move);
      this.recordPosition();
    }

    saveState() {
      this.history.push({
        grid: this.grid.map((row) => row.slice()),
        turn: this.turn,
        phase: this.phase,
        goatsPlaced: this.goatsPlaced,
        goatsCaptured: this.goatsCaptured,
        positionCounts: new Map(this.positionCounts),
        repetitionDraw: this.repetitionDraw,
      });
    }

    undo() {
      if (!this.history.length) return false;
      const state = this.history.pop();
      this.grid = state.grid;
      this.turn = state.turn;
      this.phase = state.phase;
      this.goatsPlaced = state.goatsPlaced;
      this.goatsCaptured = state.goatsCaptured;
      this.positionCounts = state.positionCounts;
      this.repetitionDraw = state.repetitionDraw;
      return true;
    }

    positionKey() {
      return `${this.grid.map((row) => row.join('')).join('/')}:${this.turn}`;
    }

    recordPosition() {
      if (this.phase !== 'MOVEMENT') return; // positions can only repeat once all goats are down
      const key = this.positionKey();
      const count = (this.positionCounts.get(key) || 0) + 1;
      this.positionCounts.set(key, count);
      if (count >= 3) this.repetitionDraw = true;
    }

    unrecordPosition() {
      if (this.phase !== 'MOVEMENT') return;
      const key = this.positionKey();
      const count = this.positionCounts.get(key) || 0;
      if (count <= 1) this.positionCounts.delete(key);
      else this.positionCounts.set(key, count - 1);
    }

    // -- queries ------------------------------------------------------------

    // [slides, jumps, trapped]: legal one-step tiger moves, captures available
    // right now (= goats under threat), and tigers with no move at all.
    tigerMobility() {
      let slides = 0;
      let jumps = 0;
      let trapped = 0;
      const grid = this.grid;
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          if (grid[r][c] !== TIGER) continue;
          let own = 0;
          for (const { to, jump } of NEIGHBOURS[r * 5 + c]) {
            const target = grid[to[0]][to[1]];
            if (target === EMPTY) {
              slides += 1;
              own += 1;
            } else if (target === GOAT && jump && grid[jump[0]][jump[1]] === EMPTY) {
              jumps += 1;
              own += 1;
            }
          }
          if (own === 0) trapped += 1;
        }
      }
      return [slides, jumps, trapped];
    }

    goatsCanMove() {
      const grid = this.grid;
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          if (grid[r][c] !== GOAT) continue;
          for (const { to } of NEIGHBOURS[r * 5 + c]) {
            if (grid[to[0]][to[1]] === EMPTY) return true;
          }
        }
      }
      return false;
    }

    // TIGER, GOAT, 'DRAW' or null while the game is on.
    checkWinner(totalTigerMoves) {
      if (this.goatsCaptured >= 5) return TIGER;
      // Trapped tigers are judged on the tigers' turn only, as in tournament
      // play: on the goats' turn a forced goat move could still free a tiger.
      if (this.turn === TIGER) {
        if (totalTigerMoves === undefined) {
          const [slides, jumps] = this.tigerMobility();
          totalTigerMoves = slides + jumps;
        }
        if (totalTigerMoves === 0) return GOAT;
      }
      if (this.phase === 'MOVEMENT' && this.turn === GOAT && !this.goatsCanMove()) return TIGER;
      if (this.repetitionDraw) return 'DRAW';
      return null;
    }

    legalMoves(player) {
      const moves = [];
      const grid = this.grid;
      if (player === GOAT && this.phase === 'PLACEMENT') {
        for (let r = 0; r < 5; r++) {
          for (let c = 0; c < 5; c++) {
            if (grid[r][c] === EMPTY) moves.push(['PLACE', r, c]);
          }
        }
        return moves;
      }
      for (let r1 = 0; r1 < 5; r1++) {
        for (let c1 = 0; c1 < 5; c1++) {
          if (grid[r1][c1] !== player) continue;
          for (const { to, jump } of NEIGHBOURS[r1 * 5 + c1]) {
            const target = grid[to[0]][to[1]];
            if (target === EMPTY) {
              moves.push(['MOVE', r1, c1, to[0], to[1]]);
            } else if (player === TIGER && target === GOAT && jump && grid[jump[0]][jump[1]] === EMPTY) {
              moves.push(['JUMP', r1, c1, jump[0], jump[1]]);
            }
          }
        }
      }
      return moves;
    }

    // -- simulated moves for the search (no history, but counted for repetition)

    executeSimulatedMove(move) {
      this.apply(move);
      this.simRepetition.push(this.repetitionDraw);
      this.recordPosition();
    }

    undoSimulatedMove(move) {
      this.unrecordPosition();
      this.repetitionDraw = this.simRepetition.pop();
      this.revert(move);
    }

    apply(move) {
      const grid = this.grid;
      if (move[0] === 'PLACE') {
        grid[move[1]][move[2]] = GOAT;
        this.goatsPlaced += 1;
        if (this.goatsPlaced === 20) this.phase = 'MOVEMENT';
        this.turn = TIGER;
      } else if (move[0] === 'MOVE') {
        const [, r1, c1, r2, c2] = move;
        grid[r2][c2] = grid[r1][c1];
        grid[r1][c1] = EMPTY;
        this.turn = this.turn === GOAT ? TIGER : GOAT;
      } else {
        const [, r1, c1, r2, c2] = move;
        grid[r2][c2] = TIGER;
        grid[r1][c1] = EMPTY;
        grid[(r1 + r2) / 2][(c1 + c2) / 2] = EMPTY;
        this.goatsCaptured += 1;
        this.turn = GOAT;
      }
    }

    revert(move) {
      const grid = this.grid;
      if (move[0] === 'PLACE') {
        grid[move[1]][move[2]] = EMPTY;
        this.goatsPlaced -= 1;
        if (this.goatsPlaced < 20) this.phase = 'PLACEMENT';
        this.turn = GOAT;
      } else if (move[0] === 'MOVE') {
        const [, r1, c1, r2, c2] = move;
        grid[r1][c1] = grid[r2][c2];
        grid[r2][c2] = EMPTY;
        this.turn = this.turn === GOAT ? TIGER : GOAT;
      } else {
        const [, r1, c1, r2, c2] = move;
        grid[r1][c1] = TIGER;
        grid[r2][c2] = EMPTY;
        grid[(r1 + r2) / 2][(c1 + c2) / 2] = GOAT;
        this.goatsCaptured -= 1;
        this.turn = TIGER;
      }
    }
  }

  /* ----- The AI: minimax with alpha-beta pruning ------------------------ */
  const WIN_SCORE = 10000;
  const W_CAPTURE = 500;
  const W_THREAT = 150;
  const W_MOBILITY = 10;
  const W_TRAPPED = 250;
  const W_CENTER = 25;

  // Heuristic value of a position from the tigers' point of view.
  const staticScore = (state, [slides, jumps, trapped]) => {
    let score = state.goatsCaptured * W_CAPTURE;
    score += jumps * W_THREAT;
    score += slides * W_MOBILITY;
    score -= trapped * W_TRAPPED;
    if (state.grid[2][2] === TIGER) score += W_CENTER;
    return score;
  };

  // depth = plies still unsearched, so a win found nearer the root beats the
  // same win found deeper.
  const terminalScore = (winner, depth) => {
    if (winner === TIGER) return WIN_SCORE + depth;
    if (winner === GOAT) return -WIN_SCORE - depth;
    return 0;
  };

  const evaluate = (state) => {
    const mobility = state.tigerMobility();
    const winner = state.checkWinner(mobility[0] + mobility[1]);
    if (winner !== null) return terminalScore(winner, 0);
    return staticScore(state, mobility);
  };

  // The same terms the search uses, for the "how the AI scores this" panel.
  const scoreBreakdown = (state) => {
    const [slides, jumps, trapped] = state.tigerMobility();
    const rows = [
      ['Captured goats', state.goatsCaptured, W_CAPTURE],
      ['Goats under threat', jumps, W_THREAT],
      ['Tiger slides', slides, W_MOBILITY],
      ['Trapped tigers', trapped, -W_TRAPPED],
      ['Tiger on centre', state.grid[2][2] === TIGER ? 1 : 0, W_CENTER],
    ].map(([label, count, weight]) => ({ label, count, weight, points: count * weight }));
    return { rows, total: rows.reduce((sum, row) => sum + row.points, 0) };
  };

  class AI {
    constructor(player, depth) {
      this.player = player; // TIGER maximises, GOAT minimises
      this.maxDepth = depth;
      this.nodes = 0;
      this.pruned = 0;
      this.lastScore = 0;
    }

    minimax(state, depth, alpha, beta, maximisingTiger) {
      this.nodes += 1;
      const mobility = state.tigerMobility(); // one board scan per node
      const winner = state.checkWinner(mobility[0] + mobility[1]);
      if (winner !== null) return [terminalScore(winner, depth), null];
      if (depth === 0) return [staticScore(state, mobility), null];

      const side = maximisingTiger ? TIGER : GOAT;
      const moves = state.legalMoves(side);
      if (!moves.length) return [terminalScore(maximisingTiger ? GOAT : TIGER, depth), null];

      if (maximisingTiger) {
        // Captures first: better ordering means more cutoffs.
        moves.sort((a, b) => (a[0] !== 'JUMP') - (b[0] !== 'JUMP'));
        let best = -Infinity;
        let bestMove = moves[0];
        for (const move of moves) {
          state.executeSimulatedMove(move);
          const [score] = this.minimax(state, depth - 1, alpha, beta, false);
          state.undoSimulatedMove(move);
          if (score > best) {
            best = score;
            bestMove = move;
          }
          alpha = Math.max(alpha, score);
          if (beta <= alpha) {
            this.pruned += 1;
            break;
          }
        }
        return [best, bestMove];
      }

      // Edge points are the safest placements; try them first.
      const edge = (m) => (m[0] === 'PLACE' ? Math.min(m[1], m[2], 4 - m[1], 4 - m[2]) : 0);
      moves.sort((a, b) => edge(a) - edge(b));
      let best = Infinity;
      let bestMove = moves[0];
      for (const move of moves) {
        state.executeSimulatedMove(move);
        const [score] = this.minimax(state, depth - 1, alpha, beta, true);
        state.undoSimulatedMove(move);
        if (score < best) {
          best = score;
          bestMove = move;
        }
        beta = Math.min(beta, score);
        if (beta <= alpha) {
          this.pruned += 1;
          break;
        }
      }
      return [best, bestMove];
    }

    bestMove(state) {
      this.nodes = 0;
      this.pruned = 0;
      if (state.turn !== this.player) return null;
      const [score, move] = this.minimax(state, this.maxDepth, -Infinity, Infinity, this.player === TIGER);
      this.lastScore = score;
      return move;
    }
  }

  self.BaghChalEngine = { EMPTY, TIGER, GOAT, NEIGHBOURS, Game, AI, evaluate, scoreBreakdown };
})();
