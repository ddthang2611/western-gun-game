import React from "react";
import type { LobbyPlayer } from "../../../types/game";
import { useI18n } from "../../../i18n";

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
  const { t } = useI18n();
  return (
    <div className="lobby-screen__panel">
      <h2 className="lobby-screen__panel-title">
        {t("lobby.playersTitle", { count: activeCount, max: maxPlayers || 8 })}
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
                  <span className="lobby-screen__host-badge">{t("lobby.hostBadge")}</span>
                )}
                {isCurrent && (
                  <span className="lobby-screen__me-badge">{t("lobby.youBadge")}</span>
                )}
                {!p.isOnline && (
                  <span className="lobby-screen__offline-badge">{t("lobby.offlineBadge")}</span>
                )}
              </div>
              <div className="lobby-screen__player-actions">
                {p.isHost ? (
                  <span className="lobby-screen__status-tag lobby-screen__status-tag--ready">
                    {t("lobby.hostBadge")}
                  </span>
                ) : p.isReady ? (
                  <span className="lobby-screen__status-tag lobby-screen__status-tag--ready">
                    {t("lobby.ready")}
                  </span>
                ) : (
                  <span className="lobby-screen__status-tag lobby-screen__status-tag--not-ready">
                    {t("lobby.notReady")}
                  </span>
                )}

                {isHost && !p.isHost && status === "waiting" && (
                  <button
                    type="button"
                    onClick={() => onKickPlayer(p.id)}
                    aria-label={t("lobby.kickAria", { name: p.name })}
                    className="lobby-screen__kick-btn"
                  >
                    {t("lobby.kick")}
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
