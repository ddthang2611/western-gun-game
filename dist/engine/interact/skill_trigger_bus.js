"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkillTriggerBus = void 0;
const skill_registry_1 = require("../cards/skill_registry");
const skill_hooks_1 = require("./skill_hooks");
class SkillTriggerBus {
    // Trigger empty hand draw hooks
    static onHandCardsConsumed(state, player, events, _deckManager) {
        if (player.isDead || player.handCards.length > 0)
            return;
        if (!player.isGhost && player.hp <= 0)
            return;
        const activeDefs = skill_registry_1.SkillRegistry.getActiveDefinitions(player, state);
        if (activeDefs.some((d) => (d.triggers?.onEmptyHandDraw ?? 0) > 0)) {
            skill_hooks_1.SkillHooks.checkSuzyLafayette(state, player, events);
        }
    }
    // Trigger damage taken skill hooks
    static onDamageApplied(state, victim, attacker, damageAmount, events) {
        skill_hooks_1.SkillHooks.onTakeDamage(state, victim, attacker, damageAmount, events);
    }
    // Record or flush out-of-turn play
    static onOutOfTurnHandCardUsed(state, player, reaction, deferUntilComplete, events, count = 1) {
        if (state.turnPlayerId === player.id || count <= 0)
            return;
        const activeDefs = skill_registry_1.SkillRegistry.getActiveDefinitions(player, state);
        if (!activeDefs.some((d) => (d.triggers?.onOutOfTurnHandCardDeferredDraw ?? 0) > 0)) {
            return;
        }
        if (deferUntilComplete && reaction) {
            for (let i = 0; i < count; i++) {
                skill_hooks_1.SkillHooks.queueDeferredMollyDraw(state, reaction, player);
            }
            return;
        }
        skill_hooks_1.SkillHooks.onPlayOutOfTurn(state, player, events, count);
    }
    // Flush deferred reaction triggers
    static onReactionCompleted(state, reaction, events) {
        skill_hooks_1.SkillHooks.flushDeferredMollyDraws(state, reaction, events);
    }
}
exports.SkillTriggerBus = SkillTriggerBus;
