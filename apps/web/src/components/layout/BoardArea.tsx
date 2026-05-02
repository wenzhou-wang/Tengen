import { BoardCanvas } from "../BoardCanvas";
import { TranslationBundle } from "../../i18n";
import { BoardSettings, GameState } from "../../types";

interface BoardAreaProps {
  game: GameState;
  settings: BoardSettings;
  t: TranslationBundle;
  onPlayMove(x: number, y: number): boolean;
}

export function BoardArea({ game, settings, t, onPlayMove }: BoardAreaProps) {
  return (
    <section className="board-zone" aria-label={t.labels.boardArea}>
      <div className="board-stage">
        <BoardCanvas game={game} settings={settings} t={t} onPlayMove={onPlayMove} />
      </div>
    </section>
  );
}
