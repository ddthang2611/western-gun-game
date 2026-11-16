import React, { useState } from "react";
import type { Player, Card, GreenCard } from "../../../types/game";
import { CardView } from "../CardView/CardView";
import { Modal } from "../../ui/Modal/Modal";
import { Button } from "../../ui/Button/Button";
import { BlindHandCard } from "./BlindHandCard";
import { JudgementTrapItem } from "./JudgementTrapItem";
import "./CardPickerModal.scss";

export type CardPickerAction = "destroy" | "steal";

export interface SelectedTargetCard {
  region: "hand" | "equipment" | "green" | "judgement";
  cardId?: string;
  handIndex?: number;
  label: string;
}

export interface CardPickerModalProps {
  targetPlayer: Player;
  action: CardPickerAction;
  cardName?: string;
  allowHand?: boolean;
  onConfirm: (selected: SelectedTargetCard) => void;
  onCancel?: () => void;
}

export const CardPickerModal: React.FC<CardPickerModalProps> = ({
  targetPlayer,
  action,
  cardName,
  allowHand = true,
  onConfirm,
  onCancel,
}) => {
  const [selected, setSelected] = useState<SelectedTargetCard | null>(null);

  const actionVerb = action === "destroy" ? "DISCARD CARD" : "STEAL CARD";
  const resolvedCardName = cardName || (action === "destroy" ? "CAT BALOU" : "PANIC!");
  const actionTitle = `${actionVerb} (${resolvedCardName})`;
  const confirmButtonText =
    action === "destroy" ? "Confirm Discard" : "Confirm Steal";

  const equippedCards: { label: string; card?: Card }[] = [
    { label: "Weapon", card: targetPlayer.equipments.weapon },
    { label: "Mustang +1", card: targetPlayer.equipments.horseDef },
    { label: "Scope -1", card: targetPlayer.equipments.horseOff },
    { label: "Barrel", card: targetPlayer.equipments.barrel },
    { label: "Extra", card: targetPlayer.equipments.extra },
  ].filter((item) => item.card !== undefined);

  const judgementEntries =
    targetPlayer.judgements && targetPlayer.judgements.length > 0
      ? targetPlayer.judgements
      : [
          ...(targetPlayer.hasJail ? [{ id: "jail", type: "JAIL" as const }] : []),
          ...(targetPlayer.hasDynamite ? [{ id: "dynamite", type: "DYNAMITE" as const }] : []),
        ];

  const hasInPlayTraps =
    (targetPlayer.greenCards && targetPlayer.greenCards.length > 0) ||
    judgementEntries.length > 0;

  return (
    <Modal isOpen={true} size="medium" onClose={onCancel}>
      <Modal.Header title={`${actionTitle} -> Target: ${targetPlayer.name}`} />

      <Modal.Body>
        <div className="card-picker__zones">
          {/* Box 1: Hand cards (face-down) */}
          {allowHand && (
            <div
              className={`card-picker__zone${targetPlayer.handCount === 0 ? " card-picker__zone--empty" : ""}`}
              aria-label="Hand cards"
            >
              <div className="card-picker__card-list">
                {Array.from({ length: targetPlayer.handCount }).map((_, idx) => (
                  <BlindHandCard
                    key={idx}
                    index={idx}
                    isSelected={selected?.region === "hand" && selected.handIndex === idx}
                    onSelect={(handIndex) =>
                      setSelected({
                        region: "hand",
                        handIndex,
                        label: `Card #${handIndex + 1}`,
                      })
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {/* Box 2: Equipped cards */}
          <div
            className={`card-picker__zone${equippedCards.length === 0 ? " card-picker__zone--empty" : ""}`}
            aria-label="Equipped cards"
          >
            <div className="card-picker__card-list">
              {equippedCards.map((item, idx) => {
                const card = item.card!;
                const isCardSelected =
                  selected?.region === "equipment" && selected.cardId === card.id;
                return (
                  <CardView
                    key={card.id || idx}
                    card={card}
                    isMini={true}
                    isSelected={isCardSelected}
                    onClick={() =>
                      setSelected({
                        region: "equipment",
                        cardId: card.id,
                        label: card.name,
                      })
                    }
                  />
                );
              })}
            </div>
          </div>

          {/* Box 3: Judgement traps & green cards */}
          <div
            className={`card-picker__zone${!hasInPlayTraps ? " card-picker__zone--empty" : ""}`}
            aria-label="Judgement and green cards"
          >
            <div className="card-picker__card-list">
              {targetPlayer.greenCards &&
                targetPlayer.greenCards.map((gCard: GreenCard) => {
                  const isCardSelected =
                    selected?.region === "green" && selected.cardId === gCard.id;
                  return (
                    <CardView
                      key={gCard.id}
                      card={gCard.card}
                      isMini={true}
                      isSelected={isCardSelected}
                      onClick={() =>
                        setSelected({
                          region: "green",
                          cardId: gCard.id,
                          label: gCard.card.name,
                        })
                      }
                    />
                  );
                })}
              {judgementEntries.map((j) => {
                const trapType = j.type === "JAIL" ? "jail" : "dynamite";
                const label = j.type === "JAIL" ? "Jail" : "Dynamite";
                return (
                  <JudgementTrapItem
                    key={j.id}
                    id={j.id}
                    type={trapType}
                    label={label}
                    isSelected={
                      selected?.region === "judgement" && selected.cardId === j.id
                    }
                    onSelect={(cardId, trapLabel) =>
                      setSelected({ region: "judgement", cardId, label: trapLabel })
                    }
                  />
                );
              })}
            </div>
          </div>
        </div>
      </Modal.Body>

      <Modal.Footer>
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          variant={action === "destroy" ? "danger" : "info"}
          disabled={!selected}
          onClick={() => selected && onConfirm(selected)}
        >
          {confirmButtonText}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
