"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReactionResolver = void 0;
const seat_manager_1 = require("../board/seat_manager");
const elimination_handler_1 = require("../elimination/elimination_handler");
const event_engine_1 = require("../events/event_engine");
const skill_hooks_1 = require("./skill_hooks");
const atomic_effects_1 = require("./primitives/atomic_effects");
const inventory_1 = require("../utils/inventory");
const GREEN_DEFENSE_CARDS = new Set([
    "SOMBRERO",
    "IRON PLATE",
    "TEN GALLON HAT",
    "BIBLE",
]);
class ReactionResolver {
    // Remove dead or inapplicable reactions
    static pruneStaleReactions(state) {
        if (!Array.isArray(state.pendingReactions) || state.pendingReactions.length === 0) {
            return;
        }
        state.pendingReactions = state.pendingReactions.filter((r) => {
            const target = state.players.get(r.targetPlayerId);
            if (!target || target.isDead) {
                return false;
            }
            if (r.type === "EVENT_DALTONS_DISCARD" && !this.hasAnyBlueCardInPlay(target)) {
                return false;
            }
            return true;
        });
    }
    // Check whether player has blue cards
    static hasAnyBlueCardInPlay(player) {
        if ((0, inventory_1.getAllEquippedCards)(player).length > 0) {
            return true;
        }
        return (player.judgements || []).some((j) => j.card.border === "blue");
    }
    // Extract selected blue card from play
    static extractBlueCardInPlay(player, targetId) {
        const equipped = (0, inventory_1.removeEquippedCardById)(player, targetId);
        if (equipped)
            return equipped;
        const judgements = player.judgements || [];
        const jIdx = judgements.findIndex((j) => (j.id === targetId || j.card.id === targetId) && j.card.border === "blue");
        if (jIdx !== -1) {
            return judgements.splice(jIdx, 1)[0].card;
        }
        return null;
    }
    // Emit private cards-drawn domain event
    static emitCardsDrawn(player, sourceCard, drawn, events) {
        if (drawn.length === 0)
            return;
        events.push({
            type: "CARDS_DRAWN",
            visibleTo: [player.id],
            payload: {
                playerId: player.id,
                playerName: player.name,
                sourceCard,
                count: drawn.length,
                cards: drawn,
            },
            maskedPayload: {
                playerId: player.id,
                playerName: player.name,
                sourceCard,
                count: drawn.length,
            },
            timestamp: Date.now(),
        });
    }
    // Handle Sid Ketchum near-death rescue
    static resolveNearDeathRescue(state, player, reaction, reactionIdx, attacker, command, deckManager) {
        const events = [];
        if (player.hp > 0) {
            state.pendingReactions.splice(reactionIdx, 1);
            return { success: true, events };
        }
        const isDeclining = command.payload?.action === "TAKE_DAMAGE" ||
            !command.discardCardIds ||
            command.discardCardIds.length === 0;
        if (isDeclining) {
            state.pendingReactions.splice(reactionIdx, 1);
            const elimRes = elimination_handler_1.EliminationHandler.handleElimination(state, player, attacker, deckManager);
            events.push(...elimRes.events);
            return { success: true, events };
        }
        if (!skill_hooks_1.SkillHooks.hasSkill(player, "Sid Ketchum", state)) {
            return { success: false, message: "Player does not have Sid Ketchum rescue." };
        }
        const discardIds = command.discardCardIds;
        if (new Set(discardIds).size !== discardIds.length) {
            return { success: false, message: "Duplicate card IDs in rescue discard." };
        }
        if (discardIds.length < 2 || discardIds.length % 2 !== 0) {
            return {
                success: false,
                message: "Near-death rescue requires pairs of cards (2 per 1 HP).",
            };
        }
        for (const id of discardIds) {
            if (!player.handCards.some((c) => c.id === id)) {
                return { success: false, message: "Rescue discard card not in hand." };
            }
        }
        const discardedCards = [];
        for (const id of discardIds) {
            const idx = player.handCards.findIndex((c) => c.id === id);
            if (idx !== -1) {
                discardedCards.push(player.handCards.splice(idx, 1)[0]);
            }
        }
        atomic_effects_1.AtomicEffects.discardCards(state, discardedCards, deckManager);
        const healAmount = discardedCards.length / 2;
        player.hp = Math.min(player.hp + healAmount, player.maxHp);
        skill_hooks_1.SkillHooks.onPlayOutOfTurn(state, player, events);
        if (player.hp > 0) {
            state.pendingReactions.splice(reactionIdx, 1);
            events.push({
                type: "SID_KETCHUM_RESCUED",
                payload: {
                    playerId: player.id,
                    playerName: player.name,
                    healedAmount: healAmount,
                    currentHp: player.hp,
                    discardedCards,
                },
                timestamp: Date.now(),
            });
            skill_hooks_1.SkillHooks.checkSuzyLafayette(state, player, events);
            return { success: true, events };
        }
        events.push({
            type: "HEAL_RESOLVED",
            payload: {
                playerId: player.id,
                playerName: player.name,
                healedAmount: healAmount,
                currentHp: player.hp,
                maxHp: player.maxHp,
            },
            timestamp: Date.now(),
        });
        if (player.handCards.length < 2) {
            state.pendingReactions.splice(reactionIdx, 1);
            const elimRes = elimination_handler_1.EliminationHandler.handleElimination(state, player, attacker, deckManager);
            events.push(...elimRes.events);
        }
        else {
            reaction.pendingDamage = Math.abs(player.hp) + 1;
        }
        return { success: true, events };
    }
    // Handle The Daltons blue discard
    static resolveDaltonsDiscard(state, player, reactionIdx, command, deckManager) {
        const events = [];
        if (!this.hasAnyBlueCardInPlay(player)) {
            state.pendingReactions.splice(reactionIdx, 1);
            return { success: true, events };
        }
        const selectedId = command.targetCardId ?? command.cardId ?? command.payload?.cardId;
        if (!selectedId || command.payload?.action === "TAKE_DAMAGE") {
            return {
                success: false,
                message: "Select one blue card in play to discard for The Daltons.",
            };
        }
        const removedCard = this.extractBlueCardInPlay(player, selectedId);
        if (!removedCard) {
            return {
                success: false,
                message: "Selected blue card not found in front of player.",
            };
        }
        atomic_effects_1.AtomicEffects.discardCard(state, removedCard, deckManager);
        state.pendingReactions.splice(reactionIdx, 1);
        events.push({
            type: "EVENT_DALTONS_DISCARDED",
            payload: {
                playerId: player.id,
                playerName: player.name,
                card: removedCard,
            },
            timestamp: Date.now(),
        });
        return { success: true, events };
    }
    // Resolve pending player reaction
    static resolve(state, command, deckManager) {
        const player = state.players.get(command.playerId);
        if (!player)
            return { success: false, message: "Player not found." };
        if (player.isDead)
            return { success: false, message: "Dead player cannot react." };
        this.pruneStaleReactions(state);
        if (state.pendingReactions.length === 0) {
            return { success: false, message: "No pending reaction." };
        }
        const reactionIdx = 0;
        const reaction = state.pendingReactions[0];
        if (reaction.targetPlayerId !== player.id) {
            return {
                success: false,
                message: "Wait for the active target player to resolve their reaction first.",
            };
        }
        const attacker = reaction.sourcePlayerId &&
            reaction.sourcePlayerId !== "SYSTEM" &&
            reaction.sourcePlayerId !== "ENV_DAMAGE"
            ? state.players.get(reaction.sourcePlayerId)
            : undefined;
        const turnPlayer = state.players.get(state.turnPlayerId);
        const events = [];
        if (reaction.type === "NEAR_DEATH_RESCUE") {
            const rescueRes = this.resolveNearDeathRescue(state, player, reaction, reactionIdx, attacker, command, deckManager);
            this.pruneStaleReactions(state);
            return rescueRes;
        }
        if (reaction.type === "EVENT_DALTONS_DISCARD") {
            const daltonsRes = this.resolveDaltonsDiscard(state, player, reactionIdx, command, deckManager);
            this.pruneStaleReactions(state);
            return daltonsRes;
        }
        // Action A: Barrel or Jourdonnais Draw!
        if (command.payload?.action === "BARREL_CHECK") {
            if (reaction.type === "EVENT_RUSSIAN_ROULETTE") {
                return {
                    success: false,
                    message: "Barrel and Jourdonnais cannot be used against Russian Roulette.",
                };
            }
            if (!reaction.canUseBarrel && !reaction.canUseJourdonnais) {
                return {
                    success: false,
                    message: "No Barrel or Jourdonnais check available.",
                };
            }
            const equipEffective = skill_hooks_1.SkillHooks.isEquipmentEffective(player, turnPlayer ?? attacker, state);
            const canBarrelNow = reaction.canUseBarrel &&
                !reaction.barrelChecked &&
                equipEffective &&
                (0, inventory_1.hasBarrelCard)(player);
            const canJourdonnaisNow = reaction.canUseJourdonnais &&
                !reaction.jourdonnaisChecked &&
                skill_hooks_1.SkillHooks.hasInnateBarrel(player, state);
            const requestedSource = (command.payload?.checkSource ??
                command.checkSource);
            if (requestedSource !== undefined &&
                requestedSource !== "BARREL" &&
                requestedSource !== "JOURDONNAIS") {
                return {
                    success: false,
                    message: "Invalid checkSource; expected BARREL or JOURDONNAIS.",
                };
            }
            let checkSource;
            if (requestedSource === "BARREL") {
                if (!canBarrelNow) {
                    return {
                        success: false,
                        message: reaction.barrelChecked
                            ? "Barrel check already used."
                            : "Barrel check is not available.",
                    };
                }
                reaction.barrelChecked = true;
                checkSource = "BARREL";
            }
            else if (requestedSource === "JOURDONNAIS") {
                if (!canJourdonnaisNow) {
                    return {
                        success: false,
                        message: reaction.jourdonnaisChecked
                            ? "Jourdonnais check already used."
                            : "Jourdonnais check is not available.",
                    };
                }
                reaction.jourdonnaisChecked = true;
                checkSource = "JOURDONNAIS";
            }
            else if (canBarrelNow) {
                reaction.barrelChecked = true;
                checkSource = "BARREL";
            }
            else if (canJourdonnaisNow) {
                reaction.jourdonnaisChecked = true;
                checkSource = "JOURDONNAIS";
            }
            else {
                return {
                    success: false,
                    message: "All available Draw! checks already used or negated.",
                };
            }
            const drawCheck = skill_hooks_1.SkillHooks.executeDrawCheck(state, player, checkSource, (c, st) => skill_hooks_1.SkillHooks.getEffectiveSuit(c, st) === "hearts");
            events.push(...drawCheck.events);
            if (drawCheck.success) {
                reaction.currentCount += 1;
                events.push({
                    type: "DEFENSE_CHECK_SUCCEEDED",
                    payload: {
                        playerId: player.id,
                        checkSource,
                        currentCount: reaction.currentCount,
                        requiredCount: reaction.requiredCount,
                    },
                    timestamp: Date.now(),
                });
                if (reaction.currentCount >= reaction.requiredCount) {
                    state.pendingReactions.splice(reactionIdx, 1);
                    events.push({
                        type: "ATTACK_EVADED",
                        payload: {
                            targetId: player.id,
                            attackerId: reaction.sourcePlayerId,
                            sourceCard: reaction.sourceCard,
                        },
                        timestamp: Date.now(),
                    });
                }
            }
            else {
                events.push({
                    type: "DEFENSE_CHECK_FAILED",
                    payload: { playerId: player.id, checkSource },
                    timestamp: Date.now(),
                });
            }
            return { success: true, events };
        }
        // Action B1: Green card defense
        const explicitGreenId = command.greenCardId ??
            command.payload?.greenCardId ??
            (command.payload?.action === "USE_GREEN_DEFENSE" ? command.cardId : undefined);
        const greenCards = player.greenCards || [];
        const fallbackGreenMatch = !explicitGreenId &&
            command.cardId &&
            !player.handCards.some((c) => c.id === command.cardId)
            ? greenCards.find((g) => g.id === command.cardId || g.card.id === command.cardId)
            : undefined;
        const requestedGreenId = explicitGreenId ?? fallbackGreenMatch?.id;
        if (requestedGreenId && command.payload?.action !== "TAKE_DAMAGE") {
            if (reaction.requiredCard !== "MISSED") {
                return {
                    success: false,
                    message: `Green defense cards cannot satisfy ${reaction.requiredCard}.`,
                };
            }
            if (reaction.type === "EVENT_RUSSIAN_ROULETTE") {
                return {
                    success: false,
                    message: "Green cards cannot be discarded for Russian Roulette.",
                };
            }
            if (!skill_hooks_1.SkillHooks.isEquipmentEffective(player, turnPlayer ?? attacker, state)) {
                return {
                    success: false,
                    message: "Green card abilities are currently negated.",
                };
            }
            const gIdx = greenCards.findIndex((g) => g.id === requestedGreenId || g.card.id === requestedGreenId);
            if (gIdx === -1) {
                return { success: false, message: "Green defense card not found in play." };
            }
            const greenEntry = greenCards[gIdx];
            if (greenEntry.isDelay) {
                return {
                    success: false,
                    message: "Green card cannot be activated on the turn it was played.",
                };
            }
            if (!GREEN_DEFENSE_CARDS.has(greenEntry.card.name)) {
                return {
                    success: false,
                    message: `Card ${greenEntry.card.name} is not a defensive green card.`,
                };
            }
            greenCards.splice(gIdx, 1);
            atomic_effects_1.AtomicEffects.discardCard(state, greenEntry.card, deckManager);
            if (greenEntry.card.name === "BIBLE") {
                const { cards: drawn, events: drawEvents } = atomic_effects_1.AtomicEffects.drawCards(state, 1, deckManager);
                player.handCards.push(...drawn);
                events.push(...drawEvents);
                this.emitCardsDrawn(player, greenEntry.card, drawn, events);
            }
            skill_hooks_1.SkillHooks.onPlayOutOfTurn(state, player, events);
            reaction.currentCount += 1;
            events.push({
                type: "DEFENSE_CARD_PLAYED",
                payload: {
                    playerId: player.id,
                    card: greenEntry.card,
                    fromGreen: true,
                    currentCount: reaction.currentCount,
                    requiredCount: reaction.requiredCount,
                },
                timestamp: Date.now(),
            });
            if (reaction.currentCount >= reaction.requiredCount) {
                state.pendingReactions.splice(reactionIdx, 1);
                events.push({
                    type: "ATTACK_EVADED",
                    payload: {
                        targetId: player.id,
                        attackerId: reaction.sourcePlayerId,
                        sourceCard: reaction.sourceCard,
                    },
                    timestamp: Date.now(),
                });
            }
            return { success: true, events };
        }
        // Action B2: Hand defense card
        if (command.cardId && command.payload?.action !== "TAKE_DAMAGE") {
            const cardIdx = player.handCards.findIndex((c) => c.id === command.cardId);
            if (cardIdx === -1) {
                return { success: false, message: "Defense card not in hand." };
            }
            const card = player.handCards[cardIdx];
            let isValidCard = false;
            if (reaction.requiredCard === "MISSED") {
                if (card.name === "MISSED!" ||
                    card.name === "DODGE" ||
                    skill_hooks_1.SkillHooks.canSubstituteCard(player, card, "MISSED", state)) {
                    isValidCard = true;
                }
            }
            else if (reaction.requiredCard === "BANG") {
                if (card.name === "BANG!" ||
                    skill_hooks_1.SkillHooks.canSubstituteCard(player, card, "BANG", state)) {
                    isValidCard = true;
                }
            }
            else if (reaction.requiredCard === "ANY_HAND") {
                isValidCard = true;
            }
            if (!isValidCard) {
                return {
                    success: false,
                    message: `Card ${card.name} cannot satisfy ${reaction.requiredCard} reaction.`,
                };
            }
            player.handCards.splice(cardIdx, 1);
            atomic_effects_1.AtomicEffects.discardCard(state, card, deckManager);
            if (reaction.requiredCard === "MISSED" && card.name !== "MISSED!" && card.name !== "DODGE") {
                if (card.name === "BANG!" && skill_hooks_1.SkillHooks.hasSkill(player, "Calamity Janet", state)) {
                    events.push({
                        type: "ACTIVE_SKILL_USED",
                        payload: {
                            playerId: player.id,
                            playerName: player.name,
                            skill: "Calamity Janet",
                            detail: "played BANG! as MISSED!",
                        },
                        timestamp: Date.now(),
                    });
                }
                else if (skill_hooks_1.SkillHooks.hasSkill(player, "Elena Fuente", state)) {
                    events.push({
                        type: "ACTIVE_SKILL_USED",
                        payload: {
                            playerId: player.id,
                            playerName: player.name,
                            skill: "Elena Fuente",
                            detail: "used hand card as MISSED!",
                        },
                        timestamp: Date.now(),
                    });
                }
            }
            else if (reaction.requiredCard === "BANG" &&
                card.name === "MISSED!" &&
                skill_hooks_1.SkillHooks.hasSkill(player, "Calamity Janet", state)) {
                events.push({
                    type: "ACTIVE_SKILL_USED",
                    payload: {
                        playerId: player.id,
                        playerName: player.name,
                        skill: "Calamity Janet",
                        detail: "played MISSED! as BANG!",
                    },
                    timestamp: Date.now(),
                });
            }
            if (card.name === "DODGE") {
                const { cards: dodgeCards, events: dodgeEvents } = atomic_effects_1.AtomicEffects.drawCards(state, 1, deckManager);
                player.handCards.push(...dodgeCards);
                events.push(...dodgeEvents);
                this.emitCardsDrawn(player, card, dodgeCards, events);
            }
            skill_hooks_1.SkillHooks.onPlayOutOfTurn(state, player, events);
            skill_hooks_1.SkillHooks.checkSuzyLafayette(state, player, events);
            if (reaction.type === "DUEL_RESPONSE") {
                const nextTargetId = reaction.sourcePlayerId;
                reaction.sourcePlayerId = player.id;
                reaction.targetPlayerId = nextTargetId;
                reaction.currentCount = 0;
                events.push({
                    type: "DUEL_BANG_RETURNED",
                    payload: {
                        fromPlayerId: player.id,
                        toPlayerId: nextTargetId,
                        card,
                    },
                    timestamp: Date.now(),
                });
                return { success: true, events };
            }
            if (reaction.type === "INDIANS_DEFENSE") {
                state.pendingReactions.splice(reactionIdx, 1);
                events.push({
                    type: "INDIANS_DEFENDED",
                    payload: {
                        playerId: player.id,
                        card,
                    },
                    timestamp: Date.now(),
                });
                return { success: true, events };
            }
            if (reaction.type === "EVENT_RUSSIAN_ROULETTE") {
                state.pendingReactions.splice(reactionIdx, 1);
                events.push({
                    type: "RUSSIAN_ROULETTE_SURVIVED",
                    payload: {
                        playerId: player.id,
                        playerName: player.name,
                        card,
                    },
                    timestamp: Date.now(),
                });
                const stopId = reaction.sourcePlayerId && reaction.sourcePlayerId !== "SYSTEM"
                    ? reaction.sourcePlayerId
                    : state.turnPlayerId;
                const nextPlayer = seat_manager_1.SeatManager.getPlayerOnLeft(state, player.id);
                if (nextPlayer &&
                    !nextPlayer.isDead &&
                    nextPlayer.id !== stopId &&
                    nextPlayer.id !== player.id) {
                    const nextReaction = event_engine_1.EventEngine.createRussianRouletteReaction(state, nextPlayer.id);
                    state.pendingReactions.push(nextReaction);
                    events.push({
                        type: "RUSSIAN_ROULETTE_PASSED",
                        payload: {
                            fromPlayerId: player.id,
                            toPlayerId: nextPlayer.id,
                        },
                        timestamp: Date.now(),
                    });
                }
                else {
                    events.push({
                        type: "RUSSIAN_ROULETTE_COMPLETED",
                        payload: { lastSurvivorId: player.id },
                        timestamp: Date.now(),
                    });
                }
                return { success: true, events };
            }
            reaction.currentCount += 1;
            events.push({
                type: "DEFENSE_CARD_PLAYED",
                payload: {
                    playerId: player.id,
                    card,
                    currentCount: reaction.currentCount,
                    requiredCount: reaction.requiredCount,
                },
                timestamp: Date.now(),
            });
            if (reaction.currentCount >= reaction.requiredCount) {
                state.pendingReactions.splice(reactionIdx, 1);
                events.push({
                    type: "ATTACK_EVADED",
                    payload: {
                        targetId: player.id,
                        attackerId: reaction.sourcePlayerId,
                        sourceCard: reaction.sourceCard,
                    },
                    timestamp: Date.now(),
                });
            }
            return { success: true, events };
        }
        // Action C: Resolve penalty or damage
        if (command.payload?.action === "TAKE_DAMAGE" || !command.cardId) {
            state.pendingReactions.splice(reactionIdx, 1);
            if (reaction.type === "EVENT_RICOCHET_DEFENSE") {
                if (reaction.ricochetTargetArea) {
                    atomic_effects_1.AtomicEffects.destroyCard(state, attacker ?? player, player, reaction.ricochetTargetArea, reaction.ricochetTargetCardId, events, deckManager);
                }
                events.push({
                    type: "RICOCHET_SHOT_RESOLVED",
                    payload: {
                        attackerId: attacker?.id,
                        targetPlayerId: player.id,
                        targetArea: reaction.ricochetTargetArea,
                        targetCardId: reaction.ricochetTargetCardId,
                    },
                    timestamp: Date.now(),
                });
                return { success: true, events };
            }
            const damageAmount = reaction.type === "EVENT_RUSSIAN_ROULETTE"
                ? reaction.pendingDamage ?? 2
                : reaction.pendingDamage ?? 1;
            const damageSourceAttacker = reaction.type === "EVENT_RUSSIAN_ROULETTE" ? undefined : attacker;
            if (reaction.type === "EVENT_RUSSIAN_ROULETTE") {
                events.push({
                    type: "RUSSIAN_ROULETTE_HIT",
                    payload: {
                        playerId: player.id,
                        playerName: player.name,
                        damage: damageAmount,
                    },
                    timestamp: Date.now(),
                });
            }
            atomic_effects_1.AtomicEffects.applyDamage(state, damageSourceAttacker, player, damageAmount, events, reaction.sourceCard, deckManager);
            this.pruneStaleReactions(state);
            return { success: true, events };
        }
        return { success: false, message: "Invalid reaction action." };
    }
}
exports.ReactionResolver = ReactionResolver;
