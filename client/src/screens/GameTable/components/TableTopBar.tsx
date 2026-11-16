import React from "react";
import type { ActiveEventInfo } from "../../../types/game";
import { DebouncedPopover } from "../../../components/ui";

export interface TableTopBarProps {
  roomId: string;
  hostInfo: string;
  currentPhase: number;
  isMock?: boolean;
  roundNumber?: number;
  isMyTurn?: boolean;
  activePlayerName?: string;
  activeEvent?: ActiveEventInfo | null;
  onOpenCharSelect: () => void;
  onBackToLobby?: () => void;
}

const PHASE_LABELS: Record<number, string> = {
  0: "0 (Judgement)",
  1: "1 (Draw)",
  2: "2 (Action)",
  3: "3 (Discard)",
};

export const TableTopBar: React.FC<TableTopBarProps> = ({
  roomId,
  hostInfo,
  currentPhase,
  isMock = true,
  roundNumber = 1,
  isMyTurn = false,
  activePlayerName,
  activeEvent,
  onOpenCharSelect,
  onBackToLobby,
}) => {
  const phaseLabel = PHASE_LABELS[currentPhase] || String(currentPhase);

  return (
    <header className="game-table__header">
      <div className="game-table__brand-group">
        <img src="/favicon.svg" alt="Sheriff Star" className="game-table__brand-icon" width={22} height={22} />
        <span className="game-table__brand">WESTERN-GUN</span>
        <span className="game-table__meta-tag">
          Room: <strong>{roomId}</strong>
        </span>
        <span className="game-table__meta-tag">
          Host: <strong>{hostInfo}</strong>
        </span>
        <span className="game-table__meta-tag">
          Round: <strong>{roundNumber}</strong>
        </span>
        <span className="game-table__meta-tag">
          Phase: <strong>{phaseLabel}</strong>
        </span>
        {activeEvent && (
          <DebouncedPopover title={`High Noon: ${activeEvent.name}`} content={activeEvent.desc} delayMs={200}>
            <span className="game-table__meta-tag game-table__meta-tag--event">
              Event: <strong>{activeEvent.name}</strong>
            </span>
          </DebouncedPopover>
        )}
        {!isMock && (
          <span className="game-table__meta-tag">
            Turn:{" "}
            <strong
              className={
                isMyTurn
                  ? "game-table__turn-label--mine"
                  : "game-table__turn-label--other"
              }
            >
              {isMyTurn ? "YOUR TURN" : activePlayerName || "..."}
            </strong>
          </span>
        )}
      </div>

      <div className="game-table__header-actions">
        {isMock && (
          <button
            type="button"
            onClick={onOpenCharSelect}
            className="game-table__btn game-table__btn--primary"
          >
            Reset Mock Data
          </button>
        )}
        <button
          type="button"
          onClick={onBackToLobby}
          className="game-table__btn game-table__btn--secondary"
        >
          {isMock ? "Back" : "Lobby"}
        </button>
      </div>
    </header>
  );
};
