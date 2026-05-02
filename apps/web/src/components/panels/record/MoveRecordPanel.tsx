import { Download } from "lucide-react";

import { TranslationBundle } from "../../../i18n";
import { MoveLogEntry } from "../../../types";

interface MoveRecordPanelProps {
  moves: MoveLogEntry[];
  t: TranslationBundle;
  onExportSgf(): void;
}

export function MoveRecordPanel({ moves, t, onExportSgf }: MoveRecordPanelProps) {
  return (
    <section className="panel record-panel" aria-label={t.labels.moveRecord}>
      <div className="section-title">
        <h2>{t.labels.record}</h2>
        <button className="ghost" type="button" onClick={onExportSgf}>
          <Download aria-hidden="true" size={16} />
          <span>{t.labels.exportSgf}</span>
        </button>
      </div>
      <ol className="move-list">
        {moves.length === 0 ? (
          <li>{t.labels.noMovesYet}</li>
        ) : (
          moves.map((move) => <li key={`${move.number}-${move.type}`}>{t.move(move)}</li>)
        )}
      </ol>
    </section>
  );
}
