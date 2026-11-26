"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DuelInteraction = void 0;
const skill_hooks_1 = require("../skill_hooks");
const atomic_effects_1 = require("../primitives/atomic_effects");
const arena_chain_manager_1 = require("../../arena/arena_chain_manager");
class DuelInteraction {
    static handleStartDuel(state, player, targetPlayer, card, cardIndex, deckManager) {
        player.handCards.splice(cardIndex, 1);
        atomic_effects_1.AtomicEffects.discardCard(state, card, deckManager);
        const duelImmune = skill_hooks_1.SkillHooks.isImmuneToCard(targetPlayer, card, player, state);
        arena_chain_manager_1.ArenaChainManager.appendBatch(state, [
            {
                kind: "PLAYED_CARD",
                card,
                actorPlayerId: player.id,
                actorPlayerName: player.name,
                targetPlayerId: targetPlayer.id,
                targetPlayerName: targetPlayer.name,
                originZone: "HAND",
                destinationZone: "DISCARD",
                actionLabel: `${card.name} -> ${targetPlayer.name}`,
                vfxType: duelImmune ? undefined : "bullet",
                vfxTargetId: targetPlayer.id,
            },
        ]);
        // Target responds first in Duel
        const reactionRes = atomic_effects_1.AtomicEffects.createReaction(state, targetPlayer, player, card, {
            type: "DUEL_RESPONSE",
            requiredCard: "BANG",
            requiredCount: 1,
            allowBarrel: false,
            allowJourdonnais: false,
        }, { duelInitiatorId: player.id });
        const events = [...reactionRes.events];
        if (!reactionRes.isImmune && reactionRes.reaction) {
            events.push({
                type: "DUEL_STARTED",
                payload: {
                    initiatorId: player.id,
                    initiatorName: player.name,
                    targetId: targetPlayer.id,
                    targetName: targetPlayer.name,
                    card,
                    nextResponderId: targetPlayer.id,
                },
                timestamp: Date.now(),
            });
        }
        skill_hooks_1.SkillHooks.checkSuzyLafayette(state, player, events);
        return { success: true, events };
    }
}
exports.DuelInteraction = DuelInteraction;
