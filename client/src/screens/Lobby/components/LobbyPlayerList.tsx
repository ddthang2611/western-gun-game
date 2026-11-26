import React from "react";
import type { LobbyPlayer } from "../../../types/game";
import { useI18n } from "../../../i18n";

export interface LobbyPlayerListProps {
  players: LobbyPlayer[];
  targetPlayers: number;
  autoFillBots: boolean;
  myPlayerId: string;
  isHost: boolean;
  status: "waiting" | "in_game";
  onKickPlayer: (playerId: string) => void;
  onAddBot: () => void;
  onRemoveBot: (botId: string) => void;
  onFillBots: () => void;
}

export const LobbyPlayerList: React.FC<LobbyPlayerListProps> = ({
  players,
  targetPlayers,
  autoFillBots,
  myPlayerId,
  isHost,
  status,
  onKickPlayer,
  onAddBot,
  onRemoveBot,
  onFillBots,
}) => {
  const { t } = useI18n();
  const botCount = players.filter((p) => p.isBot).length;
  const humanCount = players.length - botCount;
  const isAtCapacity = players.length >= targetPlayers;
  const emptySeatCount = status === "waiting" ? Math.max(0, targetPlayers - players.length) : 0;

  return (
    <div className="lobby-screen__panel">
      <div className="lobby-screen__panel-header">
        <div className="lobby-screen__panel-title-group">
          <h2 className="lobby-screen__panel-title">
            {t("lobby.playersTitle", { count: players.length, max: targetPlayers })}
          </h2>
          {botCount > 0 && (
            <span className="lobby-screen__roster-summary">
              {t("lobby.rosterSummary", { humans: humanCount, bots: botCount })}
            </span>
          )}
        </div>

        {isHost && status === "waiting" && (
          <div className="lobby-screen__header-actions-group">
            <button
              type="button"
              disabled={isAtCapacity}
              onClick={onAddBot}
              className="lobby-screen__bot-action-btn"
            >
              {t("lobby.addBot")}
            </button>
            <button
              type="button"
              disabled={isAtCapacity}
              onClick={onFillBots}
              className="lobby-screen__bot-action-btn"
            >
              {t("lobby.fillBots")}
            </button>
          </div>
        )}
      </div>

      <div className="lobby-screen__player-list">
        {players.map((p) => {
          const isCurrent = p.id === myPlayerId;
          const isBot = Boolean(p.isBot);
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
                {isBot && (
                  <span className="lobby-screen__bot-badge">{t("lobby.botBadge")}</span>
                )}
                {isCurrent && (
                  <span className="lobby-screen__me-badge">{t("lobby.youBadge")}</span>
                )}
                {!isBot && !p.isOnline && (
                  <span className="lobby-screen__offline-badge">{t("lobby.offlineBadge")}</span>
                )}
              </div>
              <div className="lobby-screen__player-actions">
                {p.isHost ? (
                  <span className="lobby-screen__status-tag lobby-screen__status-tag--ready">
                    {t("lobby.hostBadge")}
                  </span>
                ) : isBot || p.isReady ? (
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
                    onClick={() => (isBot ? onRemoveBot(p.id) : onKickPlayer(p.id))}
                    aria-label={
                      isBot
                        ? t("lobby.removeBotAria", { name: p.name })
                        : t("lobby.kickAria", { name: p.name })
                    }
                    className="lobby-screen__kick-btn"
                  >
                    {isBot ? t("lobby.removeBot") : t("lobby.kick")}
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {Array.from({ length: emptySeatCount }).map((_, idx) => {
          const seat = players.length + idx + 1;
          return (
            <div key={`empty-seat-${seat}`} className="lobby-screen__empty-seat">
              <span className="lobby-screen__empty-seat-label">
                {autoFillBots
                  ? t("lobby.emptySeatAuto", { seat })
                  : t("lobby.emptySeatOpen", { seat })}
              </span>
              {autoFillBots && (
                <span className="lobby-screen__auto-tag">{t("lobby.autoTag")}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
