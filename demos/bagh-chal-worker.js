/* The Bagh Chal AI runs here, off the page's main thread, so a deep search
   never freezes the board. The page posts a snapshot of the game plus which
   side to play and how deep to look; this posts back the chosen move. */
importScripts('bagh-chal-engine.js');

const { Game, AI } = self.BaghChalEngine;

self.onmessage = (event) => {
  const { id, snapshot, player, depth } = event.data;
  const game = Game.fromSnapshot(snapshot);
  const ai = new AI(player, depth);
  const move = ai.bestMove(game);
  self.postMessage({ id, move, nodes: ai.nodes, pruned: ai.pruned, score: ai.lastScore });
};
