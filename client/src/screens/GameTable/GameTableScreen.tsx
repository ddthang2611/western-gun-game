import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { useI18n } from "../../i18n";
import type {
  Card,
  Character,
  GameOverInfo,
  GeneralStoreInfo,
  PendingReactionInfo,
} from "../../types/game";
import { InFlightChain } from "../../components/game";
import { initialMockState, mockCandidateHeroes } from "@data/mock/mockGameTable";
import { TableTopBar } from "./components/TableTopBar";
import { OpponentRing } from "./components/OpponentRing";
import { TableSidebar } from "./components/TableSidebar";
import { TableActionBar } from "./components/TableActionBar";
import { PlayerConsole } from "./components/PlayerConsole/PlayerConsole";
import { CardFlightLayer } from "./components/CardFlightLayer";
import { TargetingArrow } from "./components/TargetingArrow";
import { VfxLayer } from "./components/VfxLayer";
import { TableModals } from "./components/TableModals";
import { useTableUi } from "./hooks/useTableUi";
import { useTableAnimations } from "./hooks/useTableAnimations";
import { useLiveTableSession } from "./hooks/useLiveTableSession";
import { useMockTableSimulation } from "./hooks/useMockTableSimulation";
import { useTableSelection } from "./hooks/useTableSelection";
import { useTableActions } from "./hooks/useTableActions";
import {
  dispatchGameEventChoreography,
  type GameEventMessage,
} from "./utils/gameEventChoreography";
import {
  computeTableViewModel,
  deriveBaseTableContext,
} from "./utils/tableSelectors";
import "./GameTableScreen.scss";

export type DevForcedModalType =
  | "char_select"
  | "defense"
  | "card_picker"
  | "general_store"
  | "game_over"
  | "combat_log"
  | null;

export interface GameTableScreenProps {
  onBackToLobby?: () => void;
  onKicked?: (reason: string) => void;
  isMock?: boolean;
  externalHeroes?: Character[];
  candidateHeroesOverride?: Character[];
  forcedModal?: DevForcedModalType;
  onCloseForcedModal?: () => void;
  mockScenarioReaction?: PendingReactionInfo | null;
  mockScenarioGeneralStore?: GeneralStoreInfo | null;
  mockScenarioGameOver?: GameOverInfo | null;
}

export const GameTableScreen: React.FC<GameTableScreenProps> = ({
  onBackToLobby,
  onKicked,
  isMock = true,
  externalHeroes,
  candidateHeroesOverride,
  forcedModal = null,
  onCloseForcedModal,
  mockScenarioReaction,
  mockScenarioGeneralStore,
  mockScenarioGameOver,
}) => {
  const { t } = useI18n();
  const ui = useTableUi();
  const reconcileHandRef = useRef<(hand: Card[]) => void>(() => undefined);
  const newHandCardsRef = useRef<(cardIds: string[]) => void>(() => undefined);
  const gameEventRef = useRef<(event: GameEventMessage) => void>(() => undefined);
  const matchResetRef = useRef<() => void>(() => undefined);

  const handleHandReconcile = useCallback((hand: Card[]) => {
    reconcileHandRef.current(hand);
  }, []);

  const handleNewHandCards = useCallback((cardIds: string[]) => {
    newHandCardsRef.current(cardIds);
  }, []);

  const handleGameEvent = useCallback((event: GameEventMessage) => {
    gameEventRef.current(event);
  }, []);

  const handleMatchReset = useCallback(() => {
    matchResetRef.current();
  }, []);

  const liveSession = useLiveTableSession({
    enabled: !isMock,
    onHandReconcile: handleHandReconcile,
    onNewHandCards: handleNewHandCards,
    onGameEvent: handleGameEvent,
    onMatchReset: handleMatchReset,
    onBackToLobby,
    onKicked,
    showError: ui.showError,
  });

  const mockSession = useMockTableSimulation({
    externalHeroes,
    showError: ui.showError,
  });

  const session = isMock ? mockSession : liveSession;
  const { state } = session;
  const isWsConnected = isMock ? true : liveSession.isWsConnected;

  const animations = useTableAnimations(state.myPlayerId, state.arenaChain);

  useEffect(() => {
    newHandCardsRef.current = animations.concealHandCards;
  }, [animations.concealHandCards]);

  useEffect(() => {
    gameEventRef.current = (event) => {
      dispatchGameEventChoreography(event, {
        getMyPlayerId: liveSession.getMyPlayerId,
        getPlayers: liveSession.getPlayers,
        triggerVfx: animations.triggerVfx,
        enqueueFlight: animations.enqueueFlight,
        scheduleTimeout: animations.scheduleTimeout,
      });
    };
  }, [animations, liveSession]);

  const baseCtx = useMemo(
    () =>
      deriveBaseTableContext({
        state,
        isMock,
        isWsConnected,
        myHand: session.myHand,
        myHeroes: session.myHeroes,
        myHp: session.myHp,
        isArenaBlockingActions: animations.isArenaBlockingActions,
      }),
    [
      animations.isArenaBlockingActions,
      isMock,
      isWsConnected,
      session.myHand,
      session.myHeroes,
      session.myHp,
      state,
    ]
  );

  const selection = useTableSelection({
    isMock,
    isMyTurn: baseCtx.isMyTurn,
    isTurnLocked: baseCtx.isTurnLocked,
    isArenaLocked: baseCtx.isArenaLocked,
    isActionLocked: baseCtx.isActionLocked,
    hasBlockingPrompt: baseCtx.hasBlockingPrompt,
    isWsConnected,
    currentPhase: state.currentPhase,
    activeHand: baseCtx.activeHand,
    activeHp: baseCtx.activeHp,
    activeMaxHp: isMock ? session.myMaxHp : baseCtx.myPlayer?.maxHp ?? session.myMaxHp,
    effectiveSkillHeroes: baseCtx.effectiveSkillHeroes,
    isSniperActive: state.activeEvent?.effectCode === "EVENT_FOC_SNIPER",
    showError: ui.showError,
  });

  useEffect(() => {
    reconcileHandRef.current = selection.reconcileHandSelection;
  }, [selection.reconcileHandSelection]);

  const { resetAnimations } = animations;
  const { handleCancelSelection } = selection;
  const { resetUi } = ui;

  useEffect(() => {
    matchResetRef.current = () => {
      resetAnimations();
      handleCancelSelection();
      resetUi();
    };
  }, [resetAnimations, handleCancelSelection, resetUi]);

  const vm = useMemo(
    () =>
      computeTableViewModel({
        state,
        isMock,
        isWsConnected,
        myHand: session.myHand,
        myHeroes: session.myHeroes,
        myHp: session.myHp,
        myMaxHp: session.myMaxHp,
        myEquipments: session.myEquipments,
        myGreenCards: session.myGreenCards,
        myJudgements: session.myJudgements,
        selectedHandCardId: selection.selectedHandCardId,
        selectedGreenCardId: selection.selectedGreenCardId,
        selectedTargetId: selection.selectedTargetId,
        discardCostIds: selection.discardCostIds,
        phase3DiscardIds: selection.phase3DiscardIds,
        skillMode: selection.skillMode,
        skillDiscardIds: selection.skillDiscardIds,
        visibleArenaCards: animations.visibleArenaCards,
        isArenaBlockingActions: animations.isArenaBlockingActions,
        isStepAnimating: animations.isStepAnimating,
        concealedInPlayCardIds: animations.concealedInPlayCardIds,
        t,
      }),
    [
      animations.concealedInPlayCardIds,
      animations.isArenaBlockingActions,
      animations.isStepAnimating,
      animations.visibleArenaCards,
      isMock,
      isWsConnected,
      selection,
      session,
      state,
      t,
    ]
  );

  const actions = useTableActions({
    isMock,
    isWsConnected,
    state,
    vm,
    selectedTargetId: selection.selectedTargetId,
    setSelectedTargetId: selection.setSelectedTargetId,
    discardCostIds: selection.discardCostIds,
    phase3DiscardIds: selection.phase3DiscardIds,
    skillMode: selection.skillMode,
    skillDiscardIds: selection.skillDiscardIds,
    sendLiveCommand: liveSession.sendLiveCommand,
    confirmMockSkill: mockSession.confirmMockSkill,
    playMockGreenCard: mockSession.playMockGreenCard,
    playMockHandCard: mockSession.playMockHandCard,
    endMockTurn: mockSession.endMockTurn,
    handleCancelSelection: selection.handleCancelSelection,
    clearSkillState: selection.clearSkillState,
    setCardPickerConfig: ui.setCardPickerConfig,
    triggerVfx: animations.triggerVfx,
    showError: ui.showError,
  });

  const myCharSelect = state.pendingCharacterSelect;
  const isWaitingOtherCharSelect =
    !isMock &&
    state.matchPhase === "CHARACTER_SELECT" &&
    Boolean(myCharSelect?.selectedCharacterIds?.length || !(myCharSelect?.candidates?.length ?? 0));
  const otherBrawlPick =
    !isMock &&
    state.pendingBrawlPick &&
    state.pendingBrawlPick.actorPlayerId !== state.myPlayerId
      ? state.pendingBrawlPick
      : null;
  const otherLuckyDukePick =
    !isMock &&
    state.pendingLuckyDukePick &&
    state.pendingLuckyDukePick.playerId !== state.myPlayerId
      ? state.pendingLuckyDukePick
      : null;
  const otherElGringoPick =
    !isMock &&
    state.pendingElGringoPick &&
    state.pendingElGringoPick.victimId !== state.myPlayerId
      ? state.pendingElGringoPick
      : null;

  return (
    <div className="game-table">
      {ui.errorNotice && (
        <div className="game-table__error-toast" role="alert">
          {ui.errorNotice}
        </div>
      )}

      {!isMock &&
        (!isWsConnected ||
          state.matchPaused ||
          isWaitingOtherCharSelect ||
          Boolean(otherBrawlPick) ||
          Boolean(otherLuckyDukePick) ||
          Boolean(otherElGringoPick)) && (
          <div className="game-table__status-banner" role="status">
            {!isWsConnected
              ? t("table.reconnectingBanner")
              : state.matchPaused
              ? t("table.pausedBanner")
              : isWaitingOtherCharSelect
              ? t("table.waitingCharsBanner", {
                  submitted: myCharSelect?.submittedPlayerIds?.length ?? 0,
                  total: myCharSelect?.totalPlayers ?? state.players.length,
                })
              : otherLuckyDukePick
              ? t("table.waitingLuckyDukeBanner", {
                  actor:
                    otherLuckyDukePick.playerName ||
                    state.players.find((p) => p.id === otherLuckyDukePick.playerId)?.name ||
                    t("common.unknown"),
                  reason: t(
                    `modals.luckyDuke.reason.${otherLuckyDukePick.reason}`,
                    undefined,
                    otherLuckyDukePick.reason
                  ),
                })
              : otherElGringoPick
              ? t("table.waitingElGringoBanner", {
                  victim:
                    otherElGringoPick.victimName ||
                    state.players.find((p) => p.id === otherElGringoPick.victimId)?.name ||
                    t("common.unknown"),
                  attacker:
                    otherElGringoPick.attackerName ||
                    state.players.find((p) => p.id === otherElGringoPick.attackerId)?.name ||
                    t("common.unknown"),
                })
              : t("table.waitingBrawlBanner", {
                  actor:
                    otherBrawlPick?.actorPlayerName ||
                    state.players.find((p) => p.id === otherBrawlPick?.actorPlayerId)?.name ||
                    t("common.unknown"),
                  target:
                    otherBrawlPick?.currentTargetName ||
                    state.players.find((p) => p.id === otherBrawlPick?.currentTargetId)?.name ||
                    t("common.unknown"),
                  remaining: otherBrawlPick?.remainingCount ?? 1,
                })}
          </div>
        )}

      <VfxLayer beams={animations.vfxBeams} />
      <TargetingArrow
        targetPlayerId={selection.selectedTargetId}
        hasSourceSelection={Boolean(vm.selectedCard || vm.selectedGreenCard)}
        isSkillOrigin={selection.skillMode === "DOC_HOLYDAY_BANG"}
      />
      <CardFlightLayer flights={animations.flyingCards} />

      <TableTopBar
        roomId={state.roomId}
        hostInfo={state.hostInfo}
        hostName={state.hostName}
        currentPhase={state.currentPhase}
        isMock={isMock}
        isHost={Boolean(state.isHost)}
        roundNumber={state.roundNumber}
        isMyTurn={vm.isMyTurn}
        activePlayerName={vm.activePlayerName}
        activeEvent={state.activeEvent}
        onOpenCharSelect={() => ui.setShowCharSelectModal(true)}
        onDeleteMatch={() => ui.setIsDeleteMatchConfirmOpen(true)}
        onBackToLobby={() => onBackToLobby?.()}
      />

      <main className="game-table__main">
        <div className="game-table__arena">
          <OpponentRing
            opponents={vm.opponents}
            activePlayerId={state.activePlayerId}
            selectedCard={vm.selectedCard}
            selectedGreenCard={vm.selectedGreenCard}
            forcedTargetMode={vm.forcedTargetMode}
            ricochetActive={vm.isRicochetActive}
            selectedTargetId={selection.selectedTargetId}
            weaponRange={vm.activeEquipments.weapon?.range || 1}
            canTarget={!vm.isActionLocked && (!vm.requiresExtraDiscard || selection.discardCostIds.length >= 1)}
            disabled={vm.isTurnLocked || vm.isArenaLocked}
            concealedInPlayCardIds={animations.concealedInPlayCardIds}
            onSelectTarget={actions.handleSelectTarget}
            centerNode={
              <InFlightChain
                cards={vm.displayInFlightCards}
                isExiting={animations.isArenaExiting}
              />
            }
          />
        </div>
        <TableSidebar
          myRole={state.myRole}
          roleCounts={state.roleCounts}
          combatLog={state.combatLog}
          structuredCombatLog={state.structuredCombatLog}
          deckCount={state.deckCount}
          discardCount={state.discardCount}
          topDiscard={state.topDiscard || (isMock ? initialMockState.topDiscard : undefined)}
          onOpenCombatLog={() => ui.setIsCombatLogModalOpen(true)}
        />
      </main>

      <TableActionBar
        myJudgements={vm.activeJudgements}
        heroes={vm.effectiveSkillHeroes}
        myHp={vm.activeHp}
        myMaxHp={vm.activeMaxHp}
        selectedCard={vm.selectedCard}
        selectedGreenCard={vm.selectedGreenCard}
        selectedTargetId={selection.selectedTargetId}
        isMock={isMock}
        currentPhase={state.currentPhase}
        isMyTurn={vm.isMyTurn}
        isLocked={vm.isTurnLocked}
        isArenaLocked={vm.isArenaLocked}
        hasBlockingPrompt={vm.hasBlockingPrompt}
        excessCardsCount={vm.excessCardsCount}
        phase3DiscardCount={selection.phase3DiscardIds.length}
        activeSkillHint={vm.activeSkillHint}
        canConfirmSelection={vm.canConfirmAction}
        isSkillMode={vm.isSkillMode}
        canConfirmSkill={vm.canConfirmSkill}
        canRicochetEquip={vm.canRicochetEquip}
        onPlayCard={actions.handlePlayCard}
        onRicochetEquip={actions.handleOpenRicochetEquip}
        onConfirmSkill={actions.handleConfirmSkill}
        onCancel={selection.handleCancelSelection}
        onEndTurn={actions.handleEndTurn}
        onTriggerSkill={selection.handleTriggerSkill}
      />

      <PlayerConsole
        equipments={vm.activeEquipments}
        hand={vm.activeHand}
        greenCards={vm.activeGreenCards}
        heroes={vm.activeHeroes}
        myHp={vm.activeHp}
        myMaxHp={vm.activeMaxHp}
        selectedCardId={selection.selectedHandCardId}
        selectedCardIds={
          !isMock && state.currentPhase === 3 && !vm.isSkillMode
            ? selection.phase3DiscardIds
            : selection.skillDiscardIds
        }
        discardCardIds={selection.discardCostIds}
        concealedCardIds={animations.concealedHandCardIds}
        concealedInPlayCardIds={animations.concealedInPlayCardIds}
        selectedGreenCardId={selection.selectedGreenCardId}
        isCurrentTurn={vm.isMyTurn && state.matchPhase !== "CHARACTER_SELECT"}
        isLocked={vm.isTurnLocked || vm.isArenaLocked}
        onSelectCard={selection.handleSelectHandCard}
        onTriggerGreenCard={selection.handleTriggerGreenCard}
      />

      <TableModals
        state={state}
        vm={vm}
        isMock={isMock}
        isWsConnected={isWsConnected}
        discardCostIds={selection.discardCostIds}
        effectiveCandidatePool={candidateHeroesOverride || mockCandidateHeroes}
        showCharSelectModal={ui.showCharSelectModal}
        setShowCharSelectModal={ui.setShowCharSelectModal}
        isCombatLogModalOpen={ui.isCombatLogModalOpen}
        setIsCombatLogModalOpen={ui.setIsCombatLogModalOpen}
        isDeleteMatchConfirmOpen={ui.isDeleteMatchConfirmOpen}
        onCancelDeleteMatch={() => ui.setIsDeleteMatchConfirmOpen(false)}
        onConfirmDeleteMatch={() => {
          ui.setIsDeleteMatchConfirmOpen(false);
          liveSession.sendDeleteMatch();
        }}
        cardPickerConfig={ui.cardPickerConfig}
        setCardPickerConfig={ui.setCardPickerConfig}
        forcedModal={forcedModal}
        onCloseForcedModal={onCloseForcedModal}
        mockScenarioReaction={mockScenarioReaction}
        mockScenarioGeneralStore={mockScenarioGeneralStore}
        mockScenarioGameOver={mockScenarioGameOver}
        onSendLiveCommand={liveSession.sendLiveCommand}
        onSendLobbyReset={liveSession.sendLobbyReset}
        onCancelSelection={selection.handleCancelSelection}
        onShowError={ui.showError}
        mockHandlers={mockSession}
      />
    </div>
  );
};
