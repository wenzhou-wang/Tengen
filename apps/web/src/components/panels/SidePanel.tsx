import { BoardSettings, GameState, ScoreEstimate } from "../../types";
import { ControlsPanel } from "./controls/ControlsPanel";
import { MoveRecordPanel } from "./record/MoveRecordPanel";
import { PlayersPanel } from "./players/PlayersPanel";
import { ScorePanel } from "./score/ScorePanel";
import { StatusPanel } from "./status/StatusPanel";

interface SidePanelProps {
  game: GameState;
  score: ScoreEstimate;
  settings: BoardSettings;
  statusText: string;
  onExportSgf(): void;
  onPass(): void;
  onResign(): void;
  onScore(): void;
  onUndo(): void;
  onUpdateSettings(settings: Partial<BoardSettings>): void;
}

export function SidePanel({
  game,
  score,
  settings,
  statusText,
  onExportSgf,
  onPass,
  onResign,
  onScore,
  onUndo,
  onUpdateSettings,
}: SidePanelProps) {
  return (
    <aside className="side-panel" aria-label="Game controls and status">
      <StatusPanel game={game} statusText={statusText} />
      <PlayersPanel game={game} />
      <ControlsPanel
        game={game}
        settings={settings}
        onPass={onPass}
        onResign={onResign}
        onScore={onScore}
        onUndo={onUndo}
        onUpdateSettings={onUpdateSettings}
      />
      <ScorePanel game={game} score={score} />
      <MoveRecordPanel moves={game.moveLog} onExportSgf={onExportSgf} />
    </aside>
  );
}
