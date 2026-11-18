import { useCallback, useState } from "react";
import type { Card, Character, GreenCard } from "../../../types/game";
import {
  DISCARD_COST_CARDS,
  GREEN_DEFENSE_NAMES,
  isBangCardForHeroes,
} from "../utils/cardRules";
import type { SkillModeType } from "../utils/tableSelectors";

export interface UseTableSelectionParams {
  isMock: boolean;
  isMyTurn: boolean;
  isTurnLocked: boolean;
  isActionLocked: boolean;
  isWsConnected: boolean;
  currentPhase: number;
  activeHand: Card[];
  activeHp: number;
  effectiveSkillHeroes: Character[];
  isSniperActive: boolean;
  showError: (message: string) => void;
}

// Manage card, target, and skill selection
export function useTableSelection({
  isMock,
  isMyTurn,
  isTurnLocked,
  isActionLocked,
  isWsConnected,
  currentPhase,
  activeHand,
  activeHp,
  effectiveSkillHeroes,
  isSniperActive,
  showError,
}: UseTableSelectionParams) {
  const [selectedHandCardId, setSelectedHandCardId] = useState<string | null>(null);
  const [selectedGreenCardId, setSelectedGreenCardId] = useState<string | null>(null);
  const [discardCostIds, setDiscardCostIds] = useState<string[]>([]);
  const [phase3DiscardIds, setPhase3DiscardIds] = useState<string[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [skillMode, setSkillMode] = useState<SkillModeType>(null);
  const [skillDiscardIds, setSkillDiscardIds] = useState<string[]>([]);

  const selectedCard = activeHand.find((c) => c.id === selectedHandCardId);
  const handLimit = effectiveSkillHeroes.some((h) => h.name === "Sean Mallory")
    ? 10
    : activeHp;
  const excessCardsCount = Math.max(0, activeHand.length - handLimit);
  const requiresExtraDiscard = Boolean(
    selectedCard && DISCARD_COST_CARDS.has(selectedCard.name) && currentPhase !== 3
  );
  const isSniperBangSelected = Boolean(
    isSniperActive &&
      selectedCard &&
      isBangCardForHeroes(selectedCard, effectiveSkillHeroes) &&
      currentPhase !== 3
  );

  const reconcileHandSelection = useCallback((nextHand: Card[]) => {
    const validIds = new Set(nextHand.map((c) => c.id));
    setSelectedHandCardId((prevId) => (prevId && validIds.has(prevId) ? prevId : null));
    setDiscardCostIds((prevIds) => prevIds.filter((id) => validIds.has(id)));
    setSkillDiscardIds((prevIds) => prevIds.filter((id) => validIds.has(id)));
    setPhase3DiscardIds((prevIds) => prevIds.filter((id) => validIds.has(id)));
  }, []);

  const handleCancelSelection = useCallback(() => {
    setSelectedHandCardId(null);
    setSelectedGreenCardId(null);
    setDiscardCostIds([]);
    setPhase3DiscardIds([]);
    setSelectedTargetId(null);
    setSkillMode(null);
    setSkillDiscardIds([]);
  }, []);

  const clearSkillState = useCallback((clearTarget = false, clearHandCard = false) => {
    setSkillMode(null);
    setSkillDiscardIds([]);
    if (clearTarget) setSelectedTargetId(null);
    if (clearHandCard) setSelectedHandCardId(null);
  }, []);

  const clearSelectionsForSkill = useCallback(() => {
    setSelectedHandCardId(null);
    setSelectedGreenCardId(null);
    setDiscardCostIds([]);
    setPhase3DiscardIds([]);
    setSelectedTargetId(null);
    setSkillDiscardIds([]);
  }, []);

  const handleSelectHandCard = useCallback(
    (card: Card) => {
      if (isTurnLocked) return;
      setSelectedGreenCardId(null);

      if (!isMock && isMyTurn && currentPhase === 3) {
        const maxDiscard = Math.max(1, excessCardsCount);
        setPhase3DiscardIds((prev) => {
          if (prev.includes(card.id)) {
            return prev.filter((id) => id !== card.id);
          }
          if (prev.length >= maxDiscard) {
            return [...prev.slice(1), card.id];
          }
          return [...prev, card.id];
        });
        return;
      }

      if (skillMode === "SID_KETCHUM_HEAL" || skillMode === "DOC_HOLYDAY_BANG") {
        setSkillDiscardIds((prev) =>
          prev.includes(card.id)
            ? prev.filter((id) => id !== card.id)
            : prev.length < 2
            ? [...prev, card.id]
            : prev
        );
        return;
      }

      if (skillMode === "JOSE_DELGADO_DRAW") {
        if (card.border !== "blue") {
          showError("Select a blue card for Jose Delgado.");
          return;
        }
        setSkillDiscardIds((prev) => (prev.includes(card.id) ? [] : [card.id]));
        return;
      }

      // Toggle extra discard cost card
      if (requiresExtraDiscard && selectedCard && selectedCard.id !== card.id) {
        const next = discardCostIds.includes(card.id)
          ? discardCostIds.filter((id) => id !== card.id)
          : [card.id];
        setDiscardCostIds(next);
        if (next.length === 0) {
          setSelectedTargetId(null);
        }
        return;
      }

      // Sniper event: optionally pick 2nd BANG!
      if (
        isSniperBangSelected &&
        selectedCard &&
        card.id !== selectedCard.id &&
        isBangCardForHeroes(card, effectiveSkillHeroes)
      ) {
        setDiscardCostIds((prev) =>
          prev.includes(card.id) ? prev.filter((id) => id !== card.id) : [card.id]
        );
        return;
      }

      if (selectedHandCardId === card.id) {
        setSelectedHandCardId(null);
        setDiscardCostIds([]);
        setSelectedTargetId(null);
      } else {
        setSelectedHandCardId(card.id);
        setDiscardCostIds([]);
        setSelectedTargetId(null);
      }
    },
    [
      currentPhase,
      discardCostIds,
      effectiveSkillHeroes,
      excessCardsCount,
      isMock,
      isMyTurn,
      isSniperBangSelected,
      isTurnLocked,
      requiresExtraDiscard,
      selectedCard,
      selectedHandCardId,
      showError,
      skillMode,
    ]
  );

  const handleTriggerGreenCard = useCallback(
    (gCard: GreenCard) => {
      if (isTurnLocked) {
        showError(
          isWsConnected
            ? "Match is paused. Actions are locked."
            : "Connection lost. Reconnecting..."
        );
        return;
      }
      if (isActionLocked) {
        showError("Green cards can only be activated during Phase 2 of your turn.");
        return;
      }
      if (gCard.isDelay) {
        showError(`${gCard.card.name} is still pending until your next turn.`);
        return;
      }
      if (GREEN_DEFENSE_NAMES.has(gCard.card.name)) {
        showError(
          `${gCard.card.name} is a defense card — activate it from the Defense prompt when attacked.`
        );
        return;
      }

      setSelectedHandCardId(null);
      setDiscardCostIds([]);
      setSkillMode(null);
      setSkillDiscardIds([]);
      setSelectedTargetId(null);
      setSelectedGreenCardId((prev) => (prev === gCard.id ? null : gCard.id));
    },
    [isActionLocked, isTurnLocked, isWsConnected, showError]
  );

  const handleTriggerSkill = useCallback(
    (heroId: string) => {
      if (isTurnLocked) {
        showError(
          isWsConnected
            ? "Match is paused. Actions are locked."
            : "Connection lost. Reconnecting..."
        );
        return;
      }
      if (isActionLocked) {
        showError("Active skills can only be used during Phase 2 of your turn.");
        return;
      }

      const hero = effectiveSkillHeroes.find((h) => h.id === heroId);
      if (!hero) return;

      if (hero.name === "Chuck Wengam") {
        if (skillMode === "CHUCK_WENGAM_SACRIFICE") {
          clearSkillState();
          return;
        }
        if (isMock && activeHp <= 1) {
          showError("Cannot sacrifice your last HP.");
          return;
        }
        clearSelectionsForSkill();
        setSkillMode("CHUCK_WENGAM_SACRIFICE");
        return;
      }

      if (hero.name === "Jose Delgado") {
        if (skillMode === "JOSE_DELGADO_DRAW") {
          clearSkillState();
          return;
        }
        const preselectedBlueId =
          selectedCard?.border === "blue" ? selectedCard.id : null;
        clearSelectionsForSkill();
        setSkillDiscardIds(preselectedBlueId ? [preselectedBlueId] : []);
        setSkillMode("JOSE_DELGADO_DRAW");
        return;
      }

      if (hero.name === "Sid Ketchum") {
        if (skillMode === "SID_KETCHUM_HEAL") {
          clearSkillState();
        } else {
          clearSelectionsForSkill();
          setSkillMode("SID_KETCHUM_HEAL");
        }
        return;
      }

      if (hero.name === "Doc Holyday") {
        if (skillMode === "DOC_HOLYDAY_BANG") {
          clearSkillState(true);
        } else {
          clearSelectionsForSkill();
          setSkillMode("DOC_HOLYDAY_BANG");
        }
        return;
      }

      showError(`${hero.name} active skill is not available yet.`);
    },
    [
      activeHp,
      clearSelectionsForSkill,
      clearSkillState,
      effectiveSkillHeroes,
      isActionLocked,
      isMock,
      isTurnLocked,
      isWsConnected,
      selectedCard,
      showError,
      skillMode,
    ]
  );

  return {
    selectedHandCardId,
    selectedGreenCardId,
    discardCostIds,
    phase3DiscardIds,
    selectedTargetId,
    setSelectedTargetId,
    skillMode,
    skillDiscardIds,
    reconcileHandSelection,
    handleSelectHandCard,
    handleTriggerGreenCard,
    handleTriggerSkill,
    handleCancelSelection,
    clearSkillState,
  };
}
