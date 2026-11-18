import React, { useState } from "react";
import type {
  Card,
  GameActionPayload,
  PendingPhase1ChoiceInfo,
  Player,
} from "../../../types/game";
import { getAllEquipments } from "../../../utils/equipments";
import { Modal } from "../../ui/Modal/Modal";
import { Panel } from "../../ui/Panel/Panel";
import { Button } from "../../ui/Button/Button";
import { CardView } from "../CardView/CardView";

export interface DrawOptionPromptProps {
  phase1Choice: PendingPhase1ChoiceInfo;
  players: Player[];
  myPlayerId: string;
  topDiscard?: Card;
  disabled: boolean;
  onResolvePhase1: (payload: GameActionPayload) => void;
  onOpenStealPicker?: (
    mode: "JESSE_STEAL_AND_DECK" | "PAT_BRENNAN_STEAL",
    targetPlayer: Player
  ) => void;
}

const OPTION_LABELS: Record<string, { title: string; desc: string }> = {
  PEDRO_DISCARD_AND_DECK: {
    title: "Pedro Ramirez: Take Top Discard + 1 Deck",
    desc: "Take the visible top card of the discard pile instead of your 1st draw.",
  },
  JESSE_STEAL_AND_DECK: {
    title: "Jesse Jones: Steal 1 Hand Card + 1 Deck",
    desc: "Pick an opponent with cards in hand to steal your 1st card from.",
  },
  PAT_BRENNAN_STEAL: {
    title: "Pat Brennan: Steal 1 Card in Play",
    desc: "Steal a blue, green, or judgement card in front of any player instead of drawing 2.",
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

export const DrawOptionPrompt: React.FC<DrawOptionPromptProps> = ({
  phase1Choice,
  players,
  myPlayerId,
  topDiscard,
  disabled,
  onResolvePhase1,
  onOpenStealPicker,
}) => {
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [selectedPlayItem, setSelectedPlayItem] = useState<{
    targetPlayerId: string;
    targetArea: "EQUIPMENT" | "GREEN" | "JUDGEMENT";
    targetCardId: string;
  } | null>(null);
  const [pendingOption, setPendingOption] = useState<string | null>(null);

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
    getAllEquipments(p.equipments).forEach((c) => {
      tableCardsInPlay.push({
        targetPlayerId: p.id,
        targetPlayerName: p.name,
        targetArea: "EQUIPMENT",
        targetCardId: c.id,
        cardName: c.name,
      });
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
    onResolvePhase1({ choice: opt });
  };

  const showFallbackConfirm =
    !onOpenStealPicker &&
    (pendingOption === "JESSE_STEAL_AND_DECK" || pendingOption === "PAT_BRENNAN_STEAL");

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
                  onClick={() => {
                    if (onOpenStealPicker) {
                      setPendingOption(null);
                      onOpenStealPicker("JESSE_STEAL_AND_DECK", opp);
                    } else {
                      setSelectedTargetId(opp.id);
                    }
                  }}
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
              {onOpenStealPicker
                ? players
                    .filter(
                      (opp) =>
                        opp.id !== myPlayerId &&
                        !opp.isDead &&
                        !opp.isGhost &&
                        tableCardsInPlay.some((c) => c.targetPlayerId === opp.id)
                    )
                    .map((opp) => {
                      const inPlayCount = tableCardsInPlay.filter(
                        (c) => c.targetPlayerId === opp.id
                      ).length;
                      return (
                        <button
                          key={opp.id}
                          type="button"
                          disabled={disabled}
                          onClick={() => {
                            setPendingOption(null);
                            onOpenStealPicker("PAT_BRENNAN_STEAL", opp);
                          }}
                          className="turn-prompt__option"
                        >
                          <div className="turn-prompt__option-title">
                            {opp.name} ({inPlayCount} card(s) in play)
                          </div>
                        </button>
                      );
                    })
                : tableCardsInPlay.map((item) => {
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
      {showFallbackConfirm && (
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
                  choice: "JESSE_STEAL_AND_DECK",
                  targetPlayerId: selectedTargetId,
                });
                setPendingOption(null);
                setSelectedTargetId(null);
              } else if (pendingOption === "PAT_BRENNAN_STEAL" && selectedPlayItem) {
                onResolvePhase1({
                  choice: "PAT_BRENNAN_STEAL",
                  ...selectedPlayItem,
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
