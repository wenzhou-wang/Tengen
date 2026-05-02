import { pluralize } from "../../../game/goEngine";
import { BLACK, GameState, WHITE } from "../../../types";

interface PlayersPanelProps {
  game: GameState;
}

export function PlayersPanel({ game }: PlayersPanelProps) {
  return (
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
