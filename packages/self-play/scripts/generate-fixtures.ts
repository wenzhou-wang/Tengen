#!/usr/bin/env node
/**
 * Regenerate the committed evaluation fixtures under `fixtures/`.
 *
 * Run with:
 *   node --experimental-transform-types --no-warnings packages/self-play/scripts/generate-fixtures.ts
 *
 * The output is deterministic for a given (baseSeed, pairings, sizes,
 * matchesPerCell), and `now` is pinned so committed records are stable.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runBatch } from "../src/runner.ts";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "..", "fixtures");

const FIXTURE_DATE = new Date("2026-05-08T00:00:00.000Z");

await runBatch({
  outputDir: outDir,
  baseSeed: 2026,
  boardSizes: [9],
  pairings: [
    { black: "random-v1", white: "random-v1" },
    { black: "random-v1", white: "heuristic-v1" },
    { black: "heuristic-v1", white: "random-v1" },
    { black: "heuristic-v1", white: "heuristic-v1" },
  ],
  matchesPerCell: 1,
  now: () => FIXTURE_DATE,
});

process.stdout.write(`Fixtures written to ${outDir}\n`);
