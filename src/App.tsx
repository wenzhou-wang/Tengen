import {
  Calculator,
  Download,
  Eye,
  Flag,
  MapPinned,
  RotateCcw,
  SkipForward,
  Undo2,
} from "lucide-react";

import { BoardCanvas } from "./components/BoardCanvas";
import {
  colorName,
  formatMove,
  formatScore,
  phaseLabel,
  pluralize,
} from "./game/goEngine";
import { useGoGame } from "./hooks/useGoGame";
import { BLACK, BoardSize, WHITE } from "./types";

export function App() {
  const { game, settings, score, statusText, toast, actions } = useGoGame();
  const currentStoneClass = game.current === BLACK ? "black" : "white";

  const handleBoardSizeChange = (value: string) => {
    const size = Number(value) as BoardSize;
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
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true" />
            <div>
              <h1>Project Tengen</h1>
              <p>{game.size} x {game.size} board</p>
            </div>
          </div>

          <div className="top-actions" aria-label="Game setup">
            <label className="field compact-field" htmlFor="boardSize">
              <span>Board</span>
              <select
                id="boardSize"
                value={game.size}
                onChange={(event) => handleBoardSizeChange(event.target.value)}
              >
                <option value={19}>19 x 19</option>
                <option value={13}>13 x 13</option>
                <option value={9}>9 x 9</option>
              </select>
            </label>
            <button className="primary" type="button" onClick={handleNewGame}>
              <RotateCcw aria-hidden="true" size={18} />
              <span>New game</span>
            </button>
          </div>
        </header>

        <main className="game-layout">
          <section className="board-zone" aria-label="Game board">
            <div className="board-stage">
              <BoardCanvas game={game} settings={settings} onPlayMove={actions.playMove} />
            </div>
          </section>

          <aside className="side-panel" aria-label="Game controls and status">
            <section className="panel status-panel">
              <div className="status-header">
                <div>
                  <p className="eyebrow">Current turn</p>
                  <h2>{game.gameOver ? winnerLabel(game) : `${colorName(game.current)} to play`}</h2>
                </div>
                <span className={`turn-stone ${currentStoneClass}`} aria-hidden="true" />
              </div>
              <p className="status-copy">{statusText}</p>
            </section>

            <section className="players" aria-label="Players">
              <PlayerRow
                color="black"
                label="Black"
                captures={game.captures[BLACK]}
                active={!game.gameOver && game.current === BLACK}
              />
              <PlayerRow
                color="white"
                label="White"
                captures={game.captures[WHITE]}
                active={!game.gameOver && game.current === WHITE}
              />
            </section>

            <section className="panel controls-panel" aria-label="Game actions">
              <div className="control-grid">
                <button type="button" onClick={actions.passTurn} disabled={game.gameOver || game.phase !== "playing"}>
                  <SkipForward aria-hidden="true" size={18} />
                  <span>Pass</span>
                </button>
                <button type="button" onClick={actions.undoMove} disabled={game.history.length === 0}>
                  <Undo2 aria-hidden="true" size={18} />
                  <span>Undo</span>
                </button>
                <button type="button" onClick={actions.scoreNow}>
                  <Calculator aria-hidden="true" size={18} />
                  <span>Score</span>
                </button>
                <button type="button" onClick={handleResign} disabled={game.gameOver || game.phase !== "playing"}>
                  <Flag aria-hidden="true" size={18} />
                  <span>Resign</span>
                </button>
              </div>
              <div className="toggle-row">
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={settings.showCoordinates}
                    onChange={(event) => actions.updateSettings({ showCoordinates: event.target.checked })}
                  />
                  <MapPinned aria-hidden="true" size={16} />
                  <span>Coordinates</span>
                </label>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={settings.showPreview}
                    onChange={(event) => actions.updateSettings({ showPreview: event.target.checked })}
                  />
                  <Eye aria-hidden="true" size={16} />
                  <span>Move preview</span>
                </label>
              </div>
            </section>

            <section className="panel score-panel" aria-label="Score estimate">
              <div className="section-title">
                <h2>Score</h2>
                <span id="phaseBadge">{phaseLabel(game.phase)}</span>
              </div>
              <dl className="score-grid">
                <ScoreCell label="Black territory" value={score.blackTerritory} />
                <ScoreCell label="White territory" value={score.whiteTerritory} />
                <ScoreCell label="Black total" value={formatScore(score.blackTotal)} />
                <ScoreCell label="White total" value={formatScore(score.whiteTotal)} />
              </dl>
            </section>

            <section className="panel record-panel" aria-label="Move record">
              <div className="section-title">
                <h2>Record</h2>
                <button className="ghost" type="button" onClick={actions.exportSgf}>
                  <Download aria-hidden="true" size={16} />
                  <span>Export SGF</span>
                </button>
              </div>
              <ol className="move-list">
                {game.moveLog.length === 0 ? (
                  <li>No moves yet.</li>
                ) : (
                  game.moveLog.map((move) => <li key={`${move.number}-${move.type}`}>{formatMove(move)}</li>)
                )}
              </ol>
            </section>
          </aside>
        </main>
      </div>

      <div className={`toast ${toast ? "is-visible" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>
      <div className="sr-only" aria-live="polite">
        {toast}
      </div>
    </>
  );
}

function PlayerRow({
  color,
  label,
  captures,
  active,
}: {
  color: "black" | "white";
  label: string;
  captures: number;
  active: boolean;
}) {
  return (
    <div className={`player-row ${active ? "is-active" : ""}`}>
      <span className={`stone-swatch ${color}`} aria-hidden="true" />
      <div>
        <strong>{label}</strong>
        <span>{pluralize(captures, "capture")}</span>
      </div>
    </div>
  );
}

function ScoreCell({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function winnerLabel(game: { winner: typeof BLACK | typeof WHITE | null }) {
  return game.winner ? `${colorName(game.winner)} wins` : "Game finished";
}
