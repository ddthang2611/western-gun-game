import React, { useState } from "react";
import type { Card, Character, GreenCard, PendingReactionInfo } from "../../../types/game";
import { Modal } from "../../ui/Modal/Modal";
import { Panel } from "../../ui/Panel/Panel";
import { Button } from "../../ui/Button/Button";
import { CardView } from "../CardView/CardView";
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
  disabled?: boolean;
  onBarrelCheck: () => void;
  onJourdonnaisCheck?: () => void;
  onPlayCard: (cardId: string) => void;
  onUseGreenDefense?: (greenCardId: string) => void;
  onDiscardBlueEquip?: (cardId: string) => void;
  onSidRescue?: (discardCardIds: string[]) => void;
  onTakeDamage: () => void;
}

const GREEN_MISSED_NAMES = new Set(["SOMBRERO", "IRON PLATE", "TEN GALLON HAT", "BIBLE"]);

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

export const DefenseModal: React.FC<DefenseModalProps> = ({
  reaction,
  myHand,
  heroes,
  myGreenCards = [],
  myBlueCardsInPlay = [],
  disabled = false,
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

  const showBarrelButton = !isRussianRoulette && reaction.canUseBarrel && !reaction.barrelChecked;
  const showJourdonnaisButton =
    !isRussianRoulette && reaction.canUseJourdonnais && !reaction.jourdonnaisChecked;

  const readyGreenDefenses =
    reaction.requiredCard === "MISSED" && !isRussianRoulette && onUseGreenDefense
      ? myGreenCards.filter((g) => !g.isDelay && GREEN_MISSED_NAMES.has(g.card.name))
      : [];

  const actionLabel =
    isSidRescue
      ? "Near-Death Sid Ketchum Rescue"
      : isDaltonsDiscard
      ? "The Daltons: Discard 1 Blue Card"
      : isRussianRoulette
      ? "Russian Roulette"
      : reaction.type === "EVENT_RICOCHET_DEFENSE"
      ? "Ricochet Shot on Equipment"
      : reaction.type === "DUEL_RESPONSE"
      ? "Duel Challenge"
      : reaction.type === "INDIANS_DEFENSE"
      ? "Indians! Ambush"
      : reaction.type === "GATLING_DEFENSE"
      ? "Gatling Volley"
      : "Incoming Attack";

  const remainingNeeded = Math.max(1, reaction.requiredCount - reaction.currentCount);
  const headerSubtitle =
    isSidRescue || isDaltonsDiscard
      ? undefined
      : `${remainingNeeded}x ${reaction.requiredCard} (${reaction.currentCount}/${reaction.requiredCount})`;

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
            </div>
          </div>
        </Panel>

        {isDaltonsDiscard ? (
          <Panel>
            <div className="card-picker__region-list">
              {myBlueCardsInPlay.map((item) => (
                <CardView
                  key={item.id}
                  card={item.card}
                  isMini={true}
                  isPlayable={!disabled}
                  isDisabled={disabled}
                  isSelected={selectedBlueCardId === item.id}
                  onClick={() => {
                    if (disabled) return;
                    setSelectionState((prev) => ({
                      key: selectionKey,
                      cardId: null,
                      greenId: null,
                      blueCardId:
                        prev.key === selectionKey && prev.blueCardId === item.id ? null : item.id,
                      rescueIds: [],
                    }));
                  }}
                />
              ))}
            </div>
          </Panel>
        ) : isSidRescue ? (
          <Panel>
            <div className="card-picker__region-list">
              {myHand.map((card) => {
                const picked = rescueIds.includes(card.id);
                return (
                  <CardView
                    key={card.id}
                    card={card}
                    isMini={true}
                    isPlayable={!disabled}
                    isDisabled={disabled}
                    isSelected={picked}
                    onClick={() => {
                      if (disabled) return;
                      setSelectionState((prev) => {
                        const base = prev.key === selectionKey ? prev.rescueIds : [];
                        const next = base.includes(card.id)
                          ? base.filter((id) => id !== card.id)
                          : [...base, card.id];
                        return {
                          key: selectionKey,
                          cardId: null,
                          greenId: null,
                          blueCardId: null,
                          rescueIds: next,
                        };
                      });
                    }}
                  />
                );
              })}
            </div>
          </Panel>
        ) : (
          <Panel>
            <div className="card-picker__region-list">
              {myHand.map((card) => {
                const eligible = isCardEligible(card, reaction.requiredCard, heroes);
                return (
                  <CardView
                    key={card.id}
                    card={card}
                    isMini={true}
                    isPlayable={!disabled && eligible}
                    isDisabled={disabled || !eligible}
                    isSelected={selectedCardId === card.id}
                    onClick={() => {
                      if (disabled || !eligible) return;
                      setSelectionState((prev) => ({
                        key: selectionKey,
                        cardId: prev.key === selectionKey && prev.cardId === card.id ? null : card.id,
                        greenId: null,
                        blueCardId: null,
                        rescueIds: [],
                      }));
                    }}
                  />
                );
              })}
            </div>
          </Panel>
        )}

        {readyGreenDefenses.length > 0 && (
          <Panel>
            <div className="card-picker__region-list">
              {readyGreenDefenses.map((gCard) => (
                <CardView
                  key={gCard.id}
                  card={gCard.card}
                  isMini={true}
                  isPlayable={!disabled}
                  isDisabled={disabled}
                  isSelected={selectedGreenId === gCard.id}
                  onClick={() => {
                    if (disabled) return;
                    setSelectionState((prev) => ({
                      key: selectionKey,
                      cardId: null,
                      greenId: prev.key === selectionKey && prev.greenId === gCard.id ? null : gCard.id,
                      blueCardId: null,
                      rescueIds: [],
                    }));
                  }}
                />
              ))}
            </div>
          </Panel>
        )}
      </Modal.Body>

      <Modal.Footer>
        {showBarrelButton && (
          <Button
            variant="info"
            disabled={disabled}
            onClick={() => {
              if (!disabled) onBarrelCheck();
            }}
          >
            Draw! (Barrel)
          </Button>
        )}
        {showJourdonnaisButton && (
          <Button
            variant="info"
            disabled={disabled}
            onClick={() => {
              if (!disabled) (onJourdonnaisCheck || onBarrelCheck)();
            }}
          >
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
              : reaction.type === "EVENT_RICOCHET_DEFENSE"
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
