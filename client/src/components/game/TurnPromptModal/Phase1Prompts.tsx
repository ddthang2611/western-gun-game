import React, { useState } from "react";
import type {
  Card,
  GameActionPayload,
  PendingPhase1ChoiceInfo,
  Player,
} from "../../../types/game";
import { Modal } from "../../ui/Modal/Modal";
import { Panel } from "../../ui/Panel/Panel";
import { Button } from "../../ui/Button/Button";
import { CardView } from "../CardView/CardView";
import { DrawOptionPrompt } from "./DrawOptionPrompt";

export interface Phase1PromptsProps {
  phase1Choice: PendingPhase1ChoiceInfo;
  players: Player[];
  myHand: Card[];
  myPlayerId: string;
  topDiscard?: Card;
  disabled: boolean;
  onResolvePhase1: (payload: GameActionPayload) => void;
  onOpenStealPicker?: (
    mode: "JESSE_STEAL_AND_DECK" | "PAT_BRENNAN_STEAL",
    targetPlayer: Player
  ) => void;
}

export const Phase1Prompts: React.FC<Phase1PromptsProps> = ({
  phase1Choice,
  players,
  myHand,
  myPlayerId,
  topDiscard,
  disabled,
  onResolvePhase1,
  onOpenStealPicker,
}) => {
  const [pickedCardIds, setPickedCardIds] = useState<string[]>([]);

  if (phase1Choice.mode === "PEYOTE_GUESS") {
    return (
      <Modal isOpen={true} size="medium">
        <Modal.Header title="Peyote" />
        <Modal.Body>
          {phase1Choice.drawnSoFar && phase1Choice.drawnSoFar.length > 0 && (
            <Panel>
              <div className="turn-prompt__cards-row">
                {phase1Choice.drawnSoFar.map((card) => (
                  <CardView key={card.id} card={card} isMini={true} isPlayable={false} />
                ))}
              </div>
            </Panel>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="danger"
            disabled={disabled}
            onClick={() => onResolvePhase1({ guess: "RED" })}
          >
            Guess RED
          </Button>
          <Button
            variant="secondary"
            disabled={disabled}
            onClick={() => onResolvePhase1({ guess: "BLACK" })}
          >
            Guess BLACK
          </Button>
        </Modal.Footer>
      </Modal>
    );
  }

  if (phase1Choice.mode === "KIT_CARLSON_PICK") {
    const preview = phase1Choice.previewCards || [];
    const needed = phase1Choice.neededCount ?? Math.max(1, preview.length - 1);
    return (
      <Modal isOpen={true} size="medium">
        <Modal.Header title={`Kit Carlson (${needed})`} />
        <Modal.Body>
          <div className="turn-prompt__cards-row">
            {preview.map((card) => {
              const selected = pickedCardIds.includes(card.id);
              return (
                <CardView
                  key={card.id}
                  card={card}
                  isSelected={selected}
                  isPlayable={!disabled}
                  onClick={() => {
                    if (disabled) return;
                    setPickedCardIds((prev) => {
                      if (prev.includes(card.id)) return prev.filter((id) => id !== card.id);
                      if (prev.length < needed) return [...prev, card.id];
                      return [...prev.slice(1), card.id];
                    });
                  }}
                />
              );
            })}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="primary"
            disabled={disabled || pickedCardIds.length !== needed}
            onClick={() => {
              onResolvePhase1({ cardIds: pickedCardIds });
              setPickedCardIds([]);
            }}
          >
            Confirm Pick ({pickedCardIds.length}/{needed})
          </Button>
        </Modal.Footer>
      </Modal>
    );
  }

  if (phase1Choice.mode === "RANCH_EXCHANGE") {
    return (
      <Modal isOpen={true} size="medium">
        <Modal.Header title="Ranch" />
        <Modal.Body>
          <div className="turn-prompt__cards-row">
            {myHand.map((card) => {
              const selected = pickedCardIds.includes(card.id);
              return (
                <CardView
                  key={card.id}
                  card={card}
                  isMini={true}
                  isSelected={selected}
                  isPlayable={!disabled}
                  onClick={() => {
                    if (disabled) return;
                    setPickedCardIds((prev) =>
                      prev.includes(card.id)
                        ? prev.filter((id) => id !== card.id)
                        : [...prev, card.id]
                    );
                  }}
                />
              );
            })}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            disabled={disabled}
            onClick={() => {
              onResolvePhase1({ skip: true, discardCardIds: [] });
              setPickedCardIds([]);
            }}
          >
            Skip
          </Button>
          <Button
            variant="primary"
            disabled={disabled}
            onClick={() => {
              onResolvePhase1({ discardCardIds: pickedCardIds });
              setPickedCardIds([]);
            }}
          >
            Exchange ({pickedCardIds.length})
          </Button>
        </Modal.Footer>
      </Modal>
    );
  }

  return (
    <DrawOptionPrompt
      phase1Choice={phase1Choice}
      players={players}
      myPlayerId={myPlayerId}
      topDiscard={topDiscard}
      disabled={disabled}
      onResolvePhase1={onResolvePhase1}
      onOpenStealPicker={onOpenStealPicker}
    />
  );
};
