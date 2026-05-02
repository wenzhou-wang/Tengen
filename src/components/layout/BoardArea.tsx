import { BoardCanvas } from "../BoardCanvas";
import { BoardSettings, GameState } from "../../types";

interface BoardAreaProps {
  game: GameState;
  settings: BoardSettings;
  onPlayMove(x: number, y: number): boolean;
}

export function BoardArea({ game, settings, onPlayMove }: BoardAreaProps) {
  return (
    <section className="board-zone" aria-label="Game board">
      <div className="board-stage">
        <BoardCanvas game={game} settings={settings} onPlayMove={onPlayMove} />
      </div>
    </section>
  );
}
