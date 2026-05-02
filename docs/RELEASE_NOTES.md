# Tengen Release Notes

Append-only log of milestone progress against `docs/AI_ROADMAP.md`. Newest
entries go at the top. See `CLAUDE.md` for the entry format and the rules for
when to add an entry.

Current milestone: **M1 — Shared Game Core** (complete pending in-browser
sanity-check). M2 not yet started.

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
