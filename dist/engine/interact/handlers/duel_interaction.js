"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DuelInteraction = void 0;
const skill_hooks_1 = require("../skill_hooks");
const atomic_effects_1 = require("../primitives/atomic_effects");
class DuelInteraction {
    static handleStartDuel(state, player, targetPlayer, card, cardIndex, deckManager) {
        player.handCards.splice(cardIndex, 1);
        atomic_effects_1.AtomicEffects.discardCard(state, card, deckManager);
        // Target responds first in Duel
        const reaction = {
            id: `reaction_duel_${targetPlayer.id}_${Date.now()}`,
            type: "DUEL_RESPONSE",
            sourcePlayerId: player.id,
            targetPlayerId: targetPlayer.id,
            sourceCard: card,
            requiredCard: "BANG",
            requiredCount: 1,
            currentCount: 0,
            canUseBarrel: false,
            canUseJourdonnais: false,
            barrelChecked: false,
            jourdonnaisChecked: false,
            createdAt: Date.now(),
        };
        state.pendingReactions.push(reaction);
        const events = [
            {
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
            },
        ];
        skill_hooks_1.SkillHooks.checkSuzyLafayette(state, player, events);
        return { success: true, events };
    }
}
exports.DuelInteraction = DuelInteraction;
