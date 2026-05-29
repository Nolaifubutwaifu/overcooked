# Overcooked — Roadmap

## Vision

A playable, browser-based **2-player Overcooked clone** with multiple
interesting levels and varied recipes. Long-term: optional networked online
play and phone-as-controller pairing. Short-term: a polished local
couch-co-op slice with several levels.

This file is the source of truth for the project's overall aim.

## Architectural decisions (locked in)

1. **TypeScript + Vite + HTML5 Canvas**, no game framework.
2. **Game state separate from rendering.** `update(state, inputs, dt) → events`
   is pure; render reads state. Networked play later is feasible without rewrite.
3. **Data-driven content.** Recipes, levels, station configs live in `src/data/`
   as TS data files.
4. **Composable items.** Pots, plates, ingredients all use a shared `Item`
   tagged union.
5. **Abstract input layer.** `InputProvider` → keyboard for now, gamepad / phone
   / network later.
6. **Events out, not effects in.** `update()` emits `GameEvent[]` so audio and
   particles are decoupled from game logic.

## Current status: **Phases 0–5 complete** ✅

- Phase 0: scaffold ✅
- Phase 1: single-player core loop ✅
- Phase 2: local 2-player ✅
- Phase 3: pots + soups + dirty plates + sink + 6 recipes ✅
- Phase 4: 3 levels with hazards (conveyors, split kitchen) + star ratings ✅
- Phase 5: menu, level select, 3-2-1-GO intro, end-of-round scorecard, procedural
  sound effects, particles, persisted high scores ✅

## Phases at a glance

### Phase 1 — Core loop ✅
Grid kitchen, WASD movement, E to interact, item state machine, orders, score,
3-min timer.

### Phase 2 — Local 2-player ✅
P1 WASD+E+Space; P2 Arrows+Shift+/. Player-vs-player collision, shared score,
item handoff via counters. Both players can chop the same board for 2× speed.

### Phase 3 — Stations & recipes ✅
Pots, soup, sink, dirty plates, finite plate stock. 6 recipes:
salad, steak, steak salad, onion soup, tomato soup, veggie soup.

### Phase 4 — Multiple levels & hazards ✅
- **First Kitchen**: open layout, basic recipes
- **Conveyor Chaos**: two horizontal conveyors fight your movement
- **Split Kitchen**: a wall divides the kitchen; pass items through a counter
  column
- Star ratings (1/2/3 stars) per level by score thresholds

### Phase 5 — Polish ✅
- Main menu with title screen
- Level select with cards, layout previews, best-score stars
- 3-2-1-GO intro overlay
- End-of-round scorecard with stars + "NEW RECORD" indicator
- Procedural Web Audio sounds: chop, sizzle, ding, fail, tick, click, whoosh
- Particles: chop puffs, serve sparkles, burn smoke, wash splashes
- localStorage high-score persistence
- Mute (M)

## Future phases (stretch goals)

### Phase 6 — Networked 2-player (online)
WebSocket server, server-authoritative state, client prediction. Hardest phase.
Skip if local couch co-op is the end state.

### Phase 7 — Phone-as-controller
Phone pairs with laptop via QR + WebSocket; laptop renders, phone provides input.

### Phase 8 — More content
- More recipes (burgers, fries, sushi, pizza)
- More levels (icy floor, fire spread, moving platforms)
- Daily challenge mode
- Custom level editor
- Better art (sprite atlas instead of emoji)

## File map

```
src/
  main.ts          bootstrap + game loop
  app.ts           scene state machine (menu → level-select → playing → round-end)
  state.ts         createInitialState + tile accessors
  update.ts        pure update — emits GameEvent[]
  render.ts        all rendering (scene-aware)
  input.ts         InputProvider (keyboard via e.code)
  audio.ts         AudioBus — procedural Web Audio sounds
  effects.ts       Particle system + GameEvent type
  types.ts         all type definitions
  constants.ts     tunable numbers
  data/
    levels.ts      Level type + 3 levels + parser
    recipes.ts     6 recipes + recipe lookup
```
