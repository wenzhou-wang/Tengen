import { useEffect, useState } from "react";

import {
  tengenServer,
  type BotMetadata,
  type PlayerSpecInput,
  type SessionPlayers,
} from "../server/client";
import type { TranslationBundle } from "../i18n";

interface ServerSessionBarProps {
  t: TranslationBundle;
  sessionId: string | null;
  players?: SessionPlayers;
}

type Choice = "human" | string; // string = bot id

function choiceToSpec(choice: Choice): PlayerSpecInput {
  if (choice === "human") return { kind: "human" };
  return { kind: "bot", id: choice };
}

function describePlayer(t: TranslationBundle, spec: SessionPlayers["black"]): string {
  if (spec.kind === "human") return t.server.opponentHuman;
  return t.server.botPlayer(spec.label);
}

export function ServerSessionBar({ t, sessionId, players }: ServerSessionBarProps) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bots, setBots] = useState<BotMetadata[]>([]);
  const [black, setBlack] = useState<Choice>("human");
  const [white, setWhite] = useState<Choice>("random-v1");

  useEffect(() => {
    let cancelled = false;
    tengenServer
      .listBots()
      .then((list) => {
        if (cancelled) return;
        setBots(list);
        // If our default white bot id isn't in the registry, fall back to the first.
        if (list.length > 0 && !list.some((b) => b.id === "random-v1")) {
          setWhite(list[0].id);
        }
      })
      .catch(() => {
        // Non-fatal: the user can still start a human-vs-human game.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (sessionId) {
    return (
      <div className="server-bar" role="status">
        <span className="server-bar__label">{t.server.serverGame}</span>
        <code className="server-bar__id" title={sessionId}>
          {sessionId.slice(0, 8)}…
        </code>
        {players && (
          <span className="server-bar__players">
            {t.server.blackPlayer}: {describePlayer(t, players.black)} · {t.server.whitePlayer}:{" "}
            {describePlayer(t, players.white)}
          </span>
        )}
        <button
          type="button"
          className="ghost"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(window.location.href);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            } catch {
              setError(t.server.couldNotCopyLink);
            }
          }}
        >
          {copied ? t.server.copied : t.server.copyLink}
        </button>
        <a className="server-bar__leave" href={window.location.pathname}>
          {t.server.leave}
        </a>
        {error && <span className="server-bar__error">{error}</span>}
      </div>
    );
  }

  return (
    <div className="server-bar">
      <span className="server-bar__label">{t.server.localGame}</span>
      <label className="server-bar__field">
        {t.server.blackPlayer}
        <select
          value={black}
          onChange={(e) => setBlack(e.target.value as Choice)}
          disabled={busy}
        >
          <option value="human">{t.server.opponentHuman}</option>
          {bots.map((bot) => (
            <option key={`b-${bot.id}`} value={bot.id}>
              {t.server.opponentBotPrefix} {bot.label}
            </option>
          ))}
        </select>
      </label>
      <label className="server-bar__field">
        {t.server.whitePlayer}
        <select
          value={white}
          onChange={(e) => setWhite(e.target.value as Choice)}
          disabled={busy}
        >
          <option value="human">{t.server.opponentHuman}</option>
          {bots.map((bot) => (
            <option key={`w-${bot.id}`} value={bot.id}>
              {t.server.opponentBotPrefix} {bot.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const session = await tengenServer.createSession({
              size: 19,
              players: {
                black: choiceToSpec(black),
                white: choiceToSpec(white),
              },
            });
            const params = new URLSearchParams(window.location.search);
            params.set("session", session.id);
            const url = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
            window.location.assign(url);
          } catch (err) {
            setError(err instanceof Error ? err.message : t.server.couldNotStart);
            setBusy(false);
          }
        }}
      >
        {busy ? t.server.starting : t.server.start}
      </button>
      {error && <span className="server-bar__error">{error}</span>}
    </div>
  );
}
