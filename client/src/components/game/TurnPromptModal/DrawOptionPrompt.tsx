import React, { useState } from "react";
import type {
  Card,
  GameActionPayload,
  PendingPhase1ChoiceInfo,
  Player,
} from "../../../types/game";
import { useI18n } from "../../../i18n";
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

const OPTION_KEYS: Record<string, { titleKey: string; descKey: string }> = {
  PEDRO_DISCARD_AND_DECK: {
    titleKey: "modals.prompt.pedroDiscard",
    descKey: "modals.prompt.pedroDiscardDesc",
  },
  JESSE_STEAL_AND_DECK: {
    titleKey: "modals.prompt.jesseSteal",
    descKey: "modals.prompt.jesseStealDesc",
  },
  PAT_BRENNAN_STEAL: {
    titleKey: "modals.prompt.patSteal",
    descKey: "modals.prompt.patStealDesc",
  },
  KIT_CARLSON: {
    titleKey: "modals.prompt.kitOption",
    descKey: "modals.prompt.kitOptionDesc",
  },
  BILL_NOFACE: {
    titleKey: "modals.prompt.billOption",
    descKey: "modals.prompt.billOptionDesc",
  },
  PIXIE_PETE: {
    titleKey: "modals.prompt.pixieOption",
    descKey: "modals.prompt.pixieOptionDesc",
  },
  SKIP_DRAW_HEAL: {
    titleKey: "modals.prompt.hardLiquor",
    descKey: "modals.prompt.hardLiquorDesc",
  },
  NORMAL_DECK: {
    titleKey: "modals.prompt.drawDeck",
    descKey: "modals.prompt.drawDeckDesc",
  },
  NORMAL_DRAW: {
    titleKey: "modals.prompt.drawDeck",
    descKey: "modals.prompt.drawDeckDesc",
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
  const { locale, t, tCard, tSuitSymbol } = useI18n();
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

  const topDiscardLoc = topDiscard ? tCard(topDiscard) : null;
  const topDiscardSub =
    topDiscardLoc && locale === "vi" && topDiscardLoc.primary.subtitleVi
      ? ` (${topDiscardLoc.primary.subtitleVi})`
      : "";

  return (
    <Modal isOpen={true} size="medium">
      <Modal.Header title={t("modals.prompt.drawTitle")} />
      <Modal.Body>
        {phase1Choice.options.includes("PEDRO_DISCARD_AND_DECK") && topDiscard && topDiscardLoc && (
          <Panel>
            <div className="turn-prompt__cards-row">
              <CardView card={topDiscard} isMini={true} isPlayable={false} />
              <div className="turn-prompt__option-desc">
                <strong>
                  {topDiscardLoc.primary.name}
                  {topDiscardSub}
                </strong>{" "}
                ({topDiscard.rank}
                {tSuitSymbol(topDiscard.suit)})
              </div>
            </div>
          </Panel>
        )}

        <div className="turn-prompt__list">
          {phase1Choice.options.map((opt) => {
            const keys = OPTION_KEYS[opt];
            const title = keys ? t(keys.titleKey) : opt;
            const desc = keys ? t(keys.descKey) : "";
            const isActive = pendingOption === opt;
            return (
              <button
                key={opt}
                type="button"
                disabled={disabled}
                onClick={() => handleOptionClick(opt)}
                className={`turn-prompt__option ${isActive ? "turn-prompt__option--selected" : ""}`}
              >
                <div className="turn-prompt__option-title">{title}</div>
                {desc && <div className="turn-prompt__option-desc">{desc}</div>}
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
                            {t("modals.prompt.cardsInPlayCount", {
                              name: opp.name,
                              count: inPlayCount,
                            })}
                          </div>
                        </button>
                      );
                    })
                : tableCardsInPlay.map((item) => {
                    const isSelected = selectedPlayItem?.targetCardId === item.targetCardId;
                    const areaLabel = t(
                      `modals.defense.area.${item.targetArea}`,
                      undefined,
                      item.targetArea
                    );
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
                          {item.cardName} ({item.targetPlayerName} - {areaLabel})
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
            {t("modals.prompt.confirmSelection")}
          </Button>
        </Modal.Footer>
      )}
    </Modal>
  );
};
