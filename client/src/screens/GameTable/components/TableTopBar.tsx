import React from "react";
import type { ActiveEventInfo } from "../../../types/game";
import { CardTooltipContent, LanguageSwitcher, useI18n } from "../../../i18n";
import { DebouncedPopover } from "../../../components/ui";
import "./TableTopBar.scss";

export interface TableTopBarProps {
  roomId: string;
  hostInfo: string;
  hostName?: string;
  currentPhase: number;
  isMock?: boolean;
  isHost?: boolean;
  roundNumber?: number;
  isMyTurn?: boolean;
  activePlayerName?: string;
  activeEvent?: ActiveEventInfo | null;
  onOpenCharSelect: () => void;
  onDeleteMatch?: () => void;
  onBackToLobby?: () => void;
}

export const TableTopBar: React.FC<TableTopBarProps> = ({
  roomId,
  hostInfo,
  hostName,
  currentPhase,
  isMock = true,
  isHost = false,
  roundNumber = 1,
  isMyTurn = false,
  activePlayerName,
  activeEvent,
  onOpenCharSelect,
  onDeleteMatch,
  onBackToLobby,
}) => {
  const { locale, t, tEvent } = useI18n();
  const phaseLabel = t(`phases.${currentPhase}`, undefined, String(currentPhase));
  const hostDisplay = hostName || hostInfo.replace(/^Host:\s*/i, "");
  const eventLoc = activeEvent ? tEvent(activeEvent) : null;
  const eventPackName =
    activeEvent?.pack === "fistful" || activeEvent?.pack === "fistful_of_cards"
      ? "A Fistful of Cards"
      : "High Noon";
  const eventDisplayName =
    eventLoc && locale === "vi" && eventLoc.primary.subtitleVi
      ? `${eventLoc.primary.name} (${eventLoc.primary.subtitleVi})`
      : eventLoc?.primary.name || activeEvent?.name || "";

  return (
    <header className="game-table__header">
      <div className="game-table__brand-group">
        <img src="/favicon.svg" alt="Sheriff Star" className="game-table__brand-icon" width={22} height={22} />
        <span className="game-table__brand">WESTERN-GUN</span>
        <span className="game-table__meta-tag">
          {t("table.roomLabel")} <strong>{roomId}</strong>
        </span>
        <span className="game-table__meta-tag">
          {t("table.hostLabel")} <strong>{hostDisplay}</strong>
        </span>
        <span className="game-table__meta-tag">
          {t("table.roundLabel")} <strong>{roundNumber}</strong>
        </span>
        <span className="game-table__meta-tag">
          {t("table.stageLabel")} <strong>{phaseLabel}</strong>
        </span>
        {activeEvent && eventLoc && (
          <DebouncedPopover
            title={`${eventPackName}: ${eventDisplayName}`}
            content={
              <CardTooltipContent
                typeLabel={t("popover.type.event")}
                primaryDesc={eventLoc.primary.desc}
                secondaryTitle={eventLoc.secondary?.name}
                secondaryDesc={eventLoc.secondary?.desc}
              />
            }
            delayMs={200}
          >
            <span className="game-table__meta-tag game-table__meta-tag--event">
              {t("table.eventLabel")} <strong>{eventDisplayName}</strong>
            </span>
          </DebouncedPopover>
        )}
        {!isMock && (
          <span className="game-table__meta-tag">
            {t("table.turnLabel")}{" "}
            <strong
              className={
                isMyTurn
                  ? "game-table__turn-label--mine"
                  : "game-table__turn-label--other"
              }
            >
              {isMyTurn ? t("table.yourTurn") : activePlayerName || "..."}
            </strong>
          </span>
        )}
      </div>

      <div className="game-table__header-actions">
        <LanguageSwitcher compact />
        {isMock && (
          <button
            type="button"
            onClick={onOpenCharSelect}
            className="game-table__btn game-table__btn--primary"
          >
            {t("table.resetMock")}
          </button>
        )}
        {!isMock && isHost && onDeleteMatch && (
          <button
            type="button"
            onClick={onDeleteMatch}
            className="game-table__btn game-table__btn--danger"
          >
            {t("table.deleteMatch")}
          </button>
        )}
        <button
          type="button"
          onClick={onBackToLobby}
          className="game-table__btn game-table__btn--secondary"
        >
          {isMock ? t("common.back") : t("table.lobby")}
        </button>
      </div>
    </header>
  );
};
