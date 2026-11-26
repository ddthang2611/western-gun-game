import { useCallback } from "react";
import type { Card, GreenCard, TableState } from "../../../types/game";
import { useI18n } from "../../../i18n";
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
  triggerVfx: (
    type: VfxBeam["type"],
    targetId?: string,
    aoeHeal?: boolean,
    sourceId?: string
  ) => void;
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
  const { t } = useI18n();

  const handleConfirmSkill = useCallback(() => {
    if (vm.isTurnLocked) {
      showError(
        isWsConnected ? t("table.errors.paused") : t("table.errors.reconnecting")
      );
      return;
    }
    if (vm.isArenaLocked) {
      showError(t("table.errors.arenaBusy"));
      return;
    }
    if (vm.isActionLocked && skillMode !== "SID_KETCHUM_HEAL") {
      showError(t("table.errors.phase2SkillsOnly"));
      return;
    }
    if (skillMode === "SID_KETCHUM_HEAL" && vm.hasBlockingPrompt) {
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
        showError(t("table.errors.selectBlueJose"));
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
        showError(t("table.errors.select2Sid"));
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
        showError(t("table.errors.select2Doc"));
        return;
      }
      if (!selectedTargetId) {
        showError(t("table.errors.selectTargetShoot"));
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
    t,
    vm.activeHand,
    vm.isActionLocked,
    vm.isArenaLocked,
    vm.isTurnLocked,
  ]);

  const handlePlayCard = useCallback(() => {
    if (vm.isTurnLocked) {
      showError(
        isWsConnected ? t("table.errors.paused") : t("table.errors.reconnecting")
      );
      return;
    }
    if (vm.isArenaLocked) {
      showError(t("table.errors.arenaBusy"));
      return;
    }

    if (vm.selectedGreenCard) {
      if (vm.isActionLocked) {
        showError(t("table.errors.phase2GreenOnly"));
        return;
      }
      if (vm.selectedGreenCard.isDelay) {
        showError(
          t("table.errors.greenPending", { card: vm.selectedGreenCard.card.name })
        );
        return;
      }
      const gName = vm.selectedGreenCard.card.name;
      if (gName === "CAN CAN" || gName === "CONESTOGA") {
        if (!selectedTargetId) {
          showError(t("table.errors.selectTargetCard", { card: gName }));
          return;
        }
        const target = state.players.find((p) => p.id === selectedTargetId);
        if (!target || countInspectableCards(target) === 0) {
          showError(
            t("table.errors.targetNoStealCards", {
              target: target?.name || t("common.unknown"),
            })
          );
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
        showError(t("table.errors.selectTargetCard", { card: gName }));
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
        showError(t("table.errors.selectExcessDiscard"));
        return;
      }
      if (sendLiveCommand("DISCARD_CARD", { discardCardIds: idsToDiscard })) {
        handleCancelSelection();
      }
      return;
    }

    if (!vm.selectedCard) return;

    if (vm.requiresExtraDiscard && discardCostIds.length < 1) {
      showError(t("table.errors.selectExtraCostFirst", { card: vm.selectedCard.name }));
      return;
    }

    if (!isMock) {
      if (vm.isActionLocked) {
        showError(t("table.errors.phase2CardsOnly"));
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
          showError(t("table.errors.selectTargetCard", { card: vm.selectedCard.name }));
          return;
        }
        const target = state.players.find((p) => p.id === selectedTargetId);
        if (!target || countInspectableCards(target) === 0) {
          showError(
            t("table.errors.targetNoCards", {
              target: target?.name || t("common.unknown"),
            })
          );
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
        showError(t("table.errors.selectTargetCard", { card: vm.selectedCard.name }));
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
        showError(t("table.errors.selectTargetCard", { card: vm.selectedCard.name }));
        return;
      }
      const target = state.players.find((p) => p.id === selectedTargetId);
      if (!target || countInspectableCards(target) === 0) {
        showError(
          t("table.errors.targetNoCards", {
            target: target?.name || t("common.unknown"),
          })
        );
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
      triggerVfx("bullet", target.id, false, state.myPlayerId);
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
    state.myPlayerId,
    state.players,
    t,
    triggerVfx,
    vm.effectiveSkillHeroes,
    vm.isActionLocked,
    vm.isArenaLocked,
    vm.isMyTurn,
    vm.isTurnLocked,
    vm.requiresExtraDiscard,
    vm.selectedCard,
    vm.selectedGreenCard,
  ]);

  const handleEndTurn = useCallback(() => {
    if (vm.isTurnLocked) {
      showError(
        isWsConnected ? t("table.errors.paused") : t("table.errors.reconnecting")
      );
      return;
    }
    if (vm.isArenaLocked) {
      showError(t("table.errors.arenaBusy"));
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
    t,
    vm.isArenaLocked,
    vm.isMyTurn,
    vm.isTurnLocked,
  ]);

  const handleSelectTarget = useCallback(
    (id: string) => {
      if (vm.isActionLocked || vm.isArenaLocked) return;
      if (vm.requiresExtraDiscard && discardCostIds.length < 1) {
        showError(
          t("table.errors.selectExtraCostFirst", {
            card: vm.selectedCard?.name || t("common.unknown"),
          })
        );
        return;
      }
      setSelectedTargetId((prev) => (prev === id ? null : id));
    },
    [
      discardCostIds.length,
      setSelectedTargetId,
      showError,
      t,
      vm.isActionLocked,
      vm.isArenaLocked,
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
