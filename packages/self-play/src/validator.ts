import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { isSupportedBoardSize } from "@tengen/game-core";

import { replayRecord } from "./replay.ts";
import {
  TRAINING_RECORD_SCHEMA_VERSION,
  type BatchManifest,
  type TrainingRecord,
} from "./types.ts";

export interface DatasetIssue {
  file: string;
  kind:
    | "unreadable"
    | "invalid-json"
    | "schema-mismatch"
    | "shape"
    | "illegal-replay"
    | "non-terminal"
    | "duplicate-record-id"
    | "duplicate-position-history";
  message: string;
}

export interface DatasetReport {
  /** Records that loaded and replayed cleanly. */
  ok: number;
  /** Records that failed at least one check. */
  failed: number;
  /** All issues in the order they were discovered. */
  issues: DatasetIssue[];
  /** Manifest file (if found). */
  manifest: BatchManifest | null;
  /** All record ids seen. */
  recordIds: string[];
}

export interface ValidatorOptions {
  /**
   * If true, treat truncated (`terminal: false`) records as failures.
   * Defaults to false — `max-moves` truncation is informational, not a
   * data-corruption signal.
   */
  requireTerminal?: boolean;
}

/**
 * Walk a self-play output directory and validate every record.
 * Loads manifest.json (optional), then every *.json record file, runs each
 * through the replayer, and checks for duplicate ids and identical
 * position-histories (a strong dupe signal even across different ids).
 */
export async function validateDataset(
  dir: string,
  options: ValidatorOptions = {},
): Promise<DatasetReport> {
  const issues: DatasetIssue[] = [];
  let manifest: BatchManifest | null = null;

  const entries = await readdir(dir);
  const recordFiles = entries.filter((f) => f.endsWith(".json") && f !== "manifest.json").sort();

  if (entries.includes("manifest.json")) {
    try {
      const raw = await readFile(join(dir, "manifest.json"), "utf8");
      const parsed = JSON.parse(raw) as BatchManifest;
      if (parsed.schemaVersion !== TRAINING_RECORD_SCHEMA_VERSION) {
        issues.push({
          file: "manifest.json",
          kind: "schema-mismatch",
          message: `Manifest schemaVersion ${parsed.schemaVersion} != expected ${TRAINING_RECORD_SCHEMA_VERSION}.`,
        });
      } else {
        manifest = parsed;
      }
    } catch (err) {
      issues.push({
        file: "manifest.json",
        kind: "invalid-json",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  let ok = 0;
  let failed = 0;
  const recordIds: string[] = [];
  const seenIds = new Map<string, string>();
  const seenHashes = new Map<string, string>();

  for (const file of recordFiles) {
    let raw: string;
    try {
      raw = await readFile(join(dir, file), "utf8");
    } catch (err) {
      issues.push({
        file,
        kind: "unreadable",
        message: err instanceof Error ? err.message : String(err),
      });
      failed += 1;
      continue;
    }

    let record: TrainingRecord;
    try {
      record = JSON.parse(raw) as TrainingRecord;
    } catch (err) {
      issues.push({
        file,
        kind: "invalid-json",
        message: err instanceof Error ? err.message : String(err),
      });
      failed += 1;
      continue;
    }

    const shape = checkRecordShape(record);
    if (shape) {
      issues.push({ file, kind: "shape", message: shape });
      failed += 1;
      continue;
    }

    if (record.schemaVersion !== TRAINING_RECORD_SCHEMA_VERSION) {
      issues.push({
        file,
        kind: "schema-mismatch",
        message: `Record schemaVersion ${record.schemaVersion} != expected ${TRAINING_RECORD_SCHEMA_VERSION}.`,
      });
      failed += 1;
      continue;
    }

    let recordFailed = false;

    if (seenIds.has(record.recordId)) {
      issues.push({
        file,
        kind: "duplicate-record-id",
        message: `recordId ${record.recordId} also appears in ${seenIds.get(record.recordId)}.`,
      });
      recordFailed = true;
    } else {
      seenIds.set(record.recordId, file);
      recordIds.push(record.recordId);
    }

    const replay = replayRecord(record);
    if (!replay.ok) {
      issues.push({ file, kind: "illegal-replay", message: replay.error });
      recordFailed = true;
    } else {
      // Position-history fingerprint: serialized final board + move count is
      // a cheap but strong dupe signal across records of the same matchup.
      const hash = `${record.boardSize}|${record.moves.length}|${record.finalBoard}`;
      const prior = seenHashes.get(hash);
      if (prior) {
        issues.push({
          file,
          kind: "duplicate-position-history",
          message: `final-board fingerprint matches ${prior}.`,
        });
        recordFailed = true;
      } else {
        seenHashes.set(hash, file);
      }

      if (options.requireTerminal && !record.terminal) {
        issues.push({
          file,
          kind: "non-terminal",
          message: `record.terminal=false (endReason=${record.endReason}) but requireTerminal was set.`,
        });
        recordFailed = true;
      }
    }

    if (recordFailed) failed += 1;
    else ok += 1;
  }

  return { ok, failed, issues, manifest, recordIds };
}

/** Returns null if the record matches the expected shape, else an error string. */
function checkRecordShape(record: TrainingRecord): string | null {
  if (typeof record !== "object" || record === null) return "record is not an object.";
  if (typeof record.recordId !== "string" || record.recordId.length === 0) {
    return "recordId missing or empty.";
  }
  if (!isSupportedBoardSize(record.boardSize)) {
    return `Unsupported boardSize ${record.boardSize}.`;
  }
  if (typeof record.seed !== "number" || !Number.isFinite(record.seed)) {
    return "seed must be a finite number.";
  }
  if (typeof record.rulesPackageVersion !== "string") {
    return "rulesPackageVersion missing.";
  }
  if (typeof record.generatedAt !== "string" || Number.isNaN(Date.parse(record.generatedAt))) {
    return "generatedAt must be an ISO 8601 string.";
  }
  if (!record.players || typeof record.players !== "object") return "players missing.";
  for (const role of ["B", "W"] as const) {
    const p = record.players[role];
    if (!p || typeof p !== "object") return `players.${role} missing.`;
    if (typeof p.id !== "string" || typeof p.version !== "string") {
      return `players.${role} missing id/version.`;
    }
    if (typeof p.seed !== "number" || !Number.isFinite(p.seed)) {
      return `players.${role}.seed must be a finite number.`;
    }
  }
  if (!Array.isArray(record.moves)) return "moves must be an array.";
  if (typeof record.finalBoard !== "string") return "finalBoard missing.";
  if (typeof record.terminal !== "boolean") return "terminal must be a boolean.";
  return null;
}
