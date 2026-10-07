# מבוך החידות — Fantasy Trivia Labyrinth

A first-person fantasy labyrinth that runs in the browser. Every run generates a new 3D labyrinth. Creatures at its key junctions ask age-appropriate trivia questions in Hebrew. **A correct answer makes the creature reveal the way. A wrong answer doesn't — and the player still walks wherever they choose.** Ten minutes per life, three lives, find the exit.

The entire player-facing experience is Hebrew and right-to-left.

> ידע הוא המפתח. הזמן הוא האויב.

---

## Contents

- [Gameplay](#gameplay)
- [Quick start](#quick-start)
- [Technology](#technology)
- [Architecture](#architecture)
- [Maze generation](#maze-generation)
- [Questions](#questions)
- [Hebrew and RTL](#hebrew-and-rtl)
- [Creatures and route reveals](#creatures-and-route-reveals)
- [Timer, lives and checkpoints](#timer-lives-and-checkpoints)
- [Scoring](#scoring)
- [Leaderboard and backend](#leaderboard-and-backend)
- [Graphics, audio and performance](#graphics-audio-and-performance)
- [Mobile](#mobile)
- [Accessibility](#accessibility)
- [Testing](#testing)
- [Debug and test tools](#debug-and-test-tools)
- [Deployment](#deployment)
- [Security](#security)
- [Extending the game](#extending-the-game)

---

## Gameplay

1. **Title → age group → optional nickname and form of address → (first time) a short tutorial.**
2. **Intro.** The theme's name appears, the camera glides in and the gate closes behind the player.
3. **Explore.** WASD and the mouse on desktop; a joystick and look-drag on touch screens. The magical map only draws what the player has seen.
4. **Creatures wait at meaningful junctions** — places where a wrong turn really costs something. They notice the player and call out. They start speaking once they're in view, so the camera never needs to turn on its own.
5. **Answer one of four.**
   - **Correct:** points, a happy reaction and the creature *reveals the route* in the world. It points, flies to the doorway or breathes fire toward it. The correct archway ignites, runes glow on the floor and a stream of light runs down the corridor.
   - **Wrong:** a small penalty and a disappointed creature. The route stays hidden and the player is free to go anywhere.
   - There is **no route-selection menu**, and the player is **never moved, rotated or teleported** after a question.
6. **The clock.** Each life has 10:00. When it reaches zero, exactly one life is lost, the clock resets to 10:00 and the labyrinth returns the player to the last checkpoint. After the third life: **נפסלת**.
7. **The exit.** Its doors open as the player approaches. Stepping into the light plays a short victory sequence, then a transparent score breakdown, then the option to submit the score to the leaderboard for that age group.

Extras that support the core loop without replacing it:

- **Treasures** (small, capped bonus; lost if not secured at a checkpoint).
- **Rare specials in deep dead ends.** The oracle sells a map revelation for 100 points. The wandering merchant trades two treasures for a minute.
- **Rare atmospheric events:** a dragon's silhouette crossing the sky, distant roars, a ghost drifting across a far corridor, firefly swarms, whispers. Each has a caption.

## Quick start

Requires Node 20 or later.

```bash
npm install
npm run dev          # http://localhost:5173
npm run check        # typecheck + lint + tests + production build
```

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server (includes the debug panel and test API) |
| `npm run build` | Typecheck and production build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | `tsc -b --noEmit` (strict) |
| `npm run lint` | ESLint (typescript-eslint, react-hooks) |
| `npm test` | Vitest unit tests |
| `npm run validate:questions` | Validate only the question database |

### Environment variables

Copy `.env.example` to `.env.local`. Both values are optional:

```
VITE_SUPABASE_URL=        # https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=   # the PUBLIC anon key — never the service-role key
```

Without them, the leaderboard is stored on the player's device in `localStorage`, and the game says so in the UI.

## Technology

- **React 19 + TypeScript (strict) + Vite**: UI, menus and HUD.
- **three.js**, used directly rather than through React Three Fiber. The game owns its frame loop, pooled lights and merged geometry, and React only renders the interface on top. This keeps per-frame work out of React reconciliation and gives exact control over draw calls.
- **zustand**: a small store that mirrors the state machine for the UI.
- **Web Audio API**: all sound and music are synthesised at runtime.
- **@fontsource** (Frank Ruhl Libre, Heebo): Hebrew fonts bundled with the app, so they work offline.
- **Vitest** for unit tests and **Playwright** for browser playthrough scripts.
- **Supabase** (optional) for the online leaderboard.

- **Photoscanned assets from [Poly Haven](https://polyhaven.com)** (CC0, public domain): 34 props and set pieces and 19 PBR material sets, optimised for the web by `scripts/assets/fetch-polyhaven.mjs` (meshopt-compressed glTF, WebP textures). They are served from `public/assets/`, with credits in [public/assets/CREDITS.md](public/assets/CREDITS.md).
- **Creatures are sculpted procedurally** from signed distance fields and meshed in Web Workers (see [Creatures](#creatures-and-route-reveals)). Sky, music and sound effects are still generated at runtime.

## Architecture

```
src/
  app/App.tsx                 phase → screen routing, engine mount
  config/gameConfig.ts        all tunables: timer, lives, scoring, maze profiles, quality profiles
  content/he/                 every player-facing string (Hebrew), separate from logic
    ui.ts  creatures.ts  environments.ts  tutorial.ts  gender.ts
    questions/                question banks per age group + authoring helpers
  game/
    core/        GameController (rules & flow), Engine (renderer/loop), AttractScene (title),
                 quality detection, devApi (development only)
    maze/        generator, validation, grid helpers, types
    player/      PlayerController (first-person), CollisionWorld (AABB + circle)
    creatures/   Creature (layered animation), CreatureManager (casting, streaming), RouteHint
      sculpt/    SDF sculpting: Sculpt (authoring), mesher (+ worker, pool), anatomy kit
      species/   16 sculpted creatures + the oracle and the merchant
    questions/   selector (no repeats, difficulty ramp, variety), validator
    scoring/     score breakdown and bounds
    session/     RunSession: clock, lives, checkpoints, treasures, snapshot/restore
    render/      MazeWorld (structure, fixtures, gate, exit), architecture (masonry kit),
                 decor (vignettes, hero rooms, encounter staging), assets (glTF/PBR loading),
                 envMaterial / pbrMaterials (scanned surfaces), liquids, envProbe, noise textures
    effects/     flames, smoke, ambient particles, pooled torch lights, treasures
    events/      rare atmospheric events
    audio/       AudioEngine: ambience, adaptive music, SFX, creature voices
    input/       unified keyboard/mouse/touch input
  services/      storage, nickname validation, leaderboard (local + Supabase)
  state/         GameMachine (explicit phases & transitions) + zustand store
  ui/            screens, HUD, components, styles
supabase/migrations/          leaderboard schema + server-side validation
tests/                        unit tests
scripts/screenshots/          Playwright playthroughs and visual-review tools (development aids)
scripts/assets/               asset download and optimisation pipeline
public/assets/                CC0 models and materials (see CREDITS.md)
```

### State machine

The game is driven by an explicit state machine (`src/state/machine.ts`), not by scattered booleans:

```
BOOT → MENU ⇄ (SETTINGS | HOW_TO_PLAY | LEADERBOARD)
     → RESUME_PROMPT
MENU → AGE_SELECTION → PLAYER_SETUP → (TUTORIAL) → LOADING → INTRO_CINEMATIC → PLAYING
PLAYING → CREATURE_ENCOUNTER → QUESTION_ACTIVE → QUESTION_RESULT → ROUTE_HINT | PLAYING
PLAYING → SPECIAL_ENCOUNTER → PLAYING
(any clock phase) → PAUSED → (back to the exact phase) | SETTINGS | MENU
(any clock phase) → LIFE_LOST → CHECKPOINT → PLAYING   |   LIFE_LOST → GAME_OVER
PLAYING | ROUTE_HINT → VICTORY → SCORE_SUMMARY → LEADERBOARD | LOADING | MENU
```

- `MOVEMENT_PHASES` (`PLAYING`, `ROUTE_HINT`): the player can walk.
- `CLOCK_PHASES`: the clock runs. It keeps running during questions — knowledge under pressure — and stops while paused. Set `pauseTimerDuringQuestions` to change this.
- Illegal transitions are rejected and logged in development.

## Maze generation

`src/game/maze/generator.ts`:

1. **Growing-tree carving.** This blends recursive backtracking (long corridors) with Prim-like branching. `corridorBias` is set per age group.
2. **Entrance and exit.** The entrance is on a random side; the exit is chosen among the farthest boundary cells on a different side.
3. **Chambers.** 2×2 to 3×2 rooms with tall vaulted ceilings in roofed themes, each with a centrepiece. They act as checkpoints and landmarks.
4. **Braiding.** A fraction of dead ends is opened into loops, which creates alternative (usually longer) routes.
5. **Analysis.** BFS distances to and from the exit, the shortest solution path, junctions and dead ends.
6. **Meaningful junctions.** A cell qualifies if it has three or more exits, is not inside a room, has exactly one exit that strictly shortens the distance to the exit, and has at least one wrong turn that leads somewhere real. Creatures are placed mostly on the solution path, and about a third off it to help players who wander, at least three cells apart.
7. **Treasures and specials.** Treasures go mostly in dead ends; specials go only at the end of deep side branches.
8. **Validation** (`validate.ts`). The entrance and exit exist, every cell is reachable, the solution path is valid, the path length is within bounds (neither trivial nor absurd), and there are enough junctions and encounters. An invalid maze is regenerated with a derived seed.

The generator is **fully deterministic per seed**, including theme, creature cast and question selection. That makes runs reproducible, makes resuming exact, and leaves the future **daily challenge** a one-liner: `dailySeed(date, ageGroup)` in `src/utils/rng.ts`.

| Age | Grid | Creatures | Character |
| --- | --- | --- | --- |
| 5–7 | 8–9 | 4 | long, simple corridors |
| 8–10 | 10–11 | 5 | |
| 11–13 | 12–14 | 6 | |
| 14–15 | 14–16 | 7 | |
| 16+ | 16–19 | 8 | more branching and loops |

**Not a grid to the eye.** Walls are subdivided and gently displaced (cave rock bulges more than dressed masonry). Ruins crumble course by course, junction exits get stone-by-stone arches, corner posts become moulded pilasters, and walls carry plinth courses and copings. Chambers hold hero set-pieces, cave vaults sag between walls, and narrative prop scenes and rubble are placed with instancing (see [Graphics](#graphics-audio-and-performance)).

## Questions

- **660 hand-written Hebrew questions:** 5–7 (122), 8–10 (127), 11–13 (114), 14–15 (111), 16+ (186). The 16+ bank is deliberately hard: about half are rated hard or expert, with plausible distractors and known traps.
- Authoring format (`src/content/he/questions/*.ts`). The correct answer is written first and the order is shuffled every time the question is shown:

  ```ts
  ['history', 'expert', 'מי היה קיסר רומא בשנה שבה נחרב בית המקדש השני?', ['אספסיאנוס', 'טיטוס', 'נירון', 'אדריאנוס'], 'טיטוס פיקד על המצור…'],
  ```

  Ids are generated from the file order (`a-001`…). Append new questions at the end to keep existing ids stable.
- **Selection** (`QuestionSelector`): no repeats within a run; recently seen questions are avoided across runs (`localStorage`); the same category never comes twice in a row; difficulty ramps up as the player gets deeper into the labyrinth; and the order is deterministic per seed.
- **Validation** (`validateQuestions`, run by the tests and at startup in development) checks for exactly four non-empty, distinct answers, exactly one correct answer, a valid age group, category and difficulty, Hebrew question and explanation text, unique ids, no duplicate question text, and that **the correct answer is not conspicuously longer** than every distractor.
- Formulas and Latin symbols are wrapped with `ltr()` so they read correctly inside RTL text.

## Hebrew and RTL

- `<html lang="he" dir="rtl">`. Layout uses logical CSS properties (`inset-inline-*`, `margin-inline-*`) throughout.
- **No player-facing strings live in components.** Everything is in `src/content/he/`. The locale layer is ready for future languages; English is not implemented.
- **Gendered address.** Hebrew second person is gendered, so the player picks "לשון זכר / לשון נקבה" during setup and in settings. Strings are either neutral or `{ m, f }`, resolved by `g()` / `useT()`.
- **Numbers inside RTL text** (clocks, scores, `5–7`, `16+`, negative values) are rendered in `<bdi dir="ltr">` via `<Num>`. Answer buttons use `unicode-bidi: plaintext`, and key names and ranges inside sentences use Unicode isolates.
- **RTL affects only the interface.** The 3D world and the controls are conventional: W is forward and the joystick sits physically on the left.
- Keyboard input uses **physical key codes**, so WASD works with a Hebrew keyboard layout without switching languages.

## Creatures and route reveals

There are 16 creatures: wizard, goblin, fairy, talking raven, dragon cub, forest spirit, stone golem, elf prophetess, mushroom-folk, ghost librarian, crystal guardian, enchanted fox, sphinx, troll, herb witch and wise owl. There are also two special characters, the oracle and the wandering merchant. Each has its own Hebrew personality lines (greeting, ask, correct, hint, wrong, revisit) and synthesised voice.

**How they are built.** No creature is assembled from separate primitive meshes. Each species (`src/game/creatures/species/`) is sculpted as one continuous organic surface:

- Shapes (ellipsoids, tapered capsules, blades, boxes, tori) are combined as signed distance fields with smooth unions and carves, plus surface relief (bark grooves, cloth folds, cracks).
- The field is meshed with surface nets, smoothed (Taubin) and given per-vertex colour, roughness, emission and a detail family.
- The head is meshed separately at about 2.5× the resolution, so faces keep their eyelids, lips and nostrils.
- Every vertex is skinned automatically to a bone hierarchy, giving a single skinned mesh per creature.
- Eyes are real textured eyeballs with a clear cornea, set inside lidded sockets.
- A shared anatomy kit (`sculpt/anatomy.ts`) provides bipeds, quadrupeds, faces with a hinged jaw, hands, robes, hoods, beards, hats and hair.
- Micro-detail is added in the shader: skin pores, bark, scales, feathers, glowing lava cracks, rune glyphs and crystal facets. It is sampled from a precomputed 3D noise texture, so it is cheap to compile and to run.

**Building at load time.** Meshing runs on a pool of Web Workers with priorities and cancellation:

- The run waits only for the two nearest creatures. The rest are sculpted while the player explores, in route order.
- Encounters only trigger once their creature is in place.
- A late arrival stays hidden until its shaders are compiled, so it never causes a hitch.
- Results are memoised for the session.

**Animation** (`Creature.ts`) is layered and procedural:

- Each species has its own stance. On top of that come breathing, weight shift and idle sway, blinking, and head and neck tracking of the player.
- Mood layers cover noticing (a hop), talking (with the jaw opening), joy (arms up with a bounce), sadness (a slump) and turning away after a wrong answer.
- Walking and quadruped gaits, wing flaps and tail sway.

**Staging.** Each creature is staged in a way that suits its biome:

- **Ruins and temple:** a blind arch with candles.
- **Forest:** roots, ferns and a small fire.
- **Caves:** flanking crystal clusters.
- **Volcanic:** a fire pit.

Every stage includes a soft key light, so creatures are never lost in darkness.

**Route reveal** (`RouteHint`). On a correct answer:

- Walkers step toward the doorway and physically point at it with an arm, a wing or the head. Flyers (fairy, raven, owl, ghost) fly to it.
- The arch outline ignites, a rune circle appears on the floor, a light fills the doorway and a particle stream flows from the creature through the arch.
- The creature also says the direction relative to where the player is looking ("הדרך הנכונה מימינך").
- A wrong answer reveals nothing.

## Timer, lives and checkpoints

`RunSession` is pure logic and unit-tested.

- 10:00 per life and 3 lives, so a run lasts at most about 30 minutes.
- Under 2:00 the music tightens and the clock turns amber. Under 0:30 there is a pulse, a heartbeat vignette and soft ticking — restrained by design.
- On expiry: exactly one life is lost, the clock resets to 10:00, a short "the labyrinth forced you back" sequence plays and the player returns to the latest checkpoint. Treasures picked up since that checkpoint go back into the labyrinth.
- Checkpoints are the entrance, every answered creature, chambers and the midpoint of the route.
- The game autosaves every 4 seconds and when the page is hidden. After a refresh it asks "המשחק הקודם עדיין ממתין לך. להמשיך?". Only completed runs can be submitted.

## Scoring

All values are configurable in `GAME_CONFIG.scoring`:

| Component | Rule |
| --- | --- |
| Trivia | 100 × difficulty multiplier (easy 1.0, medium 1.25, hard 1.5, expert 2.0) per correct answer |
| Time bonus | 1 point per second left on the clock (victory only) |
| Lives bonus | 150 per remaining life (victory only) |
| Treasures | 25 each, **capped at 250** |
| Route efficiency | up to 300 × (shortest route ÷ walked route)² (victory only) |
| Penalties | −25 per wrong answer, −100 per life lost, the oracle's price |

The total is clamped to between 0 and 20,000. The summary screen shows every line of the calculation.

## Leaderboard and backend

- There is a separate table for **each age group**. Groups are never mixed, either in the UI or in the database queries. Columns are rank, nickname, score, correct answers, time, lives lost and date.
- Nicknames are optional, 2–16 characters, stripped of bidi overrides, zero-width characters and niqqud, limited to letters, digits and a few symbols, and passed through a basic Hebrew + English profanity filter. No account and no real name are required. Players are identified only by a random per-device UUID.
- **Local mode** (default): an on-device top 50 per age group.
- **Online mode (Supabase).** Run the migration in `supabase/migrations/` (for example with `supabase db push`, or paste it into the SQL editor), then set the two `VITE_` variables. The migration creates `leaderboard_entries` with row-level security enabled and no direct table access for clients, plus two functions:
  - `get_leaderboard(age_group, limit)`: read-only, sorted, capped at 100 rows.
  - `submit_run(payload)`: a `SECURITY DEFINER` function that **re-validates everything server-side**. It checks types and ranges, nickname rules, consistency of answer and treasure counts with the labyrinth, lives, and time bounds. It rejects runs faster than the fastest possible movement along the shortest route and runs whose wall clock is shorter than their play time. It **recomputes the score**, rate-limits each player (one submission per 20 seconds, 40 per day) and rejects duplicate run ids.
- The client applies the same rules first (`src/services/leaderboard/validation.ts`, with tests for each tampering case). Failed submissions are queued and retried when the connection returns. If the leaderboard is unreachable, the UI shows "טבלת המובילים אינה זמינה כרגע." and the game continues.

## Graphics, audio and performance

**Biomes.** Five biomes start a run: ruins, enchanted forest, crystal caverns, volcanic depths and the forgotten temple. Frozen, mystic and castle variants appear as the second biome of a run. Each run crosses from one biome into a neighbouring one a little past the halfway point of the true route:
- The crossover blends gradually: wall and floor materials, fog, sky light, exposure, the player's lantern, ambient particles, light fixtures, props, the creature cast and the ambience bed (crossfaded).

**Surfaces.** Walls, trims, floors and ceilings use photoscanned PBR sets (albedo, normal, AO/roughness/metal) through a custom material (`envMaterial.ts`) with:
- stochastic anti-tiling;
- large-scale tonal variation;
- grime toward the ground;
- contact shadows where floors meet walls;
- a settling layer (moss, ash or snow) on tops, crevices and wall feet;
- glossy wet patches on floors;
- the height-aware blend into the second biome.

A pre-filtered environment probe gives every glossy surface something to reflect.

**Architecture** (`architecture.ts`):
- Masonry arches built stone by stone: voussoirs, a keystone, quoined piers and spandrel masonry.
- Moulded pilasters, plinth courses and copings.
- Crumbled wall tops that step down course by course.
- Niches and blind arches, and cave vaults that sag between walls.

**Set dressing with a story** (`decor.ts`):
- Guard posts, storerooms, reading nooks, wayside shrines, abandoned camps in dead ends, roots breaking through masonry, toppled columns and crystal growths, all built from the scanned props.

**Hero locations in the chambers:**
- **Ruins:** a ruined courtyard with a colossal statue.
- **Temple:** a sanctum with a dais and fire bowls.
- **Forest:** a druid ring of standing stones.
- **Caverns:** a crystal lake with a cascade and giant crystals.
- **Volcanic:** a lava forge pool.

**Lighting and effects:**
- ACES tone mapping, exponential fog and moonlight shadows.
- 2–8 pooled point lights cross-faded between nearby fires.
- Bloom with MSAA or SMAA, and GTAO ambient occlusion on ULTRA.
- GPU flames, smoke columns over fires, falling leaves in the forest and biome particles (fireflies, embers, motes, dust).
- Animated water with bioluminescence, lava and waterfalls.
- A gentle cinematic narrowing of the field of view during conversations (never moving or turning the camera; off with reduced motion).

**Performance:**
- Static geometry is merged into spatial chunks for frustum culling, and props are instanced.
- Every scanned prop is normalised onto one shared material layout, so the library compiles to two or three shader programs.
- All shaders are compiled asynchronously during loading, for the buffer the scene is actually drawn into.
- Textures are decoded off the main thread and uploaded during loading.
- Particle and smoke animation runs on the GPU.

**Quality** is chosen automatically, or set to low, medium, high or **ULTRA**. ULTRA adds finer creature sculpts, a 4096 shadow map, eight lights, denser props and GTAO. Resolution also adapts at runtime if the frame rate drops.

**Measured** with Playwright on a modest **Intel HD Graphics 520** laptop:
- 35–55 FPS at high quality in play.
- About 11–17 s from "enter" to the intro on a cold start. This is dominated by Direct3D shader compilation and creature meshing on a 2-core CPU, and is far shorter on current hardware.

**Audio** is fully synthesised:
- Per-biome ambience that crossfades at the crossover: wind, drips, crickets, fire crackle, lava rumble, ice chimes and whispers.
- A generative adaptive score that moves between exploration, creature, tension (under 2:00) and urgency (under 0:30), plus victory and game-over stingers.
- Footsteps that change with the floor surface, babbling creature voices and UI sounds.
- Master, music, effects and mute settings are saved locally.

## Mobile

- A floating joystick on the left half of the screen and a look-drag pad on the right. Pushing the stick to its edge breaks into a run.
- Safe-area insets (notches), dynamic viewport height, no page scrolling or pinch-zooming during play, and touch targets of at least 44–48 px.
- Landscape is preferred, and a dismissible hint suggests rotating. Portrait still works: the HUD stacks, the map tucks under the buttons and the menus scroll.
- Lower default quality on phones: fewer particles, no shadows and lower resolution.

## Accessibility

- A reduced-motion setting (on by default when the system prefers reduced motion). It removes head bob, breathing sway, camera shake and cinematic camera moves, and shortens UI animation.
- Feedback never relies on colour alone: correct and wrong answers are marked with ✓ and ✗, text and position. Atmospheric sounds have captions.
- Menus are fully keyboard-navigable with focus management. Answers can be chosen with keys 1–4, and Enter or Space continues. Dialogs and live regions are labelled for screen readers.
- Readable typography at large sizes, with high contrast on dark translucent panels.

## Testing

```bash
npm test
```

There are 77 unit tests covering:

- **Mazes:** solvability for every age group across many seeds, determinism, symmetric walls and a closed boundary, meaningful-junction placement, correct-route correctness, spacing between creatures, complexity scaling, and generation speed.
- **Questions:** every validation rule, bank sizes, answer-position randomisation and its distribution, no repeats, category variety, difficulty ramp and determinism.
- **Session and rules:** 10:00 and 3 lives, exactly one life lost per expiry with a reset and return to checkpoint, game over after the third expiry (30 minutes in total), tension and urgency events, a frozen clock while paused, wrong answers never costing a life, treasure banking, snapshot and restore, and the merchant trade.
- **Scoring:** every component, clamping, the treasure cap and the theoretical maximum.
- **State machine:** the happy path, no route-selection phase, illegal transitions, and pause/resume to the exact phase.
- **Services:** a legitimate leaderboard run is accepted and 14 tampering cases are rejected; nickname rules and profanity (including disguised spellings); collision (closed walls block, open passages pass, bounds hold).
- **Sculpting and biomes:** the mesher produces closed, smooth, correctly skinned surfaces, carves, keeps hard materials crisp, and splits head and body passes correctly; the biome crossover is monotonic along the route.

The browser playthrough scripts in `scripts/screenshots/` drive the real game with Playwright, using the GPU, while the dev server runs on port 5199 (`npx vite --port 5199`):

- `shoot.mjs`: the full flow, from title to leaderboard. Run with `VIEW=desktop|phone|portrait`.
- `themes.mjs`: every theme, with screenshots and FPS.
- `flows.mjs`: three expiries → game over, refresh → resume, pause and settings, reduced motion.
- `specials.mjs`: the oracle and the merchant.
- `world.mjs`: environment review for a biome pair (start, chambers, crossover, encounter and reveal). Run with `THEME=ruins THEME2=forest QUALITY=high`.
- `cast.mjs`: photographs every creature of a run in place, with the HUD hidden.
- `creature.mjs`: the creature turntable (`NAME=wizard,elf VIEWS=front,face,side MOOD=happy`).
- `phases.mjs` and `programs.mjs`: load-time and shader-program diagnostics.

## Debug and test tools

These are available in development only and are removed from production builds.

- Press <kbd>`</kbd> to open the debug panel: FPS, draw calls, triangles, phase, seed, position, cell and current question. Its buttons can teleport to a creature, the exit or the checkpoint; skip dialogue; answer correctly or wrongly; set the clock; expire the timer; add or remove a life; force a victory or game over; regenerate the maze; and show collider boxes.
- URL overrides: `?seed=123` reproduces a labyrinth, `?theme=castle` forces a theme, `?theme2=forest` forces the second biome and `?pbr=0` falls back to procedural textures.
- `?preview=wizard&view=face` opens a creature turntable instead of the game (views: front, close, face, side, back; `&mood=point|happy|talk|sad`).
- `window.__tm` exposes the same hooks to automated tests.

## Deployment

`npm run build` produces a static site in `dist/` that can be hosted anywhere (Netlify, Vercel, Cloudflare Pages, S3, GitHub Pages). Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the host's build environment to enable the online leaderboard. Once loaded, the game needs no network connection; only leaderboard calls use it.

## Security

- No secrets are kept in the repository. `.env*` files are git-ignored apart from `.env.example`.
- Only the public Supabase anon key ever reaches the browser. The table cannot be accessed directly; all writes go through the validating `submit_run` function.
- All user input (nicknames) is sanitised on the client and validated again on the server. React escapes everything it renders, and nothing uses `dangerouslySetInnerHTML`.
- The anti-cheat measures stop casual tampering. They cannot make a client-side game fully cheat-proof; for example, the server does not replay the maze from its seed.

## Extending the game

- **Questions:** append rows to `src/content/he/questions/age*.ts`, then run `npm run validate:questions`.
- **Themes:** add an entry to `THEMES` (`src/game/environments/themes.ts`), its look to `BIOME_LOOK` and neighbours to `BIOME_NEIGHBOURS` (`biomes.ts`), and its name to `THEME_TEXT`.
- **Creatures:** sculpt a species in `src/game/creatures/species/` with the anatomy kit, register it in `SPECIES`, and add a voice to `CREATURE_VOICES` and lines to `CREATURE_TEXT`. Review it with `?preview=<name>`.
- **Assets:** add a Poly Haven model or material to `MODELS` or `TEXTURES` in `scripts/assets/fetch-polyhaven.mjs` and run `node scripts/assets/fetch-polyhaven.mjs <name>`. Downloads are cached in `.asset-cache/`, and the credits file is regenerated.
- **Balance:** everything is in `src/config/gameConfig.ts` (timer, lives, scoring, maze profiles per age, quality profiles).
- **Daily challenge:** start a run with `dailySeed(new Date(), ageGroup)` and give the leaderboard a `mode` column.
- **Another language:** add `src/content/<locale>/` alongside `he/` and switch `dir` accordingly.
- **Research:** see [docs/RESEARCH.md](docs/RESEARCH.md) for the competitive check behind the design.
