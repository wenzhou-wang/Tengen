import { TranslationBundle } from "../../i18n";
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
  t: TranslationBundle;
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
  t,
  onExportSgf,
  onPass,
  onResign,
  onScore,
  onUndo,
  onUpdateSettings,
}: SidePanelProps) {
  return (
    <aside className="side-panel" aria-label={t.labels.controlsAndStatus}>
      <StatusPanel game={game} statusText={statusText} t={t} />
      <PlayersPanel game={game} t={t} />
      <ControlsPanel
        game={game}
        settings={settings}
        t={t}
        onPass={onPass}
        onResign={onResign}
        onScore={onScore}
        onUndo={onUndo}
        onUpdateSettings={onUpdateSettings}
      />
      <ScorePanel game={game} score={score} t={t} />
      <MoveRecordPanel moves={game.moveLog} t={t} onExportSgf={onExportSgf} />
    </aside>
  );
}
