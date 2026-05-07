import { createHeuristicBot } from "./heuristic.ts";
import { createRandomBot } from "./random.ts";
import { createMulberry32 } from "./rng.ts";
import type { AiPlayer } from "./types.ts";

export type BotId = "random-v1" | "heuristic-v1";

export const BOT_IDS: readonly BotId[] = ["random-v1", "heuristic-v1"];

export function isBotId(value: unknown): value is BotId {
  return typeof value === "string" && (BOT_IDS as readonly string[]).includes(value);
}

export interface CreateBotOptions {
  /** Seed a deterministic PRNG. Ignored when `rng` is supplied. */
  seed?: number;
  /** Explicit RNG override; takes precedence over `seed`. */
  rng?: () => number;
}

export function createBot(id: BotId, options: CreateBotOptions = {}): AiPlayer {
  const rng =
    options.rng ?? (typeof options.seed === "number" ? createMulberry32(options.seed) : undefined);
  if (id === "random-v1") return createRandomBot({ rng });
  if (id === "heuristic-v1") return createHeuristicBot({ rng });
  throw new Error(`Unknown bot id: ${id as string}`);
}

export interface BotMetadata {
  id: BotId;
  label: string;
  version: string;
  kind: AiPlayer["kind"];
}

export function listBotMetadata(): BotMetadata[] {
  return BOT_IDS.map((id) => {
    const bot = createBot(id);
    return { id, label: bot.label, version: bot.version, kind: bot.kind };
  });
}
