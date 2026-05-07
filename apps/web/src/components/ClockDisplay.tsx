import { useEffect, useState } from "react";

import {
  BLACK,
  isUnlimitedTimeControl,
  projectRemainingMs,
  WHITE,
  type PlayerColor,
  type SessionClocks,
  type TimeControl,
} from "@tengen/game-core";

import type { TranslationBundle } from "../i18n";

interface ClockDisplayProps {
  t: TranslationBundle;
  timeControl: TimeControl | null;
  clocks: SessionClocks | null;
  current: PlayerColor;
  gameOver: boolean;
}

function formatMs(ms: number): string {
  const safe = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function ClockDisplay({ t, timeControl, clocks, current, gameOver }: ClockDisplayProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!timeControl || isUnlimitedTimeControl(timeControl) || !clocks) return;
    if (gameOver || clocks.turnStartedAt === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [timeControl, clocks, gameOver]);

  if (!timeControl || isUnlimitedTimeControl(timeControl) || !clocks) return null;

  const renderRow = (color: PlayerColor) => {
    const key = color === BLACK ? "black" : "white";
    const clock = clocks[key];
    const isCurrent = !gameOver && current === color && clocks.turnStartedAt !== null;
    const elapsed = isCurrent && clocks.turnStartedAt !== null ? Math.max(0, now - clocks.turnStartedAt) : 0;
    const projected = projectRemainingMs(clock, timeControl, elapsed);
    const colorLabel = color === BLACK ? t.server.blackPlayer : t.server.whitePlayer;
    return (
      <div className={`clock-row${isCurrent ? " clock-row--current" : ""}`} key={key}>
        <span className="clock-row__color">{colorLabel}</span>
        {clock.lostOnTime || projected.willLose ? (
          <span className="clock-row__lost">{t.server.clockLost}</span>
        ) : projected.inByoyomi ? (
          <span className="clock-row__byoyomi">
            {t.server.clockByoyomiLabel} {formatMs(projected.byoyomiRemainingMs)}
          </span>
        ) : (
          <span className="clock-row__main">
            {t.server.clockMainLabel} {formatMs(projected.mainRemainingMs)}
          </span>
        )}
      </div>
    );
  };

  return (
    <section className="clock-display" aria-label="Player clocks">
      {renderRow(BLACK)}
      {renderRow(WHITE)}
    </section>
  );
}
