import { AppHeader } from "./layout/AppHeader";
import { BoardArea } from "./layout/BoardArea";
import { ServerSessionBar } from "./ServerSessionBar";
import { SidePanel } from "./panels/SidePanel";
import { ToastRegion } from "./ui/ToastRegion";
import { useServerGame } from "../hooks/useServerGame";
import { useLanguagePreference } from "../i18n";
import type { BoardSize } from "../types";

interface ServerTengenGameProps {
  sessionId: string;
}

export function ServerTengenGame({ sessionId }: ServerTengenGameProps) {
  const { t, toggleLanguage } = useLanguagePreference();
  const { status, error, session, game, settings, score, statusText, toast, actions } =
    useServerGame(sessionId, t);

  if (status === "error") {
    return (
      <div className="app-shell">
        <ServerSessionBar t={t} sessionId={sessionId} players={undefined} />
        <main className="game-layout">
          <p className="error">{t.server.loadError(error ?? t.server.unknownError)}</p>
          <p>
            <a href={window.location.pathname}>{t.server.returnToLocal}</a>
          </p>
        </main>
      </div>
    );
  }

  if (status === "loading" || !game || !score) {
    return (
      <div className="app-shell">
        <ServerSessionBar t={t} sessionId={sessionId} players={undefined} />
        <main className="game-layout">
          <p className="loading">{t.server.loading}</p>
        </main>
      </div>
    );
  }

  const handleBoardSizeChange = (size: BoardSize) => {
    if (game.moveNumber > 0 && !window.confirm(t.confirm.changeBoardSize)) return;
    void actions.resetGame(size);
  };

  const handleNewGame = () => {
    if (game.moveNumber > 0 && !window.confirm(t.confirm.newGame)) return;
    void actions.resetGame(game.size);
  };

  const handleResign = () => {
    if (window.confirm(t.confirm.resign(game.current))) {
      void actions.resignGame();
    }
  };

  const playMoveSync = (x: number, y: number): boolean => {
    void actions.playMove(x, y);
    // The board treats a true return as "consumed"; the server result will
    // arrive over SSE and re-render the board.
    return true;
  };

  return (
    <>
      <div className="app-shell">
        <ServerSessionBar t={t} sessionId={sessionId} players={session?.players} />
        <AppHeader
          game={game}
          t={t}
          onBoardSizeChange={handleBoardSizeChange}
          onLanguageToggle={toggleLanguage}
          onNewGame={handleNewGame}
        />
        <main className="game-layout">
          <BoardArea game={game} settings={settings} t={t} onPlayMove={playMoveSync} />
          <SidePanel
            game={game}
            score={score}
            settings={settings}
            statusText={statusText}
            t={t}
            onExportSgf={actions.exportSgf}
            onPass={() => void actions.passTurn()}
            onResign={handleResign}
            onScore={actions.scoreNow}
            onUndo={() => void actions.undoMove()}
            onUpdateSettings={actions.updateSettings}
          />
        </main>
      </div>
      <ToastRegion message={toast} />
    </>
  );
}
