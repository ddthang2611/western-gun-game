"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DraftStore = void 0;
const crypto_1 = __importDefault(require("crypto"));
const deck_manager_1 = require("../../deck/deck_manager");
const event_engine_1 = require("../../events/event_engine");
const skill_hooks_1 = require("../skill_hooks");
const aoe_pipeline_1 = require("../pipeline/aoe_pipeline");
const atomic_effects_1 = require("../primitives/atomic_effects");
const arena_chain_manager_1 = require("../../arena/arena_chain_manager");
const inventory_1 = require("../../utils/inventory");
const judgement_phase_1 = require("../../phases/judgement_phase");
const reaction_resolver_1 = require("../reaction_resolver");
const turn_manager_1 = require("../../phases/turn_manager");
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
        arena_chain_manager_1.ArenaChainManager.appendBatch(state, [
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
        if (!draftState || !("storePool" in draftState) || !Array.isArray(draftState.storePool)) {
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
    // Resolve sequential Brawl card destruction
    static handleBrawlSelect(state, player, command, deckManager) {
        if (player.isDead) {
            return { success: false, message: "Dead players cannot act." };
        }
        const brawlState = state.activeChain?.[0];
        if (!brawlState || brawlState.type !== "BRAWL_CARD_PICK") {
            return { success: false, message: "No active Brawl pick session." };
        }
        if (player.id !== brawlState.actorPlayerId) {
            return {
                success: false,
                message: "It is not your turn to pick a Brawl target card.",
            };
        }
        if (command.targetPlayerId &&
            command.targetPlayerId !== brawlState.currentTargetId) {
            return {
                success: false,
                message: "Target player does not match current Brawl target.",
            };
        }
        const target = state.players.get(brawlState.currentTargetId);
        if (!target || target.isDead) {
            return { success: false, message: "Brawl target player not found." };
        }
        const targetArea = command.targetArea;
        if (targetArea !== "HAND" &&
            targetArea !== "EQUIPMENT" &&
            targetArea !== "GREEN" &&
            targetArea !== "JUDGEMENT") {
            return {
                success: false,
                message: "Target area is required for Brawl selection.",
            };
        }
        if (!(0, inventory_1.hasTargetCardInArea)(target, targetArea, command.targetCardId)) {
            return {
                success: false,
                message: targetArea === "HAND"
                    ? "Target player has no cards in hand."
                    : "Valid targetCardId is required for selected area.",
            };
        }
        const events = [];
        const destroyed = atomic_effects_1.AtomicEffects.destroyCard(state, player, target, targetArea, command.targetCardId, events, deckManager);
        if (!destroyed) {
            return { success: false, message: "Target card not found." };
        }
        brawlState.affectedCount += 1;
        brawlState.remainingTargetIds = brawlState.remainingTargetIds.filter((tid) => {
            if (tid === target.id)
                return false;
            const nextTarget = state.players.get(tid);
            return Boolean(nextTarget && !nextTarget.isDead && (0, inventory_1.countPlayerTotalCards)(nextTarget) > 0);
        });
        if (brawlState.remainingTargetIds.length > 0) {
            brawlState.currentTargetId = brawlState.remainingTargetIds[0];
            events.push({
                type: "BRAWL_PICK_ADVANCED",
                payload: {
                    sourcePlayerId: player.id,
                    sourcePlayerName: player.name,
                    currentTargetId: brawlState.currentTargetId,
                    remainingCount: brawlState.remainingTargetIds.length,
                    card: brawlState.sourceCard,
                },
                timestamp: Date.now(),
            });
        }
        else {
            state.activeChain = [];
            events.push({
                type: "BRAWL_RESOLVED",
                payload: {
                    sourcePlayerId: player.id,
                    sourcePlayerName: player.name,
                    card: brawlState.sourceCard,
                    affectedCount: brawlState.affectedCount,
                },
                timestamp: Date.now(),
            });
        }
        return { success: true, events };
    }
    // Resolve interactive Lucky Duke Draw! choice
    static handleLuckyDukeSelect(state, player, command, deckManager) {
        if (player.isDead) {
            return { success: false, message: "Dead players cannot act." };
        }
        const luckyState = state.activeChain?.[0];
        if (!luckyState || luckyState.type !== "LUCKY_DUKE_PICK") {
            return { success: false, message: "No active Lucky Duke draw choice." };
        }
        if (player.id !== luckyState.playerId) {
            return { success: false, message: "It is not your turn to choose a Draw! card." };
        }
        const selectedCardId = command.cardId ?? command.payload?.cardId;
        const chosenCard = luckyState.drawnCards.find((c) => c.id === selectedCardId);
        if (!chosenCard) {
            return { success: false, message: "Selected card is not part of this Draw! check." };
        }
        for (const card of luckyState.drawnCards) {
            if (card.id !== chosenCard.id) {
                deck_manager_1.DeckManager.discardCardRespectingMine(state, card, deckManager);
            }
        }
        deck_manager_1.DeckManager.discardCardRespectingMine(state, chosenCard, deckManager);
        const events = [];
        const success = skill_hooks_1.SkillHooks.isDrawCheckSuccess(luckyState.reason, chosenCard, state);
        skill_hooks_1.SkillHooks.emitDrawCheckResult(state, player, luckyState.reason, true, luckyState.drawnCards, chosenCard, success, events);
        state.activeChain.shift();
        if (luckyState.reason === "DYNAMITE" && luckyState.judgementCard) {
            judgement_phase_1.JudgementPhase.resolveDynamiteOutcome(state, player, luckyState.judgementCard, luckyState.judgementId || luckyState.judgementCard.id, chosenCard, luckyState.drawnCards, events, deckManager);
        }
        else if (luckyState.reason === "JAIL" && luckyState.judgementCard) {
            const jailRes = judgement_phase_1.JudgementPhase.resolveJailOutcome(state, player, luckyState.judgementCard, chosenCard, luckyState.drawnCards, events);
            if (jailRes.turnSkipped) {
                events.push({
                    type: "TURN_SKIPPED",
                    payload: {
                        playerId: player.id,
                        playerName: player.name,
                        reason: "JAIL",
                    },
                    timestamp: Date.now(),
                });
                turn_manager_1.TurnManager.advanceToNextTurn(state, player.id, events);
            }
        }
        else if (luckyState.reason === "BARREL" || luckyState.reason === "JOURDONNAIS") {
            const reaction = state.pendingReactions.find((r) => r.id === luckyState.sourceReactionId) ??
                state.pendingReactions.find((r) => r.targetPlayerId === player.id);
            if (reaction) {
                reaction_resolver_1.ReactionResolver.resolveBarrelOutcome(state, player, reaction, luckyState.reason, chosenCard, luckyState.drawnCards, events);
            }
        }
        else if (luckyState.reason === "VENDETTA") {
            const vendettaRes = event_engine_1.EventEngine.resolveVendettaOutcome(state, player, chosenCard, luckyState.drawnCards, events);
            if (vendettaRes.extraTurnGranted) {
                turn_manager_1.TurnManager.startTurn(state, player, events);
            }
            else {
                turn_manager_1.TurnManager.advanceToNextTurn(state, player.id, events);
            }
        }
        return { success: true, events };
    }
    // Resolve blind El Gringo hand steal
    static handleElGringoSelect(state, player) {
        if (player.isDead) {
            return { success: false, message: "Dead players cannot act." };
        }
        const gringoState = state.activeChain?.[0];
        if (!gringoState || gringoState.type !== "EL_GRINGO_PICK") {
            return { success: false, message: "No active El Gringo steal session." };
        }
        if (player.id !== gringoState.victimId) {
            return { success: false, message: "It is not your El Gringo steal choice." };
        }
        const attacker = state.players.get(gringoState.attackerId);
        const events = [];
        if (!attacker || attacker.isDead || attacker.handCards.length === 0) {
            state.activeChain.shift();
            return { success: true, events };
        }
        const randIdx = crypto_1.default.randomInt(0, attacker.handCards.length);
        const stolenCard = attacker.handCards.splice(randIdx, 1)[0];
        player.handCards.push(stolenCard);
        events.push({
            type: "EL_GRINGO_STOLEN",
            visibleTo: [player.id, attacker.id],
            payload: {
                victimId: player.id,
                victimName: player.name,
                attackerId: attacker.id,
                attackerName: attacker.name,
                card: stolenCard,
            },
            maskedPayload: {
                victimId: player.id,
                victimName: player.name,
                attackerId: attacker.id,
                attackerName: attacker.name,
                card: {
                    id: "SECRET",
                    name: "Card from hand",
                    suit: "UNKNOWN",
                    rank: "UNKNOWN",
                },
            },
            timestamp: Date.now(),
        });
        gringoState.remainingSteals -= 1;
        if (gringoState.remainingSteals <= 0 || attacker.handCards.length === 0) {
            state.activeChain.shift();
            skill_hooks_1.SkillHooks.checkSuzyLafayette(state, attacker, events);
        }
        return { success: true, events };
    }
}
exports.DraftStore = DraftStore;
