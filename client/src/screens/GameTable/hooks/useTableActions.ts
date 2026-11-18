import { useCallback } from "react";
import type { Card, GreenCard, TableState } from "../../../types/game";
import {
  MANIPULATE_CARDS,
  TARGETED_SINGLE_CARDS,
  countInPlayCards,
  countInspectableCards,
  isBangCardForHeroes,
} from "../utils/cardRules";
import type {
  CardPickerConfig,
  SkillModeType,
  TableViewModel,
} from "../utils/tableSelectors";
import type { VfxBeam } from "./useTableAnimations";

export interface UseTableActionsParams {
  isMock: boolean;
  isWsConnected: boolean;
  state: TableState;
  vm: TableViewModel;
  selectedTargetId: string | null;
  setSelectedTargetId: React.Dispatch<React.SetStateAction<string | null>>;
  discardCostIds: string[];
  phase3DiscardIds: string[];
  skillMode: SkillModeType;
  skillDiscardIds: string[];
  sendLiveCommand: (type: string, payload?: Record<string, unknown>) => boolean;
  confirmMockSkill: (
    skillMode: SkillModeType,
    skillDiscardIds: string[],
    selectedTargetId: string | null
  ) => boolean;
  playMockGreenCard: (
    selectedGreenCard: GreenCard,
    selectedTargetId: string | null
  ) => void;
  playMockHandCard: (
    selectedCard: Card,
    discardCostIds: string[],
    selectedTargetId: string | null
  ) => boolean;
  endMockTurn: () => void;
  handleCancelSelection: () => void;
  clearSkillState: (clearTarget?: boolean, clearHandCard?: boolean) => void;
  setCardPickerConfig: (cfg: CardPickerConfig) => void;
  triggerVfx: (type: VfxBeam["type"], targetId?: string, aoeHeal?: boolean) => void;
  showError: (message: string) => void;
}

// Coordinate play, skill, and turn commands
export function useTableActions({
  isMock,
  isWsConnected,
  state,
  vm,
  selectedTargetId,
  setSelectedTargetId,
  discardCostIds,
  phase3DiscardIds,
  skillMode,
  skillDiscardIds,
  sendLiveCommand,
  confirmMockSkill,
  playMockGreenCard,
  playMockHandCard,
  endMockTurn,
  handleCancelSelection,
  clearSkillState,
  setCardPickerConfig,
  triggerVfx,
  showError,
}: UseTableActionsParams) {
  const handleConfirmSkill = useCallback(() => {
    if (vm.isTurnLocked) {
      showError(
        isWsConnected
          ? "Match is paused. Actions are locked."
          : "Connection lost. Reconnecting..."
      );
      return;
    }
    if (vm.isActionLocked) {
      showError("Active skills can only be used during Phase 2 of your turn.");
      return;
    }

    if (isMock) {
      if (confirmMockSkill(skillMode, skillDiscardIds, selectedTargetId)) {
        clearSkillState(
          skillMode === "DOC_HOLYDAY_BANG",
          skillMode === "JOSE_DELGADO_DRAW"
        );
      }
      return;
    }

    if (skillMode === "CHUCK_WENGAM_SACRIFICE") {
      sendLiveCommand("USE_ACTIVE_SKILL", {
        payload: { skillType: "CHUCK_WENGAM_SACRIFICE" },
      });
      clearSkillState();
      return;
    }

    if (skillMode === "JOSE_DELGADO_DRAW") {
      const chosenCard = vm.activeHand.find((c) => c.id === skillDiscardIds[0]);
      if (!chosenCard || chosenCard.border !== "blue") {
        showError("Select a blue card for Jose Delgado.");
        return;
      }
      sendLiveCommand("USE_ACTIVE_SKILL", {
        payload: { skillType: "JOSE_DELGADO_DRAW", cardId: chosenCard.id },
      });
      clearSkillState(false, true);
      return;
    }

    if (skillMode === "SID_KETCHUM_HEAL") {
      if (skillDiscardIds.length !== 2) {
        showError("Select 2 cards from your hand for Sid Ketchum.");
        return;
      }
      sendLiveCommand("USE_ACTIVE_SKILL", {
        payload: {
          skillType: "SID_KETCHUM_HEAL",
          discardCardIds: skillDiscardIds.slice(0, 2),
        },
      });
      clearSkillState();
      return;
    }

    if (skillMode === "DOC_HOLYDAY_BANG") {
      if (skillDiscardIds.length < 2) {
        showError("Select 2 cards from your hand to discard for Doc Holyday.");
        return;
      }
      if (!selectedTargetId) {
        showError("Select a target opponent to shoot.");
        return;
      }
      sendLiveCommand("USE_ACTIVE_SKILL", {
        payload: {
          skillType: "DOC_HOLYDAY_BANG",
          discardCardIds: skillDiscardIds.slice(0, 2),
          targetPlayerId: selectedTargetId,
        },
      });
      clearSkillState(true);
    }
  }, [
    clearSkillState,
    confirmMockSkill,
    isMock,
    isWsConnected,
    selectedTargetId,
    sendLiveCommand,
    showError,
    skillDiscardIds,
    skillMode,
    vm.activeHand,
    vm.isActionLocked,
    vm.isTurnLocked,
  ]);

  const handlePlayCard = useCallback(() => {
    if (vm.isTurnLocked) {
      showError(
        isWsConnected
          ? "Match is paused. Actions are locked."
          : "Connection lost. Reconnecting..."
      );
      return;
    }

    if (vm.selectedGreenCard) {
      if (vm.isActionLocked) {
        showError("Green cards can only be activated during Phase 2 of your turn.");
        return;
      }
      if (vm.selectedGreenCard.isDelay) {
        showError(
          `${vm.selectedGreenCard.card.name} is still pending until your next turn.`
        );
        return;
      }
      const gName = vm.selectedGreenCard.card.name;
      if (gName === "CAN CAN" || gName === "CONESTOGA") {
        if (!selectedTargetId) {
          showError(`Select a target opponent for ${gName}.`);
          return;
        }
        const target = state.players.find((p) => p.id === selectedTargetId);
        if (!target || countInspectableCards(target) === 0) {
          showError(`${target?.name || "Target"} has no cards to steal or discard.`);
          return;
        }
        setCardPickerConfig({
          isOpen: true,
          targetPlayer: target,
          action: gName === "CAN CAN" ? "destroy" : "steal",
          cardName: gName,
          sourceGreenCardId: vm.selectedGreenCard.id,
        });
        return;
      }
      if (TARGETED_SINGLE_CARDS.has(gName) && !selectedTargetId) {
        showError(`Select a target opponent for ${gName}.`);
        return;
      }
      if (!isMock) {
        if (
          sendLiveCommand("ACTIVATE_GREEN_CARD", {
            greenCardId: vm.selectedGreenCard.id,
            cardId: vm.selectedGreenCard.card.id,
            targetPlayerId: selectedTargetId || undefined,
          })
        ) {
          handleCancelSelection();
        }
        return;
      }
      playMockGreenCard(vm.selectedGreenCard, selectedTargetId);
      handleCancelSelection();
      return;
    }

    if (!isMock && state.currentPhase === 3) {
      if (!vm.isMyTurn) return;
      const idsToDiscard =
        phase3DiscardIds.length > 0
          ? phase3DiscardIds
          : vm.selectedCard
          ? [vm.selectedCard.id]
          : [];
      if (idsToDiscard.length === 0) {
        showError("Select excess card(s) to discard.");
        return;
      }
      if (sendLiveCommand("DISCARD_CARD", { discardCardIds: idsToDiscard })) {
        handleCancelSelection();
      }
      return;
    }

    if (!vm.selectedCard) return;

    if (vm.requiresExtraDiscard && discardCostIds.length < 1) {
      showError(`${vm.selectedCard.name}: Select 1 additional card in hand to discard.`);
      return;
    }

    if (!isMock) {
      if (vm.isActionLocked) {
        showError("Cards can only be played during Phase 2 of your turn.");
        return;
      }
      if (vm.selectedCard.border === "green") {
        if (sendLiveCommand("PLAY_CARD", { cardId: vm.selectedCard.id })) {
          handleCancelSelection();
        }
        return;
      }
      if (MANIPULATE_CARDS.has(vm.selectedCard.name)) {
        if (!selectedTargetId) {
          showError(`Select a target opponent for ${vm.selectedCard.name}.`);
          return;
        }
        const target = state.players.find((p) => p.id === selectedTargetId);
        if (!target || countInspectableCards(target) === 0) {
          showError(`${target?.name || "Target"} has no cards in any zone.`);
          return;
        }
        setCardPickerConfig({
          isOpen: true,
          targetPlayer: target,
          action:
            vm.selectedCard.name === "CAT BALOU" || vm.selectedCard.name === "CAN CAN"
              ? "destroy"
              : "steal",
          cardName: vm.selectedCard.name,
        });
        return;
      }
      if (
        (TARGETED_SINGLE_CARDS.has(vm.selectedCard.name) ||
          isBangCardForHeroes(vm.selectedCard, vm.effectiveSkillHeroes)) &&
        !selectedTargetId
      ) {
        showError(`Select a target opponent for ${vm.selectedCard.name}.`);
        return;
      }
      if (
        sendLiveCommand("PLAY_CARD", {
          cardId: vm.selectedCard.id,
          targetPlayerId: selectedTargetId || undefined,
          discardCardIds: discardCostIds.length > 0 ? discardCostIds : undefined,
        })
      ) {
        handleCancelSelection();
      }
      return;
    }

    if (MANIPULATE_CARDS.has(vm.selectedCard.name)) {
      if (!selectedTargetId) {
        showError(`Select a target opponent for ${vm.selectedCard.name}.`);
        return;
      }
      const target = state.players.find((p) => p.id === selectedTargetId);
      if (!target || countInspectableCards(target) === 0) {
        showError(`${target?.name || "Target"} has no cards in any zone.`);
        return;
      }
      setCardPickerConfig({
        isOpen: true,
        targetPlayer: target,
        action:
          vm.selectedCard.name === "CAT BALOU" || vm.selectedCard.name === "CAN CAN"
            ? "destroy"
            : "steal",
        cardName: vm.selectedCard.name,
      });
      triggerVfx("bullet", target.id);
      return;
    }

    if (playMockHandCard(vm.selectedCard, discardCostIds, selectedTargetId)) {
      handleCancelSelection();
    }
  }, [
    discardCostIds,
    handleCancelSelection,
    isMock,
    isWsConnected,
    phase3DiscardIds,
    playMockGreenCard,
    playMockHandCard,
    selectedTargetId,
    sendLiveCommand,
    setCardPickerConfig,
    showError,
    state.currentPhase,
    state.players,
    triggerVfx,
    vm.effectiveSkillHeroes,
    vm.isActionLocked,
    vm.isMyTurn,
    vm.isTurnLocked,
    vm.requiresExtraDiscard,
    vm.selectedCard,
    vm.selectedGreenCard,
  ]);

  const handleEndTurn = useCallback(() => {
    if (vm.isTurnLocked) {
      showError(
        isWsConnected
          ? "Match is paused. Actions are locked."
          : "Connection lost. Reconnecting..."
      );
      return;
    }
    if (!isMock && !vm.isMyTurn) return;

    if (!isMock) {
      if (sendLiveCommand("END_TURN", {})) {
        handleCancelSelection();
      }
      return;
    }
    endMockTurn();
    handleCancelSelection();
  }, [
    endMockTurn,
    handleCancelSelection,
    isMock,
    isWsConnected,
    sendLiveCommand,
    showError,
    vm.isMyTurn,
    vm.isTurnLocked,
  ]);

  const handleSelectTarget = useCallback(
    (id: string) => {
      if (vm.isActionLocked) return;
      if (vm.requiresExtraDiscard && discardCostIds.length < 1) {
        showError(
          `${vm.selectedCard?.name || "Card"}: Select 1 extra card in hand first.`
        );
        return;
      }
      setSelectedTargetId((prev) => (prev === id ? null : id));
    },
    [
      discardCostIds.length,
      setSelectedTargetId,
      showError,
      vm.isActionLocked,
      vm.requiresExtraDiscard,
      vm.selectedCard?.name,
    ]
  );

  const handleOpenRicochetEquip = useCallback(() => {
    if (
      !vm.selectedTargetPlayer ||
      countInPlayCards(vm.selectedTargetPlayer) === 0
    ) {
      return;
    }
    setCardPickerConfig({
      isOpen: true,
      targetPlayer: vm.selectedTargetPlayer,
      action: "destroy",
      cardName: "RICOCHET",
      allowHand: false,
    });
  }, [setCardPickerConfig, vm.selectedTargetPlayer]);

  return {
    handleConfirmSkill,
    handlePlayCard,
    handleEndTurn,
    handleSelectTarget,
    handleOpenRicochetEquip,
  };
}
