# Tengen Release Notes

Append-only log of milestone progress against `docs/AI_ROADMAP.md`. Newest
entries go at the top. See `CLAUDE.md` for the entry format and the rules for
when to add an entry.

Current milestone: **M4 — Self-Play and Data Pipeline** complete; ready to
begin **M5 — First Trainable Model**.

## 2026-05-08 — M4 Self-play and data pipeline shipped

Milestone: M4 — Self-Play and Data Pipeline
Status: milestone complete

- New `@tengen/self-play` workspace package providing the batch self-play
  runner, training-record schema, replayer, dataset validator, curated
  evaluation fixtures, and three CLI entrypoints (`tengen-selfplay`,
  `tengen-replay`, `tengen-validate`). Built on `@tengen/game-core` +
  `@tengen/ai-bots`; zero runtime dependencies.
- `playMatch({ boardSize, black, white, seed })` drives one full AI-vs-AI
  game through the shared engine and returns a `TrainingRecord` plus SGF.
  Per-player seeds are derived from the master seed via splitmix32 so
  identical inputs produce byte-identical records.
- `runBatch({ outputDir, baseSeed, boardSizes, pairings, matchesPerCell })`
  iterates the cell grid, writes one JSON record + one SGF per match, and
  emits a `manifest.json` stamping the dataset's `(schemaVersion,
  rulesPackageVersion, generatedAt, baseSeed, boardSizes, pairings, bots,
  matchCount, records)`. Re-running with the same `baseSeed` reproduces
  the dataset exactly.
- `replayRecord(record)` reconstructs the game from stored moves through
  `@tengen/game-core` and verifies legality of every move, the recorded
  result, the terminal flag, the winner, and the final board. Tampered
  records (move colors, finalBoard) are rejected.
- `iterateTrainingExamples(record)` yields `(position, move, value)`
  tuples — value is `+1/-1/0` from the side-to-move's perspective — so
  trainers consume the compact on-disk format directly without a separate
  expansion pass.
- `validateDataset(dir)` walks a directory, replays every record, dedupes
  by `recordId` and final-board fingerprint, and reports structured
  issues (`unreadable`, `invalid-json`, `schema-mismatch`, `shape`,
  `illegal-replay`, `non-terminal`, `duplicate-record-id`,
  `duplicate-position-history`). Powers the `tengen-validate` CLI which
  exits non-zero on any failure.
- `packages/self-play/fixtures/` holds 4 committed evaluation games (9x9
  random/random, random/heuristic, heuristic/random, heuristic/heuristic;
  baseSeed 2026, fixed `generatedAt`) reusable from tests and downstream
  comparisons. Regenerate with `packages/self-play/scripts/generate-fixtures.ts`.
- 24 new tests across 6 suites: match shape and seed derivation,
  reproducibility (identical inputs → identical records, different bots
  → different recordIds), replay (clean replay + tamper detection +
  example iteration), runner (file layout + manifest fields + byte-equal
  reruns + every record replays), validator (clean + each failure mode),
  fixtures (committed set replays cleanly). All 91 tests across the four
  workspaces pass; all five workspaces typecheck clean.
- A new `GAME_CORE_VERSION` constant is exported from `@tengen/game-core`
  (currently `"0.1.0"`) so records and manifests can stamp the rules
  version without runtime package.json access.

Acceptance criteria affected:

- **M4: Self-play can generate reproducible games from a known bot
  version and seed** — met (`reproducibility.test.ts`,
  `runner.test.ts: re-running with the same baseSeed produces
  byte-identical records`).
- **M4: Stored records can be replayed through the shared game core
  without illegal states** — met (`replay.test.ts`,
  `runner.test.ts: every record written by runBatch replays cleanly`,
  `fixtures.test.ts`).
- **M4: Data exports are versioned by rules package, bot/model version,
  board size, and generation date** — met (`BatchManifest` carries
  `rulesPackageVersion`, per-pairing `{black, white}` botIds with
  versions, `boardSizes`, `generatedAt`;
  `runner.test.ts: manifest stamps rules version, bot versions, board
  sizes, and date`).

Follow-ups / known gaps:

- The schema reserves space for stronger bots / model players via
  `PlayerIdentity.kind`; only `random` / `heuristic` are exercised
  today. M5 will register `model` players against the same schema
  without a breaking change.
- Manifest is per-batch; cross-batch dataset roll-ups (e.g. "all 9x9
  records across all batches") are deferred until the trainer needs
  them.

## 2026-05-06 — M3 close-out: bot seed plumbing and bot resignation path

Milestone: M3 — Baseline AI Opponents
Status: milestone complete

- `createBot(id, options?)` in `@tengen/ai-bots` now accepts
  `{ seed?: number; rng?: () => number }`, plumbed through to the random
  and heuristic bots. A new `createMulberry32` seedable PRNG is exported
  from the package. With the same seed, `createBot("random-v1", { seed })`
  produces an identical move sequence — the precondition for M4's
  reproducible self-play. M3 acceptance criterion "AI moves are logged
  with bot identity and version metadata" was already met; this
  additionally enables seed-based reproducibility before M4 needs it.
- `ControllerMove` (`@tengen/game-core`) now includes `{ resign: true }`,
  and `AiMoveLoop.#applyDecision` routes resign decisions into
  `service.resign({ actor: "bot" })`, emitting a structured
  `{ event: "ai_move", decision: { type: "resign" } }` log line. Bots can
  now resign (no built-in policy yet — the contract is in place; closes
  the "AI ... resignation behavior" deliverable).
- `AiLoopOptions` gains an optional `botFactory(id)` seam that overrides
  the registry. Used by tests and intended for the upcoming self-play
  runner so it can inject seeded or evaluation-only bots without mutating
  global state.
- 2 new ai-bots tests (seed determinism, mulberry32 reproducibility) and
  1 new server test (resign decision routes to `+R`). All 67 tests across
  three workspaces pass.

## 2026-05-06 — Time controls: traditional weiqi main + byo-yomi clocks

Milestone: Cross-cutting (M3 follow-up; foundation for M4+ time-bounded play)
Status: deliverable shipped

- New clock primitives in `@tengen/game-core` (`TimeControl`, `PlayerClock`,
  `SessionClocks`, `applyElapsed`, `projectRemainingMs`, `timeUntilLossMs`,
  `createInitialClocks`, `isUnlimitedTimeControl`). Implements traditional
  rules: a per-player main-time budget plus a per-move byo-yomi cap once main
  time is exhausted; overrunning byo-yomi forfeits the game.
- `POST /sessions` now accepts an optional
  `timeControl: { mainTimeSeconds, byoyomiSeconds }`. `{0,0}` and omission are
  treated as unlimited. Clocks are persisted on `SessionRecord` and ticked
  on each `playMove`/`pass`/`resign` against `turnStartedAt`. A timeout
  watcher fires per-session `setTimeout` based on `timeUntilLossMs`; when a
  player overruns, the game finalizes with `<winner>+T` (e.g. `B+T`) and the
  store/SSE emits the terminal state. `SessionStore.update` now uses a
  record-level mutator so clocks and game state update atomically.
- The AI loop computes a per-move budget from the bot's clock (a fraction of
  remaining main time, capped at 30s, or ~85% of the byo-yomi window when in
  byo-yomi) and passes it to `bot.getMove(state, { clock })` via the new
  `AiMoveContext`. The heuristic bot opportunistically samples its candidate
  set under tight budgets. Bots with no time control receive no context and
  fall back to the default 5s ceiling.
- SGF export adds `TM[mainTime]` and `OT[1xN byo-yomi]` tags when a session
  has time control; unlimited games omit them.
- Web UI: the new-session bar now offers a time-control selector with four
  presets (3h+30s default, 1h+30s, 20m+30s, 5m+10s) plus "Unlimited". A
  live `ClockDisplay` renders both players' main / byo-yomi remaining time
  in MM:SS, ticking 4Hz while the current player's clock is running, and
  highlighting the side to move. English and Simplified Chinese translations
  added.
- 9 new server tests cover session creation with time control, validation,
  per-move main-time deduction, end-to-end watcher-driven `B+T` time loss,
  rejection of moves after a time loss, and SGF TM/OT tags. 14 new clock
  unit tests cover main→byo-yomi transition, byo-yomi loss boundary,
  projection, and unlimited handling. All 63 tests across the three
  workspaces pass; web `tsc --noEmit && vite build` is clean.

## 2026-05-05 — M3 follow-ups: bot-turn protection, stale-decision drop, mode input removed

Milestone: M3 — Baseline AI Opponents
Status: in progress (post-ship fixes)

- The server now refuses human/API actions during a bot's turn. `playMove`,
  `pass`, and `resign` accept an `{ actor: "human" | "bot" }` option (default
  human). Human-actor calls reject with 409 `Cannot <action>: it is the bot's
  turn.` if the current color belongs to a bot. The `AiMoveLoop` calls with
  `actor: "bot"` to bypass the check. Closes the bug where a direct
  `POST /sessions/:id/moves` during the bot's turn placed a stone in the
  bot's color.
- The AI loop now snapshots the decision context (sessionId, moveNumber,
  current color, bot id+version) before calling `bot.getMove()` and re-checks
  it against a fresh `peek` immediately before applying. If anything changed
  (state advanced, color flipped, players replaced, game ended), the decision
  is dropped, a structured `{ event: "ai_move", decision: { type: "stale" } }`
  log line is emitted, and the loop re-evaluates from current state. The
  same check runs after a getMove rejection so we don't fire a fallback pass
  on behalf of a stale color.
- `mode` is no longer accepted on `POST /sessions`. It was always derivable
  from `players` and the partial validation it had only worked for
  `humanVsHuman`. The web client's `CreateSessionInput` no longer carries a
  `mode` field. The server still emits `mode` on the response, derived from
  players, so existing display code keeps working.
- Server tests added: bot-turn-protection (move/pass/resign all 409 during
  bot's turn) and stale-decision drop (forces a state change during the bot's
  delay window and asserts the loop emits a `stale` log instead of applying).
- Existing AI test "rejects mode mismatch" replaced with one that asserts the
  server silently ignores any `mode` field on input and derives it from
  players.

## 2026-05-04 — M3 Baseline AI opponents shipped (random + heuristic, server loop, web selector)

Milestone: M3 — Baseline AI Opponents
Status: deliverable shipped (milestone substantially complete; external engine adapter intentionally deferred)

- New `@tengen/ai-bots` workspace package with the shared `AiPlayer` contract,
  a `RandomBot` (`random-v1`), a `HeuristicBot` (`heuristic-v1`) that scores
  candidates by captures, atari avoidance, liberty counts, and edge-line
  preference, plus a small bot registry. Unit tests cover capture-when-offered,
  self-atari avoidance, game-over passing, and the registry shape.
- The server now stores `players: { black, white }` per session, derives
  `mode` (`humanVsHuman | humanVsAi | aiVsAi`) from those players, and exposes
  `GET /bots` for client-side discovery. `POST /sessions` accepts a `players`
  object; the previous behavior (no players → both human) still works.
- New `AiMoveLoop` schedules bot replies after every state-mutating route.
  Per-session lock prevents reentrancy; AI-vs-AI sessions chain moves until a
  human's turn, game-over, or error. Each AI move is logged as a single-line
  JSON event (`event: "ai_move"`) carrying `sessionId`, `moveNumber`, `color`,
  `bot.id`, `bot.version`, decision (play/pass), and `durationMs`. Timeouts
  and unrecognized/illegal returns fall back to a logged pass.
- Server tests cover `/bots` discovery, unknown bot rejection, mode-mismatch
  detection, human-vs-AI move flow with structured AI logs, and a full
  random-vs-heuristic AI-vs-AI 9x9 game ending with a valid result and SGF.
- `ServerSessionBar` now offers Black/White opponent selectors (Human / each
  registered bot) on the start screen and shows the active player roster
  ("Black: Random bot (bot) · White: Human") on the in-game bar. Strings are
  internationalized in both English and Simplified Chinese.

Acceptance criteria affected, by milestone:

- M3: human can play random and heuristic bots in the browser through the server — met (server tests + web UI; needs in-browser sanity-check pass).
- M3: two baseline bots can play each other through server-managed sessions — met (`runs an AI vs AI game to completion`).
- M3: external engine use is optional and never required for core development or tests — met (no external engine wired in; structure leaves room for one behind the same `AiPlayer` contract).
- M3: AI moves are logged with bot identity and version metadata — met (`AiMoveLoop` emits one structured `ai_move` log per move).

Follow-ups / known gaps:

- External engine (e.g. GTP / KataGo) adapter not implemented; deferred until needed for benchmarking in M7.
- AI logs go to stdout only; centralized structured logging will arrive with the model registry in M5.
- Manual two-tab + opponent-selector browser sanity-check still pending.

## 2026-05-04 — M2 follow-ups: body validation, deferred SSE subscribe

Milestone: M2 — Game Server MVP
Status: in progress (post-ship fixes)

- `POST /sessions` and `POST /sessions/:id/moves` now reject non-object JSON
  bodies (`null`, arrays, primitives) with `400 Request body must be a JSON
  object.` instead of returning a `500` `TypeError` from property access. New
  server test covers the four common non-object shapes.
- `useServerGame` no longer opens an SSE `EventSource` until the initial
  `getSession()` succeeds. For invalid/expired session ids the hook now shows
  the error page without leaving an `/events` connection retrying in the
  background.

## 2026-05-03 — M2 follow-ups: error/reset bugs, test hangs, i18n, SSE shutdown

Milestone: M2 — Game Server MVP
Status: in progress (post-ship fixes)

- Server-mode error UI is now reachable: `ServerTengenGame` checks the error
  branch before the loading branch, so a failed `getSession` no longer renders
  as a permanent spinner.
- "New game" / board-size change in server mode now performs a full navigation
  to the new `?session=` URL (`window.location.assign`) instead of
  `history.replaceState`, since `App` reads the session id once at mount.
- `apps/server` test harness now binds to `127.0.0.1` and rejects on
  `listen` errors, so test runs no longer hang on macOS sandboxes that block
  `0.0.0.0`.
- The M2 server UI is fully internationalized: `ServerSessionBar`,
  `ServerTengenGame`, and the `useServerGame` hook route every label and
  fallback string through a new `server` namespace on `TranslationBundle`.
  Both English and Simplified Chinese bundles are populated.
- Clean shutdown: `createHttpServer().close()` now calls
  `server.closeAllConnections()` so long-lived SSE responses do not block
  `SIGINT` / `SIGTERM`.



Milestone: M2 — Game Server MVP
Status: milestone complete (pending manual two-tab browser verification)

- `apps/server` is now a real authoritative game server, not a placeholder.
  Zero runtime dependencies — built on `node:http` + `@tengen/game-core` only.
- HTTP API:
  - `POST /sessions` — create (body: `{ size, mode }`, mode in
    `humanVsHuman | humanVsAi | aiVsAi`).
  - `GET /sessions` and `GET /sessions/:id` — list / fetch.
  - `POST /sessions/:id/moves` — play (body: `{ x, y }`).
  - `POST /sessions/:id/pass`, `/resign`, `/undo`.
  - `GET /sessions/:id/sgf` — returns SGF text.
  - `GET /sessions/:id/events` — Server-Sent Events stream of session state
    updates (initial state + every subsequent mutation), with 15-second
    keep-alive comments.
  - `GET /health`, plus permissive CORS and `OPTIONS` preflight.
- Storage is `InMemorySessionStore` behind a `SessionStore` interface so a
  durable backend can drop in later without touching the routes.
- All move/pass/resign/undo operations validate against `@tengen/game-core` —
  illegal moves return HTTP 409 with the engine's own error message.
- 14 server tests (`apps/server/test/server.test.ts`) cover the full
  lifecycle, illegal-move rejection (occupied + off-board), 400 on malformed
  payloads, two-pass game end, SGF endpoint, CORS preflight, and SSE delivery
  (initial event + post-move event over the same connection).
- Server scripts: `npm run dev -w @tengen/server` (watch mode, port 4000),
  `npm start -w @tengen/server`, `npm test -w @tengen/server`.
- Typed web client at `apps/web/src/server/client.ts` — `TengenServerClient`
  with `createSession`, `getSession`, `playMove`, `pass`, `resign`, `undo`,
  `exportSgf`, and `subscribe` (EventSource wrapper). Base URL configurable
  via `VITE_TENGEN_SERVER_URL` (defaults to `http://localhost:4000`).
- React hook `useServerGame(sessionId, t)` mirrors `useGoGame`'s return shape
  so the existing `BoardArea`, `SidePanel`, and other components reuse without
  modification. Settings persist locally; status messages and toast use the
  same i18n bundle as local play.
- UI integration:
  - `App.tsx` reads `?session=<id>` from the URL. Present → renders
    `<ServerTengenGame>`. Absent → renders the existing `<TengenGame>`
    (local play) untouched.
  - New `ServerSessionBar` is shown in both modes: in local mode it offers a
    "Start server game" button (creates a session, navigates to
    `?session=<id>`); in server mode it shows the truncated session id, a
    "Copy link" button (copies `window.location.href`), and a "Leave server
    game" link back to local.
- Acceptance criteria:
  - **M2: server rejects illegal moves using the shared game core** — met.
    Verified by tests (occupied / off-board / malformed payload) and live
    `curl` smoke (`POST /sessions/:id/moves` of an occupied point returns
    `409 {"error":"That intersection is occupied."}`).
  - **M2: browser can create and join a server-backed human vs human game** —
    met by code path. Two tabs hitting the same `?session=<id>` both call
    `useServerGame`, share the SSE stream, and see each other's moves. Final
    confirmation requires opening two browser tabs against `npm run dev` +
    a running server.
  - **M2: browser can request SGF for a server-backed game** — met. The
    "Export SGF" button in `SidePanel` calls `tengenServer.exportSgf(id)`
    which fetches `GET /sessions/:id/sgf`. Live smoke returns
    `(;GM[1]FF[4]CA[UTF-8]AP[Tengen:1]SZ[9]KM[6.5]RE[W+6.5];B[ee];W[dd];B[];W[])`.
  - **M2: local-only play remains available while server-backed play is
    introduced** — met. With no `?session=` query param, `App` renders the
    existing `TengenGame`/`useGoGame` flow with no behavior change.
- M2 deliverables not yet exercised by code: AI-vs-AI mode is accepted by
  `POST /sessions` but the server doesn't auto-play AI seats — that lands in
  M3 alongside the baseline bots. The session field is in place so M3 only
  needs to add the bot driver, not change the API surface.
- Follow-ups for the next session: load `npm run dev` + a running server in
  two browser tabs and play a human vs human game end to end (move, undo,
  pass-to-end, resign, SGF export) to close the manual verification gap.

## 2026-05-02 — M1 Shared Game Core extracted into @tengen/game-core

Milestone: M1 — Shared Game Core
Status: milestone complete (pending manual browser verification)

- Added `packages/game-core` workspace exporting all pure rules, types,
  scoring, and SGF helpers (`createInitialState`, `evaluateMove`,
  `playMoveOnGame`, `passOnGame`, `resignOnGame`, `undoOnGame`, `computeScore`,
  `buildSgf`, `getLegalMoves`, `getPublicState`, plus `GameState`,
  `PublicGameState`, `ControllerMove`, `LegalMove`, `MoveLogEntry`, etc.).
- `apps/web` now imports the engine and shared types from `@tengen/game-core`.
  `apps/web/src/types.ts` re-exports everything from the package and only
  defines web-only types (`BoardSettings`, `BoardMetrics`, `PlayMoveOptions`,
  `TengenApi`). The duplicate `apps/web/src/game/goEngine.ts` was removed.
- `apps/server` depends on `@tengen/game-core` and runs a smoke script
  (`npm run smoke -w @tengen/server`) that creates a game, plays a move,
  passes twice, and prints the SGF — proving the package works in pure Node
  without any browser dependencies.
- Added 12 unit tests in `packages/game-core/test/engine.test.ts` covering
  single-stone capture, multi-stone capture, suicide rejection, capture-as-
  not-suicide, positional superko (ko recapture rejected), two-pass game end,
  resignation, undo, single-color territory, neutral region (dame), SGF
  header/move encoding, and SGF result tag.
- Added `npm test` at the workspace root; runs game-core tests via Node 24's
  built-in test runner with `--experimental-transform-types` (zero TS deps).
- Acceptance criteria:
  - **M1: web and server build from the same game-state schema** — met. Both
    workspaces typecheck against `@tengen/game-core` source; server smoke run
    succeeds.
  - **M1: unit tests cover representative captures, suicide, superko, pass,
    resign, scoring, and SGF cases** — met (12/12 passing).
  - **M1: web behavior remains unchanged after the extraction** — typecheck,
    lint, and `vite build` all pass; engine source is byte-identical to the
    pre-extraction copy. Final confirmation requires loading the dev server
    in a browser and exercising play / pass / resign / undo / score / SGF.

## 2026-05-02 — Roadmap and release-notes mechanism established

Milestone: Cross-cutting
Status: process change

- Added `docs/AI_ROADMAP.md` defining milestones M0 through M7, the target
  architecture, the shared `AiPlayer` contract, and the hybrid inference plan
  (Python training, ONNX artifact, server inference via ONNX Runtime, browser
  inference via `onnxruntime-web` with WebGPU and a WASM fallback).
- Added `CLAUDE.md` with the rule to maintain this file when roadmap
  deliverables or acceptance criteria are met.
- Added this file as the source of truth for milestone progress.
- M0 acceptance criteria are already met by the existing web client; no work
  required to close M0.
