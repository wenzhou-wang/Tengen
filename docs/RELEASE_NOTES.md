# Tengen Release Notes

Append-only log of milestone progress against `docs/AI_ROADMAP.md`. Newest
entries go at the top. See `CLAUDE.md` for the entry format and the rules for
when to add an entry.

Current milestone: **M2 — Game Server MVP** (complete pending in-browser
sanity-check). M3 not yet started.

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
