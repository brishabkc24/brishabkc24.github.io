# brishabkc24.github.io

My portfolio: one hand-built page in HTML, CSS and JavaScript. No framework,
no build step, nothing to install. It shows who I am and lets you play my
projects in the browser instead of just reading about them.

**Live:** https://brishabkc24.github.io

![The home page. "I make algorithms visible", with a breadth-first search drawn across the right half of the hero.](docs/hero.png)

## What is on the page

A numbered workflow, hairlines between stages, set in Geist throughout on
oat paper, with a dark rendering of the same system behind the toggle.

1. **Watch two searches race.** My Maze Pathfinding Visualizer, ported to the
   browser. BFS and A\* race through the same maze side by side, with counters
   for cells explored and path length, a slider for how many loops the maze
   has, a speed slider, pause and reset. Under 480px it shows a recording.
2. **Play the tigers, or the goats.** My desktop Bagh Chal game, playable in
   the browser: goats or tigers against the minimax AI at three levels, or two
   players on one screen, with undo, hints, and a table that shows exactly how
   the AI scores the position.
3. **Read the code.** The repos as an index: what each one is, what it is
   built with, where to get it, with star and fork counts from the GitHub API.
4. **Follow a year of commits.** A day-by-day chart of my commits drawn from
   the GitHub API, live figures and the three most recently pushed repos.
5. **Who builds this.** A small portrait beside the name, three facts, two
   sentences, then achievements (the CEH course, Bagh Chal 1.1, the Python
   learning path) and skills as rows.

The hero's canvas is the page's signature. Every search has a goal: the flood
spreads ring by ring, each ring easing in on the clock with the newest ring in
the page's one blue, and when it reaches the goal the shortest path is traced
back in blue, cell by cell. At rest the canvas shows the last finished search
(to begin with, one from the centre). Move the pointer and a search starts from
that cell towards a fresh goal; a tap adds another. A caption under the canvas
reports the cells, rings and steps as it runs. With `prefers-reduced-motion`
only the resting picture is drawn. The page closes on an email address set
large.

![BFS and A* after a race on the same maze. A* checked 421 cells to BFS's 525; both paths are 66 steps.](docs/demo.png)

![Bagh Chal on the page, five goats in: the wooden board with tigers and goats, and the side panel with counts, the side and level switches, and the AI explanation.](docs/baghchal.jpg)

## How it is built

| File | What it does |
| --- | --- |
| `index.html` | The page: semantic sections, one `h1`, Open Graph and Twitter tags, a skip link, an inline SVG icon sprite. |
| `tokens.css` | The design tokens: colours in OKLCH, the type scale, spacing, motion, the light block and the dark block derived from it. |
| `base.css` | The base rules every page shares: reset, container, headings, focus ring, the photograph treatment. |
| `styles.css` | The page itself: nav, hero, the five stages, the close, the footer, and the breakpoints at 60rem and 480px. Every colour and length goes through a token. |
| `script.js` | Nav, theme toggle (saved in `localStorage`, follows the OS setting until you pick one), the GitHub API fetch and the commit chart (cached in `sessionStorage`), and the hero canvas. |
| `demos/maze-race.js` | The maze demo: recursive-backtracker generator, braiding, BFS and A\* as generator functions, and one `requestAnimationFrame` loop that steps both in lockstep. |
| `demos/bagh-chal-engine.js` | The Bagh Chal rules engine (neighbour table, placement and movement phases, captures, threefold repetition, undo) and the minimax search with alpha-beta pruning, ported from my Python game. |
| `demos/bagh-chal-worker.js` | A Web Worker that runs the search off the main thread, so even the Hard level never freezes the page. |
| `demos/bagh-chal.js` | The Bagh Chal board, controls and the panel that explains the AI's score. |
| `404.html` | What GitHub Pages serves for unknown paths. |

The page renders fully without JavaScript; the scripts only add the demos and
the live numbers. All motion is gated behind `prefers-reduced-motion`.

Lighthouse on a local build (mobile): Performance 97, Accessibility 100,
Best Practices 100, SEO 100.

## Run it locally

Any static server works. With Python:

```
python -m http.server 8000
```

Then open http://localhost:8000.

## Deploy

GitHub Pages serves the `main` branch. Every push republishes the site at the
URL above; there is no workflow to maintain.
