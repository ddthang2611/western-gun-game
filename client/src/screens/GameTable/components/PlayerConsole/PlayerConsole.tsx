import React from "react";
import type { EquipmentSlot, Card, GreenCard, Character } from "../../../../types/game";
import { EquipmentColumn } from "./EquipmentColumn";
import { HandCardsFan } from "./HandCardsFan";
import { GreenDelayGrid } from "./GreenDelayGrid";
import { HeroProfiles } from "./HeroProfiles";

export interface PlayerConsoleProps {
  equipments: EquipmentSlot;
  hand: Card[];
  greenCards: GreenCard[];
  heroes: Character[];
  myHp: number;
  myMaxHp: number;
  selectedCardId: string | null;
  selectedCardIds?: string[];
  discardCardIds?: string[];
  selectedGreenCardId?: string | null;
  isLocked?: boolean;
  onSelectCard: (card: Card) => void;
  onTriggerGreenCard: (card: GreenCard) => void;
}

export const PlayerConsole: React.FC<PlayerConsoleProps> = ({
  equipments,
  hand,
  greenCards,
  heroes,
  myHp,
  myMaxHp,
  selectedCardId,
  selectedCardIds,
  discardCardIds,
  selectedGreenCardId,
  isLocked = false,
  onSelectCard,
  onTriggerGreenCard,
}) => {
  return (
    <footer
      className={`game-table__player-console${isLocked ? " game-table__player-console--locked" : ""}`}
    >
      {/* Left: 5 stacked equipment bars */}
      <EquipmentColumn equipments={equipments} />

      {/* Center: Hand cards fan */}
      <HandCardsFan
        hand={hand}
        selectedCardId={selectedCardId}
        selectedCardIds={selectedCardIds}
        discardCardIds={discardCardIds}
        onSelectCard={(card) => {
          if (!isLocked) onSelectCard(card);
        }}
      />

      {/* Right-Center: Enlarged Green-Delay buttons */}
      <GreenDelayGrid
        greenCards={greenCards}
        selectedGreenCardId={selectedGreenCardId}
        onTriggerGreenCard={(card) => {
          if (!isLocked) onTriggerGreenCard(card);
        }}
      />

      {/* Far Right: Character portraits, names, diagonal HP */}
      <HeroProfiles
        heroes={heroes}
        myHp={myHp}
        myMaxHp={myMaxHp}
      />
    </footer>
  );
};
