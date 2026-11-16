import { SimulationState, EnginePlayer } from "../../types/state";
import { EngineCard } from "../../types/cards";
import { CommandResult, DomainEvent } from "../../types/actions";
import { DeckManager } from "../../deck/deck_manager";
import { ClockwiseTraversal } from "../primitives/clockwise_traversal";
import { AtomicEffects } from "../primitives/atomic_effects";
import { AoeScope, ReactionConfig, GeneralStoreDraftState } from "../interact_types";

export class AoePipeline {
  // Execute instant effect across scope
  public static executeInstantAoe(
    state: SimulationState,
    originPlayer: EnginePlayer,
    sourceCard: EngineCard,
    scope: AoeScope,
    effectFn: (target: EnginePlayer, index: number) => DomainEvent[]
  ): CommandResult {
    const targets = ClockwiseTraversal.getTraversalList(state, originPlayer.id, scope);
    const events: DomainEvent[] = [];

    targets.forEach((target, index) => {
      const stepEvents = effectFn(target, index);
      events.push(...stepEvents);
    });

    events.push({
      type: "INSTANT_AOE_RESOLVED",
      payload: {
        sourcePlayerId: originPlayer.id,
        sourcePlayerName: originPlayer.name,
        sourceCard,
        scope,
        affectedCount: targets.length,
      },
      timestamp: Date.now(),
    });

    return { success: true, events };
  }

  // Launch reaction AOE across scope
  public static executeReactionAoe(
    state: SimulationState,
    originPlayer: EnginePlayer,
    sourceCard: EngineCard,
    scope: AoeScope,
    configFn: (target: EnginePlayer) => ReactionConfig
  ): CommandResult {
    const targets = ClockwiseTraversal.getTraversalList(state, originPlayer.id, scope);
    const events: DomainEvent[] = [];
    const affectedPlayerIds: string[] = [];

    targets.forEach((target) => {
      const config = configFn(target);
      const res = AtomicEffects.createReaction(
        state,
        target,
        originPlayer,
        sourceCard,
        config
      );
      events.push(...res.events);

      if (!res.isImmune && res.reaction) {
        affectedPlayerIds.push(target.id);
      }
    });

    events.push({
      type: "REACTION_AOE_LAUNCHED",
      payload: {
        sourcePlayerId: originPlayer.id,
        sourcePlayerName: originPlayer.name,
        sourceCard,
        scope,
        affectedPlayerIds,
      },
      timestamp: Date.now(),
    });

    return { success: true, events };
  }

  // Launch General Store draft pool
  public static executeDraftStoreAoe(
    state: SimulationState,
    originPlayer: EnginePlayer,
    sourceCard: EngineCard,
    deckManager?: DeckManager
  ): CommandResult {
    const targets = ClockwiseTraversal.getTraversalList(
      state,
      originPlayer.id,
      "ALL_PLAYERS"
    );
    const draftOrder = targets.map((t) => t.id);

    const { cards: drawnCards, events: drawEvents } = AtomicEffects.drawCards(
      state,
      targets.length,
      deckManager
    );
    const events: DomainEvent[] = [...drawEvents];

    if (drawnCards.length === 0 || draftOrder.length === 0) {
      state.activeChain = [];
      events.push({
        type: "GENERAL_STORE_OPENED",
        payload: {
          originPlayerId: originPlayer.id,
          originPlayerName: originPlayer.name,
          sourceCard,
          pool: [],
          draftOrder: [],
          currentPickerId: null,
        },
        timestamp: Date.now(),
      });
      events.push({
        type: "GENERAL_STORE_COMPLETED",
        payload: { originPlayerId: originPlayer.id },
        timestamp: Date.now(),
      });
      return { success: true, events };
    }

    const effectiveOrder = draftOrder.slice(0, drawnCards.length);
    const draftState: GeneralStoreDraftState = {
      originPlayerId: originPlayer.id,
      storePool: drawnCards,
      draftOrder: effectiveOrder,
      currentPickerIndex: 0,
    };

    state.activeChain = [draftState];

    events.push({
      type: "GENERAL_STORE_OPENED",
      payload: {
        originPlayerId: originPlayer.id,
        originPlayerName: originPlayer.name,
        sourceCard,
        pool: drawnCards,
        draftOrder: effectiveOrder,
        currentPickerId: effectiveOrder[0],
      },
      timestamp: Date.now(),
    });

    return { success: true, events };
  }
}
