import { formatScore } from "../../../game/goEngine";
import { TranslationBundle } from "../../../i18n";
import { GameState, ScoreEstimate } from "../../../types";

interface ScorePanelProps {
  game: GameState;
  score: ScoreEstimate;
  t: TranslationBundle;
}

export function ScorePanel({ game, score, t }: ScorePanelProps) {
  return (
    <section className="panel score-panel" aria-label={t.labels.scoreEstimate}>
      <div className="section-title">
        <h2>{t.labels.score}</h2>
        <span id="phaseBadge">{t.phase(game.phase)}</span>
      </div>
      <dl className="score-grid">
        <ScoreCell label={t.scoreLabels.blackTerritory} value={score.blackTerritory} />
        <ScoreCell label={t.scoreLabels.whiteTerritory} value={score.whiteTerritory} />
        <ScoreCell label={t.scoreLabels.blackTotal} value={formatScore(score.blackTotal)} />
        <ScoreCell label={t.scoreLabels.whiteTotal} value={formatScore(score.whiteTotal)} />
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
