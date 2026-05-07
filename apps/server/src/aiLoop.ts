import {
  BLACK,
  getPublicState,
  isUnlimitedTimeControl,
  timeUntilLossMs,
  type ControllerMove,
  type PlayerColor,
} from "@tengen/game-core";
import { type AiMoveContext, type AiPlayer, type BotId, createBot, isBotId } from "@tengen/ai-bots";

import type { SessionService } from "./sessions.ts";
import type { SessionRecord } from "./store.ts";

export interface AiLoopOptions {
  /** Hard ceiling for a single AI move, in milliseconds. */
  maxMoveTimeoutMs?: number;
  /** Floor for a single AI move so the bot has minimum think time. */
  minMoveTimeoutMs?: number;
  /** For unlimited games or generous main time, a sensible default budget. */
  defaultMoveTimeoutMs?: number;
  /** Backward-compatible alias for defaultMoveTimeoutMs. */
  moveTimeoutMs?: number;
  /** Delay between AI moves so AI-vs-AI play is observable in the UI. */
  delayMs?: number;
  /** Optional logger; defaults to console.log. */
  log?: (line: string) => void;
}

export interface AiMoveLogPayload {
  sessionId: string;
  moveNumber: number;
  color: "B" | "W";
  bot: { id: string; version: string };
  decision:
    | { type: "play"; x: number; y: number; coord: string }
    | { type: "pass" }
    | { type: "fallback-pass"; reason: string }
    | { type: "stale"; reason: string };
  durationMs: number;
}

const DEFAULT_MAX_TIMEOUT = 30_000;
const DEFAULT_MIN_TIMEOUT = 100;
const DEFAULT_TIMEOUT = 5_000;
const DEFAULT_DELAY = 50;

interface DecisionContext {
  sessionId: string;
  moveNumber: number;
  color: PlayerColor;
  botId: string;
  botVersion: string;
}

export class AiMoveLoop {
  readonly #service: SessionService;
  readonly #maxTimeoutMs: number;
  readonly #minTimeoutMs: number;
  readonly #defaultTimeoutMs: number;
  readonly #delayMs: number;
  readonly #log: (line: string) => void;
  readonly #running = new Set<string>();
  readonly #botCache = new Map<string, AiPlayer>();
  #disposed = false;

  constructor(service: SessionService, options: AiLoopOptions = {}) {
    this.#service = service;
    this.#maxTimeoutMs = options.maxMoveTimeoutMs ?? DEFAULT_MAX_TIMEOUT;
    this.#minTimeoutMs = options.minMoveTimeoutMs ?? DEFAULT_MIN_TIMEOUT;
    this.#defaultTimeoutMs =
      options.defaultMoveTimeoutMs ?? options.moveTimeoutMs ?? DEFAULT_TIMEOUT;
    this.#delayMs = options.delayMs ?? DEFAULT_DELAY;
    this.#log = options.log ?? ((line) => console.log(line));
  }

  /** Kick off an AI move turn for the session if the current player is a bot. */
  schedule(session: SessionRecord): void {
    if (this.#disposed) return;
    if (!this.#isBotTurn(session)) return;
    if (this.#running.has(session.id)) return;
    this.#running.add(session.id);
    void this.#runLoop(session.id).finally(() => {
      this.#running.delete(session.id);
    });
  }

  dispose(): void {
    this.#disposed = true;
  }

  #isBotTurn(session: SessionRecord): boolean {
    if (session.game.gameOver) return false;
    const spec = session.players[session.game.current === BLACK ? "black" : "white"];
    return spec.kind === "bot";
  }

  #getBot(id: string): AiPlayer | null {
    if (!isBotId(id)) return null;
    let bot = this.#botCache.get(id);
    if (!bot) {
      bot = createBot(id as BotId);
      this.#botCache.set(id, bot);
    }
    return bot;
  }

  async #runLoop(sessionId: string): Promise<void> {
    while (!this.#disposed) {
      const current = this.#service.peek(sessionId);
      if (!current) return;
      if (!this.#isBotTurn(current)) return;

      const colorKey = current.game.current === BLACK ? "black" : "white";
      const spec = current.players[colorKey];
      if (spec.kind !== "bot") return;
      const bot = this.#getBot(spec.id);
      if (!bot) {
        this.#fallbackPass(current, spec, `unknown bot id: ${spec.id}`);
        return;
      }

      const ctx: DecisionContext = {
        sessionId,
        moveNumber: current.game.moveNumber,
        color: current.game.current,
        botId: spec.id,
        botVersion: spec.version,
      };

      if (this.#delayMs > 0) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, this.#delayMs);
          timer.unref?.();
        });
      }

      const startedAt = Date.now();
      const budgetMs = this.#computeBudget(current, startedAt);
      const moveContext = this.#buildMoveContext(current, budgetMs);
      let decision: ControllerMove;
      try {
        decision = await this.#withTimeout(
          bot.getMove(getPublicState(current.game), moveContext),
          budgetMs,
        );
      } catch (err) {
        // Decision context may be stale; only fall back if state hasn't moved on.
        if (this.#contextStillCurrent(ctx)) {
          this.#fallbackPassByCtx(ctx, err instanceof Error ? err.message : "bot error");
        } else {
          this.#emitStale(ctx, err instanceof Error ? err.message : "bot error after state changed");
        }
        return;
      }
      const durationMs = Date.now() - startedAt;

      if (!this.#contextStillCurrent(ctx)) {
        this.#emitStale(ctx, "session changed during bot think; dropping decision");
        continue;
      }

      const applied = this.#applyDecision(ctx, decision, durationMs);
      if (!applied) return;
    }
  }

  #contextStillCurrent(ctx: DecisionContext): boolean {
    const fresh = this.#service.peek(ctx.sessionId);
    if (!fresh || fresh.game.gameOver) return false;
    if (fresh.game.moveNumber !== ctx.moveNumber) return false;
    if (fresh.game.current !== ctx.color) return false;
    const colorKey = fresh.game.current === BLACK ? "black" : "white";
    const spec = fresh.players[colorKey];
    return spec.kind === "bot" && spec.id === ctx.botId;
  }

  #applyDecision(
    ctx: DecisionContext,
    decision: ControllerMove,
    durationMs: number,
  ): boolean {
    const colorLetter: "B" | "W" = ctx.color === BLACK ? "B" : "W";

    if (!decision || (typeof decision === "object" && "pass" in decision && decision.pass)) {
      try {
        const next = this.#service.pass(ctx.sessionId, { actor: "bot" });
        this.#emit({
          sessionId: ctx.sessionId,
          moveNumber: next.game.moveNumber,
          color: colorLetter,
          bot: { id: ctx.botId, version: ctx.botVersion },
          decision: { type: "pass" },
          durationMs,
        });
        return true;
      } catch (err) {
        this.#emit({
          sessionId: ctx.sessionId,
          moveNumber: -1,
          color: colorLetter,
          bot: { id: ctx.botId, version: ctx.botVersion },
          decision: {
            type: "fallback-pass",
            reason: err instanceof Error ? err.message : "pass failed",
          },
          durationMs,
        });
        return false;
      }
    }

    if ("x" in decision && "y" in decision) {
      try {
        const next = this.#service.playMove(ctx.sessionId, decision.x, decision.y, { actor: "bot" });
        const last = next.game.moveLog[next.game.moveLog.length - 1];
        const coord = last && last.type === "move" ? last.coord : "";
        this.#emit({
          sessionId: ctx.sessionId,
          moveNumber: next.game.moveNumber,
          color: colorLetter,
          bot: { id: ctx.botId, version: ctx.botVersion },
          decision: { type: "play", x: decision.x, y: decision.y, coord },
          durationMs,
        });
        return true;
      } catch (err) {
        this.#fallbackPassByCtx(
          ctx,
          err instanceof Error ? err.message : "illegal bot move",
        );
        return true;
      }
    }

    this.#fallbackPassByCtx(ctx, "bot returned an unrecognized move shape");
    return true;
  }

  #fallbackPass(
    session: SessionRecord,
    spec: { id: string; version: string },
    reason: string,
  ): void {
    const colorLetter: "B" | "W" = session.game.current === BLACK ? "B" : "W";
    try {
      const next = this.#service.pass(session.id, { actor: "bot" });
      this.#emit({
        sessionId: session.id,
        moveNumber: next.game.moveNumber,
        color: colorLetter,
        bot: { id: spec.id, version: spec.version },
        decision: { type: "fallback-pass", reason },
        durationMs: 0,
      });
    } catch {
      // Session may already be over; nothing to recover.
    }
  }

  #fallbackPassByCtx(ctx: DecisionContext, reason: string): void {
    const colorLetter: "B" | "W" = ctx.color === BLACK ? "B" : "W";
    try {
      const next = this.#service.pass(ctx.sessionId, { actor: "bot" });
      this.#emit({
        sessionId: ctx.sessionId,
        moveNumber: next.game.moveNumber,
        color: colorLetter,
        bot: { id: ctx.botId, version: ctx.botVersion },
        decision: { type: "fallback-pass", reason },
        durationMs: 0,
      });
    } catch {
      // Session may already be over; nothing to recover.
    }
  }

  #emitStale(ctx: DecisionContext, reason: string): void {
    const colorLetter: "B" | "W" = ctx.color === BLACK ? "B" : "W";
    this.#emit({
      sessionId: ctx.sessionId,
      moveNumber: ctx.moveNumber,
      color: colorLetter,
      bot: { id: ctx.botId, version: ctx.botVersion },
      decision: { type: "stale", reason },
      durationMs: 0,
    });
  }

  #computeBudget(record: SessionRecord, now: number): number {
    const tc = record.timeControl;
    const clocks = record.clocks;
    if (!tc || !clocks || isUnlimitedTimeControl(tc)) return this.#defaultTimeoutMs;
    const playerKey = record.game.current === BLACK ? "black" : "white";
    const clock = clocks[playerKey];
    const total = timeUntilLossMs(clock, tc);
    if (!Number.isFinite(total)) return this.#defaultTimeoutMs;
    const elapsedSinceTurn =
      clocks.turnStartedAt === null ? 0 : Math.max(0, now - clocks.turnStartedAt);
    const remaining = Math.max(0, total - elapsedSinceTurn);
    const byoyomiMs = tc.byoyomiSeconds * 1000;
    // In byoyomi: spend up to ~85% of the per-move budget; otherwise spend a
    // fraction of remaining main time, but never more than 30s on any one move.
    let target: number;
    if (clock.inByoyomi) {
      target = Math.floor(byoyomiMs * 0.85);
    } else {
      const mainAlloc = Math.floor(clock.mainRemainingMs / 30);
      target = Math.max(byoyomiMs > 0 ? Math.floor(byoyomiMs * 0.85) : 0, mainAlloc);
    }
    const safe = Math.max(0, remaining - 200);
    const clamped = Math.min(target, safe, this.#maxTimeoutMs);
    return Math.max(this.#minTimeoutMs, clamped);
  }

  #buildMoveContext(record: SessionRecord, budgetMs: number): AiMoveContext | undefined {
    const tc = record.timeControl;
    const clocks = record.clocks;
    if (!tc || !clocks || isUnlimitedTimeControl(tc)) return undefined;
    const playerKey = record.game.current === BLACK ? "black" : "white";
    const clock = clocks[playerKey];
    return {
      clock: {
        budgetMs,
        mainRemainingMs: clock.mainRemainingMs,
        inByoyomi: clock.inByoyomi,
        byoyomiMs: tc.byoyomiSeconds * 1000,
      },
    };
  }

  async #withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("AI move timed out")), timeoutMs);
      timer.unref?.();
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        },
      );
    });
  }

  #emit(payload: AiMoveLogPayload): void {
    this.#log(JSON.stringify({ event: "ai_move", ...payload }));
  }
}
