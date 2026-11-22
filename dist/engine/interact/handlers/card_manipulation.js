"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CardManipulation = void 0;
const target_validator_1 = require("../../combat/target_validator");
const event_engine_1 = require("../../events/event_engine");
const skill_hooks_1 = require("../skill_hooks");
const atomic_effects_1 = require("../primitives/atomic_effects");
const arena_chain_manager_1 = require("../../arena/arena_chain_manager");
const inventory_1 = require("../../utils/inventory");
class CardManipulation {
    // Check target area availability
    static hasTargetCard(targetPlayer, targetArea, targetCardId) {
        if (targetArea === "HAND") {
            return targetPlayer.handCards.length > 0;
        }
        if (targetArea === "EQUIPMENT") {
            const list = (0, inventory_1.getAllEquippedCards)(targetPlayer);
            return targetCardId ? list.some((c) => c.id === targetCardId) : list.length > 0;
        }
        if (targetArea === "GREEN") {
            const list = targetPlayer.greenCards || [];
            return targetCardId
                ? list.some((g) => g.id === targetCardId || g.card.id === targetCardId)
                : list.length > 0;
        }
        if (targetArea === "JUDGEMENT") {
            const list = targetPlayer.judgements || [];
            return targetCardId
                ? list.some((j) => j.id === targetCardId || j.card.id === targetCardId)
                : list.length > 0;
        }
        return false;
    }
    // Handle steal or destroy card
    static handleTheftOrDestruction(state, player, targetPlayer, card, cardIndex, targetArea = "HAND", targetCardId, deckManager, extraCardId, fromGreenEntryId) {
        const isSteal = card.name === "PANIC!" ||
            card.name === "RAG TIME" ||
            card.name === "CONESTOGA";
        const isDestroy = card.name === "CAT BALOU" || card.name === "CAN CAN";
        if (!isSteal && !isDestroy) {
            return { success: false, message: `Unsupported card manipulation: ${card.name}` };
        }
        // Validate card source before mutation
        let resolvedHandIndex = -1;
        let resolvedGreenIndex = -1;
        if (fromGreenEntryId) {
            const turnPlayer = state.players.get(state.turnPlayerId);
            if (!skill_hooks_1.SkillHooks.isEquipmentEffective(player, turnPlayer, state)) {
                return {
                    success: false,
                    message: "Green card abilities are currently negated.",
                };
            }
            const greenCards = player.greenCards || [];
            resolvedGreenIndex = greenCards.findIndex((g) => g.id === fromGreenEntryId || g.card.id === fromGreenEntryId);
            if (resolvedGreenIndex === -1) {
                return { success: false, message: "Green card not found in play." };
            }
            if (greenCards[resolvedGreenIndex].isDelay) {
                return {
                    success: false,
                    message: "Green card cannot be activated on the turn it was played.",
                };
            }
        }
        else {
            const blockReason = event_engine_1.EventEngine.shouldBlockPlayCard(state, player, card);
            if (blockReason) {
                return { success: false, message: blockReason };
            }
            resolvedHandIndex =
                cardIndex >= 0 &&
                    cardIndex < player.handCards.length &&
                    player.handCards[cardIndex].id === card.id
                    ? cardIndex
                    : player.handCards.findIndex((c) => c.id === card.id);
            if (resolvedHandIndex === -1) {
                return { success: false, message: "Card not in hand." };
            }
        }
        // Validate Rag Time extra discard
        if (card.name === "RAG TIME") {
            if (!extraCardId || extraCardId === card.id) {
                return {
                    success: false,
                    message: "Rag Time requires discarding another card from hand.",
                };
            }
            const extraExists = player.handCards.some((c) => c.id === extraCardId);
            if (!extraExists) {
                return {
                    success: false,
                    message: "Extra discard card for Rag Time not found in hand.",
                };
            }
        }
        // Validate target and distance rules
        const validation = target_validator_1.TargetValidator.validate(state, card, player, targetPlayer, {
            targetArea,
            targetCardId,
            exactDistance: card.name === "PANIC!" ? 1 : undefined,
            requiresRange: card.name === "PANIC!" ? undefined : false,
        });
        if (!validation.valid) {
            return { success: false, message: validation.reason ?? "Invalid target." };
        }
        if (!this.hasTargetCard(targetPlayer, targetArea, targetCardId)) {
            return {
                success: false,
                message: `Target card not found in ${targetArea.toLowerCase()}.`,
            };
        }
        // Consume source and cost cards
        if (fromGreenEntryId) {
            const removedGreen = (player.greenCards || []).splice(resolvedGreenIndex, 1)[0];
            atomic_effects_1.AtomicEffects.discardCard(state, removedGreen.card, deckManager);
        }
        else {
            const played = player.handCards.splice(resolvedHandIndex, 1)[0];
            atomic_effects_1.AtomicEffects.discardCard(state, played, deckManager);
        }
        let extraCardDiscarded;
        if (card.name === "RAG TIME" && extraCardId) {
            const extraIdx = player.handCards.findIndex((c) => c.id === extraCardId);
            if (extraIdx !== -1) {
                extraCardDiscarded = player.handCards.splice(extraIdx, 1)[0];
                atomic_effects_1.AtomicEffects.discardCard(state, extraCardDiscarded, deckManager);
            }
        }
        arena_chain_manager_1.ArenaChainManager.appendBatch(state, [
            {
                kind: "PLAYED_CARD",
                card,
                actorPlayerId: player.id,
                actorPlayerName: player.name,
                targetPlayerId: targetPlayer.id,
                targetPlayerName: targetPlayer.name,
                originZone: fromGreenEntryId ? "GREEN" : "HAND",
                destinationZone: "DISCARD",
                actionLabel: `${card.name} -> ${targetPlayer.name}`,
            },
            ...(extraCardDiscarded
                ? [
                    {
                        kind: "EXTRA_COST",
                        card: extraCardDiscarded,
                        actorPlayerId: player.id,
                        actorPlayerName: player.name,
                        originZone: "HAND",
                        destinationZone: "DISCARD",
                        actionLabel: `Discard Cost (${extraCardDiscarded.name})`,
                    },
                ]
                : []),
        ]);
        const events = [];
        if (!fromGreenEntryId) {
            skill_hooks_1.SkillHooks.checkSuzyLafayette(state, player, events);
        }
        // Check Apache Kid card immunity
        if (skill_hooks_1.SkillHooks.isImmuneToCard(targetPlayer, card, player, state)) {
            events.push({
                type: "APACHE_KID_IMMUNITY",
                payload: {
                    sourcePlayerId: player.id,
                    targetPlayerId: targetPlayer.id,
                    card,
                },
                timestamp: Date.now(),
            });
            if (fromGreenEntryId) {
                events.push({
                    type: "GREEN_CARD_ACTIVATED",
                    payload: {
                        playerId: player.id,
                        playerName: player.name,
                        targetId: targetPlayer.id,
                        card,
                        evadedByImmunity: true,
                    },
                    timestamp: Date.now(),
                });
            }
            return { success: true, events };
        }
        const transferred = isSteal
            ? atomic_effects_1.AtomicEffects.stealCard(state, player, targetPlayer, targetArea, targetCardId, events, deckManager)
            : atomic_effects_1.AtomicEffects.destroyCard(state, player, targetPlayer, targetArea, targetCardId, events, deckManager);
        if (!transferred) {
            return { success: false, message: "Target card not found." };
        }
        if (fromGreenEntryId) {
            const hideTransferred = isSteal && targetArea === "HAND";
            events.push({
                type: "GREEN_CARD_ACTIVATED",
                payload: {
                    playerId: player.id,
                    playerName: player.name,
                    targetId: targetPlayer.id,
                    card,
                    ...(hideTransferred ? {} : { transferredCard: transferred }),
                },
                timestamp: Date.now(),
            });
        }
        return { success: true, events };
    }
}
exports.CardManipulation = CardManipulation;
