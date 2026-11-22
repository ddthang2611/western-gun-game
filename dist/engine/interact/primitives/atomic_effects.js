"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AtomicEffects = void 0;
const crypto_1 = __importDefault(require("crypto"));
const deck_manager_1 = require("../../deck/deck_manager");
const seat_manager_1 = require("../../board/seat_manager");
const elimination_handler_1 = require("../../elimination/elimination_handler");
const skill_hooks_1 = require("../skill_hooks");
const event_rule_registry_1 = require("../../events/event_rule_registry");
const arena_chain_manager_1 = require("../../arena/arena_chain_manager");
const inventory_1 = require("../../utils/inventory");
class AtomicEffects {
    // Draw cards from state deck
    static drawCards(state, count, deckManager) {
        if (deckManager) {
            const res = deckManager.draw(count);
            return {
                cards: res.cards,
                events: res.events,
                reshuffled: res.events.some((e) => e.type === "DECK_RESHUFFLED"),
            };
        }
        return deck_manager_1.DeckManager.drawCards(state, count);
    }
    // Discard card respecting Abandoned Mine
    static discardCard(state, card, deckManager, reason = "PLAYED_CARD") {
        if (state.activeEvent?.effectCode === "EVENT_FOC_ABANDONED_MINE" &&
            reason === "PHASE_3_EXCESS") {
            if (deckManager) {
                deckManager.placeOnTopOfDeck(card);
            }
            else {
                deck_manager_1.DeckManager.placeOnTopOfDeck(state, card);
            }
            return;
        }
        if (deckManager) {
            deckManager.discard(card);
        }
        else {
            deck_manager_1.DeckManager.discardCard(state, card);
        }
    }
    // Discard multiple cards safely
    static discardCards(state, cards, deckManager, reason = "PLAYED_CARD") {
        for (const card of cards) {
            this.discardCard(state, card, deckManager, reason);
        }
    }
    // Extract card from target area
    static extractTargetCard(victim, targetArea, targetCardId) {
        if (targetArea === "HAND") {
            if (victim.handCards.length === 0)
                return null;
            const randIdx = crypto_1.default.randomInt(0, victim.handCards.length);
            return victim.handCards.splice(randIdx, 1)[0];
        }
        if (!targetCardId)
            return null;
        if (targetArea === "EQUIPMENT") {
            return (0, inventory_1.removeEquippedCardById)(victim, targetCardId);
        }
        if (targetArea === "GREEN") {
            const greenCards = victim.greenCards || [];
            const idx = greenCards.findIndex((g) => g.id === targetCardId || g.card.id === targetCardId);
            if (idx === -1)
                return null;
            return greenCards.splice(idx, 1)[0].card;
        }
        if (targetArea === "JUDGEMENT") {
            const judgements = victim.judgements || [];
            const idx = judgements.findIndex((j) => j.id === targetCardId || j.card.id === targetCardId);
            if (idx === -1)
                return null;
            return judgements.splice(idx, 1)[0].card;
        }
        return null;
    }
    // Emit theft or destruction event
    static emitAreaTransferEvent(actor, victim, targetArea, card, isSteal, events) {
        if (targetArea === "HAND") {
            events.push({
                type: isSteal ? "CARD_STOLEN_FROM_HAND" : "CARD_DESTROYED_FROM_HAND",
                visibleTo: [actor.id, victim.id],
                payload: {
                    sourcePlayerId: actor.id,
                    sourcePlayerName: actor.name,
                    targetPlayerId: victim.id,
                    targetPlayerName: victim.name,
                    card,
                    action: isSteal ? "STEAL" : "DESTROY",
                },
                maskedPayload: {
                    sourcePlayerId: actor.id,
                    sourcePlayerName: actor.name,
                    targetPlayerId: victim.id,
                    targetPlayerName: victim.name,
                    card: {
                        id: "SECRET",
                        name: "Card from hand",
                        suit: "UNKNOWN",
                        rank: "UNKNOWN",
                    },
                    action: isSteal ? "STEAL" : "DESTROY",
                },
                timestamp: Date.now(),
            });
            return;
        }
        const typeMap = {
            EQUIPMENT: ["EQUIPMENT_STOLEN", "EQUIPMENT_DESTROYED"],
            GREEN: ["GREEN_CARD_STOLEN", "GREEN_CARD_DESTROYED"],
            JUDGEMENT: ["JUDGEMENT_STOLEN", "JUDGEMENT_DESTROYED"],
        };
        events.push({
            type: isSteal ? typeMap[targetArea][0] : typeMap[targetArea][1],
            payload: {
                sourcePlayerId: actor.id,
                targetPlayerId: victim.id,
                card,
            },
            timestamp: Date.now(),
        });
    }
    // Steal card from victim area
    static stealCard(state, thief, victim, targetArea, targetCardId, events, _deckManager) {
        const card = this.extractTargetCard(victim, targetArea, targetCardId);
        if (!card)
            return null;
        thief.handCards.push(card);
        this.emitAreaTransferEvent(thief, victim, targetArea, card, true, events);
        if (targetArea === "HAND") {
            skill_hooks_1.SkillHooks.checkSuzyLafayette(state, victim, events);
        }
        return card;
    }
    // Destroy card from victim area
    static destroyCard(state, destroyer, victim, targetArea, targetCardId, events, deckManager) {
        const card = this.extractTargetCard(victim, targetArea, targetCardId);
        if (!card)
            return null;
        this.discardCard(state, card, deckManager);
        arena_chain_manager_1.ArenaChainManager.appendBatch(state, [
            {
                kind: "DISCARD_CARD",
                card,
                actorPlayerId: victim.id,
                actorPlayerName: victim.name,
                originZone: targetArea,
                originSlotKey: targetArea === "EQUIPMENT"
                    ? arena_chain_manager_1.ArenaChainManager.resolveEquipmentSlotKey(card)
                    : undefined,
                destinationZone: "DISCARD",
                actionLabel: `Destroyed (${card.name})`,
            },
        ]);
        this.emitAreaTransferEvent(destroyer, victim, targetArea, card, false, events);
        if (targetArea === "HAND") {
            skill_hooks_1.SkillHooks.checkSuzyLafayette(state, victim, events);
        }
        return card;
    }
    // Compute max feasible near-death rescue heal
    static computeMaxNearDeathHeal(handLength, usableBeers, beerHealEach, hasSid) {
        let maxHeal = 0;
        for (let b = 0; b <= usableBeers; b++) {
            const sidPairs = hasSid ? Math.floor((handLength - b) / 2) : 0;
            const total = b * beerHealEach + sidPairs;
            if (total > maxHeal) {
                maxHeal = total;
            }
        }
        return maxHeal;
    }
    // Apply damage and handle survival
    static applyDamage(state, attacker, victim, damageAmount, events = [], sourceCard, deckManager) {
        if (victim.isDead || damageAmount <= 0) {
            return {
                events,
                isEliminated: false,
                isRevived: false,
                finalHp: victim.hp,
            };
        }
        if (victim.isGhost) {
            events.push({
                type: "GHOST_IMMUNE_TO_DEATH",
                payload: {
                    playerId: victim.id,
                    playerName: victim.name,
                    damageAttempted: damageAmount,
                },
                timestamp: Date.now(),
            });
            return {
                events,
                isEliminated: false,
                isRevived: false,
                finalHp: victim.hp,
            };
        }
        victim.hp -= damageAmount;
        events.push({
            type: "PLAYER_DAMAGED",
            payload: {
                victimId: victim.id,
                victimName: victim.name,
                attackerId: attacker?.id,
                attackerName: attacker?.name,
                currentHp: victim.hp,
                damage: damageAmount,
                sourceCard,
            },
            timestamp: Date.now(),
        });
        const canBeerRevive = seat_manager_1.SeatManager.getLivingContenders(state).length > 2 &&
            !event_rule_registry_1.EventRuleRegistry.disablesBeerRescue(state);
        const beerCount = canBeerRevive
            ? victim.handCards.filter((c) => c.name === "BEER").length
            : 0;
        const beerHealEach = skill_hooks_1.SkillHooks.getBeerHealAmount(victim, state);
        const hasSid = skill_hooks_1.SkillHooks.canSidKetchumRescue(state, victim);
        const maxFeasibleHeal = this.computeMaxNearDeathHeal(victim.handCards.length, canBeerRevive ? beerCount : 0, beerHealEach, hasSid);
        // Queue interactive near-death rescue
        if (victim.hp <= 0 && victim.hp + maxFeasibleHeal > 0) {
            const canUseBeer = canBeerRevive && beerCount > 0;
            const rescueReaction = {
                id: `reaction_rescue_${victim.id}_${Date.now()}_${Math.random()
                    .toString(36)
                    .slice(2, 8)}`,
                type: "NEAR_DEATH_RESCUE",
                sourcePlayerId: attacker?.id ?? "ENV_DAMAGE",
                targetPlayerId: victim.id,
                sourceCard: sourceCard ?? {
                    id: hasSid && !canUseBeer ? "sid_rescue" : "near_death_rescue",
                    seq: 0,
                    templateId: hasSid && !canUseBeer ? "sid_rescue" : "near_death_rescue",
                    pack: "base",
                    name: hasSid && !canUseBeer ? "SID_RESCUE" : "NEAR_DEATH_RESCUE",
                    border: "brown",
                    category: "reaction",
                    rank: "A",
                    suit: "hearts",
                    desc: "Near-death rescue",
                },
                requiredCard: "SID_RESCUE",
                requiredCount: 1,
                currentCount: 0,
                canUseBarrel: false,
                canUseJourdonnais: false,
                barrelChecked: false,
                jourdonnaisChecked: false,
                canUseBeer,
                canUseSidKetchum: hasSid,
                originalDamage: damageAmount,
                pendingDamage: Math.abs(victim.hp) + 1,
                rescueBeersUsed: 0,
                createdAt: Date.now(),
            };
            state.pendingReactions.unshift(rescueReaction);
            events.push({
                type: "NEAR_DEATH_RESCUE_PENDING",
                payload: {
                    playerId: victim.id,
                    playerName: victim.name,
                    neededHeal: Math.abs(victim.hp) + 1,
                    canUseBeer,
                    canUseSidKetchum: hasSid,
                },
                timestamp: Date.now(),
            });
            if (hasSid) {
                events.push({
                    type: "SID_KETCHUM_RESCUE_PENDING",
                    payload: {
                        playerId: victim.id,
                        playerName: victim.name,
                        neededHeal: Math.abs(victim.hp) + 1,
                    },
                    timestamp: Date.now(),
                });
            }
            return {
                events,
                isEliminated: false,
                isRevived: false,
                finalHp: victim.hp,
            };
        }
        if (victim.hp > 0) {
            skill_hooks_1.SkillHooks.onTakeDamage(state, victim, attacker, damageAmount, events);
            skill_hooks_1.SkillHooks.checkSuzyLafayette(state, victim, events);
            return {
                events,
                isEliminated: false,
                isRevived: false,
                finalHp: victim.hp,
            };
        }
        const elimResult = elimination_handler_1.EliminationHandler.handleElimination(state, victim, attacker, deckManager);
        events.push(...elimResult.events);
        return {
            events,
            isEliminated: true,
            isRevived: false,
            finalHp: victim.hp,
        };
    }
    // Heal non-ghost player HP
    static applyHeal(state, target, amount, sourceCard, events = [], _deckManager) {
        if (target.isDead || target.isGhost || target.hp >= target.maxHp || amount <= 0) {
            return { events, actualHeal: 0, finalHp: target.hp };
        }
        const healAmount = sourceCard?.name === "BEER"
            ? skill_hooks_1.SkillHooks.getBeerHealAmount(target, state)
            : amount;
        const actualHeal = Math.min(healAmount, target.maxHp - target.hp);
        target.hp += actualHeal;
        events.push({
            type: "HEAL_RESOLVED",
            payload: {
                playerId: target.id,
                playerName: target.name,
                sourceCard,
                healedAmount: actualHeal,
                currentHp: target.hp,
                maxHp: target.maxHp,
            },
            timestamp: Date.now(),
        });
        return {
            events,
            actualHeal,
            finalHp: target.hp,
        };
    }
    // Create pending reaction on target
    static createReaction(state, target, attacker, sourceCard, config, overrides) {
        const events = [];
        if (skill_hooks_1.SkillHooks.isImmuneToCard(target, sourceCard, attacker, state)) {
            events.push({
                type: "APACHE_KID_IMMUNITY",
                payload: {
                    sourcePlayerId: attacker?.id,
                    targetPlayerId: target.id,
                    playerId: target.id,
                    card: sourceCard,
                },
                timestamp: Date.now(),
            });
            return { events, isImmune: true };
        }
        const turnPlayer = state.players.get(state.turnPlayerId);
        const equipEffective = skill_hooks_1.SkillHooks.isEquipmentEffective(target, turnPlayer ?? attacker, state);
        const hasBarrel = Boolean(config.allowBarrel) && equipEffective && (0, inventory_1.hasBarrelCard)(target);
        const hasJourdonnais = Boolean(config.allowJourdonnais) && skill_hooks_1.SkillHooks.hasInnateBarrel(target, state);
        let reqCount = config.requiredCount ?? 1;
        if (attacker &&
            config.type === "BANG_DEFENSE" &&
            config.requiredCard === "MISSED" &&
            config.requiredCount === undefined) {
            if (sourceCard.name === "BANG!") {
                reqCount = skill_hooks_1.SkillHooks.getMissedRequiredForAttack(attacker, sourceCard, state);
            }
            else if (sourceCard.name === "MISSED!" &&
                skill_hooks_1.SkillHooks.hasSkill(attacker, "Slab the Killer", state)) {
                reqCount = 2;
            }
        }
        const reaction = {
            id: `reaction_${config.type.toLowerCase()}_${target.id}_${Date.now()}_${Math.random()
                .toString(36)
                .slice(2, 8)}`,
            type: config.type,
            sourcePlayerId: attacker?.id || "SYSTEM",
            targetPlayerId: target.id,
            sourceCard,
            requiredCard: config.requiredCard,
            requiredCount: reqCount,
            currentCount: 0,
            canUseBarrel: hasBarrel,
            canUseJourdonnais: hasJourdonnais,
            barrelChecked: false,
            jourdonnaisChecked: false,
            createdAt: Date.now(),
            ...overrides,
        };
        state.pendingReactions.push(reaction);
        return {
            events,
            isImmune: false,
            reaction,
        };
    }
}
exports.AtomicEffects = AtomicEffects;
