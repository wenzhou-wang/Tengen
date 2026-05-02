import { Calculator, Eye, Flag, MapPinned, SkipForward, Undo2 } from "lucide-react";

import { BoardSettings, GameState } from "../../../types";

interface ControlsPanelProps {
  game: GameState;
  settings: BoardSettings;
  onPass(): void;
  onResign(): void;
  onScore(): void;
  onUndo(): void;
  onUpdateSettings(settings: Partial<BoardSettings>): void;
}

export function ControlsPanel({
  game,
  settings,
  onPass,
  onResign,
  onScore,
  onUndo,
  onUpdateSettings,
}: ControlsPanelProps) {
  const playingDisabled = game.gameOver || game.phase !== "playing";

  return (
    <section className="panel controls-panel" aria-label="Game actions">
      <div className="control-grid">
        <button type="button" onClick={onPass} disabled={playingDisabled}>
          <SkipForward aria-hidden="true" size={18} />
          <span>Pass</span>
        </button>
        <button type="button" onClick={onUndo} disabled={game.history.length === 0}>
          <Undo2 aria-hidden="true" size={18} />
          <span>Undo</span>
        </button>
        <button type="button" onClick={onScore}>
          <Calculator aria-hidden="true" size={18} />
          <span>Score</span>
        </button>
        <button type="button" onClick={onResign} disabled={playingDisabled}>
          <Flag aria-hidden="true" size={18} />
          <span>Resign</span>
        </button>
      </div>
      <div className="toggle-row">
        <BoardToggle
          checked={settings.showCoordinates}
          icon={<MapPinned aria-hidden="true" size={16} />}
          label="Coordinates"
          onChange={(checked) => onUpdateSettings({ showCoordinates: checked })}
        />
        <BoardToggle
          checked={settings.showPreview}
          icon={<Eye aria-hidden="true" size={16} />}
          label="Move preview"
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
