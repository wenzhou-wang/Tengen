import { RotateCcw } from "lucide-react";

import { BoardSize, GameState } from "../../types";

interface AppHeaderProps {
  game: GameState;
  onBoardSizeChange(size: BoardSize): void;
  onNewGame(): void;
}

export function AppHeader({ game, onBoardSizeChange, onNewGame }: AppHeaderProps) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <div>
          <h1>Tengen</h1>
          <p>
            {game.size} x {game.size} board
          </p>
        </div>
      </div>

      <div className="top-actions" aria-label="Game setup">
        <BoardSizeSelect value={game.size} onChange={onBoardSizeChange} />
        <button className="primary" type="button" onClick={onNewGame}>
          <RotateCcw aria-hidden="true" size={18} />
          <span>New game</span>
        </button>
      </div>
    </header>
  );
}

function BoardSizeSelect({ value, onChange }: { value: BoardSize; onChange(size: BoardSize): void }) {
  return (
    <label className="field compact-field" htmlFor="boardSize">
      <span>Board</span>
      <select
        id="boardSize"
        value={value}
        onChange={(event) => onChange(Number(event.target.value) as BoardSize)}
      >
        <option value={19}>19 x 19</option>
        <option value={13}>13 x 13</option>
        <option value={9}>9 x 9</option>
      </select>
    </label>
  );
}
