import React from "react";
import type { RoleType, Card, Suit, StructuredLogEntry } from "../../../types/game";
import { CardTooltipContent, useI18n } from "../../../i18n";
import { DebouncedPopover } from "../../../components/ui";
import { formatSimpleLog } from "../../../utils/formatters";
import "./TableSidebar.scss";

export interface TableSidebarProps {
  myRole?: RoleType;
  roleCounts: { police: number; outlaw: number; renegade: number };
  combatLog: string[];
  structuredCombatLog?: StructuredLogEntry[];
  deckCount?: number;
  discardCount?: number;
  topDiscard?: Card;
  onOpenCombatLog?: () => void;
}

const SUIT_SYMBOLS: Record<Suit, string> = {
  spades: "\u2660",
  hearts: "\u2665",
  diamonds: "\u2666",
  clubs: "\u2663",
};

export const TableSidebar: React.FC<TableSidebarProps> = ({
  myRole,
  roleCounts,
  combatLog,
  structuredCombatLog,
  deckCount = 80,
  discardCount = 0,
  topDiscard,
  onOpenCombatLog,
}) => {
  const { t, tCard, tRole, tLog } = useI18n();
  const displayLogs =
    structuredCombatLog && structuredCombatLog.length > 0
      ? structuredCombatLog.slice(0, 16).map((entry) => tLog(entry))
      : combatLog.slice(0, 16).map((log) => formatSimpleLog(log));
  const logCount =
    structuredCombatLog && structuredCombatLog.length > 0
      ? structuredCombatLog.length
      : combatLog.length;

  const topCardLoc = topDiscard ? tCard(topDiscard) : null;
  const topDiscardLabel = topDiscard
    ? `${topCardLoc?.primary.name || topDiscard.name} ${topDiscard.rank}${SUIT_SYMBOLS[topDiscard.suit] || ""}`
    : t("common.unknown");

  return (
    <aside className="game-table__sidebar">
      <div className="game-table__sidebar-box">
        <div className="game-table__deck-stats">
          <div className="game-table__deck-pile">
            <div
              className="game-table__pile-card game-table__pile-card--stack"
              data-flight-anchor="draw-pile"
              title={t("table.deckLabel", { count: deckCount })}
            >
              <img
                src="/assets/images/ui/card_back.png"
                alt={t("table.deckShort")}
                className="game-table__pile-img"
              />
              <span className="game-table__pile-count">{deckCount}</span>
            </div>
            <span className="game-table__deck-stat-label">{t("table.deckShort")}</span>
          </div>

          <div className="game-table__deck-pile">
            {topDiscard && topCardLoc ? (
              <DebouncedPopover
                content={
                  <CardTooltipContent
                    primaryDesc={topCardLoc.primary.desc || topDiscard.desc}
                    secondaryDesc={topCardLoc.secondary?.desc}
                  />
                }
                delayMs={200}
              >
                <div
                  className="game-table__pile-card game-table__pile-card--discard"
                  data-flight-anchor="discard-pile"
                >
                  {topDiscard.image ? (
                    <img
                      src={topDiscard.image}
                      alt={topDiscardLabel}
                      className="game-table__pile-img"
                    />
                  ) : (
                    <span className="game-table__pile-fallback">{topDiscardLabel}</span>
                  )}
                  <span className="game-table__pile-count">{discardCount}</span>
                </div>
              </DebouncedPopover>
            ) : (
              <div
                className="game-table__pile-card game-table__pile-card--empty"
                data-flight-anchor="discard-pile"
              >
                <span className="game-table__pile-count">{discardCount}</span>
              </div>
            )}
            <span className="game-table__deck-stat-label">{t("table.discardShort")}</span>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onOpenCombatLog}
        className="game-table__sidebar-box game-table__sidebar-box--log"
      >
        <div className="game-table__log-header">
          <div className="game-table__box-title game-table__box-title--inline">
            {t("table.logTitle")}
          </div>
          <span className="game-table__log-expand">({logCount})</span>
        </div>
        <div className="game-table__log-list">
          {displayLogs.map((logText, idx) => (
            <div key={idx}>{logText}</div>
          ))}
          {logCount === 0 && <div className="game-table__log-empty">—</div>}
        </div>
      </button>

      <div className="game-table__sidebar-box game-table__sidebar-box--secret-role">
        <div className="game-table__roles-grid">
          <span className="game-table__role-count--police">
            {t("roles.counter.law")} {roleCounts.police}
          </span>
          <span className="game-table__role-count--outlaw">
            {t("roles.counter.outlaw")} {roleCounts.outlaw}
          </span>
          <span className="game-table__role-count--renegade">
            {t("roles.counter.renegade")} {roleCounts.renegade}
          </span>
        </div>
        <div className="game-table__role-caption">{t("table.roleCaption")}</div>
        <div
          className={`game-table__role-name ${
            myRole ? "" : "game-table__role-name--pending"
          }`.trim()}
        >
          {myRole ? tRole(myRole).toUpperCase() : t("table.assigningRole")}
        </div>
      </div>
    </aside>
  );
};
