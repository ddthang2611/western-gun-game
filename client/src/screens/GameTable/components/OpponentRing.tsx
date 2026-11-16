import React from "react";
import type { Player, Card, GreenCard } from "../../../types/game";
import { OpponentSeat } from "../../../components/game";

export interface OpponentRingProps {
  opponents: Player[];
  selectedCard?: Card;
  selectedGreenCard?: GreenCard;
  forcedTargetMode?: string | null;
  ricochetActive?: boolean;
  selectedTargetId: string | null;
  weaponRange: number;
  canTarget?: boolean;
  disabled?: boolean;
  onSelectTarget: (id: string) => void;
  centerNode?: React.ReactNode;
}

const TARGETED_CARD_NAMES = new Set([
  "BANG!",
  "PUNCH",
  "SPRINGFIELD",
  "DUEL",
  "PANIC!",
  "CAT BALOU",
  "RAG TIME",
  "CONESTOGA",
  "CAN CAN",
  "JAIL",
  "TEQUILA",
  "KNIFE",
  "DERRINGER",
  "PEPPERBOX",
  "BUFFALO RIFLE",
]);

const MANIPULATION_CARDS = new Set([
  "PANIC!",
  "CAT BALOU",
  "RAG TIME",
  "CONESTOGA",
  "CAN CAN",
]);

function hasInPlayCards(opp: Player): boolean {
  const eq = opp.equipments;
  const hasEquip = Boolean(eq.weapon || eq.horseDef || eq.horseOff || eq.barrel || eq.extra);
  return hasEquip || opp.greenCards.length > 0 || opp.hasJail || opp.hasDynamite;
}

function hasStealableCards(opp: Player): boolean {
  return opp.handCount > 0 || hasInPlayCards(opp);
}

export const OpponentRing: React.FC<OpponentRingProps> = ({
  opponents,
  selectedCard,
  selectedGreenCard,
  forcedTargetMode,
  ricochetActive = false,
  selectedTargetId,
  weaponRange,
  canTarget = true,
  disabled = false,
  onSelectTarget,
  centerNode,
}) => {
  const targetingAllowed = canTarget && !disabled;
  const handCardName =
    selectedCard && selectedCard.border !== "green" ? selectedCard.name : undefined;
  const activeCardName =
    forcedTargetMode || selectedGreenCard?.card.name || handCardName;
  const isCardTargeted = Boolean(
    targetingAllowed && activeCardName && TARGETED_CARD_NAMES.has(activeCardName)
  );

  const isOpponentValidTarget = (opp: Player): boolean => {
    if (!activeCardName || opp.hp <= 0) return false;

    if (activeCardName === "JAIL") {
      return !opp.isSheriff && !opp.hasJail;
    }
    if (
      activeCardName === "PANIC!" ||
      activeCardName === "PUNCH" ||
      activeCardName === "KNIFE" ||
      activeCardName === "DERRINGER"
    ) {
      if (activeCardName === "PANIC!" && !hasStealableCards(opp)) return false;
      return (opp.distanceFromMe ?? 1) <= 1;
    }
    if (activeCardName === "BANG!" || activeCardName === "PEPPERBOX") {
      if (activeCardName === "BANG!" && ricochetActive && hasInPlayCards(opp)) {
        return true;
      }
      return (opp.distanceFromMe ?? 1) <= weaponRange;
    }
    if (MANIPULATION_CARDS.has(activeCardName)) {
      return hasStealableCards(opp);
    }
    return true;
  };

  let leftOpps: Player[] = [];
  let topOpps: Player[] = [];
  let rightOpps: Player[] = [];

  if (opponents.length <= 3) {
    topOpps = opponents;
  } else if (opponents.length <= 5) {
    leftOpps = [opponents[0]];
    topOpps = opponents.slice(1, 4);
    rightOpps = opponents.slice(4);
  } else {
    leftOpps = opponents.slice(0, 2);
    topOpps = opponents.slice(2, 5);
    rightOpps = opponents.slice(5);
  }

  const renderSeat = (opp: Player) => {
    const inRange = isCardTargeted ? isOpponentValidTarget(opp) : opp.hp > 0;
    return (
      <OpponentSeat
        key={opp.id}
        player={opp}
        isTargetSelected={selectedTargetId === opp.id}
        isTargetable={isCardTargeted}
        isInRange={inRange}
        distance={opp.distanceFromMe}
        onSelectTarget={() => {
          if (!targetingAllowed) return;
          onSelectTarget(opp.id);
        }}
      />
    );
  };

  return (
    <section className="game-table__opponents-arena">
      <div className="game-table__opponents-wing game-table__opponents-wing--top">
        {topOpps.map(renderSeat)}
      </div>

      <div className="game-table__opponents-middle">
        <div className="game-table__opponents-wing game-table__opponents-wing--left">
          {leftOpps.map(renderSeat)}
        </div>

        <div className="game-table__center-stage">
          {centerNode}
        </div>

        <div className="game-table__opponents-wing game-table__opponents-wing--right">
          {rightOpps.map(renderSeat)}
        </div>
      </div>
    </section>
  );
};
