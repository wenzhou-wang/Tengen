import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  buildSgf,
  computeScore,
  coordName,
  createInitialState,
  getLegalMoves,
  getPublicState,
  isValidSnapshot,
  normalizeSnapshot,
  passOnGame,
  playMoveOnGame,
  resignOnGame,
  toBoardSize,
  undoOnGame,
} from "@tengen/game-core";
import {
  BLACK,
  BoardSettings,
  BoardSize,
  ControllerMove,
  GameState,
  PlayerColor,
  PlayerController,
  PlayMoveOptions,
  TengenApi,
  WHITE,
} from "../types";
import { StatusMessage, TranslationBundle } from "../i18n";

const STORAGE_KEY = "tengen-state-v1";

interface PersistedPayload {
  game?: unknown;
  history?: unknown;
  settings?: Partial<BoardSettings>;
}

const defaultSettings: BoardSettings = {
  showCoordinates: true,
  showPreview: true,
};

function loadPersistedState(): {
  game: GameState;
  settings: BoardSettings;
  statusMessage: StatusMessage | null;
} {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { game: createInitialState(19), settings: defaultSettings, statusMessage: null };
    }

    const payload = JSON.parse(raw) as PersistedPayload;
    if (!isValidSnapshot(payload.game)) {
      return { game: createInitialState(19), settings: defaultSettings, statusMessage: null };
    }

    const game = normalizeSnapshot(payload.game);
    game.history = Array.isArray(payload.history)
      ? payload.history.filter(isValidSnapshot).map(normalizeSnapshot)
      : [];

    return {
      game,
      settings: {
        showCoordinates: payload.settings?.showCoordinates !== false,
        showPreview: payload.settings?.showPreview !== false,
      },
      statusMessage: { kind: "restored" },
    };
  } catch {
    return { game: createInitialState(19), settings: defaultSettings, statusMessage: null };
  }
}

export function useGoGame(t: TranslationBundle) {
  const [initial] = useState(() => loadPersistedState());
  const [game, setGame] = useState<GameState>(initial.game);
  const [settings, setSettings] = useState<BoardSettings>(initial.settings);
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(initial.statusMessage);
  const [toast, setToast] = useState("");
  const controllersRef = useRef<Record<PlayerColor, PlayerController>>({
    [BLACK]: { type: "human" },
    [WHITE]: { type: "human" },
  });
  const gameRef = useRef(game);

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          game,
          history: game.history,
          settings,
        }),
      );
    } catch {
      // Storage can be blocked by private browsing or strict browser settings.
    }
  }, [game, settings]);

  const score = useMemo(() => computeScore(game), [game]);

  const notify = useCallback((message: string) => {
    setToast(message);
  }, []);

  const playMove = useCallback(
    (x: number, y: number, options: PlayMoveOptions = {}) => {
      const currentGame = gameRef.current;
      const color = currentGame.current;
      const controller = controllersRef.current[color];

      if (controller.type !== "human" && !options.fromController) {
        notify(t.toast.externalPlayer(color));
        return false;
      }

      const nextGame = playMoveOnGame(currentGame, x, y);
      if ("error" in nextGame) {
        if (!options.quiet) notify(t.legalMoveError(nextGame.error));
        return false;
      }

      setGame(nextGame);
      setStatusMessage({ kind: "played", color, coord: coordName(x, y, currentGame.size) });
      return true;
    },
    [notify, t],
  );

  const passTurn = useCallback(() => {
    const currentGame = gameRef.current;
    if (currentGame.gameOver || currentGame.phase !== "playing") return;

    const color = currentGame.current;
    const nextGame = passOnGame(currentGame);
    setGame(nextGame);

    if (nextGame.gameOver && nextGame.winner) {
      const nextScore = computeScore(nextGame);
      const margin = Math.abs(nextScore.blackTotal - nextScore.whiteTotal).toFixed(1);
      setStatusMessage({ kind: "bothPassed", winner: nextGame.winner, margin });
    } else {
      setStatusMessage({ kind: "passed", color });
    }
  }, []);

  const resignGame = useCallback(() => {
    const currentGame = gameRef.current;
    if (currentGame.gameOver) return;

    const color = currentGame.current;
    const nextGame = resignOnGame(currentGame);
    setGame(nextGame);
    setStatusMessage({ kind: "resigned", color, winner: nextGame.winner ?? BLACK });
  }, []);

  const undoMove = useCallback(() => {
    const previous = undoOnGame(gameRef.current);
    if (!previous) {
      notify(t.toast.noMovesToUndo);
      return;
    }

    setGame(previous);
    setStatusMessage({ kind: "undid" });
  }, [notify, t]);

  const resetGame = useCallback((size: BoardSize | number) => {
    const boardSize = toBoardSize(Number(size));
    setGame(createInitialState(boardSize));
    setStatusMessage({ kind: "newGame", size: boardSize });
  }, []);

  const scoreNow = useCallback(() => {
    const currentScore = computeScore(gameRef.current);
    const winner = currentScore.blackTotal > currentScore.whiteTotal ? BLACK : WHITE;
    const margin = Math.abs(currentScore.blackTotal - currentScore.whiteTotal).toFixed(1);
    setStatusMessage({ kind: "scoreEstimate", winner, margin });
  }, []);

  const updateSettings = useCallback((patch: Partial<BoardSettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  }, []);

  const exportSgf = useCallback(async () => {
    const currentGame = gameRef.current;
    const sgf = buildSgf(currentGame);
    const fileName = `tengen-${currentGame.size}x${currentGame.size}-${Date.now()}.sgf`;
    const blob = new Blob([sgf], { type: "application/x-go-sgf;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(sgf);
        notify(t.toast.sgfDownloadedAndCopied);
      } else {
        notify(t.toast.sgfDownloaded);
      }
    } catch {
      notify(t.toast.sgfDownloaded);
    }
  }, [notify, t]);

  const setController = useCallback((color: PlayerColor, controller?: PlayerController | null) => {
    if (color !== BLACK && color !== WHITE) {
      throw new Error("Controller color must be BLACK or WHITE.");
    }

    controllersRef.current[color] = controller || { type: "human" };
  }, []);

  const api = useMemo<TengenApi>(
    () => ({
      colors: { EMPTY: 0, BLACK, WHITE },
      getState: () => getPublicState(gameRef.current),
      getLegalMoves: (color?: PlayerColor) =>
        getLegalMoves(gameRef.current, color ?? gameRef.current.current),
      playMove: (x: number, y: number) => playMove(x, y, { fromController: true }),
      pass: passTurn,
      undo: undoMove,
      newGame: resetGame,
      setController,
    }),
    [passTurn, playMove, resetGame, setController, undoMove],
  );

  useEffect(() => {
    window.Tengen = api;
    return () => {
      if (window.Tengen === api) {
        delete window.Tengen;
      }
    };
  }, [api]);

  useEffect(() => {
    const currentGame = game;
    const controller = controllersRef.current[currentGame.current];
    if (controller.type !== "ai" || currentGame.gameOver || currentGame.phase !== "playing") return;

    let cancelled = false;
    const requestedColor = currentGame.current;

    Promise.resolve(controller.getMove(getPublicState(currentGame)))
      .then((move: ControllerMove) => {
        if (cancelled) return;
        const latest = gameRef.current;
        if (latest.current !== requestedColor || latest.gameOver || latest.phase !== "playing" || !move)
          return;

        if ("pass" in move && move.pass) {
          passTurn();
        } else if ("x" in move && "y" in move && Number.isInteger(move.x) && Number.isInteger(move.y)) {
          playMove(move.x, move.y, { fromController: true });
        }
      })
      .catch(() => notify(t.toast.externalPlayerFailed));

    return () => {
      cancelled = true;
    };
  }, [game, notify, passTurn, playMove, t]);

  const statusText = useMemo(
    () => (statusMessage ? t.status(statusMessage) : t.defaultStatus(game)),
    [game, statusMessage, t],
  );

  return {
    game,
    settings,
    score,
    statusText,
    toast,
    actions: {
      playMove,
      passTurn,
      resignGame,
      undoMove,
      resetGame,
      scoreNow,
      updateSettings,
      exportSgf,
      setController,
    },
  };
}
