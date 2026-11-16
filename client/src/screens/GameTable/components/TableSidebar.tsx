import React from "react";
import type { RoleType, Card, Suit } from "../../../types/game";
import { DebouncedPopover } from "../../../components/ui";

export interface TableSidebarProps {
  myRole?: RoleType;
  roleCounts: { police: number; outlaw: number; renegade: number };
  combatLog: string[];
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

const formatSimpleLog = (line: string): string =>
  line
    .replace(/^\[[^\]]+\]\s*/g, "")
    .replace(/^\[Mock\]\s*/i, "")
    .trim();

export const TableSidebar: React.FC<TableSidebarProps> = ({
  myRole,
  roleCounts,
  combatLog,
  deckCount = 80,
  discardCount = 0,
  topDiscard,
  onOpenCombatLog,
}) => {
  const recentLogs = combatLog.slice(0, 3);
  const topDiscardLabel = topDiscard
    ? `${topDiscard.name} ${topDiscard.rank}${SUIT_SYMBOLS[topDiscard.suit] || ""}`
    : "None";

  return (
    <aside className="game-table__sidebar">
      <div className="game-table__sidebar-box">
        <div className="game-table__deck-stats">
          <div className="game-table__deck-pile">
            <div className="game-table__pile-card game-table__pile-card--stack" title={`Draw deck: ${deckCount} card(s)`}>
              <img
                src="/assets/images/ui/card_back.png"
                alt="Face-down draw deck"
                className="game-table__pile-img"
              />
              <span className="game-table__pile-count">{deckCount}</span>
            </div>
            <span className="game-table__deck-stat-label">Deck</span>
          </div>

          <div className="game-table__deck-pile">
            {topDiscard ? (
              <DebouncedPopover
                title={`${topDiscard.name} (${topDiscard.rank} ${topDiscard.suit})`}
                content={topDiscard.desc}
                delayMs={200}
              >
                <div className="game-table__pile-card game-table__pile-card--discard">
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
              <div className="game-table__pile-card game-table__pile-card--empty">
                <span className="game-table__pile-count">{discardCount}</span>
              </div>
            )}
            <span className="game-table__deck-stat-label">Discard</span>
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
            Log
          </div>
          <span className="game-table__log-expand">
            ({combatLog.length})
          </span>
        </div>
        <div className="game-table__log-list">
          {recentLogs.map((log, idx) => (
            <div key={idx}>{formatSimpleLog(log)}</div>
          ))}
          {combatLog.length === 0 && (
            <div className="game-table__log-empty">—</div>
          )}
        </div>
      </button>

      <div className="game-table__sidebar-box game-table__sidebar-box--secret-role">
        <div className="game-table__roles-grid">
          <span className="game-table__role-count--police">Police {roleCounts.police}</span>
          <span className="game-table__role-count--outlaw">Outlaw {roleCounts.outlaw}</span>
          <span className="game-table__role-count--renegade">Renegade {roleCounts.renegade}</span>
        </div>
        <div className="game-table__role-caption">You are the</div>
        <div
          className={`game-table__role-name ${
            myRole ? "" : "game-table__role-name--pending"
          }`.trim()}
        >
          {myRole ? myRole.toUpperCase() : "ASSIGNING..."}
        </div>
      </div>
    </aside>
  );
};
