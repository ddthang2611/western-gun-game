"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DraftStore = void 0;
const event_engine_1 = require("../../events/event_engine");
const skill_hooks_1 = require("../skill_hooks");
const aoe_pipeline_1 = require("../pipeline/aoe_pipeline");
const atomic_effects_1 = require("../primitives/atomic_effects");
class DraftStore {
    // Open General Store draft session
    static handleGeneralStore(state, player, card, cardIndex, deckManager) {
        const blockReason = event_engine_1.EventEngine.shouldBlockPlayCard(state, player, card);
        if (blockReason) {
            return { success: false, message: blockReason };
        }
        const resolvedIdx = cardIndex >= 0 &&
            cardIndex < player.handCards.length &&
            player.handCards[cardIndex].id === card.id
            ? cardIndex
            : player.handCards.findIndex((c) => c.id === card.id);
        if (resolvedIdx === -1) {
            return { success: false, message: "Card not in hand." };
        }
        const removed = player.handCards.splice(resolvedIdx, 1)[0];
        atomic_effects_1.AtomicEffects.discardCard(state, removed, deckManager);
        const suzyEvents = [];
        skill_hooks_1.SkillHooks.checkSuzyLafayette(state, player, suzyEvents);
        const res = aoe_pipeline_1.AoePipeline.executeDraftStoreAoe(state, player, card, deckManager);
        return {
            success: res.success,
            message: res.message,
            events: [...suzyEvents, ...(res.events || [])],
        };
    }
    // Resolve draft selection for picker
    static handleDraftSelect(state, player, selectedCardId, deckManager) {
        if (player.isDead) {
            return { success: false, message: "Dead players cannot draft cards." };
        }
        const draftState = state.activeChain?.[0];
        if (!draftState || !Array.isArray(draftState.storePool)) {
            return { success: false, message: "No active General Store draft session." };
        }
        const currentExpectedPlayerId = draftState.draftOrder[draftState.currentPickerIndex];
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
            if (candidate && !candidate.isDead)
                break;
            draftState.currentPickerIndex += 1;
        }
        const isCompleted = draftState.currentPickerIndex >= draftState.draftOrder.length ||
            draftState.storePool.length === 0;
        const events = [
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
                atomic_effects_1.AtomicEffects.discardCards(state, draftState.storePool.splice(0), deckManager);
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
exports.DraftStore = DraftStore;
