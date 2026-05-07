import { BLACK, WHITE, type PlayerColor } from "./types.ts";

export interface TimeControl {
  /** Total main time per player, in seconds. 0 = byoyomi from move 1. */
  mainTimeSeconds: number;
  /** Maximum seconds per move once main time is exhausted. 0 disables byoyomi. */
  byoyomiSeconds: number;
}

export interface PlayerClock {
  /** Remaining main-time budget for this player, in milliseconds. */
  mainRemainingMs: number;
  /** True once main time has been exhausted; subsequent moves run on byoyomi. */
  inByoyomi: boolean;
  /** True if this player has overrun their byoyomi budget on a move. */
  lostOnTime: boolean;
}

export interface SessionClocks {
  black: PlayerClock;
  white: PlayerClock;
  /**
   * Epoch-ms timestamp when the current player's clock started. Null when
   * the game is over or the session has no time control.
   */
  turnStartedAt: number | null;
}

export function isUnlimitedTimeControl(tc: TimeControl | null | undefined): boolean {
  if (!tc) return true;
  return tc.mainTimeSeconds <= 0 && tc.byoyomiSeconds <= 0;
}

export function createInitialPlayerClock(tc: TimeControl): PlayerClock {
  return {
    mainRemainingMs: Math.max(0, Math.round(tc.mainTimeSeconds * 1000)),
    inByoyomi: tc.mainTimeSeconds <= 0,
    lostOnTime: false,
  };
}

export function createInitialClocks(tc: TimeControl, now: number): SessionClocks {
  return {
    black: createInitialPlayerClock(tc),
    white: createInitialPlayerClock(tc),
    turnStartedAt: now,
  };
}

export interface ClockTickResult {
  clock: PlayerClock;
  lostOnTime: boolean;
}

/**
 * Apply elapsed thinking time to a player's clock and return the resulting
 * clock plus a flag indicating whether the player overran their byoyomi
 * budget. After a successful (non-loss) move in byoyomi, the per-move budget
 * resets to `tc.byoyomiSeconds` for the next move; main-time stays at zero.
 */
export function applyElapsed(
  clock: PlayerClock,
  elapsedMs: number,
  tc: TimeControl,
): ClockTickResult {
  if (clock.lostOnTime) return { clock, lostOnTime: true };
  const elapsed = Math.max(0, elapsedMs);
  let mainRemaining = clock.mainRemainingMs;
  let inByoyomi = clock.inByoyomi;
  let remaining = elapsed;

  if (!inByoyomi) {
    if (remaining <= mainRemaining) {
      mainRemaining -= remaining;
      remaining = 0;
    } else {
      remaining -= mainRemaining;
      mainRemaining = 0;
      inByoyomi = true;
    }
  }

  if (inByoyomi) {
    const budget = tc.byoyomiSeconds * 1000;
    if (budget <= 0 || remaining > budget) {
      return {
        clock: { mainRemainingMs: 0, inByoyomi: true, lostOnTime: true },
        lostOnTime: true,
      };
    }
  }

  return {
    clock: { mainRemainingMs: mainRemaining, inByoyomi, lostOnTime: false },
    lostOnTime: false,
  };
}

export interface ProjectedClock {
  mainRemainingMs: number;
  byoyomiRemainingMs: number;
  inByoyomi: boolean;
  willLose: boolean;
}

/**
 * Project the live remaining time for a player given that `elapsedMs` of
 * wall time has passed in their current turn. Used for live UI display and
 * for the timeout watcher's wake-up scheduling.
 */
export function projectRemainingMs(
  clock: PlayerClock,
  tc: TimeControl,
  elapsedMs: number,
): ProjectedClock {
  if (clock.lostOnTime) {
    return { mainRemainingMs: 0, byoyomiRemainingMs: 0, inByoyomi: true, willLose: true };
  }
  let mainRemaining = clock.mainRemainingMs;
  let inByoyomi = clock.inByoyomi;
  let remaining = Math.max(0, elapsedMs);
  let byoyomiRemaining = tc.byoyomiSeconds * 1000;

  if (!inByoyomi) {
    if (remaining <= mainRemaining) {
      mainRemaining -= remaining;
      remaining = 0;
    } else {
      remaining -= mainRemaining;
      mainRemaining = 0;
      inByoyomi = true;
    }
  }

  if (inByoyomi) {
    const budget = tc.byoyomiSeconds * 1000;
    byoyomiRemaining = Math.max(0, budget - remaining);
  } else {
    byoyomiRemaining = tc.byoyomiSeconds * 1000;
  }

  const willLose = inByoyomi && byoyomiRemaining === 0;
  return { mainRemainingMs: mainRemaining, byoyomiRemainingMs: byoyomiRemaining, inByoyomi, willLose };
}

/**
 * Time in milliseconds before the player would lose on time. Returns
 * Number.POSITIVE_INFINITY if the time control is effectively unlimited or
 * if no clock is running.
 */
export function timeUntilLossMs(clock: PlayerClock, tc: TimeControl): number {
  if (clock.lostOnTime) return 0;
  if (isUnlimitedTimeControl(tc)) return Number.POSITIVE_INFINITY;
  if (clock.inByoyomi) {
    return Math.max(0, tc.byoyomiSeconds * 1000);
  }
  return clock.mainRemainingMs + Math.max(0, tc.byoyomiSeconds * 1000);
}

export function colorKey(color: PlayerColor): "black" | "white" {
  return color === BLACK ? "black" : "white";
}

export function otherKey(color: PlayerColor): "black" | "white" {
  return color === WHITE ? "black" : "white";
}
