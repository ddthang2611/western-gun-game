import React, { useState } from "react";
import type {
  Card,
  PendingPhase1ChoiceInfo,
  PendingTurnStartChoiceInfo,
  Player,
} from "../../../types/game";
import { Modal } from "../../ui/Modal/Modal";
import { Panel } from "../../ui/Panel/Panel";
import { Button } from "../../ui/Button/Button";
import { CardView } from "../CardView/CardView";
import "./TurnPromptModal.scss";

export interface TurnPromptModalProps {
  turnStartChoice?: PendingTurnStartChoiceInfo | null;
  phase1Choice?: PendingPhase1ChoiceInfo | null;
  players: Player[];
  myHand: Card[];
  myPlayerId: string;
  topDiscard?: Card;
  disabled?: boolean;
  onResolveTurnStart: (payload: Record<string, unknown>) => void;
  onResolvePhase1: (payload: Record<string, unknown>) => void;
}

const OPTION_LABELS: Record<string, { title: string; desc: string }> = {
  PEDRO_DISCARD_AND_DECK: {
    title: "Pedro Ramirez: Take Top Discard + 1 Deck",
    desc: "Take the visible top card of the discard pile instead of your 1st draw.",
  },
  JESSE_STEAL_AND_DECK: {
    title: "Jesse Jones: Steal 1 Hand Card + 1 Deck",
    desc: "Pick an opponent with cards in hand to draw your 1st card from.",
  },
  PAT_BRENNAN_STEAL: {
    title: "Pat Brennan: Take 1 Card in Play",
    desc: "Take a blue, green, or judgement card in front of any player instead of drawing 2.",
  },
  KIT_CARLSON: {
    title: "Kit Carlson: Look at 3, Keep 2",
    desc: "Preview top 3 deck cards, keep 2 and place 1 back on top.",
  },
  BILL_NOFACE: {
    title: "Bill Noface: Draw 1 + Wounds",
    desc: "Draw 1 card plus 1 extra card per life point lost.",
  },
  PIXIE_PETE: {
    title: "Pixie Pete: Draw 3 Cards",
    desc: "Draw 3 cards instead of 2 in Phase 1.",
  },
  SKIP_DRAW_HEAL: {
    title: "Hard Liquor: Skip Draw & Heal +1 HP",
    desc: "Skip Phase 1 drawing to recover 1 life point.",
  },
  NORMAL_DECK: {
    title: "Normal Draw (Deck)",
    desc: "Draw normally from the top of the deck.",
  },
  NORMAL_DRAW: {
    title: "Normal Draw (Deck)",
    desc: "Draw normally from the top of the deck.",
  },
};

export const TurnPromptModal: React.FC<TurnPromptModalProps> = ({
  turnStartChoice,
  phase1Choice,
  players,
  myHand,
  myPlayerId,
  topDiscard,
  disabled = false,
  onResolveTurnStart,
  onResolvePhase1,
}) => {
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [selectedPlayItem, setSelectedPlayItem] = useState<{
    targetPlayerId: string;
    targetArea: "EQUIPMENT" | "GREEN" | "JUDGEMENT";
    targetCardId: string;
  } | null>(null);
  const [pickedCardIds, setPickedCardIds] = useState<string[]>([]);
  const [pendingOption, setPendingOption] = useState<string | null>(null);

  if (turnStartChoice && turnStartChoice.playerId === myPlayerId) {
    if (turnStartChoice.type === "VERA_CUSTER_COPY") {
      const choices = turnStartChoice.availableCharacters || [];
      return (
        <Modal isOpen={true} size="medium">
          <Modal.Header title="Vera Custer" />
          <Modal.Body>
            <div className="turn-prompt__list">
              {choices.map((entry) => {
                const picked = selectedCharId === entry.character.id;
                return (
                  <button
                    key={`${entry.ownerPlayerId}_${entry.character.id}`}
                    type="button"
                    disabled={disabled}
                    onClick={() => setSelectedCharId(entry.character.id)}
                    className={`turn-prompt__option ${picked ? "turn-prompt__option--selected" : ""}`}
                  >
                    <div className="turn-prompt__option-title">
                      {entry.character.name} ({entry.ownerName})
                    </div>
                    <div className="turn-prompt__option-desc">{entry.character.desc}</div>
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
                if (selectedCharId) {
                  onResolveTurnStart({ characterIds: [selectedCharId] });
                  setSelectedCharId(null);
                }
              }}
            >
              Confirm Copy
            </Button>
          </Modal.Footer>
        </Modal>
      );
    }

    if (turnStartChoice.type === "BLOOD_BROTHERS") {
      const eligible = players.filter((p) =>
        (turnStartChoice.eligibleTargetIds || []).includes(p.id)
      );
      return (
        <Modal isOpen={true} size="medium">
          <Modal.Header title="Blood Brothers" />
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
                onResolveTurnStart({ payload: { skip: true } });
                setSelectedTargetId(null);
              }}
            >
              Skip
            </Button>
            <Button
              variant="primary"
              disabled={disabled || !selectedTargetId}
              onClick={() => {
                if (selectedTargetId) {
                  onResolveTurnStart({ targetPlayerId: selectedTargetId });
                  setSelectedTargetId(null);
                }
              }}
            >
              Give 1 HP
            </Button>
          </Modal.Footer>
        </Modal>
      );
    }
  }

  if (!phase1Choice || phase1Choice.playerId !== myPlayerId) {
    return null;
  }

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
            onClick={() => onResolvePhase1({ payload: { choice: "RED" } })}
          >
            Guess RED
          </Button>
          <Button
            variant="secondary"
            disabled={disabled}
            onClick={() => onResolvePhase1({ payload: { choice: "BLACK" } })}
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
              onResolvePhase1({ payload: { cardIds: pickedCardIds } });
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
              onResolvePhase1({ discardCardIds: [] });
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

  // CHOOSE_DRAW_OPTION (Pedro Ramirez, Jesse Jones, Pat Brennan, Hard Liquor, Dual choice)
  const opponentsWithHand = players.filter(
    (p) => p.id !== myPlayerId && !p.isDead && !p.isGhost && p.handCount > 0
  );
  const tableCardsInPlay: Array<{
    targetPlayerId: string;
    targetPlayerName: string;
    targetArea: "EQUIPMENT" | "GREEN" | "JUDGEMENT";
    targetCardId: string;
    cardName: string;
  }> = [];
  players.forEach((p) => {
    if (p.id === myPlayerId || p.isDead || p.isGhost) return;
    const eqList = [
      p.equipments.weapon,
      p.equipments.horseDef,
      p.equipments.horseOff,
      p.equipments.barrel,
      ...(p.equipments.extras && p.equipments.extras.length > 0
        ? p.equipments.extras
        : p.equipments.extra
        ? [p.equipments.extra]
        : []),
    ];
    eqList.forEach((c) => {
      if (c) {
        tableCardsInPlay.push({
          targetPlayerId: p.id,
          targetPlayerName: p.name,
          targetArea: "EQUIPMENT",
          targetCardId: c.id,
          cardName: c.name,
        });
      }
    });
    (p.greenCards || []).forEach((g) => {
      tableCardsInPlay.push({
        targetPlayerId: p.id,
        targetPlayerName: p.name,
        targetArea: "GREEN",
        targetCardId: g.card.id,
        cardName: g.card.name,
      });
    });
    (p.judgements || []).forEach((j) => {
      if (j.card) {
        tableCardsInPlay.push({
          targetPlayerId: p.id,
          targetPlayerName: p.name,
          targetArea: "JUDGEMENT",
          targetCardId: j.card.id,
          cardName: j.card.name,
        });
      }
    });
  });

  const handleOptionClick = (opt: string) => {
    if (disabled) return;
    if (opt === "JESSE_STEAL_AND_DECK" || opt === "PAT_BRENNAN_STEAL") {
      setPendingOption(opt);
      setSelectedTargetId(null);
      setSelectedPlayItem(null);
      return;
    }
    setPendingOption(null);
    onResolvePhase1({ payload: { choice: opt } });
  };

  return (
    <Modal isOpen={true} size="medium">
      <Modal.Header title="Draw Phase" />
      <Modal.Body>
        {phase1Choice.options.includes("PEDRO_DISCARD_AND_DECK") && topDiscard && (
          <Panel>
            <div className="turn-prompt__cards-row">
              <CardView card={topDiscard} isMini={true} isPlayable={false} />
              <div className="turn-prompt__option-desc">
                <strong>{topDiscard.name}</strong> ({topDiscard.rank} {topDiscard.suit})
              </div>
            </div>
          </Panel>
        )}

        <div className="turn-prompt__list">
          {phase1Choice.options.map((opt) => {
            const meta = OPTION_LABELS[opt] || { title: opt, desc: "" };
            const isActive = pendingOption === opt;
            return (
              <button
                key={opt}
                type="button"
                disabled={disabled}
                onClick={() => handleOptionClick(opt)}
                className={`turn-prompt__option ${isActive ? "turn-prompt__option--selected" : ""}`}
              >
                <div className="turn-prompt__option-title">{meta.title}</div>
              </button>
            );
          })}
        </div>

        {pendingOption === "JESSE_STEAL_AND_DECK" && (
          <Panel>
            <div className="turn-prompt__list">
              {opponentsWithHand.map((opp) => (
                <button
                  key={opp.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setSelectedTargetId(opp.id)}
                  className={`turn-prompt__option ${
                    selectedTargetId === opp.id ? "turn-prompt__option--selected" : ""
                  }`}
                >
                  <div className="turn-prompt__option-title">
                    {opp.name} ({opp.handCount})
                  </div>
                </button>
              ))}
            </div>
          </Panel>
        )}

        {pendingOption === "PAT_BRENNAN_STEAL" && (
          <Panel>
            <div className="turn-prompt__list">
              {tableCardsInPlay.map((item) => {
                const isSelected = selectedPlayItem?.targetCardId === item.targetCardId;
                return (
                  <button
                    key={`${item.targetPlayerId}_${item.targetCardId}`}
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      setSelectedPlayItem({
                        targetPlayerId: item.targetPlayerId,
                        targetArea: item.targetArea,
                        targetCardId: item.targetCardId,
                      })
                    }
                    className={`turn-prompt__option ${
                      isSelected ? "turn-prompt__option--selected" : ""
                    }`}
                  >
                    <div className="turn-prompt__option-title">
                      {item.cardName} ({item.targetPlayerName} - {item.targetArea})
                    </div>
                  </button>
                );
              })}
            </div>
          </Panel>
        )}
      </Modal.Body>
      {(pendingOption === "JESSE_STEAL_AND_DECK" ||
        pendingOption === "PAT_BRENNAN_STEAL") && (
        <Modal.Footer>
          <Button
            variant="primary"
            disabled={
              disabled ||
              (pendingOption === "JESSE_STEAL_AND_DECK" && !selectedTargetId) ||
              (pendingOption === "PAT_BRENNAN_STEAL" && !selectedPlayItem)
            }
            onClick={() => {
              if (pendingOption === "JESSE_STEAL_AND_DECK" && selectedTargetId) {
                onResolvePhase1({
                  targetPlayerId: selectedTargetId,
                  payload: { choice: "JESSE_STEAL_AND_DECK", targetPlayerId: selectedTargetId },
                });
                setPendingOption(null);
                setSelectedTargetId(null);
              } else if (pendingOption === "PAT_BRENNAN_STEAL" && selectedPlayItem) {
                onResolvePhase1({
                  ...selectedPlayItem,
                  payload: { choice: "PAT_BRENNAN_STEAL", ...selectedPlayItem },
                });
                setPendingOption(null);
                setSelectedPlayItem(null);
              }
            }}
          >
            Confirm Selection
          </Button>
        </Modal.Footer>
      )}
    </Modal>
  );
};
