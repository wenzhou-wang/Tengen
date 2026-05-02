# Tengen AI Roadmap

This roadmap defines the hybrid path for turning Tengen into a web-playable AI Go
system: build the shared game and server foundation first, add simple playable AI
opponents quickly, then train stronger custom models behind repeatable evaluation
and promotion gates.

## Target Architecture

- `apps/web` owns browser interaction, local board rendering, and game review controls.
- `apps/server` owns authoritative game state for online and AI-backed sessions.
- A shared game core validates board sizes, legal moves, captures, passing, resigning,
  scoring, serialization, and SGF export consistently across web and server.
- The web client calls the server for session creation, game actions, AI move requests,
  AI-vs-AI control, saved records, and model metadata.
- AI players expose a common `getMove(gameState)` interface compatible with the
  current `window.Tengen` controller shape. The contract is deployment-agnostic:
  a `model` player may run server-side or directly in the browser.
- Training runs in Python. Trained models are exported to ONNX as the canonical
  artifact format so the same weights can be served from a Python or Rust/C++
  server and from the browser via `onnxruntime-web`.
- Browser inference uses ONNX Runtime Web with the WebGPU backend when available
  and a WASM fallback for older browsers, enabling zero-cost AI play without a
  server round trip.
- The web/server boundary remains typed and stable for TypeScript consumers
  regardless of where inference executes.

Expected AI player contract:

```ts
interface AiPlayer {
  id: string;
  label: string;
  kind: "random" | "heuristic" | "external" | "model";
  getMove(gameState: PublicGameState): Promise<ControllerMove>;
}
```

## Milestone 0: Current Baseline

Status: existing.

Tengen currently has a React and TypeScript Vite web client in `apps/web`, a local
rules engine in `apps/web/src/game/goEngine.ts`, local persistence, SGF export, and
a browser controller hook exposed through `window.Tengen`. The server workspace
exists at `apps/server` as a placeholder for future AI-backed game sessions.

Acceptance criteria:

- Human players can play local games on 9x9, 13x13, and 19x19 boards.
- The rules engine enforces legal moves, captures, suicide prevention, and positional
  superko prevention.
- Games can be exported to SGF.
- A browser-side AI controller can return a move through `getMove(state)`.

## Milestone 1: Shared Game Core

Extract reusable rules, types, serialization, scoring, and SGF helpers into a shared
workspace package such as `@tengen/game-core`.

Deliverables:

- Shared `GameState`, `PublicGameState`, `ControllerMove`, legal move, and move log
  types.
- Shared pure functions for game creation, legal move evaluation, move application,
  pass, resign, undo snapshots, score estimates, and SGF generation.
- `apps/web` consumes the shared package instead of owning the only rules copy.
- `apps/server` can import the same package without browser dependencies.

Acceptance criteria:

- Web behavior remains unchanged after the extraction.
- Unit tests cover representative captures, suicide, superko, pass, resign, scoring,
  and SGF cases in the shared package.
- Web and server build from the same game-state schema.

## Milestone 2: Game Server MVP

Implement the first authoritative game server for online and AI-backed sessions.

Deliverables:

- HTTP API for creating sessions, fetching game state, playing moves, passing,
  resigning, undo policy, and SGF export.
- WebSocket or server-sent event stream for live session updates.
- Session modes for human vs human, human vs AI, and AI vs AI.
- In-memory storage first, with an interface that can later be backed by durable
  persistence.
- Typed client helpers in the web app for server-backed sessions.

Acceptance criteria:

- The server rejects illegal moves using the shared game core.
- The browser can create and join a server-backed human vs human game.
- The browser can request SGF for a server-backed game.
- Local-only play remains available while server-backed play is introduced.

## Milestone 3: Baseline AI Opponents

Add simple opponents that make AI games playable before custom model training is
ready.

Deliverables:

- Random legal-move bot.
- Basic heuristic bot using simple Go features such as captures, atari avoidance,
  liberties, passing behavior, and board position preferences.
- Optional external engine adapter for benchmark opponents, isolated behind the same
  AI player contract.
- AI timeout, error, and resignation behavior.

Acceptance criteria:

- A human can play against random and heuristic bots in the browser through the
  server.
- Two baseline bots can play each other through server-managed sessions.
- External engine use is optional and never required for core development or tests.
- AI moves are logged with bot identity and version metadata.

## Milestone 4: Self-Play and Data Pipeline

Create the repeatable pipeline for AI-vs-AI games and training data collection.

Deliverables:

- Batch self-play runner for AI-vs-AI matches across board sizes and seeds.
- SGF and structured training record storage.
- Replay tooling that can reconstruct games from stored records.
- Basic dataset validation for legal moves, terminal states, duplicate games, and
  corrupted records.
- Evaluation fixtures that can be reused in tests and model comparisons.

Acceptance criteria:

- Self-play can generate reproducible games from a known bot version and seed.
- Stored records can be replayed through the shared game core without illegal states.
- Data exports are versioned by rules package, bot/model version, board size, and
  generation date.

## Milestone 5: First Trainable Model

Train and serve the first custom model without requiring it to be strong immediately.

Deliverables:

- Initial policy/value model target for legal move selection and position evaluation.
- Training loop in Python (PyTorch) that consumes generated records and validation
  splits.
- ONNX export step as the canonical artifact format, with a quantized variant
  produced for browser delivery.
- Model registry metadata covering training data version, code version, board sizes,
  evaluation results, ONNX artifact hashes, and promotion status.
- Server-side inference path using ONNX Runtime (Python first; Rust/C++ deferred
  until MCTS or per-call overhead requires it) that implements the shared
  `getMove(gameState)` contract.
- Evaluation harness for model vs baseline bot matches.

Acceptance criteria:

- A trained model can complete legal games through the server.
- Model artifacts are reproducible from documented data and training configuration.
- Each registered model records training data version, code version, board sizes,
  evaluation results, and promotion status.

## Milestone 6: Web AI Experience

Expose AI play and observation as first-class browser workflows.

Deliverables:

- UI for choosing human, random bot, heuristic bot, external benchmark, or registered
  model opponents.
- In-browser model execution via `onnxruntime-web` using the WebGPU backend with a
  WASM fallback, consuming the quantized ONNX artifact produced in Milestone 5.
- Backend selection (WebGPU vs WASM) with capability detection, first-load weight
  caching, and a visible indicator of where inference is running (browser vs server).
- AI-vs-AI viewing mode with start, pause, step, resume, and replay controls.
- Basic model and bot metadata in the game UI, including which inference target a
  given session is using.
- Session history with SGF export and replay from saved games.
- Clear loading, thinking, timeout, and error states for AI moves, including model
  download progress and WebGPU initialization failures.

Acceptance criteria:

- A human can start and finish a browser game against a selected AI opponent.
- A registered model can run end-to-end in the browser via WebGPU, with a WASM
  fallback exercised on a browser without WebGPU support.
- A human can watch two AIs play through the browser.
- AI games can be paused, stepped, resumed, replayed, and exported.
- The UI distinguishes baseline bots, benchmark engines, and custom models, and
  shows whether inference is running in the browser or on the server.

## Milestone 7: Evaluation and Iteration

Make model improvement measurable before stronger models become selectable.

Deliverables:

- Rating ladder for bots and models.
- Scheduled benchmark matches against fixed baseline opponents.
- Regression tests for legal move quality, server API contracts, and replay
  compatibility.
- Promotion criteria for deciding when a model becomes selectable in the web UI.
- Dashboard or report for win rates, illegal move rate, resignation behavior, average
  game length, and benchmark history.

Acceptance criteria:

- New models must pass legality, reproducibility, and benchmark gates before
  promotion.
- Regressions against baseline opponents are visible before deployment.
- Evaluation records are tied to exact model artifacts and game-core versions.

## Roadmap Acceptance Criteria

The roadmap is complete when:

- A human can play an AI through the browser.
- A human can watch AI-vs-AI games through the browser.
- Server-backed games are reproducible and exportable.
- New models can be benchmarked before becoming selectable.
- Web, server, AI players, and training jobs agree on legal moves through the shared
  game core.

## Suggested Implementation Order

1. Move rules and types into a shared package with focused tests.
2. Add server-backed sessions using in-memory storage.
3. Wire the web client to create and play server-backed sessions.
4. Add random and heuristic bots through the shared AI player contract.
5. Add self-play record generation and replay validation.
6. Train the first model in Python, export to ONNX, and serve it from the server
   behind the same AI contract.
7. Ship the same ONNX artifact (quantized) to the browser via `onnxruntime-web`
   with WebGPU and a WASM fallback.
8. Build web controls for AI selection, AI-vs-AI viewing, and model metadata,
   including the browser-vs-server inference indicator.
9. Add evaluation gates and model promotion workflow.
