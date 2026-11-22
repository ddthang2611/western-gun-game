import React, { useState } from "react";
import type { Player, GreenCard } from "../../../types/game";
import { useI18n } from "../../../i18n";
import { getAllEquipments } from "../../../utils/equipments";
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
  allowInPlay?: boolean;
  onConfirm: (selected: SelectedTargetCard) => void;
  onCancel?: () => void;
}

export const CardPickerModal: React.FC<CardPickerModalProps> = ({
  targetPlayer,
  action,
  cardName,
  allowHand = true,
  allowInPlay = true,
  onConfirm,
  onCancel,
}) => {
  const { t, tCard } = useI18n();
  const [selected, setSelected] = useState<SelectedTargetCard | null>(null);

  const resolvedCardName = cardName || (action === "destroy" ? "CAT BALOU" : "PANIC!");
  const localizedCardName = tCard({ name: resolvedCardName }).primary.name;
  const headerTitle =
    action === "destroy"
      ? t("modals.picker.removeHeader", { card: localizedCardName, target: targetPlayer.name })
      : t("modals.picker.stealHeader", { card: localizedCardName, target: targetPlayer.name });
  const confirmButtonText =
    action === "destroy" ? t("modals.picker.confirmRemove") : t("modals.picker.confirmSteal");

  const equippedCards = getAllEquipments(targetPlayer.equipments);

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
      <Modal.Header title={headerTitle} />

      <Modal.Body>
        <div className="card-picker__zones">
          {/* Box 1: Hand cards (face-down) */}
          {allowHand && (
            <div
              className={`card-picker__zone${targetPlayer.handCount === 0 ? " card-picker__zone--empty" : ""}`}
              aria-label={t("modals.picker.zoneHand")}
            >
              <div className="card-picker__zone-title">{t("modals.picker.zoneHand")}</div>
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
          {allowInPlay && (
            <div
              className={`card-picker__zone${equippedCards.length === 0 ? " card-picker__zone--empty" : ""}`}
              aria-label={t("modals.picker.zoneEquip")}
            >
              <div className="card-picker__zone-title">{t("modals.picker.zoneEquip")}</div>
              <div className="card-picker__card-list">
                {equippedCards.map((card, idx) => {
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
          )}

          {/* Box 3: Judgement traps & green cards */}
          {allowInPlay && (
            <div
              className={`card-picker__zone${!hasInPlayTraps ? " card-picker__zone--empty" : ""}`}
              aria-label={t("modals.picker.zoneInPlayOther")}
            >
              <div className="card-picker__zone-title">{t("modals.picker.zoneInPlayOther")}</div>
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
                  const trapCardName = j.type === "JAIL" ? "JAIL" : "DYNAMITE";
                  const loc = tCard({ name: trapCardName });
                  const label =
                    loc.primary.subtitleVi || loc.primary.name;
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
          )}
        </div>
      </Modal.Body>

      <Modal.Footer>
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            {t("common.cancel")}
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
