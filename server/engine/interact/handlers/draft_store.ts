import { SimulationState, EnginePlayer } from "../../types/state";
import { EngineCard } from "../../types/cards";
import { CommandResult, DomainEvent } from "../../types/actions";
import { DeckManager } from "../../deck/deck_manager";
import { EventEngine } from "../../events/event_engine";
import { SkillHooks } from "../skill_hooks";
import { GeneralStoreDraftState } from "../interact_types";
import { AoePipeline } from "../pipeline/aoe_pipeline";
import { AtomicEffects } from "../primitives/atomic_effects";
import { ArenaChainManager } from "../../arena/arena_chain_manager";

export class DraftStore {
  // Open General Store draft session
  public static handleGeneralStore(
    state: SimulationState,
    player: EnginePlayer,
    card: EngineCard,
    cardIndex: number,
    deckManager?: DeckManager
  ): CommandResult {
    const blockReason = EventEngine.shouldBlockPlayCard(state, player, card);
    if (blockReason) {
      return { success: false, message: blockReason };
    }

    const resolvedIdx =
      cardIndex >= 0 &&
      cardIndex < player.handCards.length &&
      player.handCards[cardIndex].id === card.id
        ? cardIndex
        : player.handCards.findIndex((c) => c.id === card.id);
    if (resolvedIdx === -1) {
      return { success: false, message: "Card not in hand." };
    }

    const removed = player.handCards.splice(resolvedIdx, 1)[0];
    AtomicEffects.discardCard(state, removed, deckManager);

    ArenaChainManager.appendBatch(state, [
      {
        kind: "PLAYED_CARD",
        card: removed,
        actorPlayerId: player.id,
        actorPlayerName: player.name,
        originZone: "HAND",
        destinationZone: "DISCARD",
        actionLabel: removed.name,
      },
    ]);

    const suzyEvents: DomainEvent[] = [];
    SkillHooks.checkSuzyLafayette(state, player, suzyEvents);

    const res = AoePipeline.executeDraftStoreAoe(state, player, card, deckManager);
    return {
      success: res.success,
      message: res.message,
      events: [...suzyEvents, ...(res.events || [])],
    };
  }

  // Resolve draft selection for picker
  public static handleDraftSelect(
    state: SimulationState,
    player: EnginePlayer,
    selectedCardId: string,
    deckManager?: DeckManager
  ): CommandResult {
    if (player.isDead) {
      return { success: false, message: "Dead players cannot draft cards." };
    }

    const draftState: GeneralStoreDraftState | undefined = state.activeChain?.[0];
    if (!draftState || !Array.isArray(draftState.storePool)) {
      return { success: false, message: "No active General Store draft session." };
    }

    const currentExpectedPlayerId =
      draftState.draftOrder[draftState.currentPickerIndex];
    if (player.id !== currentExpectedPlayerId) {
      return {
        success: false,
        message: "It is not your turn to pick from the General Store.",
      };
    }

    const cardIdx = draftState.storePool.findIndex((c) => c.id === selectedCardId);
    if (cardIdx === -1) {
      return {
        success: false,
        message: "Selected card is not in the General Store pool.",
      };
    }

    const chosenCard = draftState.storePool.splice(cardIdx, 1)[0];
    player.handCards.push(chosenCard);

    draftState.currentPickerIndex += 1;
    while (draftState.currentPickerIndex < draftState.draftOrder.length) {
      const candidate = state.players.get(draftState.draftOrder[draftState.currentPickerIndex]);
      if (candidate && !candidate.isDead) break;
      draftState.currentPickerIndex += 1;
    }
    const isCompleted =
      draftState.currentPickerIndex >= draftState.draftOrder.length ||
      draftState.storePool.length === 0;

    const events: DomainEvent[] = [
      {
        type: "GENERAL_STORE_CARD_PICKED",
        payload: {
          playerId: player.id,
          playerName: player.name,
          card: chosenCard,
          remainingPoolCount: draftState.storePool.length,
          nextPickerId: isCompleted
            ? null
            : draftState.draftOrder[draftState.currentPickerIndex],
        },
        timestamp: Date.now(),
      },
    ];

    if (isCompleted) {
      if (draftState.storePool.length > 0) {
        AtomicEffects.discardCards(state, draftState.storePool.splice(0), deckManager);
      }
      state.activeChain = [];
      events.push({
        type: "GENERAL_STORE_COMPLETED",
        payload: { originPlayerId: draftState.originPlayerId },
        timestamp: Date.now(),
      });
    }

    return { success: true, events };
  }
}
