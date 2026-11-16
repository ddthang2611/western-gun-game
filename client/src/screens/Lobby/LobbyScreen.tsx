import React, { useState, useEffect, useRef, useCallback } from "react";
import "./LobbyScreen.scss";

interface LobbyPlayer {
  id: string;
  name: string;
  seatIndex: number;
  isHost: boolean;
  isReady: boolean;
  isOnline: boolean;
}

interface GameSettings {
  dualCharacterEnabled: boolean;
  dualCharacterHpRule: "strict" | "balanced" | "juggernaut";
  expansions: string[];
}

interface LobbyState {
  roomExists: boolean;
  roomId: string;
  roomName?: string;
  hostId: string;
  status: "waiting" | "in_game";
  players: LobbyPlayer[];
  settings: GameSettings;
  minPlayers: number;
  maxPlayers: number;
}

export interface LobbyScreenProps {
  currentUser?: { playerId: string; name: string };
  onStartGame?: () => void;
  onLogout?: () => void;
  onKicked?: (reason: string) => void;
}

const EXPANSION_OPTIONS = [
  { id: "dodge_city", label: "Dodge City (15 Heroes + Green Cards)", disabled: false },
  { id: "high_noon", label: "High Noon (Temporarily Disabled)", disabled: true },
  { id: "fistful_of_cards", label: "A Fistful of Cards (15 Round Events)", disabled: false },
];

export const LobbyScreen: React.FC<LobbyScreenProps> = ({
  currentUser,
  onStartGame,
  onLogout,
  onKicked,
}) => {
  const [playerName, setPlayerName] = useState(currentUser?.name || "");
  const [pinCode, setPinCode] = useState("");
  const [roomNameInput, setRoomNameInput] = useState("Saloon Table #1");
  const [isJoined, setIsJoined] = useState(Boolean(currentUser));
  const [myPlayerId, setMyPlayerId] = useState(currentUser?.playerId || "");
  const [errorMessage, setErrorMessage] = useState("");
  const [lobbyState, setLobbyState] = useState<LobbyState | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lanUrls, setLanUrls] = useState<string[]>([]);
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const prevStatusRef = useRef<string | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const pingTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const shouldReconnectRef = useRef(true);
  const connectWsRef = useRef<(() => void) | null>(null);
  const onStartGameRef = useRef(onStartGame);
  const onKickedRef = useRef(onKicked);
  const isJoinedRef = useRef(Boolean(currentUser));
  const initialPlayerIdRef = useRef(currentUser?.playerId || "");

  useEffect(() => {
    onStartGameRef.current = onStartGame;
    onKickedRef.current = onKicked;
  }, [onStartGame, onKicked]);

  useEffect(() => {
    isJoinedRef.current = isJoined;
  }, [isJoined]);

  useEffect(() => {
    let active = true;
    const pollStatus = () => {
      fetch("/api/status")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!active || !data) return;
          if (data.lanIps) {
            const port = window.location.port || data.port || 2611;
            setLanUrls(data.lanIps.map((ip: string) => `http://${ip}:${port}`));
          }
          if (data.tunnelUrl) {
            setTunnelUrl(data.tunnelUrl);
          }
        })
        .catch(() => {
          // Ignore status fetch failure
        });
    };
    pollStatus();
    const timer = window.setInterval(pollStatus, 4000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const clearPingTimer = useCallback(() => {
    if (pingTimerRef.current !== null) {
      window.clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
  }, []);

  const closeSocket = useCallback(() => {
    clearReconnectTimer();
    clearPingTimer();
    const ws = socketRef.current;
    if (ws) {
      socketRef.current = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      if (ws.readyState === WebSocket.CONNECTING) {
        // Defer close until handshake finishes
        ws.onopen = () => ws.close(1000);
      } else {
        ws.onopen = null;
        if (ws.readyState === WebSocket.OPEN) {
          ws.close(1000);
        }
      }
    }
  }, [clearReconnectTimer, clearPingTimer]);

  const connectWebSocket = useCallback(() => {
    closeSocket();

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;

    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      reconnectAttemptRef.current = 0;
      setIsConnected(true);
      setErrorMessage("");
      if (isJoinedRef.current) {
        ws.send(JSON.stringify({ type: "SYNC_LOBBY", payload: {} }));
      }
      clearPingTimer();
      pingTimerRef.current = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "PING", payload: {} }));
        }
      }, 20000);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case "AUTH_SUCCESS": {
            const incomingId = msg.payload?.playerId || "";
            if (
              initialPlayerIdRef.current &&
              incomingId &&
              initialPlayerIdRef.current !== incomingId
            ) {
              setErrorMessage(
                `Browser session switched to ${msg.payload?.name || "another player"}. Use an Incognito or separate browser window per player.`
              );
            }
            initialPlayerIdRef.current = incomingId;
            setIsJoined(true);
            setMyPlayerId(incomingId);
            break;
          }
          case "AUTH_REQUIRED": {
            if (isJoinedRef.current) {
              setIsJoined(false);
              setLobbyState(null);
              setErrorMessage(
                msg.payload?.reason || "Session expired. Please sign in again."
              );
            }
            break;
          }
          case "LOBBY_STATE": {
            const prevStatus = prevStatusRef.current;
            const newStatus = msg.payload?.status;
            prevStatusRef.current = newStatus;
            setLobbyState(msg.payload);

            // Auto-launch when match starts from lobby
            if (prevStatus === "waiting" && newStatus === "in_game") {
              onStartGameRef.current?.();
            }
            break;
          }
          case "PLAYER_KICKED": {
            const reason = msg.payload?.reason || "You were removed from the room by the Host.";
            shouldReconnectRef.current = false;
            closeSocket();
            setIsJoined(false);
            fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
            if (onKickedRef.current) {
              onKickedRef.current(reason);
            } else {
              setErrorMessage(reason);
            }
            break;
          }
          case "ERROR": {
            setErrorMessage(msg.payload?.message || "An unexpected error occurred.");
            break;
          }
          default:
            break;
        }
      } catch {
        // Ignore unparseable message
      }
    };

    ws.onclose = () => {
      clearPingTimer();
      setIsConnected(false);
      if (shouldReconnectRef.current) {
        const delay = Math.min(5000, 1000 * Math.pow(2, reconnectAttemptRef.current));
        reconnectAttemptRef.current += 1;
        reconnectTimerRef.current = window.setTimeout(() => {
          connectWsRef.current?.();
        }, delay);
      }
    };

    ws.onerror = () => {
      setIsConnected(false);
    };
  }, [clearPingTimer, closeSocket]);

  useEffect(() => {
    connectWsRef.current = connectWebSocket;
  }, [connectWebSocket]);

  useEffect(() => {
    shouldReconnectRef.current = true;
    // Defer initial connect past StrictMode cleanup
    const connectTimer = window.setTimeout(() => {
      connectWebSocket();
    }, 0);
    return () => {
      window.clearTimeout(connectTimer);
      shouldReconnectRef.current = false;
      closeSocket();
    };
  }, [connectWebSocket, closeSocket]);

  const sendMessage = useCallback(
    (type: string, payload: Record<string, unknown> = {}): boolean => {
      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        setErrorMessage("Cannot connect to server. Retrying...");
        connectWebSocket();
        return false;
      }
      socketRef.current.send(JSON.stringify({ type, payload }));
      return true;
    },
    [connectWebSocket]
  );

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = playerName.trim();
    const cleanPin = pinCode.trim();

    if (!cleanName) {
      setErrorMessage("Please enter player name.");
      return;
    }
    if (!cleanPin || cleanPin.length !== 4) {
      setErrorMessage("PIN must be exactly 4 digits.");
      return;
    }

    setErrorMessage("");
    sendMessage("AUTH_JOIN", {
      name: cleanName,
      pin: cleanPin,
    });
  };

  const handleLogoutClick = async () => {
    shouldReconnectRef.current = false;
    closeSocket();
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore
    }
    setIsJoined(false);
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

  const toggleExpansion = (expId: string, enabled: boolean) => {
    if (!lobbyState || expId === "high_noon") return;
    const current = new Set(lobbyState.settings.expansions || ["base"]);
    current.add("base");
    current.delete("high_noon");
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

  const handleResetRoom = () => {
    setErrorMessage("");
    sendMessage("RESET_LOBBY", {});
  };

  const me = lobbyState?.players.find((p) => p.id === myPlayerId);
  const isHost = lobbyState?.hostId === myPlayerId;
  const onlinePlayers = lobbyState?.players.filter((p) => p.isOnline) || [];
  const activeCount = onlinePlayers.length;
  const allReady = onlinePlayers.length > 0 && onlinePlayers.every((p) => p.isHost || p.isReady);
  const unreadyNames = onlinePlayers
    .filter((p) => !p.isHost && !p.isReady)
    .map((p) => p.name);

  return (
    <div className="lobby-screen">
      <div className="lobby-screen__container">
      <header className="lobby-screen__header">
        <div className="lobby-screen__title-group">
          <img src="/favicon.svg" alt="Sheriff Star" className="lobby-screen__badge-icon" width={28} height={28} />
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
          {isJoined && (
            <button type="button" onClick={handleLogoutClick} className="lobby-screen__logout-btn">
              Leave Lobby
            </button>
          )}
        </div>
      </header>

      {errorMessage && (
        <div role="alert" className="lobby-screen__error-alert">{errorMessage}</div>
      )}

      {!isJoined ? (
        <div className="lobby-screen__auth-card">
          <h2 className="lobby-screen__card-header">Player Identification</h2>
          <p className="lobby-screen__subtitle">
            Enter your Name and a 4-digit PIN to join the lobby table.
          </p>
          <form onSubmit={handleJoin} className="lobby-screen__form">
            <div className="lobby-screen__form-group">
              <label htmlFor="lobby-player-name" className="lobby-screen__label">Player Name:</label>
              <input
                id="lobby-player-name"
                type="text"
                autoComplete="username"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="e.g. Sheriff John"
                className="lobby-screen__input"
                maxLength={20}
                required
              />
            </div>
            <div className="lobby-screen__form-group">
              <label htmlFor="lobby-player-pin" className="lobby-screen__label">4-Digit PIN:</label>
              <input
                id="lobby-player-pin"
                type="password"
                autoComplete="current-password"
                inputMode="numeric"
                value={pinCode}
                onChange={(e) => setPinCode(e.target.value.replace(/\D/g, ""))}
                placeholder="4 digits"
                className="lobby-screen__input lobby-screen__input--pin"
                maxLength={4}
                required
              />
            </div>
            <button type="submit" className="lobby-screen__join-btn">
              Enter Saloon
            </button>
          </form>
        </div>
      ) : !lobbyState ? (
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
            disabled={lobbyState.status === "in_game" || activeCount >= (lobbyState.maxPlayers || 8)}
            onClick={handleJoinRoom}
            className="lobby-screen__btn lobby-screen__btn--ready lobby-screen__btn--full"
          >
            {lobbyState.status === "in_game"
              ? "Match Already in Progress"
              : "Join Room"}
          </button>
        </div>
      ) : (
        <>
          <div className="lobby-screen__grid">
            <div className="lobby-screen__panel">
              <h2 className="lobby-screen__panel-title">
                Players in Room ({activeCount} / {lobbyState?.maxPlayers || 8})
              </h2>
              <div className="lobby-screen__player-list">
                {lobbyState?.players.map((p) => {
                  const isCurrent = p.id === myPlayerId;
                  return (
                    <div
                      key={p.id}
                      className={`lobby-screen__player-item ${
                        isCurrent ? "lobby-screen__player-item--me" : ""
                      }`}
                    >
                      <div className="lobby-screen__player-meta">
                        <span className="lobby-screen__player-name">{p.name}</span>
                        {p.isHost && (
                          <span className="lobby-screen__host-badge">HOST</span>
                        )}
                        {isCurrent && (
                          <span className="lobby-screen__me-badge">YOU</span>
                        )}
                        {!p.isOnline && (
                          <span className="lobby-screen__offline-badge">OFFLINE</span>
                        )}
                      </div>
                      <div className="lobby-screen__player-actions">
                        {p.isHost ? (
                          <span className="lobby-screen__status-tag lobby-screen__status-tag--ready">
                            HOST
                          </span>
                        ) : p.isReady ? (
                          <span className="lobby-screen__status-tag lobby-screen__status-tag--ready">
                            READY
                          </span>
                        ) : (
                          <span className="lobby-screen__status-tag lobby-screen__status-tag--not-ready">
                            NOT READY
                          </span>
                        )}

                        {isHost && !p.isHost && lobbyState?.status === "waiting" && (
                          <button
                            type="button"
                            onClick={() => handleKickPlayer(p.id)}
                            aria-label={`Kick ${p.name} from room`}
                            className="lobby-screen__kick-btn"
                          >
                            Kick
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="lobby-screen__panel">
              <h2 className="lobby-screen__panel-title">Game Rules &amp; Settings</h2>
              <div className="lobby-screen__settings-form">
                <label className="lobby-screen__checkbox-row">
                  <input
                    type="checkbox"
                    checked={false}
                    disabled={true}
                    onChange={() => undefined}
                  />
                  <span>Dual Character Mode (Disabled - Single Character Only)</span>
                </label>

                {lobbyState?.settings.dualCharacterEnabled && (
                  <div className="lobby-screen__form-group">
                    <label htmlFor="lobby-hp-rule" className="lobby-screen__label">Dual HP Rule:</label>
                    <select
                      id="lobby-hp-rule"
                      value={lobbyState.settings.dualCharacterHpRule}
                      disabled={!isHost}
                      onChange={(e) => updateSetting("dualCharacterHpRule", e.target.value)}
                      className="lobby-screen__select"
                    >
                      <option value="strict">Strict (Min Base HP)</option>
                      <option value="balanced">Balanced (Min HP + 1)</option>
                      <option value="juggernaut">Juggernaut (Sum HP - 2)</option>
                    </select>
                  </div>
                )}

                <div className="lobby-screen__form-group">
                  <span className="lobby-screen__label">Expansions (Base always active):</span>
                  <div className="lobby-screen__expansions-list">
                    {EXPANSION_OPTIONS.map((exp) => {
                      const active = !exp.disabled && (lobbyState?.settings.expansions || []).includes(exp.id);
                      const isDisabled = !isHost || exp.disabled;
                      return (
                        <label
                          key={exp.id}
                          className={`lobby-screen__checkbox-row${
                            exp.disabled ? " lobby-screen__checkbox-row--disabled" : ""
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={active}
                            disabled={isDisabled}
                            onChange={(e) => toggleExpansion(exp.id, e.target.checked)}
                          />
                          <span>{exp.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {tunnelUrl && (
                  <div className="lobby-screen__form-group">
                    <span className="lobby-screen__label">Invite via Global Cloudflare Link:</span>
                    <div className="lobby-screen__lan-list">
                      <div className="lobby-screen__lan-item">
                        <code className="lobby-screen__lan-code">{tunnelUrl}</code>
                        <button
                          type="button"
                          onClick={() => void handleCopyUrl(tunnelUrl)}
                          className="lobby-screen__copy-btn"
                        >
                          {copiedUrl === tunnelUrl ? "Copied" : "Copy"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {lanUrls.length > 0 && (
                  <div className="lobby-screen__form-group">
                    <span className="lobby-screen__label">Invite via LAN:</span>
                    <div className="lobby-screen__lan-list">
                      {lanUrls.map((url) => (
                        <div key={url} className="lobby-screen__lan-item">
                          <code className="lobby-screen__lan-code">{url}</code>
                          <button
                            type="button"
                            onClick={() => void handleCopyUrl(url)}
                            className="lobby-screen__copy-btn"
                          >
                            {copiedUrl === url ? "Copied" : "Copy"}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="lobby-screen__action-bar">
            {lobbyState?.status === "in_game" ? (
              <>
                <button
                  type="button"
                  onClick={onStartGame}
                  className="lobby-screen__btn lobby-screen__btn--start"
                >
                  Join Game Table
                </button>
                {isHost && (
                  <button
                    type="button"
                    onClick={handleResetRoom}
                    className="lobby-screen__btn lobby-screen__btn--unready"
                  >
                    Reset Room to Lobby
                  </button>
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
                      me?.isReady ? "lobby-screen__btn--unready" : "lobby-screen__btn--ready"
                    }`}
                  >
                    {me?.isReady ? "Cancel Ready" : "I am Ready!"}
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
                      disabled={
                        !isConnected || activeCount < (lobbyState?.minPlayers ?? 3) || !allReady
                      }
                      className="lobby-screen__btn lobby-screen__btn--start"
                    >
                      Start Match ({activeCount}/{lobbyState?.minPlayers ?? 3})
                    </button>
                  </div>
                )}

                {(!isHost || activeCount <= 1) && (
                  <button
                    type="button"
                    onClick={handleLeaveRoom}
                    className="lobby-screen__btn lobby-screen__btn--leave"
                  >
                    Leave Room
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
      </div>
    </div>
  );
};
