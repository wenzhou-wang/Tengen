import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { GAME_CORE_VERSION, type BoardSize } from "@tengen/game-core";
import { listBotMetadata, type BotId } from "@tengen/ai-bots";

import { playMatch } from "./match.ts";
import {
  TRAINING_RECORD_SCHEMA_VERSION,
  type BatchManifest,
  type TrainingRecord,
} from "./types.ts";

export interface BatchPairing {
  black: BotId;
  white: BotId;
}

export interface BatchConfig {
  outputDir: string;
  /** Master seed for the run. Per-match seeds are derived from this. */
  baseSeed: number;
  /** Board sizes to play; one match per (size × pairing × matchIndex). */
  boardSizes: BoardSize[];
  /** Bot pairings (B vs W). At least one. */
  pairings: BatchPairing[];
  /** Number of matches per (size × pairing). */
  matchesPerCell: number;
  /** Optional cap on plies per game; forwarded to playMatch. */
  maxMoves?: number;
  /** Override clock for deterministic manifests in tests. */
  now?: () => Date;
  /** Called before each match starts; useful for progress logs. */
  onMatchStart?: (info: BatchMatchInfo) => void;
  /** Called after each match completes. */
  onMatchComplete?: (info: BatchMatchInfo, record: TrainingRecord) => void;
}

export interface BatchMatchInfo {
  index: number;
  total: number;
  boardSize: BoardSize;
  black: BotId;
  white: BotId;
  seed: number;
}

export interface BatchOutput {
  manifest: BatchManifest;
  manifestPath: string;
  records: TrainingRecord[];
}

/**
 * Run a batch of self-play matches, writing one JSON record + one SGF per
 * match plus a single manifest.json that stamps the dataset's
 * (rules version, bot versions, board sizes, generation date).
 */
export async function runBatch(config: BatchConfig): Promise<BatchOutput> {
  if (config.pairings.length === 0) {
    throw new Error("runBatch: at least one pairing is required.");
  }
  if (config.boardSizes.length === 0) {
    throw new Error("runBatch: at least one board size is required.");
  }
  if (config.matchesPerCell <= 0) {
    throw new Error("runBatch: matchesPerCell must be > 0.");
  }

  await mkdir(config.outputDir, { recursive: true });
  const now = config.now ?? (() => new Date());

  const total = config.boardSizes.length * config.pairings.length * config.matchesPerCell;
  const records: TrainingRecord[] = [];
  const recordFiles: string[] = [];
  let index = 0;

  for (const size of config.boardSizes) {
    for (const pairing of config.pairings) {
      for (let i = 0; i < config.matchesPerCell; i += 1) {
        index += 1;
        const seed = deriveMatchSeed(config.baseSeed, size, pairing, i);
        const info: BatchMatchInfo = {
          index,
          total,
          boardSize: size,
          black: pairing.black,
          white: pairing.white,
          seed,
        };
        config.onMatchStart?.(info);
        const result = await playMatch({
          boardSize: size,
          black: pairing.black,
          white: pairing.white,
          seed,
          maxMoves: config.maxMoves,
          now,
        });
        const baseName = `${size}-${pairing.black}-vs-${pairing.white}-${result.record.recordId}`;
        const recordFile = `${baseName}.json`;
        const sgfFile = `${baseName}.sgf`;
        await writeFile(
          join(config.outputDir, recordFile),
          `${JSON.stringify(result.record, null, 2)}\n`,
          "utf8",
        );
        await writeFile(join(config.outputDir, sgfFile), `${result.sgf}\n`, "utf8");
        records.push(result.record);
        recordFiles.push(recordFile);
        config.onMatchComplete?.(info, result.record);
      }
    }
  }

  const usedBotIds = new Set<string>();
  for (const p of config.pairings) {
    usedBotIds.add(p.black);
    usedBotIds.add(p.white);
  }
  const allBots = listBotMetadata();
  const bots = allBots
    .filter((b) => usedBotIds.has(b.id))
    .map((b) => ({ id: b.id, version: b.version, kind: b.kind }));

  const manifest: BatchManifest = {
    schemaVersion: TRAINING_RECORD_SCHEMA_VERSION,
    rulesPackageVersion: GAME_CORE_VERSION,
    generatedAt: now().toISOString(),
    baseSeed: config.baseSeed >>> 0,
    boardSizes: config.boardSizes.slice(),
    pairings: config.pairings.map((p) => ({ black: p.black, white: p.white })),
    bots,
    matchCount: records.length,
    records: recordFiles,
  };

  const manifestPath = join(config.outputDir, "manifest.json");
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return { manifest, manifestPath, records };
}

/**
 * Derive a unique 32-bit seed for a match cell from the run's base seed,
 * board size, pairing, and within-cell match index. Stable across runs.
 */
function deriveMatchSeed(
  baseSeed: number,
  size: BoardSize,
  pairing: BatchPairing,
  matchIndex: number,
): number {
  let h = (baseSeed >>> 0) ^ 0x811c9dc5;
  h = mix(h, size);
  h = mix(h, hashString(pairing.black));
  h = mix(h, hashString(pairing.white));
  h = mix(h, matchIndex >>> 0);
  return h >>> 0;
}

function mix(state: number, value: number): number {
  let x = (state ^ (value >>> 0)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x;
}

function hashString(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
