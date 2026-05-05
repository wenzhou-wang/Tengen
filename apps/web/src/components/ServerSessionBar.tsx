import { useState } from "react";

import { tengenServer } from "../server/client";
import type { TranslationBundle } from "../i18n";

interface ServerSessionBarProps {
  t: TranslationBundle;
  sessionId: string | null;
}

export function ServerSessionBar({ t, sessionId }: ServerSessionBarProps) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (sessionId) {
    return (
      <div className="server-bar" role="status">
        <span className="server-bar__label">{t.server.serverGame}</span>
        <code className="server-bar__id" title={sessionId}>
          {sessionId.slice(0, 8)}…
        </code>
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
      <button
        type="button"
        className="primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const session = await tengenServer.createSession({ size: 19 });
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
