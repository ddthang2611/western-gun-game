import React, { useState } from "react";
import type {
  GameActionPayload,
  PendingTurnStartChoiceInfo,
  Player,
} from "../../../types/game";
import { useI18n } from "../../../i18n";
import { Modal } from "../../ui/Modal/Modal";
import { Button } from "../../ui/Button/Button";

export interface TurnStartPromptsProps {
  choice: PendingTurnStartChoiceInfo;
  players: Player[];
  disabled: boolean;
  onResolveTurnStart: (payload: GameActionPayload) => void;
}

export const TurnStartPrompts: React.FC<TurnStartPromptsProps> = ({
  choice,
  players,
  disabled,
  onResolveTurnStart,
}) => {
  const { t, tChar } = useI18n();
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);

  if (choice.type === "VERA_CUSTER_COPY") {
    const available = choice.availableCharacters || [];
    return (
      <Modal isOpen={true} size="medium">
        <Modal.Header title={t("modals.prompt.veraTitle")} />
        <Modal.Body>
          <div className="turn-prompt__list">
            {available.map((entry) => {
              const picked = selectedCharId === entry.character.id;
              const charLoc = tChar(entry.character);
              return (
                <button
                  key={`${entry.ownerPlayerId}_${entry.character.id}`}
                  type="button"
                  disabled={disabled}
                  onClick={() => setSelectedCharId(entry.character.id)}
                  className={`turn-prompt__option ${picked ? "turn-prompt__option--selected" : ""}`}
                >
                  <div className="turn-prompt__option-title">
                    {charLoc.primary.name} ({entry.ownerName})
                  </div>
                  <div className="turn-prompt__option-desc">{charLoc.primary.desc}</div>
                </button>
              );
            })}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="primary"
            disabled={disabled || !selectedCharId}
            onClick={() => {
              if (!selectedCharId) return;
              onResolveTurnStart({
                characterId: selectedCharId,
                characterIds: [selectedCharId],
              });
              setSelectedCharId(null);
            }}
          >
            {t("modals.prompt.confirmCopy")}
          </Button>
        </Modal.Footer>
      </Modal>
    );
  }

  const eligible = players.filter((p) => (choice.eligibleTargetIds || []).includes(p.id));
  return (
    <Modal isOpen={true} size="medium">
      <Modal.Header title={t("modals.prompt.bloodBrothersTitle")} />
      <Modal.Body>
        <div className="turn-prompt__list">
          {eligible.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={disabled}
              onClick={() => setSelectedTargetId(p.id)}
              className={`turn-prompt__option ${
                selectedTargetId === p.id ? "turn-prompt__option--selected" : ""
              }`}
            >
              <div className="turn-prompt__option-title">
                {p.name} ({p.hp}/{p.maxHp} HP)
              </div>
            </button>
          ))}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button
          variant="secondary"
          disabled={disabled}
          onClick={() => {
            onResolveTurnStart({ skip: true });
            setSelectedTargetId(null);
          }}
        >
          {t("modals.prompt.skipTransfer")}
        </Button>
        <Button
          variant="primary"
          disabled={disabled || !selectedTargetId}
          onClick={() => {
            if (!selectedTargetId) return;
            onResolveTurnStart({ targetPlayerId: selectedTargetId });
            setSelectedTargetId(null);
          }}
        >
          {t("modals.prompt.giveHp")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
