import React, { useState, useEffect, useRef, useCallback } from "react";
import type { ExpansionOptionInfo, LobbyState } from "../../types/game";
import { useGameSocket } from "../../hooks/useGameSocket";
import { Button, Modal } from "../../components/ui";
import { LobbyPlayerList } from "./components/LobbyPlayerList";
import { LobbySettingsPanel } from "./components/LobbySettingsPanel";
import "./LobbyScreen.scss";

export interface LobbyScreenProps {
  currentUser?: { playerId: string; name: string };
  autoJoinInGame?: boolean;
  onStartGame?: () => void;
  onLogout?: () => void;
  onKicked?: (reason: string) => void;
}

const EXPANSION_OPTIONS: ExpansionOptionInfo[] = [
  { id: "dodge_city", label: "Dodge City (15 Heroes + Green Cards)", active: true },
  { id: "high_noon", label: "High Noon (13 Round Events)", active: false },
  { id: "fistful_of_cards", label: "A Fistful of Cards (15 Round Events)", active: false },
];

export const LobbyScreen: React.FC<LobbyScreenProps> = ({
  currentUser,
  autoJoinInGame = true,
  onStartGame,
  onLogout,
  onKicked,
}) => {
  const { isConnected, sendMessage, subscribe, disconnectSocket } = useGameSocket();

  const [roomNameInput, setRoomNameInput] = useState("Saloon Table #1");
  const [myPlayerId, setMyPlayerId] = useState(currentUser?.playerId || "");
  const [errorMessage, setErrorMessage] = useState("");
  const [isDbLocked, setIsDbLocked] = useState(false);
  const [isSessionLocked, setIsSessionLocked] = useState(false);
  const [lobbyState, setLobbyState] = useState<LobbyState | null>(null);
  const [lanUrls, setLanUrls] = useState<string[]>([]);
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<"delete_match" | "delete_room" | null>(null);

  const prevStatusRef = useRef<string | null>(null);
  const hasAutoLaunchedRef = useRef(false);
  const autoJoinInGameRef = useRef(autoJoinInGame);
  const onStartGameRef = useRef(onStartGame);
  const onLogoutRef = useRef(onLogout);
  const onKickedRef = useRef(onKicked);
  const initialPlayerIdRef = useRef(currentUser?.playerId || "");
  const myPlayerIdRef = useRef(currentUser?.playerId || "");

  useEffect(() => {
    autoJoinInGameRef.current = autoJoinInGame;
    onStartGameRef.current = onStartGame;
    onLogoutRef.current = onLogout;
    onKickedRef.current = onKicked;
  }, [autoJoinInGame, onStartGame, onLogout, onKicked]);

  // Redirect unauthenticated entry back to AuthScreen
  useEffect(() => {
    if (!currentUser) {
      disconnectSocket();
      onLogoutRef.current?.();
    }
  }, [currentUser, disconnectSocket]);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/status");
      if (!res.ok) return;
      const data = await res.json();
      if (!data) return;

      const locked = data.status === "locked" || data.requiresUnlock === true;
      setIsDbLocked(locked);

      if (Array.isArray(data.lanIps)) {
        const port = data.port || window.location.port || 2611;
        setLanUrls(data.lanIps.map((ip: string) => `http://${ip}:${port}`));
      }
      setTunnelUrl(typeof data.tunnelUrl === "string" && data.tunnelUrl ? data.tunnelUrl : null);
    } catch {
      // Ignore status fetch failure
    }
  }, []);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      void refreshStatus();
    }, 0);
    const pollTimer = window.setInterval(() => {
      void refreshStatus();
    }, 4000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(pollTimer);
    };
  }, [refreshStatus]);

  useEffect(() => {
    if (isConnected && currentUser && !isSessionLocked) {
      sendMessage("SYNC_LOBBY");
    }
  }, [isConnected, currentUser, isSessionLocked, sendMessage]);

  useEffect(() => {
    const unsubscribe = subscribe((msg) => {
      switch (msg.type) {
        case "AUTH_SUCCESS": {
          const incomingId =
            typeof msg.payload?.playerId === "string" ? msg.payload.playerId : "";
          const incomingName =
            typeof msg.payload?.name === "string" ? msg.payload.name : "another player";

          if (
            initialPlayerIdRef.current &&
            incomingId &&
            initialPlayerIdRef.current !== incomingId
          ) {
            const lockReason = `Browser session switched to ${incomingName}. This tab is locked; use an Incognito or separate browser window per player.`;
            setIsSessionLocked(true);
            setErrorMessage(lockReason);
            disconnectSocket();
            onKickedRef.current?.(lockReason);
            return;
          }

          if (!initialPlayerIdRef.current && incomingId) {
            initialPlayerIdRef.current = incomingId;
            myPlayerIdRef.current = incomingId;
            setMyPlayerId(incomingId);
          }
          break;
        }

        case "AUTH_REQUIRED": {
          const reason =
            typeof msg.payload?.reason === "string"
              ? msg.payload.reason
              : "Session expired. Please sign in again.";
          disconnectSocket();
          setLobbyState(null);
          if (onKickedRef.current) {
            onKickedRef.current(reason);
          } else if (onLogoutRef.current) {
            onLogoutRef.current();
          } else {
            setErrorMessage(reason);
          }
          break;
        }

        case "DATABASE_UNLOCKED": {
          setIsDbLocked(false);
          setErrorMessage("");
          void refreshStatus();
          sendMessage("SYNC_LOBBY");
          break;
        }

        case "LOBBY_STATE": {
          const nextState = msg.payload as unknown as LobbyState;
          if (!nextState) break;
          const prevStatus = prevStatusRef.current;
          const newStatus = nextState.status;
          prevStatusRef.current = newStatus;
          setLobbyState(nextState);

          if (!nextState.roomExists || newStatus === "waiting") {
            hasAutoLaunchedRef.current = false;
            setConfirmAction(null);
          }

          const activeId = myPlayerIdRef.current;
          const isParticipant =
            Boolean(activeId) &&
            Array.isArray(nextState.players) &&
            nextState.players.some((p) => p.id === activeId);
          const shouldAutoTransition =
            newStatus === "in_game" &&
            isParticipant &&
            (prevStatus === "waiting" || autoJoinInGameRef.current);

          if (shouldAutoTransition && !hasAutoLaunchedRef.current) {
            hasAutoLaunchedRef.current = true;
            onStartGameRef.current?.();
          }
          break;
        }

        case "PLAYER_KICKED": {
          const reason =
            typeof msg.payload?.reason === "string"
              ? msg.payload.reason
              : "You were removed from the room by the Host.";
          disconnectSocket();
          fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
          if (onKickedRef.current) {
            onKickedRef.current(reason);
          } else {
            setErrorMessage(reason);
          }
          break;
        }

        case "ERROR": {
          const message =
            typeof msg.payload?.message === "string"
              ? msg.payload.message
              : "An unexpected error occurred.";
          setErrorMessage(message);
          break;
        }

        default:
          break;
      }
    });

    return unsubscribe;
  }, [subscribe, disconnectSocket, refreshStatus, sendMessage]);

  const handleLogoutClick = async () => {
    disconnectSocket();
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore logout request errors
    }
    setLobbyState(null);
    onLogout?.();
  };

  const toggleReady = () => {
    if (!lobbyState) {
      setErrorMessage("Syncing room state. Please try again.");
      sendMessage("SYNC_LOBBY");
      return;
    }
    const player = lobbyState.players.find((p) => p.id === myPlayerId);
    if (!player) {
      setErrorMessage("Join the room first.");
      return;
    }
    setErrorMessage("");
    sendMessage("SET_READY", { isReady: !player.isReady });
  };

  const updateSetting = (key: string, value: unknown) => {
    if (!lobbyState || lobbyState.hostId !== myPlayerId) return;
    sendMessage("UPDATE_SETTINGS", { [key]: value });
  };

  const expansionOptions = lobbyState?.expansionCatalog || EXPANSION_OPTIONS;

  const toggleExpansion = (expId: string, enabled: boolean) => {
    const option = expansionOptions.find((e) => e.id === expId);
    if (!lobbyState || !option?.active) return;
    const current = new Set(lobbyState.settings.expansions || ["base"]);
    current.add("base");
    if (enabled) {
      current.add(expId);
    } else {
      current.delete(expId);
    }
    updateSetting("expansions", Array.from(current));
  };

  const handleKickPlayer = (targetPlayerId: string) => {
    if (!lobbyState || lobbyState.hostId !== myPlayerId) return;
    sendMessage("KICK_PLAYER", { playerId: targetPlayerId });
  };

  const handleCopyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      window.setTimeout(() => setCopiedUrl((curr) => (curr === url ? null : curr)), 2000);
    } catch {
      setErrorMessage("Clipboard access unavailable. Copy the URL manually.");
    }
  };

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    sendMessage("CREATE_ROOM", { roomName: roomNameInput.trim() || "Saloon Table #1" });
  };

  const handleJoinRoom = () => {
    setErrorMessage("");
    sendMessage("JOIN_ROOM", {});
  };

  const handleLeaveRoom = () => {
    setErrorMessage("");
    sendMessage("LEAVE_ROOM", {});
  };

  const handleStartGame = () => {
    if (!lobbyState) return;
    setErrorMessage("");
    sendMessage("START_GAME", {});
  };

  const handleConfirmHostAction = () => {
    if (!confirmAction) return;
    setErrorMessage("");
    if (confirmAction === "delete_match") {
      sendMessage("DELETE_MATCH", {});
    } else if (confirmAction === "delete_room") {
      sendMessage("DELETE_ROOM", {});
    }
    setConfirmAction(null);
  };

  const me = lobbyState?.players.find((p) => p.id === myPlayerId);
  const isHost = lobbyState?.hostId === myPlayerId;
  const onlinePlayers = lobbyState?.players.filter((p) => p.isOnline) || [];
  const activeCount = onlinePlayers.length;
  const minPlayers = lobbyState?.minPlayers ?? 3;
  const allReady = onlinePlayers.length > 0 && onlinePlayers.every((p) => p.isHost || p.isReady);
  const unreadyNames = onlinePlayers
    .filter((p) => !p.isHost && !p.isReady)
    .map((p) => p.name);

  if (!currentUser || isSessionLocked) {
    return (
      <div className="lobby-screen">
        <div className="lobby-screen__container">
          <div className="lobby-screen__auth-card lobby-screen__room-entry">
            <h2 className="lobby-screen__card-header">
              {isSessionLocked ? "Session Locked" : "Authentication Required"}
            </h2>
            <p className="lobby-screen__subtitle">
              {errorMessage || "Sign in to access the Saloon Lobby."}
            </p>
            {onLogout && (
              <button
                type="button"
                onClick={() => void handleLogoutClick()}
                className="lobby-screen__btn lobby-screen__btn--ready lobby-screen__btn--full"
              >
                Return to Sign In
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lobby-screen">
      <div className="lobby-screen__container">
        <header className="lobby-screen__header">
          <div className="lobby-screen__title-group">
            <img
              src="/favicon.svg"
              alt="Sheriff Star"
              className="lobby-screen__badge-icon"
              width={28}
              height={28}
            />
            <h1 className="lobby-screen__title">WESTERN GUN - LOBBY</h1>
            <div className="lobby-screen__connection-badge">
              <span
                className={`lobby-screen__status-dot ${
                  isConnected
                    ? "lobby-screen__status-dot--online"
                    : "lobby-screen__status-dot--offline"
                }`}
              />
              <span>{isConnected ? "Server: Connected" : "Server: Reconnecting..."}</span>
            </div>
          </div>

          <div className="lobby-screen__header-actions">
            <a href="/dev-test" className="lobby-screen__dev-link">
              Dev UI Sandbox
            </a>
            <button
              type="button"
              onClick={() => void handleLogoutClick()}
              className="lobby-screen__logout-btn"
            >
              Leave Lobby
            </button>
          </div>
        </header>

        {isDbLocked && (
          <div role="status" className="lobby-screen__lock-notice">
            Catalog database is locked. Waiting for database unlock before starting a match.
          </div>
        )}

        {errorMessage && (
          <div role="alert" className="lobby-screen__error-alert">
            {errorMessage}
          </div>
        )}

        {!lobbyState ? (
          <div className="lobby-screen__auth-card lobby-screen__room-entry">
            <h2 className="lobby-screen__card-header">Connecting to Saloon</h2>
            <p className="lobby-screen__subtitle">
              Synchronizing room state from server...
            </p>
            <button
              type="button"
              onClick={() => sendMessage("SYNC_LOBBY")}
              className="lobby-screen__btn lobby-screen__btn--ready lobby-screen__btn--full"
            >
              Retry Sync
            </button>
          </div>
        ) : !lobbyState.roomExists ? (
          <div className="lobby-screen__auth-card lobby-screen__room-entry">
            <h2 className="lobby-screen__card-header">Create Saloon Table</h2>
            <p className="lobby-screen__subtitle">
              No table is open right now. Create a room to become Host and configure match rules.
            </p>
            <form onSubmit={handleCreateRoom} className="lobby-screen__form">
              <div className="lobby-screen__form-group">
                <label htmlFor="lobby-room-name" className="lobby-screen__label">
                  Room Name:
                </label>
                <input
                  id="lobby-room-name"
                  type="text"
                  value={roomNameInput}
                  onChange={(e) => setRoomNameInput(e.target.value)}
                  placeholder="Saloon Table #1"
                  className="lobby-screen__input"
                  maxLength={32}
                />
              </div>
              <button type="submit" className="lobby-screen__btn lobby-screen__btn--start">
                Create Room
              </button>
            </form>
          </div>
        ) : !me ? (
          <div className="lobby-screen__auth-card lobby-screen__room-entry">
            <h2 className="lobby-screen__card-header">
              {lobbyState.roomName || "Saloon Table #1"}
            </h2>
            <p className="lobby-screen__subtitle">
              Host:{" "}
              <strong>
                {lobbyState.players.find((p) => p.id === lobbyState.hostId)?.name || "Unknown"}
              </strong>{" "}
              | Players: {activeCount} / {lobbyState.maxPlayers || 8} | Status:{" "}
              {lobbyState.status === "in_game" ? "Match in Progress" : "Waiting"}
            </p>
            <button
              type="button"
              disabled={
                lobbyState.status === "in_game" || activeCount >= (lobbyState.maxPlayers || 8)
              }
              onClick={handleJoinRoom}
              className="lobby-screen__btn lobby-screen__btn--ready lobby-screen__btn--full"
            >
              {lobbyState.status === "in_game" ? "Match Already in Progress" : "Join Room"}
            </button>
          </div>
        ) : (
          <>
            <div className="lobby-screen__grid">
              <LobbyPlayerList
                players={lobbyState.players}
                activeCount={activeCount}
                maxPlayers={lobbyState.maxPlayers}
                myPlayerId={myPlayerId}
                isHost={isHost}
                status={lobbyState.status}
                onKickPlayer={handleKickPlayer}
              />

              <LobbySettingsPanel
                settings={lobbyState.settings}
                expansionOptions={expansionOptions}
                isHost={isHost}
                tunnelUrl={tunnelUrl}
                lanUrls={lanUrls}
                copiedUrl={copiedUrl}
                onToggleExpansion={toggleExpansion}
                onCopyUrl={(url) => void handleCopyUrl(url)}
              />
            </div>

            <div className="lobby-screen__action-bar">
              {lobbyState.status === "in_game" ? (
                <>
                  <button
                    type="button"
                    onClick={onStartGame}
                    className="lobby-screen__btn lobby-screen__btn--start"
                  >
                    Join Game Table
                  </button>
                  {isHost && (
                    <>
                      <button
                        type="button"
                        disabled={!isConnected}
                        onClick={() => setConfirmAction("delete_match")}
                        className="lobby-screen__btn lobby-screen__btn--danger"
                      >
                        Delete Match
                      </button>
                      <button
                        type="button"
                        disabled={!isConnected}
                        onClick={() => setConfirmAction("delete_room")}
                        className="lobby-screen__btn lobby-screen__btn--danger-outline"
                      >
                        Delete Room
                      </button>
                    </>
                  )}
                </>
              ) : (
                <>
                  {!isHost && (
                    <button
                      type="button"
                      disabled={!isConnected}
                      onClick={toggleReady}
                      className={`lobby-screen__btn ${
                        me.isReady ? "lobby-screen__btn--unready" : "lobby-screen__btn--ready"
                      }`}
                    >
                      {me.isReady ? "Cancel Ready" : "I am Ready!"}
                    </button>
                  )}

                  {isHost && (
                    <div className="lobby-screen__start-group">
                      {unreadyNames.length > 0 && (
                        <span className="lobby-screen__start-hint">
                          Waiting for Ready: {unreadyNames.join(", ")}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={handleStartGame}
                        disabled={!isConnected || isDbLocked || activeCount < minPlayers || !allReady}
                        className="lobby-screen__btn lobby-screen__btn--start"
                      >
                        {activeCount >= minPlayers
                          ? `Start Match (${activeCount} Ready)`
                          : `Start Match (${activeCount}/${minPlayers})`}
                      </button>
                    </div>
                  )}

                  {(!isHost || lobbyState.players.length <= 1) && (
                    <button
                      type="button"
                      disabled={!isConnected}
                      onClick={handleLeaveRoom}
                      className="lobby-screen__btn lobby-screen__btn--leave"
                    >
                      Leave Room
                    </button>
                  )}

                  {isHost && (
                    <button
                      type="button"
                      disabled={!isConnected}
                      onClick={() => setConfirmAction("delete_room")}
                      className="lobby-screen__btn lobby-screen__btn--danger-outline"
                    >
                      Delete Room
                    </button>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>

      {confirmAction !== null && (
        <Modal isOpen={true} size="medium" onClose={() => setConfirmAction(null)}>
          <Modal.Header
            title={confirmAction === "delete_match" ? "Delete Active Match?" : "Delete Saloon Room?"}
            subtitle="Host Room Management"
          />
          <Modal.Body>
            <p>
              {confirmAction === "delete_match"
                ? "This will immediately abort the active match, wipe all saved match state and combat logs, and return all players to the waiting room."
                : "This will permanently close the room, remove all players from the table, and clear any active match data so a new room can be created."}
            </p>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setConfirmAction(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleConfirmHostAction}>
              {confirmAction === "delete_match" ? "Delete Match" : "Delete Room"}
            </Button>
          </Modal.Footer>
        </Modal>
      )}
    </div>
  );
};
