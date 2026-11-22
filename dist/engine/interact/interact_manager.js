"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InteractManager = void 0;
const target_validator_1 = require("../combat/target_validator");
const bang_limiter_1 = require("../combat/bang_limiter");
const event_engine_1 = require("../events/event_engine");
const draft_store_1 = require("./handlers/draft_store");
const active_skills_1 = require("./handlers/active_skills");
const reaction_resolver_1 = require("./reaction_resolver");
const skill_hooks_1 = require("./skill_hooks");
const card_registry_1 = require("../cards/card_registry");
const card_execution_pipeline_1 = require("./card_execution_pipeline");
const inventory_1 = require("../utils/inventory");
class InteractManager {
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
        return card_execution_pipeline_1.CardExecutionPipeline.executeHandPlay(state, player, card, cardIndex, command, deckManager);
    }
    // Activate ready green card
    static resolveActivateGreenCard(state, command, eventsOrDeckManager, maybeDeckManager) {
        const deckManager = Array.isArray(eventsOrDeckManager)
            ? maybeDeckManager
            : eventsOrDeckManager;
        return card_execution_pipeline_1.CardExecutionPipeline.executeGreenActivation(state, command, deckManager);
    }
    // Route reaction command
    static resolveReaction(state, command, deckManager) {
        return reaction_resolver_1.ReactionResolver.resolve(state, command, deckManager);
    }
    // Route active chain card selection
    static resolveDraftSelection(state, command, deckManager) {
        const player = state.players.get(command.playerId);
        if (!player)
            return { success: false, message: "Player not found." };
        const head = state.activeChain?.[0];
        if (head && head.type === "BRAWL_CARD_PICK") {
            return draft_store_1.DraftStore.handleBrawlSelect(state, player, command, deckManager);
        }
        if (head && head.type === "LUCKY_DUKE_PICK") {
            return draft_store_1.DraftStore.handleLuckyDukeSelect(state, player, command, deckManager);
        }
        if (head && head.type === "EL_GRINGO_PICK") {
            return draft_store_1.DraftStore.handleElGringoSelect(state, player);
        }
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
    static executeActiveSkill(state, command, deckManager) {
        const player = state.players.get(command.playerId);
        if (!player)
            return { success: false, message: "Player not found." };
        if (player.isDead)
            return { success: false, message: "Dead players cannot act." };
        const events = [];
        const result = active_skills_1.ActiveSkills.handleActiveSkill(state, command, events, deckManager);
        if (result && typeof result === "object" && "success" in result) {
            return result;
        }
        return { success: Boolean(result), events };
    }
    // Check manipulation card targetability
    static canTargetAnyZone(state, player, target, card, exactDistance) {
        const distOpts = exactDistance !== undefined ? { exactDistance } : { requiresRange: false };
        if (target.handCards.length > 0 &&
            target_validator_1.TargetValidator.validate(state, card, player, target, {
                ...distOpts,
                targetArea: "HAND",
            }).valid) {
            return true;
        }
        const equipped = (0, inventory_1.getAllEquippedCards)(target);
        if (equipped.length > 0 &&
            target_validator_1.TargetValidator.validate(state, card, player, target, {
                ...distOpts,
                targetArea: "EQUIPMENT",
                targetCardId: equipped[0].id,
            }).valid) {
            return true;
        }
        if ((target.greenCards?.length ?? 0) > 0 &&
            target_validator_1.TargetValidator.validate(state, card, player, target, {
                ...distOpts,
                targetArea: "GREEN",
                targetCardId: target.greenCards[0].id,
            }).valid) {
            return true;
        }
        if ((target.judgements?.length ?? 0) > 0 &&
            target_validator_1.TargetValidator.validate(state, card, player, target, {
                ...distOpts,
                targetArea: "JUDGEMENT",
                targetCardId: target.judgements[0].id,
            }).valid) {
            return true;
        }
        return false;
    }
    // Check Phase 2 card playability
    static isCardPlayableInPhase2(state, player, card) {
        if (player.isDead)
            return false;
        if (event_engine_1.EventEngine.shouldBlockPlayCard(state, player, card))
            return false;
        const def = card_registry_1.CardRegistry.get(card);
        if (!def)
            return false;
        const isBangSub = card.name === "MISSED!" && skill_hooks_1.SkillHooks.canSubstituteCard(player, card, "BANG", state);
        if (def.zone === "REACTION_ONLY" && !isBangSub) {
            return false;
        }
        if (def.extraHandDiscard > 0) {
            const extraCount = player.handCards.filter((c) => c.id !== card.id).length;
            if (extraCount < def.extraHandDiscard)
                return false;
        }
        const others = Array.from(state.players.values()).filter((p) => !p.isDead && p.id !== player.id);
        if (def.name === "BANG!" || isBangSub) {
            if (isBangSub &&
                event_engine_1.EventEngine.shouldBlockPlayCard(state, player, { ...card, name: "BANG!" })) {
                return false;
            }
            if (state.activeEvent?.effectCode === "EVENT_FOC_RICOCHET" &&
                others.some((t) => (0, inventory_1.getAllEquippedCards)(t).length > 0 ||
                    (t.greenCards?.length ?? 0) > 0 ||
                    (t.judgements?.length ?? 0) > 0)) {
                return true;
            }
            const hasReachableTarget = others.some((t) => target_validator_1.TargetValidator.validate(state, card, player, t).valid);
            if (state.activeEvent?.effectCode === "EVENT_FOC_SNIPER" &&
                hasReachableTarget &&
                player.handCards.some((c) => c.id !== card.id &&
                    (c.name === "BANG!" ||
                        (c.name === "MISSED!" &&
                            skill_hooks_1.SkillHooks.hasSkill(player, "Calamity Janet", state))))) {
                return true;
            }
            if (!bang_limiter_1.BangLimiter.canPlayBang(state, player))
                return false;
            return hasReachableTarget;
        }
        if (card_registry_1.CardRegistry.isEquippableCard(card)) {
            if (def.slotKey === "weapon") {
                return player.equipments.weapon?.name !== card.name;
            }
            if (def.name === "JAIL") {
                return others.some((t) => target_validator_1.TargetValidator.validate(state, card, player, t, { requiresRange: false }).valid);
            }
            if (def.name === "DYNAMITE") {
                return !player.judgements.some((j) => j.type === "DYNAMITE" || j.card.name === card.name);
            }
            if (def.zone === "EQUIP_BLUE") {
                if (def.slotKey === "horseDef")
                    return !player.equipments.horseDef;
                if (def.slotKey === "horseOff")
                    return !player.equipments.horseOff;
                if (def.slotKey === "barrel")
                    return !player.equipments.barrel;
                return !(0, inventory_1.hasEquippedCardByName)(player, card.name);
            }
            if (def.zone === "EQUIP_GREEN") {
                return !(player.greenCards || []).some((g) => g.card.name === card.name);
            }
        }
        if (def.targeting.scope === "SELF" ||
            def.targeting.scope === "ALL_LIVING" ||
            def.targeting.scope === "ALL_OTHERS") {
            return true;
        }
        if (def.targeting.scope === "SINGLE_ANY") {
            return Array.from(state.players.values()).some((p) => !p.isDead && !p.isGhost);
        }
        if (def.targeting.scope === "SINGLE_OTHER") {
            const exactDistance = def.targeting.distance === "EXACT_1" ? 1 : undefined;
            if (card_registry_1.CardRegistry.isManipulationCard(card)) {
                return others.some((t) => this.canTargetAnyZone(state, player, t, card, exactDistance));
            }
            const valOpts = exactDistance !== undefined ? { exactDistance } : { requiresRange: false };
            return others.some((t) => target_validator_1.TargetValidator.validate(state, card, player, t, valOpts).valid);
        }
        return false;
    }
}
exports.InteractManager = InteractManager;
