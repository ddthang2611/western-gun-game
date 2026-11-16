import React, { useState } from "react";
import type { GeneralStoreInfo, Player } from "../../../types/game";
import { Modal } from "../../ui/Modal/Modal";
import { Panel } from "../../ui/Panel/Panel";
import { Button } from "../../ui/Button/Button";
import { CardView } from "../CardView/CardView";
import "./GeneralStoreModal.scss";

export interface GeneralStoreModalProps {
  store: GeneralStoreInfo;
  myPlayerId: string;
  players: Player[];
  disabled?: boolean;
  onPickCard: (cardId: string) => void;
}

export const GeneralStoreModal: React.FC<GeneralStoreModalProps> = ({
  store,
  myPlayerId,
  players,
  disabled = false,
  onPickCard,
}) => {
  const selectionKey = `${store.currentPickerId}:${store.pool.length}`;
  const [selectionState, setSelectionState] = useState<{
    key: string;
    cardId: string | null;
  }>({ key: selectionKey, cardId: null });

  const selectedCardId = selectionState.key === selectionKey ? selectionState.cardId : null;

  const isMyPick = store.currentPickerId === myPlayerId;
  const canPick = isMyPick && !disabled;
  const pickerPlayer = players.find((p) => p.id === store.currentPickerId);
  const remainingOrderNames = store.draftOrder
    .slice(store.currentPickerIndex)
    .map((id) => players.find((p) => p.id === id)?.name || id)
    .join(" -> ");
  const pickerLabel = isMyPick
    ? `Your turn (${remainingOrderNames})`
    : `Waiting: ${store.currentPickerName || pickerPlayer?.name || "opponent"} (${remainingOrderNames})`;

  return (
    <Modal isOpen={true} size="medium">
      <Modal.Header
        title={`General Store (${store.originPlayerName || "Player"})`}
        subtitle={pickerLabel}
      />

      <Modal.Body>
        <Panel>
          <div className="general-store__pool">
            {store.pool.map((card) => (
              <div key={card.id} className="general-store__card">
                <CardView
                  card={card}
                  isMini={false}
                  isPlayable={canPick}
                  isDisabled={!canPick}
                  isSelected={canPick && selectedCardId === card.id}
                  onClick={() => {
                    if (!canPick) return;
                    setSelectionState((prev) => ({
                      key: selectionKey,
                      cardId: prev.key === selectionKey && prev.cardId === card.id ? null : card.id,
                    }));
                  }}
                />
              </div>
            ))}
          </div>
        </Panel>
      </Modal.Body>

      <Modal.Footer>
        <div className="general-store__actions">
          <Button
            variant="primary"
            disabled={!canPick || !selectedCardId}
            onClick={() => canPick && selectedCardId && onPickCard(selectedCardId)}
          >
            {isMyPick ? "Take Card" : "Waiting..."}
          </Button>
        </div>
      </Modal.Footer>
    </Modal>
  );
};
