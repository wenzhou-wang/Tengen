import { Download } from "lucide-react";

import { formatMove } from "../../../game/goEngine";
import { MoveLogEntry } from "../../../types";

interface MoveRecordPanelProps {
  moves: MoveLogEntry[];
  onExportSgf(): void;
}

export function MoveRecordPanel({ moves, onExportSgf }: MoveRecordPanelProps) {
  return (
    <section className="panel record-panel" aria-label="Move record">
      <div className="section-title">
        <h2>Record</h2>
        <button className="ghost" type="button" onClick={onExportSgf}>
          <Download aria-hidden="true" size={16} />
          <span>Export SGF</span>
        </button>
      </div>
      <ol className="move-list">
        {moves.length === 0 ? (
          <li>No moves yet.</li>
        ) : (
          moves.map((move) => <li key={`${move.number}-${move.type}`}>{formatMove(move)}</li>)
        )}
      </ol>
    </section>
  );
}
