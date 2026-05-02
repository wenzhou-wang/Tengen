import { Languages, RotateCcw } from "lucide-react";

import { TranslationBundle } from "../../i18n";
import { BoardSize, GameState } from "../../types";

interface AppHeaderProps {
  game: GameState;
  t: TranslationBundle;
  onBoardSizeChange(size: BoardSize): void;
  onLanguageToggle(): void;
  onNewGame(): void;
}

export function AppHeader({ game, t, onBoardSizeChange, onLanguageToggle, onNewGame }: AppHeaderProps) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <div>
          <h1>Tengen</h1>
          <p>{t.boardDescription(game.size)}</p>
        </div>
      </div>

      <div className="top-actions" aria-label={t.labels.gameSetup}>
        <button
          className="ghost language-toggle"
          type="button"
          aria-label={t.languageToggleAria}
          title={t.languageToggleAria}
          onClick={onLanguageToggle}
        >
          <Languages aria-hidden="true" size={18} />
          <span>{t.languageToggleText}</span>
        </button>
        <BoardSizeSelect value={game.size} t={t} onChange={onBoardSizeChange} />
        <button className="primary" type="button" onClick={onNewGame}>
          <RotateCcw aria-hidden="true" size={18} />
          <span>{t.labels.newGame}</span>
        </button>
      </div>
    </header>
  );
}

function BoardSizeSelect({
  value,
  t,
  onChange,
}: {
  value: BoardSize;
  t: TranslationBundle;
  onChange(size: BoardSize): void;
}) {
  return (
    <label className="field compact-field" htmlFor="boardSize">
      <span>{t.labels.board}</span>
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
