"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AoeActions = void 0;
const event_engine_1 = require("../../events/event_engine");
const skill_hooks_1 = require("../skill_hooks");
const aoe_pipeline_1 = require("../pipeline/aoe_pipeline");
const atomic_effects_1 = require("../primitives/atomic_effects");
const clockwise_traversal_1 = require("../primitives/clockwise_traversal");
const arena_chain_manager_1 = require("../../arena/arena_chain_manager");
const inventory_1 = require("../../utils/inventory");
class AoeActions {
    // Consume hand card safely
    static consumeHandCard(state, player, card, cardIndex, deckManager) {
        const resolvedIdx = cardIndex >= 0 &&
            cardIndex < player.handCards.length &&
            player.handCards[cardIndex].id === card.id
            ? cardIndex
            : player.handCards.findIndex((c) => c.id === card.id);
        if (resolvedIdx === -1)
            return false;
        const removed = player.handCards.splice(resolvedIdx, 1)[0];
        atomic_effects_1.AtomicEffects.discardCard(state, removed, deckManager);
        return true;
    }
    // Handle INDIANS! AOE attack
    static handleIndians(state, player, card, cardIndex, deckManager) {
        const blockReason = event_engine_1.EventEngine.shouldBlockPlayCard(state, player, card);
        if (blockReason) {
            return { success: false, message: blockReason };
        }
        if (!this.consumeHandCard(state, player, card, cardIndex, deckManager)) {
            return { success: false, message: "Card not in hand." };
        }
        arena_chain_manager_1.ArenaChainManager.appendBatch(state, [
            {
                kind: "PLAYED_CARD",
                card,
                actorPlayerId: player.id,
                actorPlayerName: player.name,
                originZone: "HAND",
                destinationZone: "DISCARD",
                actionLabel: card.name,
                vfxType: "bullet",
                vfxAoe: true,
            },
        ]);
        const suzyEvents = [];
        skill_hooks_1.SkillHooks.checkSuzyLafayette(state, player, suzyEvents);
        const res = aoe_pipeline_1.AoePipeline.executeReactionAoe(state, player, card, "ALL_OTHERS", () => ({
            type: "INDIANS_DEFENSE",
            requiredCard: "BANG",
            requiredCount: 1,
            allowBarrel: false,
            allowJourdonnais: false,
        }));
        return {
            success: res.success,
            message: res.message,
            events: [...suzyEvents, ...(res.events || [])],
        };
    }
    // Handle GATLING AOE attack
    static handleGatling(state, player, card, cardIndex, deckManager) {
        const blockReason = event_engine_1.EventEngine.shouldBlockPlayCard(state, player, card);
        if (blockReason) {
            return { success: false, message: blockReason };
        }
        if (!this.consumeHandCard(state, player, card, cardIndex, deckManager)) {
            return { success: false, message: "Card not in hand." };
        }
        arena_chain_manager_1.ArenaChainManager.appendBatch(state, [
            {
                kind: "PLAYED_CARD",
                card,
                actorPlayerId: player.id,
                actorPlayerName: player.name,
                originZone: "HAND",
                destinationZone: "DISCARD",
                actionLabel: card.name,
                vfxType: "bullet",
                vfxAoe: true,
            },
        ]);
        const suzyEvents = [];
        skill_hooks_1.SkillHooks.checkSuzyLafayette(state, player, suzyEvents);
        const res = aoe_pipeline_1.AoePipeline.executeReactionAoe(state, player, card, "ALL_OTHERS", () => ({
            type: "GATLING_DEFENSE",
            requiredCard: "MISSED",
            requiredCount: 1,
            allowBarrel: true,
            allowJourdonnais: true,
        }));
        return {
            success: res.success,
            message: res.message,
            events: [...suzyEvents, ...(res.events || [])],
        };
    }
    // Handle active HOWITZER green card
    static handleHowitzer(state, player, greenEntry, deckManager) {
        const turnPlayer = state.players.get(state.turnPlayerId);
        if (!skill_hooks_1.SkillHooks.isEquipmentEffective(player, turnPlayer, state)) {
            return {
                success: false,
                message: "Green card abilities are currently negated.",
            };
        }
        const greenCards = player.greenCards || [];
        const idx = greenCards.findIndex((g) => g.id === greenEntry.id || g.card.id === greenEntry.card.id);
        if (idx === -1) {
            return { success: false, message: "Howitzer not found in play." };
        }
        const entry = greenCards[idx];
        if (entry.isDelay) {
            return {
                success: false,
                message: "Green card cannot be activated on the turn it was played.",
            };
        }
        greenCards.splice(idx, 1);
        atomic_effects_1.AtomicEffects.discardCard(state, entry.card, deckManager);
        arena_chain_manager_1.ArenaChainManager.appendBatch(state, [
            {
                kind: "PLAYED_CARD",
                card: entry.card,
                actorPlayerId: player.id,
                actorPlayerName: player.name,
                originZone: "GREEN",
                destinationZone: "DISCARD",
                actionLabel: entry.card.name,
                vfxType: "bullet",
                vfxAoe: true,
            },
        ]);
        const res = aoe_pipeline_1.AoePipeline.executeReactionAoe(state, player, entry.card, "ALL_OTHERS", () => ({
            type: "GATLING_DEFENSE",
            requiredCard: "MISSED",
            requiredCount: 1,
            allowBarrel: true,
            allowJourdonnais: true,
        }));
        const events = [
            {
                type: "GREEN_CARD_ACTIVATED",
                payload: {
                    playerId: player.id,
                    playerName: player.name,
                    card: entry.card,
                },
                timestamp: Date.now(),
            },
            ...(res.events || []),
        ];
        return {
            success: res.success,
            message: res.message,
            events,
        };
    }
    // Handle SALOON all-player heal
    static handleSaloon(state, player, card, cardIndex, deckManager) {
        const blockReason = event_engine_1.EventEngine.shouldBlockPlayCard(state, player, card);
        if (blockReason) {
            return { success: false, message: blockReason };
        }
        if (!this.consumeHandCard(state, player, card, cardIndex, deckManager)) {
            return { success: false, message: "Card not in hand." };
        }
        arena_chain_manager_1.ArenaChainManager.appendBatch(state, [
            {
                kind: "PLAYED_CARD",
                card,
                actorPlayerId: player.id,
                actorPlayerName: player.name,
                originZone: "HAND",
                destinationZone: "DISCARD",
                actionLabel: `${card.name} (+1 HP All)`,
                vfxType: "heal",
                vfxAoe: true,
            },
        ]);
        const suzyEvents = [];
        skill_hooks_1.SkillHooks.checkSuzyLafayette(state, player, suzyEvents);
        const res = aoe_pipeline_1.AoePipeline.executeInstantAoe(state, player, card, "ALL_PLAYERS", (target) => {
            const stepEvents = [];
            if (skill_hooks_1.SkillHooks.isImmuneToCard(target, card, player, state)) {
                stepEvents.push({
                    type: "APACHE_KID_IMMUNITY",
                    payload: {
                        sourcePlayerId: player.id,
                        targetPlayerId: target.id,
                        playerId: target.id,
                        card,
                    },
                    timestamp: Date.now(),
                });
                return stepEvents;
            }
            atomic_effects_1.AtomicEffects.applyHeal(state, target, 1, card, stepEvents, deckManager);
            return stepEvents;
        });
        return {
            success: res.success,
            message: res.message,
            events: [
                ...suzyEvents,
                ...(res.events || []),
                {
                    type: "SALOON_HEALED",
                    payload: { sourcePlayerId: player.id, card },
                    timestamp: Date.now(),
                },
            ],
        };
    }
    // Resolve BRAWL targets sequentially
    static resolveBrawlTargets(state, player, card, command, deckManager) {
        const selectionMap = new Map();
        for (const sel of command?.targetSelections || []) {
            selectionMap.set(sel.targetPlayerId, sel);
        }
        const events = [];
        const targets = clockwise_traversal_1.ClockwiseTraversal.getTraversalList(state, player.id, "ALL_OTHERS");
        const remainingTargetIds = [];
        let affectedCount = 0;
        for (const target of targets) {
            if (skill_hooks_1.SkillHooks.isImmuneToCard(target, card, player, state)) {
                events.push({
                    type: "APACHE_KID_IMMUNITY",
                    payload: {
                        sourcePlayerId: player.id,
                        targetPlayerId: target.id,
                        card,
                    },
                    timestamp: Date.now(),
                });
                continue;
            }
            if ((0, inventory_1.countPlayerTotalCards)(target) === 0) {
                continue;
            }
            const sel = selectionMap.get(target.id);
            if (sel?.targetArea &&
                (0, inventory_1.hasTargetCardInArea)(target, sel.targetArea, sel.targetCardId)) {
                const destroyed = atomic_effects_1.AtomicEffects.destroyCard(state, player, target, sel.targetArea, sel.targetCardId, events, deckManager);
                if (destroyed) {
                    affectedCount += 1;
                    continue;
                }
            }
            remainingTargetIds.push(target.id);
        }
        if (remainingTargetIds.length === 0) {
            events.push({
                type: "BRAWL_RESOLVED",
                payload: {
                    sourcePlayerId: player.id,
                    sourcePlayerName: player.name,
                    card,
                    affectedCount,
                },
                timestamp: Date.now(),
            });
            return { success: true, events };
        }
        const brawlState = {
            type: "BRAWL_CARD_PICK",
            actorPlayerId: player.id,
            sourceCard: card,
            remainingTargetIds,
            currentTargetId: remainingTargetIds[0],
            affectedCount,
        };
        state.activeChain.push(brawlState);
        events.push({
            type: "BRAWL_PICK_STARTED",
            payload: {
                sourcePlayerId: player.id,
                sourcePlayerName: player.name,
                currentTargetId: remainingTargetIds[0],
                remainingCount: remainingTargetIds.length,
                card,
            },
            timestamp: Date.now(),
        });
        return { success: true, events };
    }
    // Handle BRAWL multi-target destruction
    static handleBrawl(state, player, card, cardIndex, command, deckManager) {
        const blockReason = event_engine_1.EventEngine.shouldBlockPlayCard(state, player, card);
        if (blockReason) {
            return { success: false, message: blockReason };
        }
        const extraCardId = command?.discardCardIds?.[0];
        if (!extraCardId || extraCardId === card.id) {
            return {
                success: false,
                message: "Brawl requires discarding another card from hand.",
            };
        }
        const hasExtra = player.handCards.some((c) => c.id === extraCardId);
        if (!hasExtra) {
            return {
                success: false,
                message: "Extra discard card for Brawl not found in hand.",
            };
        }
        if (!this.consumeHandCard(state, player, card, cardIndex, deckManager)) {
            return { success: false, message: "Card not in hand." };
        }
        const extraIdx = player.handCards.findIndex((c) => c.id === extraCardId);
        let extraCard;
        if (extraIdx !== -1) {
            extraCard = player.handCards.splice(extraIdx, 1)[0];
            atomic_effects_1.AtomicEffects.discardCard(state, extraCard, deckManager);
        }
        arena_chain_manager_1.ArenaChainManager.appendBatch(state, [
            {
                kind: "PLAYED_CARD",
                card,
                actorPlayerId: player.id,
                actorPlayerName: player.name,
                originZone: "HAND",
                destinationZone: "DISCARD",
                actionLabel: card.name,
            },
            ...(extraCard
                ? [
                    {
                        kind: "EXTRA_COST",
                        card: extraCard,
                        actorPlayerId: player.id,
                        actorPlayerName: player.name,
                        originZone: "HAND",
                        destinationZone: "DISCARD",
                        actionLabel: `Discard Cost (${extraCard.name})`,
                    },
                ]
                : []),
        ]);
        const suzyEvents = [];
        skill_hooks_1.SkillHooks.checkSuzyLafayette(state, player, suzyEvents);
        const res = this.resolveBrawlTargets(state, player, card, command, deckManager);
        return {
            success: res.success,
            message: res.message,
            events: [...suzyEvents, ...(res.events || [])],
        };
    }
}
exports.AoeActions = AoeActions;
