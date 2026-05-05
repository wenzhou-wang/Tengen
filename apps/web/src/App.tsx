import { ServerTengenGame } from "./components/ServerTengenGame";
import { TengenGame } from "./components/TengenGame";

function readSessionIdFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("session");
  return value && value.length > 0 ? value : null;
}

export function App() {
  const sessionId = readSessionIdFromUrl();
  if (sessionId) {
    return <ServerTengenGame sessionId={sessionId} />;
  }
  return <TengenGame />;
}
