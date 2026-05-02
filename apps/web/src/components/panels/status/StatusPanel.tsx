import { TranslationBundle } from "../../../i18n";
import { BLACK, GameState } from "../../../types";

interface StatusPanelProps {
  game: GameState;
  statusText: string;
  t: TranslationBundle;
}

export function StatusPanel({ game, statusText, t }: StatusPanelProps) {
  const currentStoneClass = game.current === BLACK ? "black" : "white";

  return (
    <section className="panel status-panel">
      <div className="status-header">
        <div>
          <p className="eyebrow">{t.labels.currentTurn}</p>
          <h2>{game.gameOver ? t.winner(game.winner) : t.currentPlayer(game.current)}</h2>
        </div>
        <span className={`turn-stone ${currentStoneClass}`} aria-hidden="true" />
      </div>
      <p className="status-copy">{statusText}</p>
    </section>
  );
}
