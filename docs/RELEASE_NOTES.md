# Tengen Release Notes

Append-only log of milestone progress against `docs/AI_ROADMAP.md`. Newest
entries go at the top. See `CLAUDE.md` for the entry format and the rules for
when to add an entry.

Current milestone: **M0 — Current Baseline** (existing). M1 not yet started.

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
