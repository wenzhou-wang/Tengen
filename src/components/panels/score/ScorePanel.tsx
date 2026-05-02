import { formatScore, phaseLabel } from "../../../game/goEngine";
import { GameState, ScoreEstimate } from "../../../types";

interface ScorePanelProps {
  game: GameState;
  score: ScoreEstimate;
}

export function ScorePanel({ game, score }: ScorePanelProps) {
  return (
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
