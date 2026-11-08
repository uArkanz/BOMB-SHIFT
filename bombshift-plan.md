# BOMB//SHIFT — Development Plan (Revised v4)

## Top-Level Overview

**Goal:** Build a modern, functional reimagining of Bomberman called BOMB//SHIFT, using React + TypeScript + Vite for the application shell, Phaser 3 for the game engine, and Supabase for backend (auth, profiles, history, rankings).

**Scope (v1):**
- Full playable Solo mode (wave-based AI enemies, progressive difficulty)
- Full playable 1v1 Local mode (two players, same PC, independent key schemes)
- SHIFT mechanic (bomb-triggered teleport — nearest safe cell, with activation window and cooldown)
- Arena dynamic events (periodic automatic map reconfigurations with safety validation)
- Neon / futuristic visual identity with particles, glitch effects, and dynamic lighting
- Supabase authentication for Player 1; Player 2 is a named local guest
- Match results submitted exclusively via Supabase Edge Functions (no direct client inserts)
- Two independent rankings: Solo (best score) and 1v1 (wins + win-rate tiebreaker)
- Player profile and match history
- Test suite covering bombs, explosions, SHIFT, AI, collisions, arena events, and persistence

**Non-goals for v1:**
- Online multiplayer (network play)
- Mobile / touch controls
- More than two simultaneous human players
- Paid features or monetization

**Stack:**

| Layer | Technology |
|---|---|
| UI Shell | React 18 + TypeScript + Vite |
| Game Engine | Phaser 3 |
| Styling | CSS Modules + custom design tokens |
| Backend | Supabase (Auth, PostgreSQL, Edge Functions) |
| State (UI) | React Context + useReducer |
| Testing | Vitest + @testing-library/react |

**Architecture Pattern:**
React owns all screens outside the game (menus, auth, profile, rankings). Phaser owns the game canvas. A typed `GameEventBus` bridges the two without coupling them. React mounts/unmounts the Phaser instance as the player navigates to/from the game screen. All data writes go through Supabase Edge Functions — the client never calls `insert()` on match result tables directly.

---

## Sub-Tasks

---

### ST-01 — Project Scaffolding & Tooling

**Status:** `[x] done`

**Intent:**
Bootstrap the Vite + React + TypeScript project, install all required dependencies, configure path aliases, and establish the base folder structure. Nothing is playable yet — this is the foundation everything else builds on.

**Expected Outcomes:**
- `npm run dev` starts the dev server with no errors
- `npm run build` produces a clean production bundle
- Phaser 3 renders a blank canvas inside a React component
- Supabase client is initialized and can ping the project
- Vitest is configured and `npm run test` executes
- ESLint + Prettier are configured and passing
- Folder structure matches the architecture defined in the **Folder Structure** section

**Todo List:**
1. Initialize Vite project: `npm create vite@latest . -- --template react-ts`
2. Install runtime dependencies: `phaser`, `@supabase/supabase-js`, `react-router-dom`
3. Install dev dependencies: `vitest`, `@testing-library/react`, `jsdom`, `eslint`, `prettier`, `@types/node`
4. Create `.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` placeholders
5. Configure `vite.config.ts`: path alias `@/` → `src/`, test environment `jsdom`
6. Create the full folder structure (see **Folder Structure** section)
7. Create `src/lib/supabase.ts` — Supabase client singleton (reads env vars)
8. Create `src/game/PhaserGame.tsx` — React component that mounts Phaser into a `<div ref>` and calls `game.destroy(true)` in `useEffect` cleanup
9. Create `src/game/GameEventBus.ts` — typed event emitter bridge (React ↔ Phaser); defines all event names as a const enum
10. Verify `npm run dev`, `npm run build`, and `npm run test` all pass cleanly

**Relevant Context:** Blank workspace — start from scratch.

---

### ST-02 — Supabase Schema, Edge Functions & Auth

**Status:** `[ ] pending`

**Intent:**
Define and apply the Supabase database schema, create Edge Functions for all match-result writes, enable email/password authentication, and build the React auth screens. All data writes go through Edge Functions — never direct client inserts on match tables.

**Expected Outcomes:**
- Tables exist: `profiles`, `solo_matches`, `pvp_matches`
- RLS on `profiles` allows users to read/write their own row only
- `solo_matches` and `pvp_matches` are **not writable by the client** — only the Edge Functions have insert rights via the service role
- Edge Function `submit-solo-result` validates JWT, ownership, all field bounds, UUID format, and idempotency before inserting
- Edge Function `submit-pvp-result` validates JWT, ownership, `player2_name` constraints, UUID format, and idempotency before inserting
- Both Edge Functions reject the entire payload if any single validation fails — no partial writes
- A logged-in user's profile is accessible via `useAuth()` hook
- Guest (unauthenticated) users can play but their results are never submitted; a post-match invite to register is shown
- Auth screens (Login, Register) are navigable from the main menu
- Session persists across page reloads

**Authentication Policy (canonical):**
- **Solo mode:** authentication is optional. If authenticated, result is submitted via Edge Function and appears in rankings. If guest, result is discarded; post-match screen shows a "Create account to save your score" invite.
- **1v1 mode:** Player 1 (host) must be authenticated to submit a ranked result. If Player 1 is a guest, the match plays normally but is not recorded. Player 2 is always a named guest regardless of whether they have an account.

**Todo List:**
1. Create Supabase project (manual — credentials go into `.env.local`)
2. SQL migration — `profiles` table:
   - `id` (uuid PK, FK → auth.users), `username` (text, unique), `avatar_url` (text nullable), `created_at`
   - RLS: authenticated user can SELECT/UPDATE their own row; SELECT is public (for rankings joins)
3. SQL migration — `solo_matches` table:
   - `id` (uuid PK), `match_uuid` (uuid v4, unique — idempotency key), `player_id` (FK → profiles, NOT NULL), `score` (int NOT NULL CHECK score >= 0), `waves_survived` (int NOT NULL CHECK waves_survived >= 1), `kills` (int NOT NULL CHECK kills >= 0), `total_duration_seconds` (int NOT NULL), `wave_durations` (int[] NOT NULL — one element per wave, for server-side time-bonus validation), `played_at` (timestamptz DEFAULT now())
   - RLS: **no client insert**; SELECT is public for rankings; player can SELECT their own rows
4. SQL migration — `pvp_matches` table:
   - `id` (uuid PK), `match_uuid` (uuid v4, unique), `player1_id` (FK → profiles, NOT NULL), `player2_name` (text NOT NULL, CHECK char_length(player2_name) BETWEEN 1 AND 20), `result` (enum: `win` | `loss` | `draw`), `duration_seconds` (int NOT NULL), `played_at` (timestamptz DEFAULT now())
   - RLS: **no client insert**; SELECT is public; player can SELECT their own rows
5. Create Edge Function `submit-solo-result`:
   - Step 1 — Auth: validate JWT; extract `jwt.sub`; reject if unauthenticated (401)
   - Step 2 — Ownership: assert `payload.player_id === jwt.sub`; reject if mismatch (403)
   - Step 3 — UUID: validate `match_uuid` matches regex `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`; reject if malformed (400)
   - Step 4 — Bounds: `score` in [0, 500 000]; `waves_survived` in [1, 50]; `kills` in [0, 400]; `wave_durations` is a non-empty int array with `length === waves_survived` and every element > 0; reject any violation (400)
   - Step 5 — Idempotency: upsert with `match_uuid` as conflict key; on conflict do nothing and return 200
   - Step 6 — Insert: use service-role client to insert validated record
6. Create Edge Function `submit-pvp-result`:
   - Step 1 — Auth: validate JWT; extract `jwt.sub`; reject if unauthenticated (401)
   - Step 2 — Ownership: assert `payload.player1_id === jwt.sub`; reject if mismatch (403)
   - Step 3 — UUID: validate `match_uuid` as UUID v4 (same regex); reject if malformed (400)
   - Step 4 — Bounds: `result` must be exactly `win`, `loss`, or `draw`; `player2_name` non-empty string, stripped of leading/trailing whitespace, length 1–20 chars after stripping; `duration_seconds` > 0; reject any violation (400)
   - Step 5 — Idempotency: upsert with `match_uuid` as conflict key; on conflict do nothing and return 200
   - Step 6 — Insert: use service-role client to insert validated record
7. Create `src/hooks/useAuth.ts` — session, user, login, logout, register, loading state; expose `isAuthenticated: boolean`
8. Create `src/pages/auth/LoginPage.tsx` and `RegisterPage.tsx`
9. Wire auth state into `App.tsx` router (protected routes redirect to `/auth/login`); guest access to `/play` is permitted but rankings submission is skipped

**Relevant Context:**
- `src/lib/supabase.ts` from ST-01
- Edge Functions live in `supabase/functions/` and are deployed with Supabase CLI

---

### ST-03 — Navigation & UI Shell

**Status:** `[x] done`

**Intent:**
Build the full navigation skeleton: main menu, mode select, settings stub, and the game screen container. Establish the design system (neon color tokens, typography, button styles) so every subsequent screen is visually consistent from the start.

**Expected Outcomes:**
- Main Menu renders with game title, Play, Rankings, Profile, and Settings options
- Mode Select screen offers Solo and 1v1 Local with descriptions
- All routes are navigable without errors
- CSS custom properties define the neon palette, fonts, and spacing globally
- Screens use the design system — no inline colors or magic numbers anywhere

**Todo List:**
1. Configure `react-router-dom` routes in `App.tsx`:
   - `/` → `MainMenuPage`
   - `/play` → `ModeSelectPage`
   - `/play/solo` → `GamePage` (mode=solo)
   - `/play/1v1` → `GamePage` (mode=1v1)
   - `/rankings` → `RankingsPage`
   - `/profile` → `ProfilePage` (protected)
   - `/settings` → `SettingsPage`
   - `/auth/login` → `LoginPage`
   - `/auth/register` → `RegisterPage`
2. Create `src/styles/tokens.css` — CSS custom properties:
   - Neon palette: `--color-cyan`, `--color-magenta`, `--color-bg`, `--color-surface`, `--glow-sm`, `--glow-md`
   - Typography: `--font-display` (pixel/arcade), `--font-body`
   - Spacing scale: `--space-1` … `--space-8`
3. Create `src/styles/global.css` — CSS reset + font imports
4. Create base UI components: `Button.tsx`, `Card.tsx`, `Logo.tsx`, `LoadingSpinner.tsx`
5. Build `MainMenuPage.tsx`: animated logo, menu items, auth-aware header (shows username or Login CTA)
6. Build `ModeSelectPage.tsx`: Solo vs 1v1 cards with descriptions and visual icons
7. Build `RankingsPage.tsx` shell (data wired in ST-12)
8. Build `SettingsPage.tsx` shell (audio volume wired in ST-13)

**Relevant Context:**
- `PhaserGame.tsx` is mounted inside `GamePage`
- Auth state from `useAuth()` drives the header

---

### ST-04 — Phaser Game Bootstrap & Arena Renderer

**Status:** `[ ] pending`

**Intent:**
Initialize the Phaser 3 game inside its React wrapper, build the grid-based arena renderer, and establish the core data structures (grid state, cell types, tile graphics). No gameplay logic yet — just a correctly rendered and structurally sound map.

**Expected Outcomes:**
- Phaser canvas mounts and unmounts cleanly with the React component lifecycle
- A 13×13 grid arena renders with cell types: `SOLID_WALL`, `DESTRUCTIBLE`, `FLOOR`
- Camera fills the browser window (fullscreen scale mode, `Phaser.Scale.FIT`)
- Arena layout is generated from a config object — not hardcoded per-tile
- Player spawn corners (top-left, bottom-right) are always guaranteed clear (3×3 area)

**Todo List:**
1. Create `src/game/config.ts`:
   - Phaser `GameConfig`: scale mode `FIT`, base canvas 832×832 (64 px × 13 tiles)
   - Scene list: `BootScene`, `PreloadScene`, `GameScene`, `HUDScene`
2. Build `BootScene.ts` — brief loading screen while `PreloadScene` runs
3. Build `PreloadScene.ts` — loads all spritesheets, tilesets, audio keys, and particle atlases
4. Create `src/game/types/GridTypes.ts`:
   - Enum `CellType`: `FLOOR`, `SOLID_WALL`, `DESTRUCTIBLE`
   - Enum `EntityType`: `PLAYER`, `ENEMY`, `BOMB`
   - Interface `GridCell`: `{ type: CellType; occupant: EntityType | null }`
   - Interface `ArenaState`: `{ grid: GridCell[][]; width: number; height: number }`
5. Create `src/game/arena/ArenaGenerator.ts`:
   - Classic Bomberman pattern: solid walls on all even-indexed rows AND columns
   - Remaining interior cells filled randomly with `DESTRUCTIBLE` (configurable `blockDensity`, default 0.65)
   - Guaranteed clear spawn zones: 2-cell radius around top-left and bottom-right corners
6. Build `GameScene.ts` arena renderer:
   - Renders `ArenaState` as a Phaser `StaticGroup` of tile sprites
   - Exposes `destroyBlock(gx, gy)` and `updateCell(gx, gy, type)` methods
7. Write unit test: `ArenaGenerator` — spawn zones always clear, solid wall pattern correct

**Relevant Context:**
- `PhaserGame.tsx` from ST-01 — the Phaser game instance is created here
- `GameEventBus.ts` from ST-01 — used for React ↔ Phaser communication in all subsequent tasks

---

### ST-05 — Player Controller & Movement

**Status:** `[ ] pending`

**Intent:**
Implement the player entity: sprite, smooth grid-aligned movement, two independent input schemes (P1: WASD/Space/LShift; P2: Arrows/Enter/RShift), and collision with walls and blocks.

**Expected Outcomes:**
- P1 moves with WASD; P2 moves with Arrow keys — no key conflicts
- Movement is tile-aligned (snaps to grid cells) with smooth tween interpolation
- Players cannot enter `SOLID_WALL` or `DESTRUCTIBLE` cells
- Player stats are configurable per instance: `maxBombs`, `bombRange`, `shiftCooldownMs`
- Both players use the same `Player` class — mode determines how many are instantiated

**Standardized Input Schemes (no conflicts):**

| Action | Player 1 | Player 2 |
|---|---|---|
| Move Up | W | Arrow Up |
| Move Down | S | Arrow Down |
| Move Left | A | Arrow Left |
| Move Right | D | Arrow Right |
| Place Bomb | Space | Enter (Numpad Enter also accepted) |
| Activate SHIFT | Left Shift | Right Shift |

**Todo List:**
1. Create `src/game/input/InputScheme.ts` — interface `InputScheme { up, down, left, right, bomb, shift: Phaser.Input.Keyboard.Key }`
2. Create `src/game/input/InputConfig.ts` — exports `SCHEME_P1` and `SCHEME_P2` as `InputScheme` constants using Phaser key codes; verify no key appears in both schemes
3. Create `src/game/entities/Player.ts` — Phaser `GameObject`:
   - Properties: `gridX`, `gridY`, `speed`, `maxBombs`, `activeBombs`, `bombRange`, `lives`, `isAlive`
   - `update(delta)`: reads input scheme, queues next move if not already tweening
   - Movement: tween from current pixel position to next tile center (duration = 1000/speed ms)
   - Collision: check `ArenaState.grid[nextY][nextX].type` before committing move
4. Add `setStats(partial: Partial<PlayerStats>)` method — called by power-up system and game mode
5. Write unit test: collision — player cannot move into wall or destructible cell

**Relevant Context:**
- `ArenaState` and `GridTypes.ts` from ST-04
- `Player.ts` is instantiated by `SoloGameMode` (ST-10) and `PvPGameMode` (ST-10)

---

### ST-06 — Bomb System & Explosion Engine

**Status:** `[ ] pending`

**Intent:**
Implement the complete bomb lifecycle: placement, fuse countdown, cross-shaped explosion propagation, chain reactions, block destruction, and player hit detection. This is the mechanical heart of the game.

**Expected Outcomes:**
- A player places a bomb on their current cell (limited by `activeBombs < maxBombs`)
- After a 3-second fuse, the bomb explodes in a plus-shape up to `bombRange` cells in each arm
- Explosion arms are blocked by `SOLID_WALL` (arm stops before the wall) and stop on (and destroy) `DESTRUCTIBLE` blocks
- A bomb inside another explosion's zone detonates instantly (chain reaction) — no infinite loops
- A player on any explosion cell is marked dead
- Explosion VFX: animated neon particle burst per arm cell, screen shake proportional to chain length
- Destroyed blocks are replaced with `FLOOR` cells; a power-up may appear (v1: `BOMB+1` or `RANGE+1`)

**Todo List:**
1. Create `src/game/entities/Bomb.ts`:
   - Props: `gridX`, `gridY`, `range`, `owner: Player`, `fuseMs` (default 3000)
   - State machine: `IDLE` → `FUSING` → `DETONATING` → `DONE`
   - Visual: pulsing glow sprite; scale-tween accelerates near detonation
2. Create `src/game/systems/ExplosionSystem.ts`:
   - `explode(bomb, arenaState, allBombs, allPlayers)` — calculates all `ExplosionCell[]` for 4 arms
   - Arm resolution: iterate 1…range in each direction; stop on `SOLID_WALL`; mark `DESTRUCTIBLE` as last hit (arm stops after that cell)
   - Chain reaction: for each `DESTRUCTIBLE` or `FLOOR` cell in blast, check `allBombs` for a bomb there; if found and not already `DETONATING`, call `explode()` on it recursively — guard with a `detonating: Set<Bomb>` to prevent cycles
   - Player hit: check each explosion cell against all player `gridX/gridY`
   - Returns `ExplosionResult { cells, destroyedBlocks, hitPlayers, chainCount }`
3. Create `src/game/systems/DestructionSystem.ts`:
   - Receives `destroyedBlocks[]`, calls `arenaState.updateCell()` and `GameScene.destroyBlock()`
   - Rolls power-up spawn per destroyed block (25% chance in v1)
4. Create `src/game/vfx/ExplosionVFX.ts`:
   - Renders per-cell explosion frames using particle emitters
   - `GameScene.cameras.main.shake(duration, intensity)` — intensity scales with `chainCount`
   - Plays `AudioManager.playExplosion(chainCount)` SFX
5. Wire bomb placement: `Player.update()` calls `BombSystem.placeBomb(player, arenaState)` on bomb key press
6. Write unit tests:
   - Explosion arm stops at solid wall
   - Explosion arm destroys destructible block and stops
   - Chain reaction does not loop infinitely
   - Player in blast zone is marked as hit

**Relevant Context:**
- `Player.ts` from ST-05
- `ArenaState` from ST-04
- `GameEventBus` — emits `bomb:exploded` so SHIFT system in ST-07 can open its window

---

### ST-07 — SHIFT Mechanic

**Status:** `[ ] pending`

**Intent:**
Implement the SHIFT teleport ability. When the player's own bomb explodes, a short activation window opens. If the player presses their SHIFT key during this window, they teleport to the **nearest safe cell** within the blast zone. Safety is evaluated at the moment of activation, not at explosion time.

**SHIFT Rules (canonical):**
- Window opens the instant the player's bomb detonates; duration: **800 ms**
- Candidate cells: all `ExplosionCell[]` from that bomb's explosion, evaluated **after** `DestructionSystem` has applied block removals (freshly cleared cells are eligible as FLOOR destinations)
- The player's **own current cell is always excluded** from candidates — destination must differ from origin
- A cell is **safe** if all of the following are true: cell type is `CellType.FLOOR` at activation time; no active explosion frame covers it at activation time; no other entity (player, bomb, enemy) occupies it at activation time
- Tie-breaking: nearest safe cell by **Chebyshev distance** from the player's current position; if two cells share the same distance, choose the one with the lower grid index (row-major order) for determinism
- If no safe cell remains after filtering → SHIFT fails silently (no teleport, window closes, **no cooldown consumed**)
- If SHIFT succeeds → teleport fires, cooldown starts: **10 seconds**
- Cooldown is per-player; HUD shows it as a depleting bar
- SHIFT cannot be activated outside the window, or while on cooldown

**Expected Outcomes:**
- Teleport places player on nearest safe blast cell
- Blocked/occupied/explosion cells are never used as destinations
- Cooldown prevents spamming; HUD reflects remaining cooldown
- VFX: glitch scanline flash on origin cell, neon particle trail to destination
- Audio: distinct SHIFT whoosh SFX

**Todo List:**
1. Add to `Player.ts`:
   - `shiftWindowOpen: boolean`, `shiftWindowExpiresAt: number`, `shiftCooldownRemainingMs: number`
   - `shiftBlastCells: ExplosionCell[]` — stored when window opens; populated after `DestructionSystem` runs
2. In `ExplosionSystem.ts`: after resolving a player-owned bomb AND after `DestructionSystem` has updated `ArenaState`, call `player.openShiftWindow(blastCells, 800)` — order matters: block removals must be committed first
3. Create `src/game/systems/ShiftSystem.ts`:
   - `tryShift(player, arenaState, activeExplosionCells): ShiftResult`
   - Remove player's own cell from candidates: filter out any cell where `gx === player.gridX && gy === player.gridY`
   - Filter remaining cells to only safe ones (FLOOR at activation time, no active explosion, no occupant)
   - Sort by Chebyshev distance from `player.gridX/gridY`; secondary sort by row-major index for determinism
   - Take the first result; if list is empty → return `{ success: false }` (no cooldown consumed)
   - If found → teleport player, start 10 s cooldown, emit `shift:used` on `GameEventBus`
4. In `Player.update(delta)`: decrement `shiftCooldownRemainingMs`, check window expiry, handle SHIFT key press → call `ShiftSystem.tryShift()`
5. Create `src/game/vfx/ShiftVFX.ts`:
   - Origin: scanline/glitch particle burst at current cell
   - Destination: neon ring + particle trail
   - Tween player sprite from origin to destination over 150 ms
6. Emit `shift:ready` when cooldown reaches 0 (HUD update)
7. Write unit tests:
   - SHIFT selects nearest safe cell when multiple candidates exist (Chebyshev distance verified)
   - SHIFT excludes the player's own current cell from candidates
   - SHIFT uses post-destruction cell state (freshly cleared cells are eligible)
   - SHIFT fails silently when all candidates are unsafe; no cooldown consumed
   - SHIFT cannot fire outside the 800 ms window
   - SHIFT cannot fire while cooldown is active

**Relevant Context:**
- `ExplosionSystem.ts` from ST-06 — provides `ExplosionCell[]`
- `Player.ts` from ST-05
- `HUDScene` (ST-11) subscribes to `shift:used` and `shift:ready`

---

### ST-08 — Arena Dynamic Events

**Status:** `[ ] pending`

**Intent:**
Implement periodic automatic map-reconfiguration events ("SHIFT Events"). Every **20 seconds** a mutation is selected, validated for safety, and applied to the arena. Unsafe mutations are **cancelled** — no partial application. Players are never displaced by a mutation.

**Safety Contract (non-negotiable):**
- No block may be placed on a cell occupied by a player, enemy, or bomb
- No block may be placed on a cell that is the only escape route from any player's current position (reachability check via BFS)
- If the chosen mutation would violate any safety rule → cancel the entire mutation and skip to the next timer tick
- Solid walls are never affected by any mutation

**Mutation Types (v1 — 3 types):**

| Type | Description |
|---|---|
| Clear Zone | Remove all destructible blocks in a radius-3 circle around a random interior point |
| Block Surge | Add destructible blocks to random FLOOR cells in a zone, after safety validation |
| Corridor Shift | Open a full horizontal or vertical corridor through the arena |

**Expected Outcomes:**
- A mutation fires every 20 seconds from match start
- Each mutation passes safety checks before being applied
- Unsafe mutation is silently cancelled; timer resets normally
- Visual: full-screen scanline flash + per-tile animated reveal before mutation applies
- Banner: "⚡ SHIFT EVENT" text overlay with glitch animation
- Emit `arena:shift_event` on `GameEventBus` so HUD can react

**Todo List:**
1. Create `src/game/systems/ShiftEventSystem.ts`:
   - Repeating timer, `intervalMs` configurable (default 20 000)
   - `tick(arenaState, players, enemies, bombs)` → selects random mutation type → validates → applies or cancels
2. Create `src/game/arena/ArenaMutations.ts`:
   - `clearZone(state, cx, cy, radius): MutationProposal` — returns list of cells to change; marks removed blocks
   - `blockSurge(state, cx, cy, radius, players, enemies, bombs): MutationProposal` — excludes occupied cells and cells that would trap players (BFS escape check)
   - `corridorShift(state, axis, index, players, enemies, bombs): MutationProposal`
   - Each returns `{ safe: boolean; changes: CellChange[] }` — system only applies if `safe === true`
3. Apply `MutationProposal.changes` to `ArenaState` and call `GameScene.updateCell()` for each changed tile
4. Create `src/game/vfx/ShiftEventVFX.ts`:
   - Scanline shader overlay (CSS animation or Phaser postFX)
   - Staggered tile-flip tween for each changed cell
   - Banner text with glitch animation
5. Write unit tests:
   - Mutation with a player on the target cell is cancelled
   - Mutation that traps a player (BFS finds no escape) is cancelled
   - Solid walls are never changed by any mutation

**Relevant Context:**
- `ArenaState` and `GameScene.updateCell()` from ST-04
- `GameEventBus` from ST-01
- `Pathfinder.ts` from ST-09 (BFS escape check) — this system is written last among ST-08/ST-09; the escape check can use a lightweight inline BFS if ST-09 is not yet complete

---

### ST-09 — Enemy AI (Solo Mode)

**Status:** `[ ] pending`

**Intent:**
Build the enemy AI for Solo mode. Enemies navigate the grid, avoid active and predicted explosions, and attempt to trap the player with bombs. Three tiers with escalating intelligence; difficulty rises across waves.

**Wave Progression Table:**

| Wave | Total Enemies | Tier Mix | New Tier Introduced | Power-ups active |
|---|---|---|---|---|
| 1 | 2 | 2× Grunt | Grunt | No |
| 2 | 3 | 2× Grunt, 1× Chaser | Chaser | No |
| 3 | 4 | 2× Grunt, 2× Chaser | — | Yes |
| 4 | 5 | 2× Chaser, 1× Tactician, 2× Grunt | Tactician | Yes |
| 5 | 5 | 2× Grunt, 3× Tactician | — | Yes |
| 6 | 6 | 2× Grunt, 4× Tactician | — | Yes |
| 7 | 7 | 2× Grunt, 5× Tactician | — | Yes |
| 8 | 8 | 2× Grunt, 6× Tactician | — | Yes |
| 9+ | 8 (cap) | 2× Grunt, 6× Tactician | — | Yes |

**Wave 5+ Formula (canonical):**
- `N = min(6, waveNumber - 4)` where N is the number of Tacticians
- `totalEnemies = min(8, 2 + N)` — hard cap of 8 enemies regardless of wave number
- Tier mix always: 2× Grunt + N× Tactician (Chasers are phased out after wave 4)
- Wave 9 and beyond: composition frozen at wave 8 values (difficulty maintained via arena events and player pressure)

**Scoring Formula (canonical):**
- **Kill score:** `100 × waveNumber` points per enemy killed
- **Wave-clear bonus:** `500 × waveNumber` points (awarded only if all enemies in the wave are eliminated)
- **Per-wave time bonus:** `max(0, 60 - waveDurationSeconds) × 5` points — applied once per wave, using the duration of that individual wave in seconds
- **Final score:** sum of all kill scores + sum of all wave-clear bonuses + sum of all per-wave time bonuses
- **Ranking:** uses the **best single-run final score** (one row per run in `solo_matches`)
- **Server-side validation:** the Edge Function receives `wave_durations` (int array) and can independently reconstruct the time bonus for each wave; the submitted `score` must equal the server-reconstructed total ± 0 (exact match required — no tolerance)

**AI Tier Behavior:**

| Tier | Movement | Bomb Placement | Danger Avoidance |
|---|---|---|---|
| Grunt | Random walk | Random, low frequency | None |
| Chaser | BFS toward player | When adjacent to player | Avoids cells in `DangerMap` |
| Tactician | BFS toward player | Predictive — places bomb to cut off player path | Full `DangerMap` + retreat logic |

**Expected Outcomes:**
- Enemies move on the grid and respond to the player's position
- `DangerMap` marks cells as dangerous based on active bombs and their predicted blast zones
- Wave system spawns the correct tier mix per the progression table; wave ends when all enemies are dead
- Tacticians are introduced gradually (wave 4: 1; waves 5+: scaled via formula) — no abrupt difficulty spikes
- No enemy spawns on an occupied cell or on a cell with no walkable neighbour
- Game ends when the player has 0 lives; final score emitted to `GameEventBus` includes `wave_durations[]`

**Spawn Point Rules (canonical):**
- Waves 1–2: enemies spawn at the two interior corner regions (top-right and bottom-left quadrant centres), at cells guaranteed to be `FLOOR` and unoccupied
- Waves 3+: additional enemies spawn at **peripheral interior cells** — cells within 1 tile of the arena border, not on solid walls, not occupied by a player, enemy, or bomb, and with at least one walkable adjacent cell
- Minimum safe distance from the player spawn position: **3 tiles (Chebyshev)** — a spawn candidate is rejected if its distance to any human player is < 3
- If no valid spawn cell exists for an enemy slot, that enemy is skipped for this wave (not an error)
- Spawn positions are evaluated at wave-start time, not pre-computed

**Todo List:**
1. Create `src/game/ai/Pathfinder.ts`:
   - BFS on `ArenaState` grid; returns `GridCell[]` path or `null` if unreachable
   - Accepts optional `excludeCells: Set<string>` (danger avoidance)
2. Create `src/game/ai/DangerMap.ts`:
   - Computes `Set<string>` of dangerous cell keys (`"gx,gy"`) from all active bombs' predicted blast zones
   - Updates every frame (cheap on a 13×13 grid)
3. Create `src/game/entities/Enemy.ts` — base class: `gridX`, `gridY`, `tier`, `isAlive`, `update(delta)`
4. Create `src/game/ai/behaviors/GruntBehavior.ts` — random walkable direction; place bomb every 4–6 s randomly
5. Create `src/game/ai/behaviors/ChaserBehavior.ts` — BFS toward player position; avoid `DangerMap` cells
6. Create `src/game/ai/behaviors/TacticianBehavior.ts` — Chaser + predictive bomb placement (identifies cells that cut off the player's BFS path); retreats when in danger
7. Create `src/game/systems/WaveSystem.ts`:
   - `WaveConfig[]` encodes the full progression table and the wave 5+ formula
   - `startWave(n)`: records `waveStartTime`; spawns enemies at valid peripheral spawn cells per spawn rules above; emits `wave:start`
   - `endWave()`: records `waveDuration = now - waveStartTime`; accumulates `waveDurations[]`
   - Emits `wave:complete` when all enemies dead (triggers next wave after a brief pause)
   - Emits `game:over` with `{ score, wavesReached, kills, totalDurationSeconds, waveDurations[] }` when player dies
8. Write unit tests:
   - Pathfinder returns correct BFS path on a known grid
   - Pathfinder returns null when target is unreachable
   - `DangerMap` marks correct cells for a given bomb configuration
   - Wave 5+ formula: `waveNumber=5` → 3 Tacticians, `waveNumber=10` → 6 Tacticians (capped), total ≤ 8
   - Spawn rules: no enemy spawns within 3 tiles of the player; no spawn on occupied cells

**Relevant Context:**
- `Player.ts` from ST-05 — position is the BFS target
- `ArenaState` from ST-04 — walkability map
- `ExplosionSystem.ts` from ST-06 — blast zone prediction for `DangerMap`

---

### ST-10 — Game Modes Orchestration

**Status:** `[ ] pending`

**Intent:**
Wire all systems into two complete, playable game modes. Both modes handle match start, end conditions, result packaging, and submission to Supabase via Edge Functions.

**Expected Outcomes:**
- Solo mode: starts at wave 1, escalates per wave table, ends on player death; if authenticated, score submitted via `submit-solo-result`; if guest, post-match shows register invite instead
- 1v1 mode: pre-match screen collects Player 2 guest name; Player 1 must be authenticated to record result; match ends on first elimination or simultaneous death (draw)
- Both modes: authenticated submission uses the player's JWT + client-generated `match_uuid` (UUID v4)
- Post-match screen shows result summary with Play Again / Back to Menu / View Rankings
- Guest post-match screen shows a "Create account to save your score" CTA

**Authentication Behaviour in GamePage:**
- If Player 1 is a guest and reaches `PostMatchPage`: skip Edge Function call; show guest invite banner; CTAs still include Play Again and Back to Menu
- If Player 1 is authenticated: generate `match_uuid`, call Edge Function, show loading state, handle error with retry
- 1v1 ranked submission only fires when `isAuthenticated === true` for Player 1

**Todo List:**
1. Create `src/game/modes/SoloGameMode.ts`:
   - Orchestrates: `ArenaGenerator`, `Player`, `WaveSystem`, `ShiftEventSystem`, `BombSystem`, `ExplosionSystem`, `ShiftSystem`
   - On `game:over`: collects `{ score, wavesReached, kills, totalDurationSeconds, waveDurations[] }`, emits to `GameEventBus`
2. Create `src/game/modes/PvPGameMode.ts`:
   - Orchestrates: `ArenaGenerator`, `Player` (×2), `ShiftEventSystem`, `BombSystem`, `ExplosionSystem`, `ShiftSystem`
   - On first player death: emits `game:over` with `{ winner: 'p1' | 'p2', durationSeconds }`
   - Draw condition: both players die in the same explosion frame → `result: 'draw'`
3. Create `src/pages/PreMatchPage.tsx` (1v1 only):
   - If Player 1 is a guest: show warning "Results will not be saved — log in to rank"
   - Input field for Player 2 guest name (required, 1–20 chars, validated client-side before proceeding)
   - Passes validated name to Phaser via `GameEventBus` before mounting game
4. Create `src/pages/PostMatchPage.tsx`:
   - Reads `isAuthenticated` from `useAuth()`
   - If authenticated: generate `match_uuid` via `crypto.randomUUID()`; call `supabase.functions.invoke(...)` with full payload; show loading spinner; on success show result card; on error show retry button
   - If guest: skip submission; show result card with "Create account to save your score" invite linking to `/auth/register`
   - Result card always shows score/waves (Solo) or winner/duration (1v1), Play Again, Back to Menu, View Rankings CTAs
5. Connect `GamePage.tsx` to read mode from route and instantiate the correct game mode

**Relevant Context:**
- All systems from ST-04 through ST-09
- `useAuth()` from ST-02 for player JWT
- Edge Functions from ST-02

---

### ST-11 — HUD & In-Game UI

**Status:** `[ ] pending`

**Intent:**
Build the in-game HUD using a dedicated Phaser `HUDScene` (rendered on top of `GameScene`). Shows player stats, SHIFT cooldown, wave info, and event banners — all updated reactively via `GameEventBus` events.

**Expected Outcomes:**
- HUD renders on `HUDScene`, launched in parallel with `GameScene`
- P1 panel (bottom-left): bomb count, range, SHIFT cooldown bar, lives
- P2 panel (bottom-right, 1v1 only): mirrored layout
- Solo panel: wave number, enemies remaining, current score
- SHIFT cooldown bar depletes smoothly; glows cyan when ready
- Wave start and arena event banners animate in/out

**Todo List:**
1. Create `src/game/scenes/HUDScene.ts` — launched alongside `GameScene` via `scene.launch('HUDScene')`
2. Implement player panel using Phaser `Text` and `Graphics` objects (no DOM):
   - Bomb icon + counter, range icon + counter
   - SHIFT bar: `Graphics.fillRect` animated each frame via `shiftCooldownRemainingMs / shiftCooldownMs`
   - Lives display: heart icons
3. Subscribe `HUDScene` to `GameEventBus` events: `player:stats_changed`, `shift:used`, `shift:ready`, `wave:start`, `wave:complete`, `arena:shift_event`
4. Implement wave/event banner: centered `Text` object, tween scale-in → hold → scale-out
5. Full-screen overlay events (game over, wave complete) are emitted to React via `GameEventBus` — React renders these as DOM overlays, not Phaser objects

**Relevant Context:**
- `GameEventBus` events are defined across ST-01, ST-07, ST-08, ST-09
- `HUDScene` must not hold references to game-logic objects; it only reads from events

---

### ST-12 — Rankings & Profile Pages

**Status:** `[ ] pending`

**Intent:**
Build the Rankings and Profile pages querying Supabase for leaderboard data and personal history. Two independent leaderboards: Solo (best score per player) and 1v1 (wins, with win-rate as tiebreaker).

**Rankings Logic (canonical):**

| Mode | Minimum matches to appear | Primary Sort | Tiebreaker |
|---|---|---|---|
| Solo | 1 (any completed run) | `MAX(score) DESC` (best single run) | `MAX(waves_survived) DESC` |
| 1v1 | 5 completed matches | `win_count DESC` | `win_rate DESC` |

**1v1 Win-Rate Formula:**
- `win_count` = number of rows where `result = 'win'`
- `total_matches` = total number of rows for that `player1_id` (wins + losses + draws)
- `win_rate` = `win_count::float / total_matches` (range 0.0–1.0)
- **Draws count as 0 wins and 1 match played** (they increase the denominator but not the numerator)
- A player with fewer than 5 `total_matches` is excluded from the 1v1 ranking entirely (filtered in the RPC `WHERE total_matches >= 5`)

**Design Note — Unilateral Record:**
The 1v1 ranking reflects results from the perspective of Player 1 (the authenticated host) only. Player 2 is a named guest and has no account entry. This is an intentional design constraint of the local-play model; all displayed stats carry this caveat.

**Expected Outcomes:**
- Rankings page: two tabs (Solo / 1v1), table with rank, username, score or wins, tiebreaker value
- Solo ranking includes any player with at least 1 completed run
- 1v1 ranking includes only players with at least 5 completed matches
- Draws appear in match history but do not count as wins
- The authenticated user's row is highlighted regardless of position
- Profile page: username, avatar placeholder, personal bests, last 10 matches (including draws)
- Data fetched on mount with a loading skeleton; stale-on-navigate refresh
- All queries use only public-readable columns (no private fields exposed)

**Todo List:**
1. Create Supabase RPC `solo_rankings`:
   ```sql
   SELECT p.username, m.player_id, MAX(m.score) AS best_score, MAX(m.waves_survived) AS best_waves
   FROM solo_matches m JOIN profiles p ON p.id = m.player_id
   GROUP BY m.player_id, p.username
   ORDER BY best_score DESC, best_waves DESC
   ```
2. Create Supabase RPC `pvp_rankings`:
   ```sql
   SELECT p.username, m.player1_id,
     COUNT(*) FILTER (WHERE m.result = 'win') AS win_count,
     COUNT(*) AS total_matches,
     COUNT(*) FILTER (WHERE m.result = 'win')::float / COUNT(*) AS win_rate
   FROM pvp_matches m JOIN profiles p ON p.id = m.player1_id
   GROUP BY m.player1_id, p.username
   HAVING COUNT(*) >= 5
   ORDER BY win_count DESC, win_rate DESC
   ```
3. Add DB indexes: `solo_matches(player_id, score DESC)`, `pvp_matches(player1_id, result)`
4. Create `src/hooks/useRankings.ts` — calls `supabase.rpc('solo_rankings')` and `supabase.rpc('pvp_rankings')`; returns typed arrays
5. Build `RankingsPage.tsx`: two tabs, table with rank / username / primary metric / tiebreaker; current-user row highlighted via `useAuth()`; 1v1 tab shows a footnote explaining the 5-match minimum and unilateral record
6. Build `ProfilePage.tsx`: personal bests section + paginated match history (10 per page); draws displayed in history with a "DRAW" badge
7. Write integration test: `useRankings` returns correctly shaped data from a mocked Supabase client; player with 4 pvp matches does not appear in 1v1 ranking

**Relevant Context:**
- Schema from ST-02
- `useAuth()` from ST-02
- `RankingsPage` shell from ST-03

---

### ST-13 — Audio System & Visual Polish

**Status:** `[ ] pending`

**Intent:**
Integrate the full audio system and apply the final layer of visual polish: particle systems, neon glow simulation, screen effects, glitch shaders, and synchronized SFX. Settings page wires volume controls.

**Expected Outcomes:**
- Background music loops during gameplay; music and SFX volumes are independently controllable
- All SFX play at correct moments: bomb place, explosion (with chain intensity variant), SHIFT, player death, wave start, arena event, UI clicks
- Particle emitters active on: explosion arms, SHIFT origin/destination, player footsteps (subtle)
- Screen shake on explosion (intensity scales with chain count)
- Settings page: music volume + SFX volume sliders saved to `localStorage`

**Todo List:**
1. Add all audio asset placeholders to `public/assets/audio/` and declare keys in `PreloadScene`
2. Create `src/game/audio/AudioManager.ts`:
   - Wraps `Phaser.Sound.BaseSoundManager`
   - Named methods: `playExplosion(chainCount)`, `playShift()`, `playBombPlace()`, `playPlayerDeath()`, `playWaveStart()`, `playArenaEvent()`, `playUIClick()`
   - Reads initial volumes from `localStorage`
3. Create `src/game/vfx/ParticleManager.ts` — manages reusable particle emitter pools (explosion, SHIFT, footstep); pooled to avoid GC spikes
4. Apply neon glow simulation: `Phaser.FX.Glow` on player sprites and bomb sprites; bloom-like additive blending on particle emitters
5. Wire screen shake in `ExplosionVFX`: `scene.cameras.main.shake(200 + chainCount * 50, 0.005 * chainCount)`
6. Build `SettingsPage.tsx`: range inputs for music/SFX volume → `AudioManager.setVolumes()` + `localStorage.setItem()`
7. Read audio prefs from `localStorage` on `AudioManager` initialization in `PreloadScene`

**Relevant Context:**
- `PreloadScene` from ST-04
- VFX modules from ST-06, ST-07, ST-08

---

### ST-14 — Test Suite, QA & Deploy

**Status:** `[ ] pending`

**Intent:**
Write the complete test suite, run a full manual QA pass over both game modes, fix regressions, and configure production deployment. Tests must cover all critical game systems as specified.

**Test Coverage Targets:**

| System | Tests |
|---|---|
| Bomb placement | Max bomb limit enforced; bomb placed on correct cell |
| Explosions | Arm stops at solid wall; destroys destructible block and stops; chain reaction resolves correctly; no infinite loop |
| SHIFT | Nearest safe cell selected by Chebyshev distance; player's own cell excluded; post-destruction cells eligible; fails silently when no safe cell; no cooldown on failure; blocked outside window; blocked during cooldown |
| Scoring | Kill score = 100 × wave; wave-clear bonus = 500 × wave; per-wave time bonus = max(0, 60 - waveDuration) × 5; final score is exact sum |
| Wave progression | Wave 5 → 3 Tacticians; wave 10 → 6 Tacticians (cap); total enemies never exceed 8; no enemy spawns within 3 tiles of player; no spawn on occupied cell |
| AI / Pathfinder | BFS path correctness on known grid; unreachable target returns null |
| Collisions | Player blocked by wall and destructible |
| Arena Events | Mutation cancelled when player is on target cell; mutation cancelled when BFS escape is blocked; solid walls never changed |
| Edge Functions | `submit-solo-result`: mismatched player_id rejected (403); malformed UUID rejected (400); score out of bounds rejected; duplicate match_uuid accepted idempotently (200, one row); `wave_durations` length mismatch rejected |
| Edge Functions | `submit-pvp-result`: empty player2_name rejected; player2_name > 20 chars rejected; invalid result value rejected; duplicate match_uuid idempotent |
| Rankings | Player with 4 pvp matches excluded from 1v1 ranking; draw counted as 0 wins, 1 match played; win_rate calculated correctly |
| Guest flow | Guest completing Solo: no Edge Function call; register invite shown; Guest completing 1v1: no Edge Function call |

**Expected Outcomes:**
- `npm run test` passes with zero failures across all coverage targets above
- Manual QA: both game modes fully playable from start to post-match (authenticated and guest paths)
- All Supabase flows (auth, submit, rankings, profile) work end-to-end
- `npm run build` produces zero TypeScript errors and zero ESLint warnings
- `README.md` documents setup, env vars, and Supabase schema steps
- Deployed to Vercel (or equivalent static host) with env vars configured

**Todo List:**
1. Write unit tests for each row in the coverage table above (using Vitest + jsdom)
2. Write integration tests:
   - `PostMatchPage` (authenticated): calls correct Edge Function with valid payload; shows loading then result
   - `PostMatchPage` (guest): skips Edge Function; shows register invite
   - `useRankings`: returns correctly shaped data from a mocked Supabase client; respects 5-match minimum for 1v1
3. Manual QA checklist:
   - Solo (authenticated): wave 1→5 playthrough; SHIFT fires and excludes own cell; time bonus accumulates per wave; arena events trigger; score saved and appears in rankings
   - Solo (guest): wave 1+ playthrough; post-match shows register invite; no DB row created
   - 1v1 (authenticated host): pre-match name entry with 1–20 char validation; match plays to conclusion; winner/draw recorded; ranking updates after 5 matches
   - 1v1 (guest host): match plays; post-match shows invite; no DB row created
4. Fix all identified bugs
5. Configure `vite.config.ts` `base` for production path
6. Create `vercel.json` with `{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }` for SPA routing
7. Write `README.md`: prerequisites, env setup, `npm run dev`, `npm run build`, Supabase schema and Edge Function deployment steps
8. Final `npm run build` — zero errors, zero warnings

---

## Folder Structure

```
bomb_shift/
├── supabase/
│   └── functions/
│       ├── submit-solo-result/   # Edge Function
│       └── submit-pvp-result/    # Edge Function
├── public/
│   └── assets/
│       ├── audio/
│       ├── sprites/
│       └── tilesets/
└── src/
    ├── assets/                   # Images referenced in React components
    ├── components/
    │   └── ui/                   # Button, Card, Logo, LoadingSpinner
    ├── game/
    │   ├── ai/
    │   │   ├── behaviors/        # GruntBehavior, ChaserBehavior, TacticianBehavior
    │   │   ├── DangerMap.ts
    │   │   └── Pathfinder.ts
    │   ├── arena/
    │   │   ├── ArenaGenerator.ts
    │   │   └── ArenaMutations.ts
    │   ├── audio/
    │   │   └── AudioManager.ts
    │   ├── entities/
    │   │   ├── Bomb.ts
    │   │   ├── Enemy.ts
    │   │   └── Player.ts
    │   ├── input/
    │   │   ├── InputConfig.ts    # SCHEME_P1, SCHEME_P2 constants
    │   │   └── InputScheme.ts    # Interface definition
    │   ├── modes/
    │   │   ├── PvPGameMode.ts
    │   │   └── SoloGameMode.ts
    │   ├── scenes/
    │   │   ├── BootScene.ts
    │   │   ├── GameScene.ts
    │   │   ├── HUDScene.ts
    │   │   └── PreloadScene.ts
    │   ├── systems/
    │   │   ├── BombSystem.ts
    │   │   ├── DestructionSystem.ts
    │   │   ├── ExplosionSystem.ts
    │   │   ├── ShiftEventSystem.ts
    │   │   └── ShiftSystem.ts
    │   ├── types/
    │   │   └── GridTypes.ts
    │   ├── vfx/
    │   │   ├── ExplosionVFX.ts
    │   │   ├── ParticleManager.ts
    │   │   ├── ShiftEventVFX.ts
    │   │   └── ShiftVFX.ts
    │   ├── config.ts             # Phaser GameConfig
    │   ├── GameEventBus.ts       # Typed React<->Phaser event bridge
    │   └── PhaserGame.tsx        # React component mounting Phaser
    ├── hooks/
    │   ├── useAuth.ts
    │   └── useRankings.ts
    ├── lib/
    │   └── supabase.ts
    ├── pages/
    │   ├── auth/
    │   │   ├── LoginPage.tsx
    │   │   └── RegisterPage.tsx
    │   ├── GamePage.tsx
    │   ├── MainMenuPage.tsx
    │   ├── ModeSelectPage.tsx
    │   ├── PostMatchPage.tsx
    │   ├── PreMatchPage.tsx
    │   ├── ProfilePage.tsx
    │   ├── RankingsPage.tsx
    │   └── SettingsPage.tsx
    ├── styles/
    │   ├── global.css
    │   └── tokens.css
    ├── App.tsx
    └── main.tsx
```

---

## Dependencies & Technical Risks

### Runtime Dependencies

| Package | Purpose |
|---|---|
| `phaser` | 2D game engine — scenes, input, physics, audio, particles, FX |
| `@supabase/supabase-js` | Auth, Postgres queries, Edge Function invocation |
| `react-router-dom` | Client-side navigation |

### Dev Dependencies

| Package | Purpose |
|---|---|
| `vitest` | Test runner (Vite-native) |
| `@testing-library/react` | React component testing |
| `jsdom` | DOM environment for Vitest |
| `eslint` + `prettier` | Code quality |

### Technical Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Phaser and React reconciler conflict — both want to own the DOM | High | Mount Phaser into a `<div ref>` React never re-renders; `useEffect` cleanup calls `game.destroy(true)` |
| Memory leaks when navigating away from `GamePage` | High | Phaser game is destroyed on `useEffect` cleanup; all `GameEventBus` listeners removed |
| Chain-reaction explosion infinite loop | High | `detonating: Set<Bomb>` guard in `ExplosionSystem` — a bomb already in the set is skipped |
| Supabase RLS misconfiguration exposing user data or allowing direct client inserts | High | Match tables have no INSERT grant for authenticated role; only Edge Functions use service role |
| Arena mutation trapping a player | High | BFS escape check before applying; mutation cancelled if `safe === false` |
| SHIFT teleporting into an active explosion | High | Safety check at activation time (not explosion time) against live `activeExplosionCells` |
| Audio autoplay policy (browsers block audio without gesture) | Medium | `AudioContext.resume()` triggered on first user key press or mouse click |
| Arena mutations partially applied on engine crash mid-mutation | Medium | Mutations are prepared as a `MutationProposal` (all changes computed first) then applied atomically in a single pass |
| Edge Function cold starts adding latency to post-match submission | Low | Show loading state in `PostMatchPage`; non-blocking for UX; retry on failure |
| BFS pathfinding performance | Low | 13×13 grid — BFS is negligible cost; no optimization needed in v1 |

---

## Development Roadmap

### Phase 1 — Foundation
**ST-01 → ST-03:** Project setup, Supabase schema + Edge Functions, auth flows, navigation shell, design system.
**Goal:** Navigable shell with login/register and a blank Phaser canvas that mounts/unmounts cleanly.

### Phase 2 — Core Engine
**ST-04 → ST-06:** Arena renderer, player movement, bomb/explosion system.
**Goal:** One player can move, place bombs, trigger chain reactions, and destroy blocks in a rendered arena.

### Phase 3 — Signature Mechanics
**ST-07 → ST-08:** SHIFT teleport and arena dynamic events.
**Goal:** Both defining features of BOMB//SHIFT are playable and visually distinctive.

### Phase 4 — Game Modes
**ST-09 → ST-11:** Enemy AI, mode orchestration (Solo + 1v1), and HUD.
**Goal:** Both game modes are fully playable end-to-end with a functional HUD.

### Phase 5 — Backend & Rankings
**ST-12:** Rankings and profile pages with live Supabase data.
**Goal:** Match results persist through Edge Functions; rankings and profiles are visible and correct.

### Phase 6 — Polish & Ship
**ST-13 → ST-14:** Audio, particles, visual effects, full test suite, QA, and deployment.
**Goal:** A shippable, polished v1 with passing tests and a live deployment.
