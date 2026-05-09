#!/usr/bin/env node
import { isBotId, type BotId } from "@tengen/ai-bots";
import { isSupportedBoardSize, type BoardSize } from "@tengen/game-core";

import { runBatch, type BatchPairing } from "../runner.ts";

interface Args {
  out: string;
  seed: number;
  sizes: BoardSize[];
  pairings: BatchPairing[];
  matches: number;
  maxMoves?: number;
}

function usage(): never {
  process.stderr.write(
    [
      "tengen-selfplay --out <dir> [options]",
      "",
      "Options:",
      "  --out <dir>              Output directory (required).",
      "  --seed <int>             Master seed (default 1).",
      "  --sizes 9,13,19          Comma-separated board sizes (default 9).",
      "  --pairings B:W[,...]     Pairings, e.g. random-v1:heuristic-v1 (default random-v1:random-v1).",
      "  --matches <n>            Matches per (size × pairing) (default 1).",
      "  --max-moves <n>          Cap plies per game (default 4*size*size).",
      "",
    ].join("\n"),
  );
  process.exit(2);
}

function parseArgs(argv: string[]): Args {
  let out: string | undefined;
  let seed = 1;
  let sizesRaw = "9";
  let pairingsRaw = "random-v1:random-v1";
  let matches = 1;
  let maxMoves: number | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--out":
        out = next;
        i += 1;
        break;
      case "--seed":
        seed = Number.parseInt(next ?? "", 10);
        i += 1;
        break;
      case "--sizes":
        sizesRaw = next ?? "";
        i += 1;
        break;
      case "--pairings":
        pairingsRaw = next ?? "";
        i += 1;
        break;
      case "--matches":
        matches = Number.parseInt(next ?? "", 10);
        i += 1;
        break;
      case "--max-moves":
        maxMoves = Number.parseInt(next ?? "", 10);
        i += 1;
        break;
      case "--help":
      case "-h":
        usage();
      // eslint-disable-next-line no-fallthrough
      default:
        process.stderr.write(`Unknown arg: ${arg}\n`);
        usage();
    }
  }

  if (!out) {
    process.stderr.write("Missing required --out <dir>.\n");
    usage();
  }
  if (!Number.isFinite(seed)) usage();
  if (!Number.isFinite(matches) || matches <= 0) usage();

  const sizes = sizesRaw
    .split(",")
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => isSupportedBoardSize(n)) as BoardSize[];
  if (sizes.length === 0) {
    process.stderr.write("--sizes must include at least one of 9, 13, 19.\n");
    usage();
  }

  const pairings: BatchPairing[] = pairingsRaw.split(",").map((p) => {
    const [b, w] = p.split(":").map((s) => s.trim());
    if (!isBotId(b) || !isBotId(w)) {
      process.stderr.write(`Invalid pairing: ${p}. Use <botId>:<botId>.\n`);
      usage();
    }
    return { black: b as BotId, white: w as BotId };
  });

  return { out, seed, sizes, pairings, matches, maxMoves };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const start = Date.now();
  const result = await runBatch({
    outputDir: args.out,
    baseSeed: args.seed,
    boardSizes: args.sizes,
    pairings: args.pairings,
    matchesPerCell: args.matches,
    maxMoves: args.maxMoves,
    onMatchStart: (info) => {
      process.stdout.write(
        `[${info.index}/${info.total}] ${info.boardSize}x${info.boardSize} ${info.black} vs ${info.white} (seed ${info.seed})\n`,
      );
    },
    onMatchComplete: (info, record) => {
      process.stdout.write(
        `  -> ${record.recordId} ${record.result || "(non-terminal)"} (${record.moves.length} plies, ${record.endReason})\n`,
      );
    },
  });
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  process.stdout.write(
    `Wrote ${result.records.length} records + manifest to ${args.out} in ${elapsed}s.\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`tengen-selfplay failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
