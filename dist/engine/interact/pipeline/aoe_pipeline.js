"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AoePipeline = void 0;
const clockwise_traversal_1 = require("../primitives/clockwise_traversal");
const atomic_effects_1 = require("../primitives/atomic_effects");
class AoePipeline {
    // Execute instant effect across scope
    static executeInstantAoe(state, originPlayer, sourceCard, scope, effectFn) {
        const targets = clockwise_traversal_1.ClockwiseTraversal.getTraversalList(state, originPlayer.id, scope);
        const events = [];
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
    static executeReactionAoe(state, originPlayer, sourceCard, scope, configFn) {
        const targets = clockwise_traversal_1.ClockwiseTraversal.getTraversalList(state, originPlayer.id, scope);
        const events = [];
        const affectedPlayerIds = [];
        targets.forEach((target) => {
            const config = configFn(target);
            const res = atomic_effects_1.AtomicEffects.createReaction(state, target, originPlayer, sourceCard, config);
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
    static executeDraftStoreAoe(state, originPlayer, sourceCard, deckManager) {
        const targets = clockwise_traversal_1.ClockwiseTraversal.getTraversalList(state, originPlayer.id, "ALL_PLAYERS");
        const draftOrder = targets.map((t) => t.id);
        const { cards: drawnCards, events: drawEvents } = atomic_effects_1.AtomicEffects.drawCards(state, targets.length, deckManager);
        const events = [...drawEvents];
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
        const draftState = {
            type: "GENERAL_STORE_DRAFT",
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
exports.AoePipeline = AoePipeline;
