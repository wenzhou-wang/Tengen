import { createHash } from "node:crypto";

import type { BoardSize } from "@tengen/game-core";

/**
 * Derive a per-player seed from the master match seed. Stable across runs:
 * `derivePlayerSeed(seed, "B")` always yields the same uint32. Uses splitmix32
 * on `(seed XOR roleSalt)` so identical master seeds produce different B/W
 * sequences.
 */
export function derivePlayerSeed(masterSeed: number, role: "B" | "W"): number {
  const salt = role === "B" ? 0x9e3779b9 : 0x6a09e667;
  let x = ((masterSeed >>> 0) ^ salt) >>> 0;
  x = (x + 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x;
}

/**
 * Stable id for a record from its inputs; identical inputs always produce
 * the same id. Used as the filename and as the dataset-level dedupe key.
 */
export function computeRecordId(input: {
  boardSize: BoardSize;
  seed: number;
  black: { id: string; version: string };
  white: { id: string; version: string };
  rulesPackageVersion: string;
}): string {
  const canonical = JSON.stringify({
    s: input.boardSize,
    seed: input.seed >>> 0,
    b: `${input.black.id}@${input.black.version}`,
    w: `${input.white.id}@${input.white.version}`,
    r: input.rulesPackageVersion,
  });
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}
