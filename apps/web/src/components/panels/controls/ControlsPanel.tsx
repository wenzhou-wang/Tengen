import { Calculator, Eye, Flag, MapPinned, SkipForward, Undo2 } from "lucide-react";

import { TranslationBundle } from "../../../i18n";
import { BoardSettings, GameState } from "../../../types";

interface ControlsPanelProps {
  game: GameState;
  settings: BoardSettings;
  t: TranslationBundle;
  onPass(): void;
  onResign(): void;
  onScore(): void;
  onUndo(): void;
  onUpdateSettings(settings: Partial<BoardSettings>): void;
}

export function ControlsPanel({
  game,
  settings,
  t,
  onPass,
  onResign,
  onScore,
  onUndo,
  onUpdateSettings,
}: ControlsPanelProps) {
  const playingDisabled = game.gameOver || game.phase !== "playing";

  return (
    <section className="panel controls-panel" aria-label={t.labels.gameActions}>
      <div className="control-grid">
        <button type="button" onClick={onPass} disabled={playingDisabled}>
          <SkipForward aria-hidden="true" size={18} />
          <span>{t.labels.pass}</span>
        </button>
        <button type="button" onClick={onUndo} disabled={game.history.length === 0}>
          <Undo2 aria-hidden="true" size={18} />
          <span>{t.labels.undo}</span>
        </button>
        <button type="button" onClick={onScore}>
          <Calculator aria-hidden="true" size={18} />
          <span>{t.labels.score}</span>
        </button>
        <button type="button" onClick={onResign} disabled={playingDisabled}>
          <Flag aria-hidden="true" size={18} />
          <span>{t.labels.resign}</span>
        </button>
      </div>
      <div className="toggle-row">
        <BoardToggle
          checked={settings.showCoordinates}
          icon={<MapPinned aria-hidden="true" size={16} />}
          label={t.labels.coordinates}
          onChange={(checked) => onUpdateSettings({ showCoordinates: checked })}
        />
        <BoardToggle
          checked={settings.showPreview}
          icon={<Eye aria-hidden="true" size={16} />}
          label={t.labels.movePreview}
          onChange={(checked) => onUpdateSettings({ showPreview: checked })}
        />
      </div>
    </section>
  );
}

function BoardToggle({
  checked,
  icon,
  label,
  onChange,
}: {
  checked: boolean;
  icon: React.ReactNode;
  label: string;
  onChange(checked: boolean): void;
}) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {icon}
      <span>{label}</span>
    </label>
  );
}
