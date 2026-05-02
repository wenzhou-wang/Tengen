import { colorName } from "../../../game/goEngine";
import { BLACK, GameState } from "../../../types";

interface StatusPanelProps {
  game: GameState;
  statusText: string;
}

export function StatusPanel({ game, statusText }: StatusPanelProps) {
  const currentStoneClass = game.current === BLACK ? "black" : "white";

  return (
    <section className="panel status-panel">
      <div className="status-header">
        <div>
          <p className="eyebrow">Current turn</p>
          <h2>{game.gameOver ? winnerLabel(game) : `${colorName(game.current)} to play`}</h2>
        </div>
        <span className={`turn-stone ${currentStoneClass}`} aria-hidden="true" />
      </div>
      <p className="status-copy">{statusText}</p>
    </section>
  );
}

function winnerLabel(game: GameState) {
  return game.winner ? `${colorName(game.winner)} wins` : "Game finished";
}
