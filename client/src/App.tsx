import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { GameSocketProvider } from "./hooks/useGameSocket";
import { disconnectSocket } from "./services/wsClient";
import "./App.scss";

const AuthScreen = lazy(() =>
  import("./screens/Auth/AuthScreen").then((m) => ({ default: m.AuthScreen }))
);
const LobbyScreen = lazy(() =>
  import("./screens/Lobby/LobbyScreen").then((m) => ({ default: m.LobbyScreen }))
);
const GameTableScreen = lazy(() =>
  import("./screens/GameTable/GameTableScreen").then((m) => ({ default: m.GameTableScreen }))
);
const DevTestScreen = lazy(() =>
  import("./screens/DevTest/DevTestScreen").then((m) => ({ default: m.DevTestScreen }))
);

type ScreenType = "auth" | "lobby" | "table" | "dev-test";

const SCREEN_TITLES: Record<ScreenType, string> = {
  auth: "Western Gun - Authentication",
  lobby: "Western Gun - Lobby",
  table: "Western Gun - Game Table",
  "dev-test": "Western Gun - Dev UI Sandbox",
};

function isDevTestPath(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.pathname.replace(/\/+$/, "") === "/dev-test";
}

function App() {
  const [currentScreen, setCurrentScreen] = useState<ScreenType>(() =>
    isDevTestPath() ? "dev-test" : "auth"
  );
  const [currentUser, setCurrentUser] = useState<{ playerId: string; name: string } | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [returnedFromTable, setReturnedFromTable] = useState(false);

  useEffect(() => {
    document.title = SCREEN_TITLES[currentScreen];
  }, [currentScreen]);

  useEffect(() => {
    if (isDevTestPath()) {
      return;
    }

    // Clear any leftover hash on initial mount so browser is never trapped in table view
    if (typeof window !== "undefined" && window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }

    // Validate active HttpOnly Cookie session on application launch
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : { authenticated: false }))
      .then((data) => {
        if (data.authenticated && data.user) {
          setCurrentUser(data.user);
          setCurrentScreen("lobby");
        } else {
          setCurrentScreen("auth");
        }
      })
      .catch(() => {
        setCurrentScreen("auth");
      });
  }, []);

  const handleAuthenticated = useCallback((user: { playerId: string; name: string }) => {
    setAuthNotice(null);
    setReturnedFromTable(false);
    setCurrentUser(user);
    setCurrentScreen("lobby");
  }, []);

  const handleLogout = useCallback(() => {
    disconnectSocket();
    setAuthNotice(null);
    setReturnedFromTable(false);
    setCurrentUser(null);
    setCurrentScreen("auth");
  }, []);

  const handleKicked = useCallback((reason: string) => {
    disconnectSocket();
    setReturnedFromTable(false);
    setCurrentUser(null);
    setAuthNotice(reason);
    setCurrentScreen("auth");
  }, []);

  return (
    <div className="app-shell">
      <Suspense fallback={<div className="app-loading">Loading Saloon...</div>}>
        {currentScreen === "dev-test" && <DevTestScreen />}

        {currentScreen === "auth" && (
          <AuthScreen onAuthenticated={handleAuthenticated} noticeMessage={authNotice} />
        )}

        {(currentScreen === "lobby" || currentScreen === "table") && (
          <GameSocketProvider>
            {currentScreen === "lobby" && (
              <LobbyScreen
                currentUser={currentUser || undefined}
                autoJoinInGame={!returnedFromTable}
                onStartGame={() => {
                  setReturnedFromTable(false);
                  setCurrentScreen("table");
                }}
                onLogout={handleLogout}
                onKicked={handleKicked}
              />
            )}

            {currentScreen === "table" && (
              <GameTableScreen
                isMock={false}
                onBackToLobby={() => {
                  setReturnedFromTable(true);
                  setCurrentScreen("lobby");
                }}
                onKicked={handleKicked}
              />
            )}
          </GameSocketProvider>
        )}
      </Suspense>
    </div>
  );
}

export default App;
