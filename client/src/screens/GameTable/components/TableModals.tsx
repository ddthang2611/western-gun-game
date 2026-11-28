import React from "react";
import { useI18n } from "../../../i18n";
import type {
  Character,
  GameOverInfo,
  GeneralStoreInfo,
  PendingReactionInfo,
  TableState,
} from "../../../types/game";
import {
  CardPickerModal,
  CharacterSelectModal,
  DefenseModal,
  GameOverModal,
  GeneralStoreModal,
  LuckyDukeModal,
  TurnPromptModal,
  type SelectedTargetCard,
} from "../../../components/game";
import type { CardPickerConfig, TableViewModel } from "../utils/tableSelectors";
import type { DevForcedModalType } from "../GameTableScreen";
import { Button, Modal } from "../../../components/ui";
import { CombatLogModal } from "./CombatLogModal";

export interface MockModalHandlers {
  resetMockWithHeroes: (heroes: Character[]) => void;
  resolveMockDrawCheck: (source: "BARREL" | "JOURDONNAIS") => void;
  resolveMockDefensePlayCard: (cardId: string) => void;
  resolveMockDefenseGreen: (greenId: string) => void;
  resolveMockDefenseTakeDamage: () => void;
  pickMockGeneralStoreCard: (cardId: string, store: GeneralStoreInfo) => void;
  confirmMockManipulationPicker: (
    targetId: string,
    chosen: SelectedTargetCard,
    isSteal: boolean,
    cardName: string,
    selectedCardId?: string,
    discardCostIds?: string[],
    sourceGreenCardId?: string
  ) => void;
}

export interface TableModalsProps {
  state: TableState;
  vm: TableViewModel;
  isMock: boolean;
  isWsConnected: boolean;
  discardCostIds: string[];
  effectiveCandidatePool: Character[];
  showCharSelectModal: boolean;
  setShowCharSelectModal: (open: boolean) => void;
  isCombatLogModalOpen: boolean;
  setIsCombatLogModalOpen: (open: boolean) => void;
  isDeleteMatchConfirmOpen?: boolean;
  onCancelDeleteMatch?: () => void;
  onConfirmDeleteMatch?: () => void;
  cardPickerConfig: CardPickerConfig;
  setCardPickerConfig: (cfg: CardPickerConfig) => void;
  forcedModal: DevForcedModalType;
  onCloseForcedModal?: () => void;
  mockScenarioReaction?: PendingReactionInfo | null;
  mockScenarioGeneralStore?: GeneralStoreInfo | null;
  mockScenarioGameOver?: GameOverInfo | null;
  onSendLiveCommand: (type: string, payload?: Record<string, unknown>) => boolean;
  onSendLobbyReset: () => void;
  onCancelSelection: () => void;
  onShowError: (message: string) => void;
  mockHandlers: MockModalHandlers;
}

// Coordinate all table modal dialogs
export const TableModals: React.FC<TableModalsProps> = ({
  state,
  vm,
  isMock,
  isWsConnected,
  discardCostIds,
  effectiveCandidatePool,
  showCharSelectModal,
  setShowCharSelectModal,
  isCombatLogModalOpen,
  setIsCombatLogModalOpen,
  isDeleteMatchConfirmOpen = false,
  onCancelDeleteMatch,
  onConfirmDeleteMatch,
  cardPickerConfig,
  setCardPickerConfig,
  forcedModal,
  onCloseForcedModal,
  mockScenarioReaction,
  mockScenarioGeneralStore,
  mockScenarioGameOver,
  onSendLiveCommand,
  onSendLobbyReset,
  onCancelSelection,
  onShowError,
  mockHandlers,
}) => {
  const { t } = useI18n();
  const {
    isTurnLocked,
    isArenaLocked,
    isStepAnimating,
    myPlayer,
    opponents,
    activeHand,
    effectiveSkillHeroes,
    activeGreenCards,
    myBlueCardsInPlay,
    selectedCard,
    selectedGreenCard,
  } = vm;

  const myCharSelect = state.pendingCharacterSelect;
  const isLiveCharSelectOpen =
    !isMock &&
    state.matchPhase === "CHARACTER_SELECT" &&
    Boolean(myCharSelect) &&
    !myCharSelect?.selectedCharacterIds?.length &&
    (myCharSelect?.candidates?.length ?? 0) > 0;
  const isCharSelectOpen =
    isLiveCharSelectOpen ||
    (isMock && (showCharSelectModal || forcedModal === "char_select"));

  // Wait for newly played/checked card in ACTIVE_CHAIN to land face-up in Card Arena before opening DefenseModal
  const isArenaSettling = state.arenaChain?.status === "SETTLING";
  const isDefenseOpen = !isMock
    ? Boolean(state.myPendingReaction) &&
      !state.pendingBrawlPick &&
      !state.pendingLuckyDukePick &&
      !state.pendingElGringoPick &&
      !isArenaSettling &&
      !isStepAnimating
    : forcedModal === "defense";
  const effectiveDefenseReaction = !isMock
    ? state.myPendingReaction
    : mockScenarioReaction;

  // Open store once card lands
  const isGeneralStoreOpen = !isMock
    ? Boolean(state.generalStore && state.generalStore.pool.length > 0) &&
      !isArenaSettling &&
      (!isStepAnimating || (state.generalStore?.currentPickerIndex ?? 0) > 0)
    : forcedModal === "general_store" && Boolean(mockScenarioGeneralStore);
  const effectiveGeneralStore = !isMock
    ? state.generalStore
    : mockScenarioGeneralStore;

  const isGameOverOpen = !isMock
    ? Boolean(state.gameOver) && !isArenaLocked
    : forcedModal === "game_over";
  const effectiveGameOver = !isMock ? state.gameOver : mockScenarioGameOver;

  const isCardPickerOpen =
    (cardPickerConfig.isOpen && Boolean(cardPickerConfig.targetPlayer)) ||
    (isMock && forcedModal === "card_picker" && Boolean(opponents[0]));

  const brawlPick = !isMock ? state.pendingBrawlPick : null;
  const brawlTargetPlayer =
    brawlPick && brawlPick.actorPlayerId === state.myPlayerId
      ? state.players.find((p) => p.id === brawlPick.currentTargetId)
      : undefined;
  const isBrawlPickerOpen =
    Boolean(brawlTargetPlayer) &&
    !isCardPickerOpen &&
    !isArenaSettling &&
    !isStepAnimating;

  const luckyDukePick = !isMock ? state.pendingLuckyDukePick : null;
  const isLuckyDukeOpen =
    Boolean(luckyDukePick && luckyDukePick.playerId === state.myPlayerId) &&
    !isCardPickerOpen &&
    !isBrawlPickerOpen &&
    !isArenaSettling &&
    !isStepAnimating;

  const elGringoPick = !isMock ? state.pendingElGringoPick : null;
  const elGringoAttacker =
    elGringoPick && elGringoPick.victimId === state.myPlayerId
      ? state.players.find((p) => p.id === elGringoPick.attackerId)
      : undefined;
  const isElGringoPickerOpen =
    Boolean(elGringoAttacker) &&
    !isCardPickerOpen &&
    !isBrawlPickerOpen &&
    !isLuckyDukeOpen &&
    !isArenaSettling &&
    !isStepAnimating;

  return (
    <>
      {isCharSelectOpen && (
        <CharacterSelectModal
          candidates={
            isLiveCharSelectOpen
              ? myCharSelect!.candidates
              : effectiveCandidatePool
          }
          dualMode={
            isLiveCharSelectOpen
              ? (myCharSelect!.requiredCount || 1) === 2
              : Boolean(state.dualCharacterMode)
          }
          hpRule={isLiveCharSelectOpen ? state.hpRule || "strict" : "strict"}
          isSheriff={isLiveCharSelectOpen ? Boolean(myPlayer?.isSheriff) : false}
          onCancel={
            isLiveCharSelectOpen
              ? undefined
              : () => {
                  setShowCharSelectModal(false);
                  onCloseForcedModal?.();
                }
          }
          onConfirm={(selectedHeroes) => {
            if (isLiveCharSelectOpen) {
              if (selectedHeroes.length > 0) {
                onSendLiveCommand("SELECT_CHARACTERS", {
                  characterIds: selectedHeroes.map((h) => h.id),
                });
              }
              return;
            }
            mockHandlers.resetMockWithHeroes(selectedHeroes);
            setShowCharSelectModal(false);
            onCloseForcedModal?.();
          }}
        />
      )}

      {!isMock && !isArenaLocked && (
        <TurnPromptModal
          turnStartChoice={state.pendingTurnStartChoice}
          phase1Choice={state.pendingPhase1Choice}
          players={state.players}
          myHand={activeHand}
          myPlayerId={state.myPlayerId}
          topDiscard={state.topDiscard}
          disabled={isTurnLocked || isArenaLocked}
          isPickerOpen={cardPickerConfig.isOpen}
          onResolveTurnStart={(payload) => {
            if (!isTurnLocked && !isArenaLocked) {
              onSendLiveCommand("RESOLVE_TURN_START", payload);
            }
          }}
          onResolvePhase1={(payload) => {
            if (!isTurnLocked && !isArenaLocked) {
              onSendLiveCommand("RESOLVE_PHASE_1", payload);
            }
          }}
          onOpenStealPicker={(mode, targetPlayer) => {
            setCardPickerConfig({
              isOpen: true,
              targetPlayer,
              action: "steal",
              cardName:
                mode === "JESSE_STEAL_AND_DECK" ? "JESSE JONES" : "PAT BRENNAN",
              allowHand: mode === "JESSE_STEAL_AND_DECK",
              allowInPlay: mode === "PAT_BRENNAN_STEAL",
              stealContext: { mode },
            });
          }}
        />
      )}

      {isDefenseOpen && effectiveDefenseReaction && (
        <DefenseModal
          reaction={effectiveDefenseReaction}
          myHand={activeHand}
          heroes={effectiveSkillHeroes}
          myGreenCards={activeGreenCards}
          myBlueCardsInPlay={myBlueCardsInPlay}
          myHp={vm.activeHp}
          disabled={isTurnLocked}
          onDrawCheck={(source) => {
            if (!isMock) {
              if (isTurnLocked) return;
              onSendLiveCommand("RESOLVE_REACTION", {
                checkSource: source,
                payload: { action: "BARREL_CHECK", checkSource: source },
              });
            } else {
              mockHandlers.resolveMockDrawCheck(source);
              onCloseForcedModal?.();
            }
          }}
          onPlayCard={(cardId) => {
            if (!isMock) {
              if (isTurnLocked) return;
              onSendLiveCommand("RESOLVE_REACTION", { cardId });
            } else {
              mockHandlers.resolveMockDefensePlayCard(cardId);
              onCloseForcedModal?.();
            }
          }}
          onUseGreenDefense={(greenId) => {
            if (!isMock) {
              if (isTurnLocked) return;
              onSendLiveCommand("RESOLVE_REACTION", {
                cardId: greenId,
                greenCardId: greenId,
                payload: { action: "USE_GREEN_DEFENSE", greenCardId: greenId },
              });
            } else {
              mockHandlers.resolveMockDefenseGreen(greenId);
              onCloseForcedModal?.();
            }
          }}
          onDiscardBlueEquip={(cardId) => {
            if (!isMock && !isTurnLocked) {
              onSendLiveCommand("RESOLVE_REACTION", { targetCardId: cardId });
            }
          }}
          onSidRescue={(discardIds) => {
            if (!isMock && !isTurnLocked) {
              onSendLiveCommand("RESOLVE_REACTION", {
                discardCardIds: discardIds,
              });
            }
          }}
          onTakeDamage={() => {
            if (!isMock) {
              if (isTurnLocked) return;
              onSendLiveCommand("RESOLVE_REACTION", {
                payload: { action: "TAKE_DAMAGE" },
              });
            } else {
              mockHandlers.resolveMockDefenseTakeDamage();
              onCloseForcedModal?.();
            }
          }}
        />
      )}

      {isGeneralStoreOpen && effectiveGeneralStore && (
        <GeneralStoreModal
          store={effectiveGeneralStore}
          myPlayerId={state.myPlayerId}
          players={state.players}
          disabled={isTurnLocked}
          onPickCard={(cardId) => {
            if (!isMock) {
              if (isTurnLocked) return;
              onSendLiveCommand("SELECT_STOLEN_CARD", { cardId });
            } else {
              mockHandlers.pickMockGeneralStoreCard(cardId, effectiveGeneralStore);
              onCloseForcedModal?.();
            }
          }}
        />
      )}

      {isGameOverOpen && effectiveGameOver && (
        <GameOverModal
          gameOver={effectiveGameOver}
          players={state.players}
          myRole={state.myRole}
          onReturnToLobby={() => {
            if (!isMock) {
              onSendLobbyReset();
            } else {
              onCloseForcedModal?.();
            }
          }}
        />
      )}

      {isCardPickerOpen && (
        <CardPickerModal
          targetPlayer={(cardPickerConfig.targetPlayer || opponents[0])!}
          action={cardPickerConfig.action}
          cardName={cardPickerConfig.cardName || "CAT BALOU"}
          allowHand={cardPickerConfig.allowHand ?? true}
          allowInPlay={cardPickerConfig.allowInPlay ?? true}
          onCancel={() => {
            if (!cardPickerConfig.stealContext) {
              onCancelSelection();
            }
            setCardPickerConfig({ isOpen: false, action: "destroy" });
            onCloseForcedModal?.();
          }}
          onConfirm={(chosen) => {
            if (!isMock && isTurnLocked) {
              onShowError(
                isWsConnected
                  ? "Match is paused. Actions are locked."
                  : "Connection lost. Reconnecting..."
              );
              return;
            }
            const target = (cardPickerConfig.targetPlayer || opponents[0])!;
            const stealCtx = cardPickerConfig.stealContext;
            if (stealCtx) {
              if (stealCtx.mode === "JESSE_STEAL_AND_DECK") {
                onSendLiveCommand("RESOLVE_PHASE_1", {
                  targetPlayerId: target.id,
                  payload: {
                    choice: "JESSE_STEAL_AND_DECK",
                    targetPlayerId: target.id,
                  },
                });
              } else if (stealCtx.mode === "PAT_BRENNAN_STEAL") {
                let targetArea: "EQUIPMENT" | "GREEN" | "JUDGEMENT" = "EQUIPMENT";
                let targetCardId = chosen.cardId;
                if (chosen.region === "green") {
                  targetArea = "GREEN";
                  const matchedGreen = (target.greenCards || []).find(
                    (g) => g.id === chosen.cardId
                  );
                  targetCardId = matchedGreen?.card.id || chosen.cardId;
                } else if (chosen.region === "judgement") {
                  targetArea = "JUDGEMENT";
                  const matchedJudge = (target.judgements || []).find(
                    (j) => j.id === chosen.cardId
                  );
                  targetCardId = matchedJudge?.card?.id || chosen.cardId;
                }
                onSendLiveCommand("RESOLVE_PHASE_1", {
                  targetPlayerId: target.id,
                  targetArea,
                  targetCardId,
                  payload: {
                    choice: "PAT_BRENNAN_STEAL",
                    targetPlayerId: target.id,
                    targetArea,
                    targetCardId,
                  },
                });
              }
              setCardPickerConfig({ isOpen: false, action: "destroy" });
              return;
            }

            const activeCard = selectedCard || selectedGreenCard?.card;
            if (!isMock && activeCard) {
              let targetArea: "HAND" | "EQUIPMENT" | "GREEN" | "JUDGEMENT" = "HAND";
              if (chosen.region === "equipment") targetArea = "EQUIPMENT";
              else if (chosen.region === "green") targetArea = "GREEN";
              else if (chosen.region === "judgement") targetArea = "JUDGEMENT";

              onSendLiveCommand(
                cardPickerConfig.sourceGreenCardId
                  ? "ACTIVATE_GREEN_CARD"
                  : "PLAY_CARD",
                {
                  cardId: activeCard.id,
                  greenCardId: cardPickerConfig.sourceGreenCardId,
                  targetPlayerId: target.id,
                  targetArea,
                  targetCardId: chosen.cardId,
                  discardCardIds:
                    discardCostIds.length > 0 ? discardCostIds : undefined,
                }
              );
            } else if (isMock) {
              const isSteal = cardPickerConfig.action === "steal";
              mockHandlers.confirmMockManipulationPicker(
                target.id,
                chosen,
                isSteal,
                cardPickerConfig.cardName || (isSteal ? "PANIC!" : "CAT BALOU"),
                selectedCard?.id,
                discardCostIds,
                cardPickerConfig.sourceGreenCardId
              );
            }
            onCancelSelection();
            setCardPickerConfig({ isOpen: false, action: "destroy" });
            onCloseForcedModal?.();
          }}
        />
      )}

      {isBrawlPickerOpen && brawlTargetPlayer && brawlPick && (
        <CardPickerModal
          key={`brawl-${brawlTargetPlayer.id}-${brawlPick.remainingCount}`}
          targetPlayer={brawlTargetPlayer}
          action="destroy"
          cardName={brawlPick.sourceCard?.name || "BRAWL"}
          allowHand={true}
          allowInPlay={true}
          onCancel={undefined}
          onConfirm={(chosen) => {
            if (isTurnLocked) {
              onShowError(
                isWsConnected
                  ? t("table.errors.paused")
                  : t("table.errors.reconnecting")
              );
              return;
            }
            let targetArea: "HAND" | "EQUIPMENT" | "GREEN" | "JUDGEMENT" = "HAND";
            if (chosen.region === "equipment") targetArea = "EQUIPMENT";
            else if (chosen.region === "green") targetArea = "GREEN";
            else if (chosen.region === "judgement") targetArea = "JUDGEMENT";

            onSendLiveCommand("SELECT_STOLEN_CARD", {
              targetPlayerId: brawlTargetPlayer.id,
              targetArea,
              targetCardId: chosen.cardId,
            });
          }}
        />
      )}

      {isLuckyDukeOpen && luckyDukePick && (
        <LuckyDukeModal
          pick={luckyDukePick}
          disabled={isTurnLocked}
          onPickCard={(cardId) => {
            if (isTurnLocked) {
              onShowError(
                isWsConnected
                  ? t("table.errors.paused")
                  : t("table.errors.reconnecting")
              );
              return;
            }
            onSendLiveCommand("SELECT_STOLEN_CARD", { cardId });
          }}
        />
      )}

      {isElGringoPickerOpen && elGringoAttacker && elGringoPick && (
        <CardPickerModal
          key={`el-gringo-${elGringoAttacker.id}-${elGringoPick.remainingSteals}`}
          targetPlayer={elGringoAttacker}
          action="steal"
          cardName="EL GRINGO"
          allowHand={true}
          allowInPlay={false}
          onCancel={undefined}
          onConfirm={() => {
            if (isTurnLocked) {
              onShowError(
                isWsConnected
                  ? t("table.errors.paused")
                  : t("table.errors.reconnecting")
              );
              return;
            }
            onSendLiveCommand("SELECT_STOLEN_CARD", {
              targetPlayerId: elGringoAttacker.id,
              targetArea: "HAND",
            });
          }}
        />
      )}

      <CombatLogModal
        isOpen={isCombatLogModalOpen || (isMock && forcedModal === "combat_log")}
        combatLog={state.combatLog}
        structuredCombatLog={state.structuredCombatLog}
        onClose={() => {
          setIsCombatLogModalOpen(false);
          onCloseForcedModal?.();
        }}
      />

      {!isMock && isDeleteMatchConfirmOpen && (
        <Modal isOpen={true} size="medium" onClose={onCancelDeleteMatch}>
          <Modal.Header
            title={t("lobby.deleteMatchTitle")}
            subtitle={t("table.hostMatchManagement")}
          />
          <Modal.Body>
            <p>{t("table.deleteMatchConfirmBody")}</p>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={onCancelDeleteMatch}>
              {t("common.cancel")}
            </Button>
            <Button variant="danger" onClick={onConfirmDeleteMatch}>
              {t("table.deleteMatch")}
            </Button>
          </Modal.Footer>
        </Modal>
      )}
    </>
  );
};
