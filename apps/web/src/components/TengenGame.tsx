import { AppHeader } from "./layout/AppHeader";
import { BoardArea } from "./layout/BoardArea";
import { ServerSessionBar } from "./ServerSessionBar";
import { SidePanel } from "./panels/SidePanel";
import { ToastRegion } from "./ui/ToastRegion";
import { useGoGame } from "../hooks/useGoGame";
import { useLanguagePreference } from "../i18n";
import { BoardSize } from "../types";

export function TengenGame() {
  const { t, toggleLanguage } = useLanguagePreference();
  const { game, settings, score, statusText, toast, actions } = useGoGame(t);

  const handleBoardSizeChange = (size: BoardSize) => {
    if (game.moveNumber > 0 && !window.confirm(t.confirm.changeBoardSize)) {
      return;
    }

    actions.resetGame(size);
  };

  const handleNewGame = () => {
    if (game.moveNumber > 0 && !window.confirm(t.confirm.newGame)) {
      return;
    }

    actions.resetGame(game.size);
  };

  const handleResign = () => {
    if (window.confirm(t.confirm.resign(game.current))) {
      actions.resignGame();
    }
  };

  return (
    <>
      <div className="app-shell">
        <ServerSessionBar t={t} sessionId={null} />
        <AppHeader
          game={game}
          t={t}
          onBoardSizeChange={handleBoardSizeChange}
          onLanguageToggle={toggleLanguage}
          onNewGame={handleNewGame}
        />
        <main className="game-layout">
          <BoardArea game={game} settings={settings} t={t} onPlayMove={actions.playMove} />
          <SidePanel
            game={game}
            score={score}
            settings={settings}
            statusText={statusText}
            t={t}
            onExportSgf={actions.exportSgf}
            onPass={actions.passTurn}
            onResign={handleResign}
            onScore={actions.scoreNow}
            onUndo={actions.undoMove}
            onUpdateSettings={actions.updateSettings}
          />
        </main>
      </div>
      <ToastRegion message={toast} />
    </>
  );
}
