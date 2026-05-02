import { AppHeader } from "./layout/AppHeader";
import { BoardArea } from "./layout/BoardArea";
import { SidePanel } from "./panels/SidePanel";
import { ToastRegion } from "./ui/ToastRegion";
import { colorName } from "../game/goEngine";
import { useGoGame } from "../hooks/useGoGame";
import { BoardSize } from "../types";

export function TengenGame() {
  const { game, settings, score, statusText, toast, actions } = useGoGame();

  const handleBoardSizeChange = (size: BoardSize) => {
    if (game.moveNumber > 0 && !window.confirm("Changing board size starts a new game. Continue?")) {
      return;
    }

    actions.resetGame(size);
  };

  const handleNewGame = () => {
    if (game.moveNumber > 0 && !window.confirm("Start a new game and clear the board?")) {
      return;
    }

    actions.resetGame(game.size);
  };

  const handleResign = () => {
    if (window.confirm(`${colorName(game.current)} resigns?`)) {
      actions.resignGame();
    }
  };

  return (
    <>
      <div className="app-shell">
        <AppHeader game={game} onBoardSizeChange={handleBoardSizeChange} onNewGame={handleNewGame} />
        <main className="game-layout">
          <BoardArea game={game} settings={settings} onPlayMove={actions.playMove} />
          <SidePanel
            game={game}
            score={score}
            settings={settings}
            statusText={statusText}
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
