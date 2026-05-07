import { BLACK, timeUntilLossMs } from "@tengen/game-core";

import type { SessionService, TimeoutWatcherLike } from "./sessions.ts";
import type { SessionRecord } from "./store.ts";

export interface TimeoutWatcherOptions {
  /** Extra ms added to each fire delay so we don't race the deadline. */
  marginMs?: number;
  /** Optional injection point for tests (e.g., fake timers). */
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
  now?: () => number;
}

const DEFAULT_MARGIN = 25;

export class TimeoutWatcher implements TimeoutWatcherLike {
  readonly #service: SessionService;
  readonly #margin: number;
  readonly #setTimer: typeof setTimeout;
  readonly #clearTimer: typeof clearTimeout;
  readonly #now: () => number;
  readonly #timers = new Map<string, ReturnType<typeof setTimeout>>();
  #disposed = false;

  constructor(service: SessionService, options: TimeoutWatcherOptions = {}) {
    this.#service = service;
    this.#margin = options.marginMs ?? DEFAULT_MARGIN;
    this.#setTimer = options.setTimer ?? setTimeout;
    this.#clearTimer = options.clearTimer ?? clearTimeout;
    this.#now = options.now ?? (() => Date.now());
  }

  onStateChange(record: SessionRecord): void {
    if (this.#disposed) return;
    this.disarm(record.id);
    if (record.game.gameOver) return;
    if (!record.clocks || !record.timeControl) return;
    if (record.clocks.turnStartedAt === null) return;
    const playerKey = record.game.current === BLACK ? "black" : "white";
    const clock = record.clocks[playerKey];
    if (clock.lostOnTime) {
      this.#fireSoon(record.id, 0);
      return;
    }
    const total = timeUntilLossMs(clock, record.timeControl);
    if (!Number.isFinite(total)) return;
    const elapsed = Math.max(0, this.#now() - record.clocks.turnStartedAt);
    const remaining = total - elapsed;
    this.#fireSoon(record.id, Math.max(0, remaining) + this.#margin);
  }

  disarm(id: string): void {
    const t = this.#timers.get(id);
    if (t) {
      this.#clearTimer(t);
      this.#timers.delete(id);
    }
  }

  dispose(): void {
    this.#disposed = true;
    for (const t of this.#timers.values()) this.#clearTimer(t);
    this.#timers.clear();
  }

  #fireSoon(id: string, delayMs: number): void {
    const timer = this.#setTimer(() => {
      this.#timers.delete(id);
      try {
        this.#service.timeout(id);
      } catch {
        // Service errors are reported via its own publish path.
      }
    }, delayMs);
    (timer as { unref?: () => void }).unref?.();
    this.#timers.set(id, timer);
  }
}
