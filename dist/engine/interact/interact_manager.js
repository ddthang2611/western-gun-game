"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InteractManager = void 0;
const deck_manager_1 = require("../deck/deck_manager");
const target_validator_1 = require("../combat/target_validator");
const bang_limiter_1 = require("../combat/bang_limiter");
const event_engine_1 = require("../events/event_engine");
const single_target_1 = require("./handlers/single_target");
const aoe_actions_1 = require("./handlers/aoe_actions");
const draft_store_1 = require("./handlers/draft_store");
const heal_actions_1 = require("./handlers/heal_actions");
const card_manipulation_1 = require("./handlers/card_manipulation");
const duel_interaction_1 = require("./handlers/duel_interaction");
const equipment_action_1 = require("./handlers/equipment_action");
const reaction_resolver_1 = require("./reaction_resolver");
const skill_hooks_1 = require("./skill_hooks");
const atomic_effects_1 = require("./primitives/atomic_effects");
const GREEN_DEFENSE_ONLY = new Set([
    "SOMBRERO",
    "IRON PLATE",
    "TEN GALLON HAT",
    "BIBLE",
]);
class InteractManager {
    // Draw brown action cards safely
    static handleDrawCardPlay(state, player, card, cardIndex, drawCount, deckManager) {
        player.handCards.splice(cardIndex, 1);
        atomic_effects_1.AtomicEffects.discardCard(state, card, deckManager);
        const events = [];
        skill_hooks_1.SkillHooks.checkSuzyLafayette(state, player, events);
        const { cards: drawn, events: drawEvents } = atomic_effects_1.AtomicEffects.drawCards(state, drawCount, deckManager);
        player.handCards.push(...drawn);
        events.push(...drawEvents);
        events.push({
            type: "CARDS_DRAWN",
            visibleTo: [player.id],
            payload: {
                playerId: player.id,
                playerName: player.name,
                sourceCard: card,
                count: drawn.length,
                cards: drawn,
            },
            maskedPayload: {
                playerId: player.id,
                playerName: player.name,
                sourceCard: card,
                count: drawn.length,
            },
            timestamp: Date.now(),
        });
        return { success: true, events };
    }
    // Clear forced Law of the West
    static clearForcedPlayIfMatched(player, playedCardId, result) {
        if (result.success && playedCardId && player.forcedPlayCardId === playedCardId) {
            player.forcedPlayCardId = null;
        }
        return result;
    }
    // Route card play command
    static resolveCardPlay(state, command, deckManager) {
        const player = state.players.get(command.playerId);
        if (!player)
            return { success: false, message: "Player not found." };
        if (player.isDead)
            return { success: false, message: "Dead players cannot act." };
        if (command.greenCardId) {
            return this.resolveActivateGreenCard(state, command, deckManager);
        }
        if (!command.cardId) {
            return { success: false, message: "Card ID is required." };
        }
        const cardIndex = player.handCards.findIndex((c) => c.id === command.cardId);
        if (cardIndex === -1) {
            const greenMatch = (player.greenCards || []).find((g) => g.id === command.cardId || g.card.id === command.cardId);
            if (greenMatch) {
                return this.resolveActivateGreenCard(state, { ...command, greenCardId: greenMatch.id }, deckManager);
            }
            return { success: false, message: "Card not in hand." };
        }
        const card = player.handCards[cardIndex];
        const res = this.executeHandCardPlay(state, player, card, cardIndex, command, deckManager);
        if (res.success) {
            res.events = res.events || [];
            const targetName = command.targetPlayerId
                ? state.players.get(command.targetPlayerId)?.name
                : undefined;
            res.events.push({
                type: "CARD_PLAYED_TO_ARENA",
                payload: {
                    playerId: player.id,
                    playerName: player.name,
                    targetPlayerId: command.targetPlayerId,
                    targetPlayerName: targetName,
                    card,
                },
                timestamp: Date.now(),
            });
        }
        return res;
    }
    static executeHandCardPlay(state, player, card, cardIndex, command, deckManager) {
        const blockReason = event_engine_1.EventEngine.shouldBlockPlayCard(state, player, card);
        if (blockReason) {
            return { success: false, message: blockReason };
        }
        const targetPlayer = command.targetPlayerId
            ? state.players.get(command.targetPlayerId)
            : undefined;
        // A. Single target and draw actions
        const isBangSubstitute = card.name === "MISSED!" &&
            skill_hooks_1.SkillHooks.canSubstituteCard(player, card, "BANG", state);
        if (card.name === "BANG!" || isBangSubstitute) {
            if (isBangSubstitute) {
                const bangBlock = event_engine_1.EventEngine.shouldBlockPlayCard(state, player, {
                    ...card,
                    name: "BANG!",
                });
                if (bangBlock) {
                    return { success: false, message: bangBlock };
                }
            }
            if (!targetPlayer) {
                return { success: false, message: "Target required for BANG!." };
            }
            return this.clearForcedPlayIfMatched(player, card.id, single_target_1.SingleTargetActions.handleBang(state, player, targetPlayer, card, cardIndex, deckManager, command));
        }
        if (card.name === "MISSED!" || card.name === "DODGE") {
            return {
                success: false,
                message: `${card.name} can only be played as a reaction to an attack.`,
            };
        }
        if (card.name === "PUNCH") {
            if (!targetPlayer)
                return { success: false, message: "Target required for Punch." };
            return this.clearForcedPlayIfMatched(player, card.id, single_target_1.SingleTargetActions.handlePunch(state, player, targetPlayer, card, cardIndex, deckManager));
        }
        if (card.name === "SPRINGFIELD") {
            if (!targetPlayer) {
                return { success: false, message: "Target required for Springfield." };
            }
            return this.clearForcedPlayIfMatched(player, card.id, single_target_1.SingleTargetActions.handleSpringfield(state, player, targetPlayer, card, cardIndex, command.discardCardIds?.[0], deckManager));
        }
        if (card.name === "STAGECOACH" || card.name === "WELLS FARGO") {
            const drawCount = card.name === "WELLS FARGO" ? 3 : 2;
            return this.clearForcedPlayIfMatched(player, card.id, this.handleDrawCardPlay(state, player, card, cardIndex, drawCount, deckManager));
        }
        // B. AOE actions
        if (card.name === "INDIANS!") {
            return this.clearForcedPlayIfMatched(player, card.id, aoe_actions_1.AoeActions.handleIndians(state, player, card, cardIndex, deckManager));
        }
        if (card.name === "GATLING") {
            return this.clearForcedPlayIfMatched(player, card.id, aoe_actions_1.AoeActions.handleGatling(state, player, card, cardIndex, deckManager));
        }
        if (card.name === "BRAWL") {
            return this.clearForcedPlayIfMatched(player, card.id, aoe_actions_1.AoeActions.handleBrawl(state, player, card, cardIndex, command, deckManager));
        }
        // C. Draft store
        if (card.name === "GENERAL STORE") {
            return this.clearForcedPlayIfMatched(player, card.id, draft_store_1.DraftStore.handleGeneralStore(state, player, card, cardIndex, deckManager));
        }
        // D. Heals
        if (card.name === "SALOON") {
            return this.clearForcedPlayIfMatched(player, card.id, heal_actions_1.HealActions.handleSaloon(state, player, card, cardIndex, deckManager));
        }
        if (card.name === "BEER") {
            return this.clearForcedPlayIfMatched(player, card.id, heal_actions_1.HealActions.handleBeer(state, player, card, cardIndex, deckManager));
        }
        if (card.name === "WHISKY") {
            return this.clearForcedPlayIfMatched(player, card.id, heal_actions_1.HealActions.handleWhisky(state, player, card, cardIndex, command.discardCardIds?.[0], deckManager));
        }
        if (card.name === "TEQUILA") {
            return this.clearForcedPlayIfMatched(player, card.id, heal_actions_1.HealActions.handleTequila(state, player, targetPlayer, card, cardIndex, command.discardCardIds?.[0], deckManager));
        }
        // E. Card theft or destruction
        if (card.name === "PANIC!" ||
            card.name === "CAT BALOU" ||
            card.name === "RAG TIME") {
            if (!targetPlayer) {
                return { success: false, message: "Target required for this card." };
            }
            return this.clearForcedPlayIfMatched(player, card.id, card_manipulation_1.CardManipulation.handleTheftOrDestruction(state, player, targetPlayer, card, cardIndex, command.targetArea || "HAND", command.targetCardId, deckManager, command.discardCardIds?.[0]));
        }
        // F. Duel
        if (card.name === "DUEL") {
            if (!targetPlayer)
                return { success: false, message: "Target required for Duel." };
            const validation = target_validator_1.TargetValidator.validate(state, card, player, targetPlayer, {
                requiresRange: false,
            });
            if (!validation.valid) {
                return { success: false, message: validation.reason ?? "Invalid target." };
            }
            if (skill_hooks_1.SkillHooks.isImmuneToCard(targetPlayer, card, player, state)) {
                player.handCards.splice(cardIndex, 1);
                atomic_effects_1.AtomicEffects.discardCard(state, card, deckManager);
                const events = [
                    {
                        type: "APACHE_KID_IMMUNITY",
                        payload: {
                            sourcePlayerId: player.id,
                            targetPlayerId: targetPlayer.id,
                            card,
                        },
                        timestamp: Date.now(),
                    },
                ];
                skill_hooks_1.SkillHooks.checkSuzyLafayette(state, player, events);
                return this.clearForcedPlayIfMatched(player, card.id, { success: true, events });
            }
            const duelDeckManager = deckManager ??
                {
                    discard: (c) => atomic_effects_1.AtomicEffects.discardCard(state, c),
                    draw: (n) => atomic_effects_1.AtomicEffects.drawCards(state, n),
                    placeOnTopOfDeck: (c) => deck_manager_1.DeckManager.placeOnTopOfDeck(state, c),
                };
            return this.clearForcedPlayIfMatched(player, card.id, duel_interaction_1.DuelInteraction.handleStartDuel(state, player, targetPlayer, card, cardIndex, duelDeckManager));
        }
        // G. Blue, judgement, green equip
        if (card.border === "blue" ||
            card.border === "green" ||
            card.category === "weapon" ||
            card.category === "equipment" ||
            card.category === "green_delayed" ||
            card.category === "green_delay" ||
            card.category === "green_active" ||
            card.category === "judgement" ||
            card.name === "JAIL" ||
            card.name === "DYNAMITE") {
            return this.clearForcedPlayIfMatched(player, card.id, equipment_action_1.EquipmentAction.handleEquip(state, player, targetPlayer, card, cardIndex, deckManager));
        }
        return { success: false, message: `Unsupported action card: ${card.name}` };
    }
    // Activate ready green card
    static resolveActivateGreenCard(state, command, eventsOrDeckManager, maybeDeckManager) {
        const externalEvents = Array.isArray(eventsOrDeckManager)
            ? eventsOrDeckManager
            : undefined;
        const deckManager = Array.isArray(eventsOrDeckManager)
            ? maybeDeckManager
            : eventsOrDeckManager;
        const player = state.players.get(command.playerId);
        if (!player)
            return { success: false, message: "Player not found." };
        if (player.isDead)
            return { success: false, message: "Dead players cannot act." };
        const requestedGreenId = command.greenCardId ?? command.cardId;
        if (!requestedGreenId) {
            return { success: false, message: "Green card ID is required." };
        }
        const greenEntry = (player.greenCards || []).find((g) => g.id === requestedGreenId || g.card.id === requestedGreenId);
        if (!greenEntry) {
            return { success: false, message: "Green card not found in play." };
        }
        const targetPlayer = command.targetPlayerId
            ? state.players.get(command.targetPlayerId)
            : undefined;
        const cardName = greenEntry.card.name;
        let res;
        if (cardName === "PONY EXPRESS" ||
            cardName === "CANTEEN" ||
            cardName === "BUFFALO RIFLE" ||
            cardName === "PEPPERBOX" ||
            cardName === "DERRINGER" ||
            cardName === "KNIFE") {
            res = single_target_1.SingleTargetActions.handleActivateGreenCard(state, player, greenEntry, targetPlayer, deckManager);
        }
        else if (cardName === "HOWITZER") {
            res = aoe_actions_1.AoeActions.handleHowitzer(state, player, greenEntry, deckManager);
        }
        else if (cardName === "CONESTOGA" || cardName === "CAN CAN") {
            if (!targetPlayer) {
                return { success: false, message: `Target required for ${cardName}.` };
            }
            res = card_manipulation_1.CardManipulation.handleTheftOrDestruction(state, player, targetPlayer, greenEntry.card, -1, command.targetArea || "HAND", command.targetCardId, deckManager, undefined, greenEntry.id);
        }
        else if (GREEN_DEFENSE_ONLY.has(cardName)) {
            return {
                success: false,
                message: `${cardName} can only be activated during an attack reaction.`,
            };
        }
        else {
            return { success: false, message: `Unsupported green card: ${cardName}` };
        }
        if (res.success) {
            res.events = res.events || [];
            res.events.push({
                type: "CARD_PLAYED_TO_ARENA",
                payload: {
                    playerId: player.id,
                    playerName: player.name,
                    targetPlayerId: targetPlayer?.id,
                    targetPlayerName: targetPlayer?.name,
                    card: greenEntry.card,
                },
                timestamp: Date.now(),
            });
            if (externalEvents) {
                externalEvents.push(...res.events);
            }
        }
        return res;
    }
    // Route reaction command
    static resolveReaction(state, command, deckManager) {
        return reaction_resolver_1.ReactionResolver.resolve(state, command, deckManager);
    }
    // Route General Store draft pick
    static resolveDraftSelection(state, command, deckManager) {
        const player = state.players.get(command.playerId);
        if (!player)
            return { success: false, message: "Player not found." };
        if (!command.cardId) {
            return { success: false, message: "Card ID required to pick." };
        }
        return draft_store_1.DraftStore.handleDraftSelect(state, player, command.cardId, deckManager);
    }
    // Prune dead or stale reactions
    static pruneStaleReactions(state) {
        reaction_resolver_1.ReactionResolver.pruneStaleReactions(state);
    }
    // Route character active skill
    static executeActiveSkill(state, command, _deckManager) {
        const player = state.players.get(command.playerId);
        if (!player)
            return { success: false, message: "Player not found." };
        if (player.isDead)
            return { success: false, message: "Dead players cannot act." };
        const events = [];
        const result = skill_hooks_1.SkillHooks.handleActiveSkill(state, command, events);
        if (result && typeof result === "object" && "success" in result) {
            return result;
        }
        return { success: Boolean(result), events };
    }
    // Check whether target holds cards
    static playerHasAnyCard(player) {
        const eq = player.equipments;
        const hasEquip = Boolean(eq?.weapon ||
            eq?.horseDef ||
            eq?.horseOff ||
            eq?.barrel ||
            eq?.extra ||
            (eq?.extras && eq.extras.length > 0));
        return (player.handCards.length > 0 ||
            hasEquip ||
            (player.greenCards?.length ?? 0) > 0 ||
            (player.judgements?.length ?? 0) > 0);
    }
    // Check Phase 2 card playability
    static isCardPlayableInPhase2(state, player, card) {
        if (player.isDead)
            return false;
        if (event_engine_1.EventEngine.shouldBlockPlayCard(state, player, card))
            return false;
        const others = Array.from(state.players.values()).filter((p) => !p.isDead && p.id !== player.id);
        const hasExtraHandCard = player.handCards.some((c) => c.id !== card.id);
        const isBangSub = card.name === "MISSED!" &&
            skill_hooks_1.SkillHooks.canSubstituteCard(player, card, "BANG", state);
        if (card.name === "BANG!" || isBangSub) {
            if (isBangSub &&
                event_engine_1.EventEngine.shouldBlockPlayCard(state, player, { ...card, name: "BANG!" })) {
                return false;
            }
            if (state.activeEvent?.effectCode === "EVENT_FOC_RICOCHET" &&
                others.some((t) => {
                    const eq = t.equipments;
                    return Boolean(eq?.weapon ||
                        eq?.horseDef ||
                        eq?.horseOff ||
                        eq?.barrel ||
                        eq?.extra ||
                        (eq?.extras && eq.extras.length > 0) ||
                        (t.greenCards?.length ?? 0) > 0 ||
                        (t.judgements?.length ?? 0) > 0);
                })) {
                return true;
            }
            if (!bang_limiter_1.BangLimiter.canPlayBang(state, player))
                return false;
            return others.some((t) => target_validator_1.TargetValidator.validate(state, card, player, t).valid);
        }
        if (card.name === "MISSED!" || card.name === "DODGE") {
            return false;
        }
        if (card.name === "PUNCH") {
            return others.some((t) => target_validator_1.TargetValidator.validate(state, card, player, t, { exactDistance: 1 })
                .valid);
        }
        if (card.name === "SPRINGFIELD") {
            return (hasExtraHandCard &&
                others.some((t) => target_validator_1.TargetValidator.validate(state, card, player, t, {
                    requiresRange: false,
                }).valid));
        }
        if (card.name === "WHISKY") {
            return hasExtraHandCard;
        }
        if (card.name === "TEQUILA") {
            const anyLivingNonGhost = Array.from(state.players.values()).some((p) => !p.isDead && !p.isGhost);
            return hasExtraHandCard && anyLivingNonGhost;
        }
        if (card.name === "BRAWL") {
            return hasExtraHandCard;
        }
        if (card.name === "RAG TIME") {
            return (hasExtraHandCard &&
                others.some((t) => this.playerHasAnyCard(t) &&
                    target_validator_1.TargetValidator.validate(state, card, player, t, {
                        requiresRange: false,
                    }).valid));
        }
        if (card.name === "PANIC!") {
            return others.some((t) => this.playerHasAnyCard(t) &&
                target_validator_1.TargetValidator.validate(state, card, player, t, { exactDistance: 1 })
                    .valid);
        }
        if (card.name === "CAT BALOU") {
            return others.some((t) => this.playerHasAnyCard(t) &&
                target_validator_1.TargetValidator.validate(state, card, player, t, {
                    requiresRange: false,
                }).valid);
        }
        if (card.name === "DUEL") {
            return others.some((t) => target_validator_1.TargetValidator.validate(state, card, player, t, {
                requiresRange: false,
            }).valid);
        }
        if (card.name === "BEER" ||
            card.name === "SALOON" ||
            card.name === "INDIANS!" ||
            card.name === "GATLING" ||
            card.name === "GENERAL STORE" ||
            card.name === "STAGECOACH" ||
            card.name === "WELLS FARGO") {
            return true;
        }
        if (card.name === "JAIL") {
            return others.some((t) => target_validator_1.TargetValidator.validate(state, card, player, t, {
                requiresRange: false,
            }).valid);
        }
        if (card.name === "DYNAMITE") {
            return !player.judgements.some((j) => j.type === "DYNAMITE" || j.card.name === card.name);
        }
        if (card.category === "weapon" || (card.border === "blue" && Boolean(card.weaponRange))) {
            return player.equipments.weapon?.name !== card.name;
        }
        if (card.border === "blue") {
            if (card.name === "MUSTANG")
                return !player.equipments.horseDef;
            if (card.name === "SCOPE")
                return !player.equipments.horseOff;
            if (card.name === "BARREL")
                return !player.equipments.barrel;
            const norm = card.name === "BINOCULARS" ? "BINOCULAR" : card.name;
            const extras = player.equipments.extras || [];
            const inExtras = extras.some((c) => (c.name === "BINOCULARS" ? "BINOCULAR" : c.name) === norm);
            const inExtra = player.equipments.extra &&
                (player.equipments.extra.name === "BINOCULARS"
                    ? "BINOCULAR"
                    : player.equipments.extra.name) === norm;
            return !inExtras && !inExtra;
        }
        if (card.border === "green" ||
            card.category === "green_delayed" ||
            card.category === "green_delay" ||
            card.category === "green_active") {
            return !(player.greenCards || []).some((g) => g.card.name === card.name);
        }
        return false;
    }
}
exports.InteractManager = InteractManager;
