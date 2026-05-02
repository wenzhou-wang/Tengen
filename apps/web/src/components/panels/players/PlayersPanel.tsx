import { TranslationBundle } from "../../../i18n";
import { BLACK, GameState, WHITE } from "../../../types";

interface PlayersPanelProps {
  game: GameState;
  t: TranslationBundle;
}

export function PlayersPanel({ game, t }: PlayersPanelProps) {
  return (
    <section className="players" aria-label={t.labels.players}>
      <PlayerRow
        color="black"
        label={t.color(BLACK)}
        captures={game.captures[BLACK]}
        active={!game.gameOver && game.current === BLACK}
        t={t}
      />
      <PlayerRow
        color="white"
        label={t.color(WHITE)}
        captures={game.captures[WHITE]}
        active={!game.gameOver && game.current === WHITE}
        t={t}
      />
    </section>
  );
}

function PlayerRow({
  color,
  label,
  captures,
  active,
  t,
}: {
  color: "black" | "white";
  label: string;
  captures: number;
  active: boolean;
  t: TranslationBundle;
}) {
  return (
    <div className={`player-row ${active ? "is-active" : ""}`}>
      <span className={`stone-swatch ${color}`} aria-hidden="true" />
      <div>
        <strong>{label}</strong>
        <span>{t.captureCount(captures)}</span>
      </div>
    </div>
  );
}
