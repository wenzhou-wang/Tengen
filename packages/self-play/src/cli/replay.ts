#!/usr/bin/env node
import { readFile } from "node:fs/promises";

import { replayRecord } from "../replay.ts";
import type { TrainingRecord } from "../types.ts";

async function main(): Promise<void> {
  const file = process.argv[2];
  if (!file) {
    process.stderr.write("Usage: tengen-replay <record.json>\n");
    process.exit(2);
  }
  const raw = await readFile(file, "utf8");
  const record = JSON.parse(raw) as TrainingRecord;
  const result = replayRecord(record);
  if (!result.ok) {
    process.stderr.write(`FAIL ${record.recordId ?? "(no id)"}: ${result.error}\n`);
    process.exit(1);
  }
  process.stdout.write(
    `OK   ${record.recordId} size=${record.boardSize} moves=${record.moves.length} result=${
      record.result || "(non-terminal)"
    }\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`tengen-replay failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
