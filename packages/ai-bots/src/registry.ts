import { createHeuristicBot } from "./heuristic.ts";
import { createRandomBot } from "./random.ts";
import type { AiPlayer } from "./types.ts";

export type BotId = "random-v1" | "heuristic-v1";

export const BOT_IDS: readonly BotId[] = ["random-v1", "heuristic-v1"];

export function isBotId(value: unknown): value is BotId {
  return typeof value === "string" && (BOT_IDS as readonly string[]).includes(value);
}

export function createBot(id: BotId): AiPlayer {
  if (id === "random-v1") return createRandomBot();
  if (id === "heuristic-v1") return createHeuristicBot();
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
