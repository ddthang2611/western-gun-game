import React, { useState } from "react";
import type { Card, Character, GreenCard, PendingReactionInfo } from "../../../types/game";
import { Modal } from "../../ui/Modal/Modal";
import { Panel } from "../../ui/Panel/Panel";
import { Button } from "../../ui/Button/Button";
import { CardView } from "../CardView/CardView";
import { DefenseCardSection, type DefenseCardItem } from "./DefenseCardSection";
import "./DefenseModal.scss";

export interface BlueCardInPlayItem {
  id: string;
  label: string;
  card: Card;
}

export interface DefenseModalProps {
  reaction: PendingReactionInfo;
  myHand: Card[];
  heroes: Character[];
  myGreenCards?: GreenCard[];
  myBlueCardsInPlay?: BlueCardInPlayItem[];
  myHp?: number;
  disabled?: boolean;
  onDrawCheck?: (source: "BARREL" | "JOURDONNAIS") => void;
  onBarrelCheck?: () => void;
  onJourdonnaisCheck?: () => void;
  onPlayCard: (cardId: string) => void;
  onUseGreenDefense?: (greenCardId: string) => void;
  onDiscardBlueEquip?: (cardId: string) => void;
  onSidRescue?: (discardCardIds: string[]) => void;
  onTakeDamage: () => void;
}

const GREEN_MISSED_NAMES = new Set(["SOMBRERO", "IRON PLATE", "TEN GALLON HAT", "BIBLE"]);

const AREA_LABELS: Record<string, string> = {
  EQUIPMENT: "Equipment",
  GREEN: "Green Card",
  JUDGEMENT: "Judgement",
};

function isCardEligible(
  card: Card,
  requiredCard: PendingReactionInfo["requiredCard"],
  heroes: Character[]
): boolean {
  const hasElena = heroes.some((h) => h.name === "Elena Fuente");
  const hasCalamity = heroes.some((h) => h.name === "Calamity Janet");

  if (requiredCard === "ANY_HAND") return true;
  if (requiredCard === "MISSED") {
    return (
      card.name === "MISSED!" ||
      card.name === "DODGE" ||
      hasElena ||
      (hasCalamity && card.name === "BANG!")
    );
  }
  if (requiredCard === "BANG") {
    return card.name === "BANG!" || (hasCalamity && card.name === "MISSED!");
  }
  return false;
}

function resolveRicochetTargetCard(
  reaction: PendingReactionInfo,
  myBlueCardsInPlay: BlueCardInPlayItem[],
  myGreenCards: GreenCard[]
): Card | undefined {
  if (reaction.targetCard) return reaction.targetCard;
  const targetId = reaction.ricochetTargetCardId;
  if (!targetId) return undefined;

  const blueMatch = myBlueCardsInPlay.find(
    (item) => item.id === targetId || item.card.id === targetId
  );
  if (blueMatch) return blueMatch.card;

  const greenMatch = myGreenCards.find(
    (g) => g.id === targetId || g.card.id === targetId
  );
  return greenMatch?.card;
}

export const DefenseModal: React.FC<DefenseModalProps> = ({
  reaction,
  myHand,
  heroes,
  myGreenCards = [],
  myBlueCardsInPlay = [],
  myHp,
  disabled = false,
  onDrawCheck,
  onBarrelCheck,
  onJourdonnaisCheck,
  onPlayCard,
  onUseGreenDefense,
  onDiscardBlueEquip,
  onSidRescue,
  onTakeDamage,
}) => {
  const selectionKey = `${reaction.id}:${reaction.currentCount}:${myHand.length}:${myGreenCards.length}:${myBlueCardsInPlay.length}`;
  const [selectionState, setSelectionState] = useState<{
    key: string;
    cardId: string | null;
    greenId: string | null;
    blueCardId: string | null;
    rescueIds: string[];
  }>({ key: selectionKey, cardId: null, greenId: null, blueCardId: null, rescueIds: [] });

  const selectedCardId = selectionState.key === selectionKey ? selectionState.cardId : null;
  const selectedGreenId = selectionState.key === selectionKey ? selectionState.greenId : null;
  const selectedBlueCardId = selectionState.key === selectionKey ? selectionState.blueCardId : null;
  const rescueIds = selectionState.key === selectionKey ? selectionState.rescueIds : [];

  const isSidRescue = reaction.requiredCard === "SID_RESCUE" || reaction.type === "NEAR_DEATH_RESCUE";
  const isDaltonsDiscard =
    reaction.requiredCard === "BLUE_EQUIP" || reaction.type === "EVENT_DALTONS_DISCARD";
  const isRussianRoulette = reaction.type === "EVENT_RUSSIAN_ROULETTE";
  const isRicochet =
    reaction.type === "EVENT_RICOCHET_DEFENSE" || reaction.type === "RICOCHET_HIT";

  const showBarrelButton = !isRussianRoulette && reaction.canUseBarrel && !reaction.barrelChecked;
  const showJourdonnaisButton =
    !isRussianRoulette && reaction.canUseJourdonnais && !reaction.jourdonnaisChecked;

  const readyGreenDefenses =
    reaction.requiredCard === "MISSED" && !isRussianRoulette && onUseGreenDefense
      ? myGreenCards.filter((g) => !g.isDelay && GREEN_MISSED_NAMES.has(g.card.name))
      : [];

  const deficit =
    reaction.pendingDamage && reaction.pendingDamage > 0
      ? reaction.pendingDamage
      : myHp !== undefined && myHp <= 0
      ? Math.abs(myHp) + 1
      : 1;
  const cardsNeeded = deficit * 2;
  const sidHint = `Need at least ${cardsNeeded} cards to heal ${deficit} lethal damage`;

  const ricochetTargetCard = isRicochet
    ? resolveRicochetTargetCard(reaction, myBlueCardsInPlay, myGreenCards)
    : undefined;
  const ricochetAreaLabel = reaction.ricochetTargetArea
    ? AREA_LABELS[reaction.ricochetTargetArea] || reaction.ricochetTargetArea
    : "In Play";

  const actionLabel =
    isSidRescue
      ? "Near-Death Sid Ketchum Rescue"
      : isDaltonsDiscard
      ? "The Daltons: Discard 1 Blue Card"
      : isRussianRoulette
      ? "Russian Roulette"
      : isRicochet
      ? "Ricochet Shot on In-Play Card"
      : reaction.type === "DUEL_RESPONSE"
      ? "Duel Challenge"
      : reaction.type === "INDIANS_DEFENSE"
      ? "Indians! Ambush"
      : reaction.type === "GATLING_DEFENSE"
      ? reaction.sourceCard?.name === "HOWITZER"
        ? "Howitzer Volley"
        : "Gatling Volley"
      : "Incoming Attack";

  const remainingNeeded = Math.max(1, reaction.requiredCount - reaction.currentCount);
  const headerSubtitle =
    isSidRescue || isDaltonsDiscard
      ? undefined
      : `${remainingNeeded}x ${reaction.requiredCard} (${reaction.currentCount}/${reaction.requiredCount})`;

  const handleDrawCheck = (source: "BARREL" | "JOURDONNAIS") => {
    if (disabled) return;
    if (onDrawCheck) {
      onDrawCheck(source);
      return;
    }
    if (source === "JOURDONNAIS") {
      (onJourdonnaisCheck || onBarrelCheck)?.();
    } else {
      onBarrelCheck?.();
    }
  };

  const handItems: DefenseCardItem[] = myHand.map((card) => ({
    id: card.id,
    card,
    eligible: isSidRescue ? true : isCardEligible(card, reaction.requiredCard, heroes),
  }));

  const blueItems: DefenseCardItem[] = myBlueCardsInPlay.map((item) => ({
    id: item.id,
    card: item.card,
  }));

  const greenItems: DefenseCardItem[] = readyGreenDefenses.map((g) => ({
    id: g.id,
    card: g.card,
  }));

  return (
    <Modal isOpen={true} size="medium">
      <Modal.Header
        title={`${actionLabel} — ${reaction.sourcePlayerName || "Opponent"}`}
        subtitle={headerSubtitle}
      />

      <Modal.Body>
        <Panel>
          <div className="defense-modal__source">
            <CardView card={reaction.sourceCard} isMini={true} isPlayable={false} />
            <div className="defense-modal__source-meta">
              <strong>{reaction.sourceCard.name}</strong> ({reaction.sourceCard.rank} {reaction.sourceCard.suit})
              {reaction.sourceCard.desc && (
                <div className="defense-modal__source-desc">{reaction.sourceCard.desc}</div>
              )}
            </div>
          </div>
        </Panel>

        {isRicochet && (
          <Panel>
            <div className="defense-modal__ricochet-target">
              {ricochetTargetCard && (
                <CardView card={ricochetTargetCard} isMini={true} isPlayable={false} />
              )}
              <div className="defense-modal__ricochet-meta">
                <span className="defense-modal__ricochet-area">
                  Target ({ricochetAreaLabel})
                </span>
                <strong>
                  {ricochetTargetCard
                    ? `${ricochetTargetCard.name} (${ricochetTargetCard.rank} ${ricochetTargetCard.suit})`
                    : reaction.ricochetTargetCardId || "In-Play Card"}
                </strong>
                <span className="defense-modal__source-desc">
                  Play a Missed! card to protect this card, or allow it to be destroyed.
                </span>
              </div>
            </div>
          </Panel>
        )}

        {isDaltonsDiscard ? (
          <DefenseCardSection
            items={blueItems}
            selectedIds={selectedBlueCardId ? [selectedBlueCardId] : []}
            disabled={disabled}
            onSelect={(id) =>
              setSelectionState((prev) => ({
                key: selectionKey,
                cardId: null,
                greenId: null,
                blueCardId: prev.key === selectionKey && prev.blueCardId === id ? null : id,
                rescueIds: [],
              }))
            }
          />
        ) : isSidRescue ? (
          <DefenseCardSection
            hint={`${sidHint} (${rescueIds.length} selected)`}
            items={handItems}
            selectedIds={rescueIds}
            disabled={disabled}
            onSelect={(id) =>
              setSelectionState((prev) => {
                const base = prev.key === selectionKey ? prev.rescueIds : [];
                const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
                return {
                  key: selectionKey,
                  cardId: null,
                  greenId: null,
                  blueCardId: null,
                  rescueIds: next,
                };
              })
            }
          />
        ) : (
          <DefenseCardSection
            items={handItems}
            emptyText="No cards in hand."
            selectedIds={selectedCardId ? [selectedCardId] : []}
            disabled={disabled}
            onSelect={(id) =>
              setSelectionState((prev) => ({
                key: selectionKey,
                cardId: prev.key === selectionKey && prev.cardId === id ? null : id,
                greenId: null,
                blueCardId: null,
                rescueIds: [],
              }))
            }
          />
        )}

        {greenItems.length > 0 && (
          <DefenseCardSection
            title="Ready Green Defense Cards"
            items={greenItems}
            selectedIds={selectedGreenId ? [selectedGreenId] : []}
            disabled={disabled}
            onSelect={(id) =>
              setSelectionState((prev) => ({
                key: selectionKey,
                cardId: null,
                greenId: prev.key === selectionKey && prev.greenId === id ? null : id,
                blueCardId: null,
                rescueIds: [],
              }))
            }
          />
        )}
      </Modal.Body>

      <Modal.Footer hint={isSidRescue ? sidHint : undefined}>
        {showBarrelButton && (
          <Button variant="info" disabled={disabled} onClick={() => handleDrawCheck("BARREL")}>
            Draw! (Barrel)
          </Button>
        )}
        {showJourdonnaisButton && (
          <Button variant="info" disabled={disabled} onClick={() => handleDrawCheck("JOURDONNAIS")}>
            Draw! (Jourdonnais)
          </Button>
        )}
        {isDaltonsDiscard ? (
          <Button
            variant="primary"
            disabled={disabled || !selectedBlueCardId}
            onClick={() => {
              if (!disabled && selectedBlueCardId && onDiscardBlueEquip) {
                onDiscardBlueEquip(selectedBlueCardId);
              }
            }}
          >
            Confirm Blue Discard
          </Button>
        ) : isSidRescue ? (
          <Button
            variant="primary"
            disabled={disabled || rescueIds.length < 2 || rescueIds.length % 2 !== 0}
            onClick={() => {
              if (!disabled && onSidRescue) {
                onSidRescue(rescueIds);
              }
            }}
          >
            Heal (+{Math.floor(rescueIds.length / 2)} HP)
          </Button>
        ) : (
          <Button
            variant="primary"
            disabled={disabled || (!selectedCardId && !selectedGreenId)}
            onClick={() => {
              if (disabled) return;
              if (selectedCardId) {
                onPlayCard(selectedCardId);
              } else if (selectedGreenId && onUseGreenDefense) {
                onUseGreenDefense(selectedGreenId);
              }
            }}
          >
            Play Defense
          </Button>
        )}
        {!isDaltonsDiscard && (
          <Button
            variant="danger"
            disabled={disabled}
            onClick={() => {
              if (!disabled) onTakeDamage();
            }}
          >
            {isSidRescue
              ? "Accept Elimination"
              : isRicochet
              ? "Allow Destroy"
              : isRussianRoulette
              ? "Take 2 Damage"
              : "Take Damage"}
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
};
