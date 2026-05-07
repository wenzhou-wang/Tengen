import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BLACK, computeScore, coordName, type BoardSize, type GameState, WHITE } from "@tengen/game-core";

import { ServerError, tengenServer, type SessionRecord } from "../server/client.ts";
import type { StatusMessage, TranslationBundle } from "../i18n";
import type { BoardSettings } from "../types";

const SETTINGS_STORAGE_KEY = "tengen-server-settings-v1";

const defaultSettings: BoardSettings = {
  showCoordinates: true,
  showPreview: true,
};

function loadSettings(): BoardSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw) as Partial<BoardSettings>;
    return { ...defaultSettings, ...parsed };
  } catch {
    return defaultSettings;
  }
}

export type ServerGameStatus = "loading" | "ready" | "error";

export interface UseServerGameResult {
  status: ServerGameStatus;
  error: string | null;
  session: SessionRecord | null;
  game: GameState | null;
  settings: BoardSettings;
  score: ReturnType<typeof computeScore> | null;
  statusText: string;
  toast: string;
  actions: {
    playMove: (x: number, y: number) => Promise<boolean>;
    passTurn: () => Promise<void>;
    resignGame: () => Promise<void>;
    undoMove: () => Promise<void>;
    resetGame: (size: BoardSize | number) => Promise<void>;
    scoreNow: () => void;
    updateSettings: (patch: Partial<BoardSettings>) => void;
    exportSgf: () => Promise<void>;
  };
}

export function useServerGame(sessionId: string, t: TranslationBundle): UseServerGameResult {
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [errorBySession, setErrorBySession] = useState<{ id: string; message: string } | null>(null);
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(null);
  const [toast, setToast] = useState("");
  const [settings, setSettings] = useState<BoardSettings>(() => loadSettings());
  const sessionRef = useRef<SessionRecord | null>(null);
  const tRef = useRef(t);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // ignore
    }
  }, [settings]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const notify = useCallback((message: string) => setToast(message), []);

  // Initial fetch, then SSE subscription only on success.
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    tengenServer
      .getSession(sessionId)
      .then((record) => {
        if (cancelled) return;
        setSession(record);
        unsubscribe = tengenServer.subscribe(sessionId, (next) => {
          if (cancelled) return;
          setSession(next);
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : tRef.current.server.loadFailed;
        setErrorBySession({ id: sessionId, message });
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [sessionId]);

  const error = errorBySession && errorBySession.id === sessionId ? errorBySession.message : null;
  const isLoaded = session !== null && session.id === sessionId;
  const status: ServerGameStatus = error ? "error" : isLoaded ? "ready" : "loading";
  const game = isLoaded ? session.game : null;
  const score = useMemo(() => (game ? computeScore(game) : null), [game]);

  const playMove = useCallback(
    async (x: number, y: number) => {
      const current = sessionRef.current;
      if (!current) return false;
      try {
        const next = await tengenServer.playMove(current.id, x, y);
        setSession(next);
        setStatusMessage({
          kind: "played",
          color: current.game.current,
          coord: coordName(x, y, current.game.size),
        });
        return true;
      } catch (err) {
        if (err instanceof ServerError) {
          notify(t.legalMoveError(err.message));
        } else {
          notify(t.toast.externalPlayerFailed);
        }
        return false;
      }
    },
    [notify, t],
  );

  const passTurn = useCallback(async () => {
    const current = sessionRef.current;
    if (!current || current.game.gameOver) return;
    try {
      const next = await tengenServer.pass(current.id);
      setSession(next);
      if (next.game.gameOver && next.game.winner) {
        const nextScore = computeScore(next.game);
        const margin = Math.abs(nextScore.blackTotal - nextScore.whiteTotal).toFixed(1);
        setStatusMessage({ kind: "bothPassed", winner: next.game.winner, margin });
      } else {
        setStatusMessage({ kind: "passed", color: current.game.current });
      }
    } catch (err) {
      notify(t.server.actionFailed(err instanceof Error ? err.message : t.server.unknownError));
    }
  }, [notify, t]);

  const resignGame = useCallback(async () => {
    const current = sessionRef.current;
    if (!current || current.game.gameOver) return;
    try {
      const next = await tengenServer.resign(current.id);
      setSession(next);
      setStatusMessage({
        kind: "resigned",
        color: current.game.current,
        winner: next.game.winner ?? BLACK,
      });
    } catch (err) {
      notify(t.server.actionFailed(err instanceof Error ? err.message : t.server.unknownError));
    }
  }, [notify, t]);

  const undoMove = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) return;
    try {
      const next = await tengenServer.undo(current.id);
      setSession(next);
      setStatusMessage({ kind: "undid" });
    } catch (err) {
      if (err instanceof ServerError && err.status === 409) {
        // 409 covers both "no moves to undo" and "cannot undo a time-loss"
        // (and any future undo-state rejection). Distinguish by message so
        // we don't lie about the reason.
        if (/no move/i.test(err.message)) {
          notify(t.toast.noMovesToUndo);
        } else {
          notify(t.server.actionFailed(err.message));
        }
      } else {
        notify(t.server.actionFailed(err instanceof Error ? err.message : t.server.unknownError));
      }
    }
  }, [notify, t]);

  const resetGame = useCallback(
    async (size: BoardSize | number) => {
      const boardSize = (size === 9 || size === 13 || size === 19 ? size : 19) as BoardSize;
      const current = sessionRef.current;
      try {
        const next = await tengenServer.createSession({
          size: boardSize,
          // Preserve the active time control so a "New game" on a timed
          // session doesn't silently downgrade to unlimited play.
          timeControl: current?.timeControl ?? null,
        });
        const params = new URLSearchParams(window.location.search);
        params.set("session", next.id);
        const url = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
        // Full navigation: App reads ?session=<id> once at mount, so a
        // history.replaceState would leave the React tree on the old id.
        window.location.assign(url);
      } catch (err) {
        notify(err instanceof Error ? err.message : t.server.createFailed);
      }
    },
    [notify, t],
  );

  const scoreNow = useCallback(() => {
    const current = sessionRef.current;
    if (!current) return;
    const currentScore = computeScore(current.game);
    const winner = currentScore.blackTotal > currentScore.whiteTotal ? BLACK : WHITE;
    const margin = Math.abs(currentScore.blackTotal - currentScore.whiteTotal).toFixed(1);
    setStatusMessage({ kind: "scoreEstimate", winner, margin });
  }, []);

  const updateSettings = useCallback((patch: Partial<BoardSettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  }, []);

  const exportSgf = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) return;
    try {
      const sgf = await tengenServer.exportSgf(current.id);
      const fileName = `tengen-${current.size}x${current.size}-${Date.now()}.sgf`;
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
    } catch (err) {
      notify(err instanceof Error ? err.message : t.server.sgfFailed);
    }
  }, [notify, t]);

  const statusText = useMemo(() => {
    if (!game) return "";
    return statusMessage ? t.status(statusMessage) : t.defaultStatus(game);
  }, [game, statusMessage, t]);

  return {
    status,
    error,
    session,
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
    },
  };
}
