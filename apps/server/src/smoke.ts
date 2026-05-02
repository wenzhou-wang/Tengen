import {
  buildSgf,
  createInitialState,
  passOnGame,
  playMoveOnGame,
} from "@tengen/game-core";

const game = createInitialState(9);
const afterMove = playMoveOnGame(game, 4, 4);
if ("error" in afterMove) {
  throw new Error(`Move rejected: ${afterMove.error}`);
}

const finished = passOnGame(passOnGame(afterMove));
if (!finished.gameOver) {
  throw new Error("Two passes should end the game.");
}

console.log(buildSgf(finished));
