import React from "react";
import type { LobbyPlayer } from "../../../types/game";

export interface LobbyPlayerListProps {
  players: LobbyPlayer[];
  activeCount: number;
  maxPlayers: number;
  myPlayerId: string;
  isHost: boolean;
  status: "waiting" | "in_game";
  onKickPlayer: (playerId: string) => void;
}

export const LobbyPlayerList: React.FC<LobbyPlayerListProps> = ({
  players,
  activeCount,
  maxPlayers,
  myPlayerId,
  isHost,
  status,
  onKickPlayer,
}) => {
  return (
    <div className="lobby-screen__panel">
      <h2 className="lobby-screen__panel-title">
        Players in Room ({activeCount} / {maxPlayers || 8})
      </h2>
      <div className="lobby-screen__player-list">
        {players.map((p) => {
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

                {isHost && !p.isHost && status === "waiting" && (
                  <button
                    type="button"
                    onClick={() => onKickPlayer(p.id)}
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
  );
};
