"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealActions = void 0;
const seat_manager_1 = require("../../board/seat_manager");
const event_engine_1 = require("../../events/event_engine");
const skill_hooks_1 = require("../skill_hooks");
const atomic_effects_1 = require("../primitives/atomic_effects");
const aoe_actions_1 = require("./aoe_actions");
const arena_chain_manager_1 = require("../../arena/arena_chain_manager");
class HealActions {
    // Remove specified card IDs from hand
    static removeHandCardsById(player, cardIds) {
        const idSet = new Set(cardIds);
        const removed = [];
        player.handCards = player.handCards.filter((c) => {
            if (idSet.has(c.id)) {
                removed.push(c);
                return false;
            }
            return true;
        });
        return removed;
    }
    // Heal all living contenders
    static handleSaloon(state, player, card, cardIndex, deckManager) {
        return aoe_actions_1.AoeActions.handleSaloon(state, player, card, cardIndex, deckManager);
    }
    // Heal self unless The Reverend or 2P
    static handleBeer(state, player, card, cardIndex, deckManager) {
        const blockReason = event_engine_1.EventEngine.shouldBlockPlayCard(state, player, card);
        if (blockReason) {
            return { success: false, message: blockReason };
        }
        player.handCards.splice(cardIndex, 1);
        atomic_effects_1.AtomicEffects.discardCard(state, card, deckManager);
        const events = [];
        const living = seat_manager_1.SeatManager.getLivingContenders(state);
        arena_chain_manager_1.ArenaChainManager.appendBatch(state, [
            {
                kind: "PLAYED_CARD",
                card,
                actorPlayerId: player.id,
                actorPlayerName: player.name,
                originZone: "HAND",
                destinationZone: "DISCARD",
                actionLabel: living.length <= 2 ? `${card.name} (No Effect)` : `${card.name} (+HP)`,
                vfxType: living.length > 2 ? "heal" : undefined,
                vfxTargetId: player.id,
            },
        ]);
        if (living.length <= 2) {
            events.push({
                type: "BEER_NO_EFFECT_2P",
                payload: {
                    playerId: player.id,
                    card,
                    message: "Beer has no effect when only 2 players remain.",
                },
                timestamp: Date.now(),
            });
            skill_hooks_1.SkillHooks.checkSuzyLafayette(state, player, events);
            return { success: true, events };
        }
        const beerHeal = skill_hooks_1.SkillHooks.getBeerHealAmount(player, state);
        if (beerHeal > 1 && skill_hooks_1.SkillHooks.hasSkill(player, "Tequila Joe", state)) {
            events.push({
                type: "ACTIVE_SKILL_USED",
                payload: {
                    playerId: player.id,
                    playerName: player.name,
                    skill: "Tequila Joe",
                    detail: `healed +${beerHeal} HP from Beer`,
                },
                timestamp: Date.now(),
            });
        }
        atomic_effects_1.AtomicEffects.applyHeal(state, player, 1, card, events, deckManager);
        skill_hooks_1.SkillHooks.checkSuzyLafayette(state, player, events);
        return { success: true, events };
    }
    // Heal self 2 HP with extra discard
    static handleWhisky(state, player, card, _cardIndex, extraCardId, deckManager) {
        const blockReason = event_engine_1.EventEngine.shouldBlockPlayCard(state, player, card);
        if (blockReason) {
            return { success: false, message: blockReason };
        }
        if (!extraCardId || extraCardId === card.id) {
            return { success: false, message: "Whisky requires discarding 1 extra card." };
        }
        const extraCard = player.handCards.find((c) => c.id === extraCardId);
        if (!extraCard) {
            return { success: false, message: "Valid extra card required." };
        }
        const removed = this.removeHandCardsById(player, [card.id, extraCard.id]);
        atomic_effects_1.AtomicEffects.discardCards(state, removed, deckManager);
        arena_chain_manager_1.ArenaChainManager.appendBatch(state, [
            {
                kind: "PLAYED_CARD",
                card,
                actorPlayerId: player.id,
                actorPlayerName: player.name,
                originZone: "HAND",
                destinationZone: "DISCARD",
                actionLabel: `${card.name} (+2 HP)`,
                vfxType: "heal",
                vfxTargetId: player.id,
            },
            {
                kind: "EXTRA_COST",
                card: extraCard,
                actorPlayerId: player.id,
                actorPlayerName: player.name,
                originZone: "HAND",
                destinationZone: "DISCARD",
                actionLabel: `Discard Cost (${extraCard.name})`,
            },
        ]);
        const events = [];
        atomic_effects_1.AtomicEffects.applyHeal(state, player, 2, card, events, deckManager);
        skill_hooks_1.SkillHooks.checkSuzyLafayette(state, player, events);
        return { success: true, events };
    }
    // Heal target 1 HP with extra discard
    static handleTequila(state, player, targetPlayer, card, _cardIndex, extraCardId, deckManager) {
        const blockReason = event_engine_1.EventEngine.shouldBlockPlayCard(state, player, card);
        if (blockReason) {
            return { success: false, message: blockReason };
        }
        const target = targetPlayer ?? player;
        if (target.isDead || target.isGhost) {
            return { success: false, message: "Target player cannot regain life points." };
        }
        if (!extraCardId || extraCardId === card.id) {
            return { success: false, message: "Tequila requires discarding 1 extra card." };
        }
        const extraCard = player.handCards.find((c) => c.id === extraCardId);
        if (!extraCard) {
            return { success: false, message: "Valid extra card required." };
        }
        const removed = this.removeHandCardsById(player, [card.id, extraCard.id]);
        atomic_effects_1.AtomicEffects.discardCards(state, removed, deckManager);
        const events = [];
        const isImmune = target.id !== player.id &&
            skill_hooks_1.SkillHooks.isImmuneToCard(target, card, player, state);
        arena_chain_manager_1.ArenaChainManager.appendBatch(state, [
            {
                kind: "PLAYED_CARD",
                card,
                actorPlayerId: player.id,
                actorPlayerName: player.name,
                targetPlayerId: target.id,
                targetPlayerName: target.name,
                originZone: "HAND",
                destinationZone: "DISCARD",
                actionLabel: `${card.name} -> ${target.name}`,
                vfxType: isImmune ? undefined : "heal",
                vfxTargetId: target.id,
            },
            {
                kind: "EXTRA_COST",
                card: extraCard,
                actorPlayerId: player.id,
                actorPlayerName: player.name,
                originZone: "HAND",
                destinationZone: "DISCARD",
                actionLabel: `Discard Cost (${extraCard.name})`,
            },
        ]);
        if (isImmune) {
            events.push({
                type: "APACHE_KID_IMMUNITY",
                payload: {
                    sourcePlayerId: player.id,
                    targetPlayerId: target.id,
                    card,
                },
                timestamp: Date.now(),
            });
            skill_hooks_1.SkillHooks.checkSuzyLafayette(state, player, events);
            return { success: true, events };
        }
        atomic_effects_1.AtomicEffects.applyHeal(state, target, 1, card, events, deckManager);
        skill_hooks_1.SkillHooks.checkSuzyLafayette(state, player, events);
        return { success: true, events };
    }
}
exports.HealActions = HealActions;
