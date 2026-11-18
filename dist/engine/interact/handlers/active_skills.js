"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActiveSkills = void 0;
const deck_manager_1 = require("../../deck/deck_manager");
const target_validator_1 = require("../../combat/target_validator");
const skill_hooks_1 = require("../skill_hooks");
const atomic_effects_1 = require("../primitives/atomic_effects");
class ActiveSkills {
    // Active character skills handler
    static handleActiveSkill(state, command, events) {
        const player = state.players.get(command.playerId);
        if (!player)
            return { success: false, message: "Player not found." };
        if (player.isDead)
            return { success: false, message: "Dead players cannot act." };
        const skillType = String(command.payload?.skillType ?? command.payload?.skill ?? "");
        if (skillType === "SID_KETCHUM_HEAL") {
            return ActiveSkills.handleSidKetchumHeal(state, player, command, events);
        }
        if (skillType === "CHUCK_WENGAM_HP" || skillType === "CHUCK_WENGAM_SACRIFICE") {
            return ActiveSkills.handleChuckWengamHp(state, player, skillType, events);
        }
        if (skillType === "JOSE_DELGADO_DRAW") {
            return ActiveSkills.handleJoseDelgadoDraw(state, player, command, events);
        }
        if (skillType === "DOC_HOLYDAY_BANG") {
            return ActiveSkills.handleDocHolydayBang(state, player, command, events);
        }
        return { success: false, message: `Unknown active skill: ${skillType}` };
    }
    static handleSidKetchumHeal(state, player, command, events) {
        if (player.isGhost) {
            return { success: false, message: "Ghosts have no life points." };
        }
        if (!skill_hooks_1.SkillHooks.hasSkill(player, "Sid Ketchum", state)) {
            return { success: false, message: "Player does not have Sid Ketchum ability." };
        }
        if (player.hp >= player.maxHp) {
            return { success: false, message: "Player already at maximum HP." };
        }
        const discardIds = ActiveSkills.extractTwoDistinctIds(command.discardCardIds ?? command.payload?.discardCardIds);
        if (!discardIds) {
            return {
                success: false,
                message: "Exactly 2 distinct cards required for Sid Ketchum.",
            };
        }
        const discarded = ActiveSkills.removeHandCards(player, discardIds);
        if (!discarded) {
            return { success: false, message: "Selected cards not found in hand." };
        }
        for (const card of discarded) {
            deck_manager_1.DeckManager.discardCard(state, card);
        }
        player.hp = Math.min(player.hp + 1, player.maxHp);
        events.push({
            type: "ACTIVE_SKILL_USED",
            payload: {
                playerId: player.id,
                skill: "SID_KETCHUM_HEAL",
                discardedCount: 2,
                currentHp: player.hp,
            },
            timestamp: Date.now(),
        });
        skill_hooks_1.SkillHooks.checkSuzyLafayette(state, player, events);
        return { success: true, events };
    }
    static handleChuckWengamHp(state, player, skillName, events) {
        if (!skill_hooks_1.SkillHooks.hasSkill(player, "Chuck Wengam", state)) {
            return { success: false, message: "Player does not have Chuck Wengam ability." };
        }
        if (state.turnPlayerId !== player.id || state.currentPhase !== 2) {
            return {
                success: false,
                message: "Chuck Wengam ability requires Phase 2 of your turn.",
            };
        }
        if (player.isGhost || player.hp <= 1) {
            return { success: false, message: "Cannot sacrifice last HP." };
        }
        player.hp -= 1;
        events.push({
            type: "PLAYER_DAMAGED",
            payload: {
                victimId: player.id,
                victimName: player.name,
                currentHp: player.hp,
                damage: 1,
            },
            timestamp: Date.now(),
        });
        const { cards: drawn, events: drawEvents } = deck_manager_1.DeckManager.drawCards(state, 2);
        events.push(...drawEvents);
        player.handCards.push(...drawn);
        events.push({
            type: "ACTIVE_SKILL_USED",
            payload: {
                playerId: player.id,
                skill: skillName,
                currentHp: player.hp,
                drawnCount: drawn.length,
            },
            timestamp: Date.now(),
        });
        skill_hooks_1.SkillHooks.onTakeDamage(state, player, undefined, 1, events);
        return { success: true, events };
    }
    static handleJoseDelgadoDraw(state, player, command, events) {
        if (!skill_hooks_1.SkillHooks.hasSkill(player, "Jose Delgado", state)) {
            return { success: false, message: "Player does not have Jose Delgado ability." };
        }
        if (state.turnPlayerId !== player.id || state.currentPhase !== 2) {
            return {
                success: false,
                message: "Jose Delgado ability requires Phase 2 of your turn.",
            };
        }
        if (state.joseDelgadoCountThisTurn >= 2) {
            return {
                success: false,
                message: "Jose Delgado can only be used twice per turn.",
            };
        }
        const blueCardId = command.cardId ?? command.discardCardIds?.[0] ?? command.payload?.cardId;
        if (typeof blueCardId !== "string" || !blueCardId) {
            return { success: false, message: "Blue card ID required." };
        }
        const cardIdx = player.handCards.findIndex((c) => c.id === blueCardId);
        if (cardIdx === -1)
            return { success: false, message: "Card not in hand." };
        const card = player.handCards[cardIdx];
        if (card.border !== "blue") {
            return { success: false, message: "Must discard a blue card." };
        }
        player.handCards.splice(cardIdx, 1);
        deck_manager_1.DeckManager.discardCard(state, card);
        state.joseDelgadoCountThisTurn += 1;
        skill_hooks_1.SkillHooks.checkSuzyLafayette(state, player, events);
        const { cards: drawn, events: drawEvents } = deck_manager_1.DeckManager.drawCards(state, 2);
        events.push(...drawEvents);
        player.handCards.push(...drawn);
        events.push({
            type: "ACTIVE_SKILL_USED",
            payload: {
                playerId: player.id,
                skill: "JOSE_DELGADO_DRAW",
                discardedCardId: card.id,
                drawnCount: drawn.length,
                usesThisTurn: state.joseDelgadoCountThisTurn,
            },
            timestamp: Date.now(),
        });
        return { success: true, events };
    }
    static handleDocHolydayBang(state, player, command, events) {
        if (!skill_hooks_1.SkillHooks.hasSkill(player, "Doc Holyday", state)) {
            return { success: false, message: "Player does not have Doc Holyday ability." };
        }
        if (state.turnPlayerId !== player.id || state.currentPhase !== 2) {
            return {
                success: false,
                message: "Doc Holyday ability requires Phase 2 of your turn.",
            };
        }
        if (state.docHolydayUsedThisTurn >= 1) {
            return {
                success: false,
                message: "Doc Holyday ability can only be used once per turn.",
            };
        }
        const discardIds = ActiveSkills.extractTwoDistinctIds(command.discardCardIds ?? command.payload?.discardCardIds);
        if (!discardIds) {
            return {
                success: false,
                message: "Exactly 2 distinct cards required for Doc Holyday.",
            };
        }
        const hasBoth = discardIds.every((id) => player.handCards.some((c) => c.id === id));
        if (!hasBoth) {
            return { success: false, message: "Selected discard cards not found in hand." };
        }
        const targetPlayerId = command.targetPlayerId ?? command.payload?.targetPlayerId;
        if (typeof targetPlayerId !== "string" || !targetPlayerId) {
            return { success: false, message: "Target player is required." };
        }
        const target = state.players.get(targetPlayerId);
        const previewCard = {
            id: `doc_holyday_${Date.now()}`,
            seq: 0,
            templateId: "base_bang",
            pack: "base",
            name: "BANG!",
            border: "brown",
            category: "action",
            rank: "A",
            suit: "clubs",
            desc: "",
        };
        const validation = target_validator_1.TargetValidator.validate(state, previewCard, player, target, {
            requiresRange: true,
        });
        if (!validation.valid || !target) {
            return {
                success: false,
                message: validation.reason ?? "Invalid target for Doc Holyday.",
            };
        }
        const discarded = ActiveSkills.removeHandCards(player, discardIds);
        if (!discarded) {
            return { success: false, message: "Selected discard cards not found in hand." };
        }
        for (const card of discarded) {
            deck_manager_1.DeckManager.discardCard(state, card);
        }
        state.docHolydayUsedThisTurn += 1;
        skill_hooks_1.SkillHooks.checkSuzyLafayette(state, player, events);
        // Suitless skill avoids Apache Kid
        const sourceCard = {
            ...discarded[0],
            name: "BANG!",
            suit: "clubs",
        };
        const reactionRes = atomic_effects_1.AtomicEffects.createReaction(state, target, player, sourceCard, {
            type: "BANG_DEFENSE",
            requiredCard: "MISSED",
            allowBarrel: true,
            allowJourdonnais: true,
        });
        events.push(...reactionRes.events);
        if (!reactionRes.isImmune && reactionRes.reaction) {
            events.push({
                type: "DOC_HOLYDAY_BANG",
                payload: {
                    playerId: player.id,
                    attackerId: player.id,
                    playerName: player.name,
                    targetId: target.id,
                    targetPlayerId: target.id,
                    targetName: target.name,
                    discardedCardIds: discarded.map((c) => c.id),
                    requiredMissedCount: reactionRes.reaction.requiredCount,
                    canUseBarrel: reactionRes.reaction.canUseBarrel,
                    canUseJourdonnais: reactionRes.reaction.canUseJourdonnais,
                },
                timestamp: Date.now(),
            });
        }
        return { success: true, events };
    }
    static extractTwoDistinctIds(raw) {
        if (!Array.isArray(raw) || raw.length !== 2)
            return null;
        const [first, second] = raw;
        if (typeof first !== "string" || typeof second !== "string")
            return null;
        if (!first || !second || first === second)
            return null;
        return [first, second];
    }
    static removeHandCards(player, cardIds) {
        const idSet = new Set(cardIds);
        const matched = player.handCards.filter((c) => idSet.has(c.id));
        if (matched.length !== cardIds.length)
            return null;
        player.handCards = player.handCards.filter((c) => !idSet.has(c.id));
        return matched;
    }
}
exports.ActiveSkills = ActiveSkills;
