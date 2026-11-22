import React, { useState } from "react";
import type { PendingLuckyDukePickInfo } from "../../../types/game";
import { useI18n } from "../../../i18n";
import { Modal } from "../../ui/Modal/Modal";
import { Panel } from "../../ui/Panel/Panel";
import { Button } from "../../ui/Button/Button";
import { CardView } from "../CardView/CardView";
import "./LuckyDukeModal.scss";

export interface LuckyDukeModalProps {
  pick: PendingLuckyDukePickInfo;
  disabled?: boolean;
  onPickCard: (cardId: string) => void;
}

// Render interactive Lucky Duke 2-card choice modal
export const LuckyDukeModal: React.FC<LuckyDukeModalProps> = ({
  pick,
  disabled = false,
  onPickCard,
}) => {
  const { t } = useI18n();
  const selectionKey = `${pick.reason}:${pick.drawnCards.map((c) => c.id).join(",")}`;
  const [selectionState, setSelectionState] = useState<{
    key: string;
    cardId: string | null;
  }>({ key: selectionKey, cardId: null });

  const selectedCardId =
    selectionState.key === selectionKey ? selectionState.cardId : null;

  const reasonLabel = t(
    `modals.luckyDuke.reason.${pick.reason}`,
    undefined,
    pick.reason
  );

  return (
    <Modal isOpen={true} size="medium">
      <Modal.Header
        title={t("modals.luckyDuke.title", { reason: reasonLabel })}
        subtitle={t("modals.luckyDuke.subtitle")}
      />

      <Modal.Body>
        <Panel>
          <div className="lucky-duke-modal__cards">
            {pick.drawnCards.map((card) => {
              const badgeLabel =
                pick.reason === "DYNAMITE"
                  ? card.matches
                    ? t("modals.luckyDuke.safe")
                    : t("modals.luckyDuke.explodes")
                  : card.matches
                  ? t("modals.luckyDuke.pass")
                  : t("modals.luckyDuke.fail");

              return (
                <div key={card.id} className="lucky-duke-modal__option">
                  <CardView
                    card={card}
                    isMini={false}
                    isPlayable={!disabled}
                    isDisabled={disabled}
                    isSelected={!disabled && selectedCardId === card.id}
                    onClick={() => {
                      if (disabled) return;
                      setSelectionState((prev) => ({
                        key: selectionKey,
                        cardId:
                          prev.key === selectionKey && prev.cardId === card.id
                            ? null
                            : card.id,
                      }));
                    }}
                  />
                  <span
                    className={`lucky-duke-modal__badge ${
                      card.matches
                        ? "lucky-duke-modal__badge--pass"
                        : "lucky-duke-modal__badge--fail"
                    }`}
                  >
                    {badgeLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </Panel>
      </Modal.Body>

      <Modal.Footer>
        <Button
          variant="primary"
          disabled={disabled || !selectedCardId}
          onClick={() => !disabled && selectedCardId && onPickCard(selectedCardId)}
        >
          {t("modals.luckyDuke.confirm")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
