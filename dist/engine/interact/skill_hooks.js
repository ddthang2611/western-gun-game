"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkillHooks = void 0;
const deck_manager_1 = require("../deck/deck_manager");
const event_rule_registry_1 = require("../events/event_rule_registry");
const skill_registry_1 = require("../cards/skill_registry");
const DYNAMITE_RANKS = new Set(["2", "3", "4", "5", "6", "7", "8", "9"]);
class SkillHooks {
    // Check character skill and suppression
    static hasSkill(player, charName, state) {
        if (event_rule_registry_1.EventRuleRegistry.suppressesSkills(state)) {
            return false;
        }
        const needle = charName.toLowerCase();
        const hasBase = player.characters.some((c) => c.name.toLowerCase() === needle || c.id.toLowerCase() === needle);
        if (hasBase)
            return true;
        if (player.copiedCharacter) {
            return (player.copiedCharacter.name.toLowerCase() === needle ||
                player.copiedCharacter.id.toLowerCase() === needle);
        }
        return false;
    }
    // Resolve suit under active event
    static getEffectiveSuit(card, state) {
        return event_rule_registry_1.EventRuleRegistry.getEffectiveSuit(state, card);
    }
    // Check if equipment is active
    static isEquipmentEffective(owner, turnPlayer, state) {
        if (event_rule_registry_1.EventRuleRegistry.negatesEquipment(state)) {
            return false;
        }
        const activeTurn = turnPlayer ?? (state ? state.players.get(state.turnPlayerId) : undefined);
        if (activeTurn &&
            owner.id !== activeTurn.id &&
            skill_registry_1.SkillRegistry.getActiveDefinitions(activeTurn, state).some((d) => d.passive?.negateOthersInPlayDuringOwnTurn)) {
            return false;
        }
        return true;
    }
    // Slab the Killer attack modifier
    static getMissedRequiredForAttack(attacker, card, state) {
        if (card.name === "BANG!") {
            for (const def of skill_registry_1.SkillRegistry.getActiveDefinitions(attacker, state)) {
                if (def.passive?.standardBangMissedRequired) {
                    return def.passive.standardBangMissedRequired;
                }
            }
        }
        return 1;
    }
    // Apache Kid Diamonds immunity check
    static isImmuneToCard(defender, card, attacker, state) {
        if (!attacker || attacker.id === defender.id) {
            return false;
        }
        const suit = SkillHooks.getEffectiveSuit(card, state);
        return skill_registry_1.SkillRegistry.getActiveDefinitions(defender, state).some((d) => d.passive?.immuneToOtherPlayersSuit === suit);
    }
    // Calamity Janet and Elena Fuente
    static canSubstituteCard(player, card, targetRole, state) {
        for (const def of skill_registry_1.SkillRegistry.getActiveDefinitions(player, state)) {
            if (targetRole === "MISSED" && def.substitution?.allowAnyHandAsMissed) {
                return true;
            }
            if (targetRole === "MISSED" && card.name === "BANG!" && def.substitution?.allowBangAsMissed) {
                return true;
            }
            if (targetRole === "BANG" && card.name === "MISSED!" && def.substitution?.allowMissedAsBang) {
                return true;
            }
        }
        return false;
    }
    // Jourdonnais innate Barrel check
    static hasInnateBarrel(player, state) {
        return skill_registry_1.SkillRegistry.getActiveDefinitions(player, state).some((d) => d.passive?.innateBarrel);
    }
    // Willy the Kid unlimited BANG!
    static hasUnlimitedBang(player, state) {
        return skill_registry_1.SkillRegistry.getActiveDefinitions(player, state).some((d) => d.passive?.unlimitedBang);
    }
    // Paul Regret defense distance bonus
    static getDistanceDefenseBonus(defender, state) {
        let bonus = 0;
        for (const def of skill_registry_1.SkillRegistry.getActiveDefinitions(defender, state)) {
            bonus += def.passive?.defenseDistanceBonus ?? 0;
        }
        return bonus;
    }
    // Rose Doolan offense distance bonus
    static getDistanceOffenseBonus(attacker, state) {
        let bonus = 0;
        for (const def of skill_registry_1.SkillRegistry.getActiveDefinitions(attacker, state)) {
            bonus += def.passive?.offenseDistanceBonus ?? 0;
        }
        return bonus;
    }
    // Sean Mallory end-turn hand limit
    static getPhase3HandLimit(player, state) {
        for (const def of skill_registry_1.SkillRegistry.getActiveDefinitions(player, state)) {
            if (def.passive?.phase3HandLimit !== undefined) {
                return def.passive.phase3HandLimit;
            }
        }
        return player.hp;
    }
    // Tequila Joe Beer heal amount
    static getBeerHealAmount(player, state) {
        for (const def of skill_registry_1.SkillRegistry.getActiveDefinitions(player, state)) {
            if (def.passive?.beerHealAmount !== undefined) {
                return def.passive.beerHealAmount;
            }
        }
        return 1;
    }
    // Evaluate Draw! condition by reason
    static isDrawCheckSuccess(reason, card, state) {
        const suit = SkillHooks.getEffectiveSuit(card, state);
        if (reason === "DYNAMITE") {
            return !(suit === "spades" && DYNAMITE_RANKS.has(card.rank));
        }
        return suit === "hearts";
    }
    // Emit finalized Draw! check result
    static emitDrawCheckResult(state, player, reason, isLuckyDuke, drawn, chosenCard, success, events) {
        const effectiveSuit = chosenCard
            ? SkillHooks.getEffectiveSuit(chosenCard, state)
            : undefined;
        events.push({
            type: "DRAW_CHECK_RESULT",
            payload: {
                playerId: player.id,
                playerName: player.name,
                reason,
                isLuckyDuke,
                drawnCards: drawn,
                chosenCard,
                effectiveSuit,
                effectiveSuits: drawn.map((c) => SkillHooks.getEffectiveSuit(c, state)),
                emptyDeck: drawn.length === 0,
                success,
                isSuccess: success,
            },
            timestamp: Date.now(),
        });
    }
    // Lucky Duke Draw! check execution
    static executeDrawCheck(state, player, reason, condition, luckyMeta) {
        const events = [];
        const isLuckyDuke = SkillHooks.hasSkill(player, "Lucky Duke", state);
        const count = isLuckyDuke ? 2 : 1;
        const { cards: drawn, events: drawEvents } = deck_manager_1.DeckManager.drawCards(state, count);
        events.push(...drawEvents);
        if (isLuckyDuke && drawn.length === 2) {
            const pickState = {
                type: "LUCKY_DUKE_PICK",
                playerId: player.id,
                reason,
                drawnCards: drawn,
                ...(luckyMeta?.judgementCard ? { judgementCard: luckyMeta.judgementCard } : {}),
                ...(luckyMeta?.judgementId ? { judgementId: luckyMeta.judgementId } : {}),
                ...(luckyMeta?.sourceReactionId ? { sourceReactionId: luckyMeta.sourceReactionId } : {}),
            };
            state.activeChain.push(pickState);
            events.push({
                type: "LUCKY_DUKE_DRAW_PENDING",
                payload: {
                    playerId: player.id,
                    playerName: player.name,
                    reason,
                    drawnCards: drawn,
                },
                timestamp: Date.now(),
            });
            return {
                pendingInteraction: pickState,
                success: false,
                drawnCards: drawn,
                events,
            };
        }
        const chosenCard = drawn[0];
        const success = chosenCard ? condition(chosenCard, state) : false;
        deck_manager_1.DeckManager.discardCardsRespectingMine(state, drawn);
        SkillHooks.emitDrawCheckResult(state, player, reason, isLuckyDuke, drawn, chosenCard, success, events);
        return { success, drawnCards: drawn, chosenCard, events };
    }
    // Suzy Lafayette empty hand draw
    static checkSuzyLafayette(state, player, events) {
        if (player.isDead || player.handCards.length > 0)
            return;
        if (!player.isGhost && player.hp <= 0)
            return;
        if (!SkillHooks.hasSkill(player, "Suzy Lafayette", state))
            return;
        const { cards: drawn, events: drawEvents } = deck_manager_1.DeckManager.drawCards(state, 1);
        events.push(...drawEvents);
        if (drawn.length === 0)
            return;
        player.handCards.push(...drawn);
        events.push({
            type: "SUZY_LAFAYETTE_TRIGGERED",
            payload: {
                playerId: player.id,
                playerName: player.name,
                drawnCount: drawn.length,
            },
            timestamp: Date.now(),
        });
    }
    // Bart Cassidy and El Gringo
    static onTakeDamage(state, victim, attacker, damageAmount, events) {
        if (damageAmount <= 0 || victim.isDead || victim.isGhost || victim.hp <= 0) {
            return;
        }
        if (SkillHooks.hasSkill(victim, "Bart Cassidy", state)) {
            const { cards: drawn, events: drawEvents } = deck_manager_1.DeckManager.drawCards(state, damageAmount);
            events.push(...drawEvents);
            if (drawn.length > 0) {
                victim.handCards.push(...drawn);
                events.push({
                    type: "BART_CASSIDY_TRIGGERED",
                    payload: {
                        playerId: victim.id,
                        drawnCount: drawn.length,
                    },
                    timestamp: Date.now(),
                });
            }
        }
        if (SkillHooks.hasSkill(victim, "El Gringo", state) &&
            attacker &&
            attacker.id !== victim.id &&
            !attacker.isDead &&
            attacker.handCards.length > 0) {
            const remainingSteals = Math.min(damageAmount, attacker.handCards.length);
            const gringoState = {
                type: "EL_GRINGO_PICK",
                victimId: victim.id,
                attackerId: attacker.id,
                remainingSteals,
            };
            state.activeChain.push(gringoState);
            events.push({
                type: "EL_GRINGO_PICK_PENDING",
                payload: {
                    victimId: victim.id,
                    victimName: victim.name,
                    attackerId: attacker.id,
                    attackerName: attacker.name,
                    remainingSteals,
                },
                timestamp: Date.now(),
            });
        }
    }
    // Molly Stark out-of-turn draw
    static onPlayOutOfTurn(state, player, events, count = 1) {
        if (player.isDead ||
            (!player.isGhost && player.hp <= 0) ||
            state.turnPlayerId === player.id ||
            count <= 0) {
            return;
        }
        if (!SkillHooks.hasSkill(player, "Molly Stark", state))
            return;
        const { cards: drawn, events: drawEvents } = deck_manager_1.DeckManager.drawCards(state, count);
        events.push(...drawEvents);
        if (drawn.length === 0)
            return;
        player.handCards.push(...drawn);
        events.push({
            type: "MOLLY_STARK_TRIGGERED",
            payload: {
                playerId: player.id,
                playerName: player.name,
                drawnCount: drawn.length,
            },
            timestamp: Date.now(),
        });
    }
    // Queue Molly Stark deferred draw
    static queueDeferredMollyDraw(state, reaction, player) {
        if (player.isDead || (!player.isGhost && player.hp <= 0))
            return;
        if (state.turnPlayerId === player.id)
            return;
        if (!SkillHooks.hasSkill(player, "Molly Stark", state))
            return;
        if (!reaction.deferredMollyDraws) {
            reaction.deferredMollyDraws = {};
        }
        reaction.deferredMollyDraws[player.id] =
            (reaction.deferredMollyDraws[player.id] ?? 0) + 1;
    }
    // Flush or forward Molly draws
    static flushDeferredMollyDraws(state, reaction, events) {
        const deferred = reaction.deferredMollyDraws;
        if (!deferred)
            return;
        for (const [pid, count] of Object.entries(deferred)) {
            if (count <= 0)
                continue;
            const targetPlayer = state.players.get(pid);
            if (!targetPlayer || targetPlayer.isDead)
                continue;
            if (!targetPlayer.isGhost && targetPlayer.hp <= 0) {
                const rescue = state.pendingReactions.find((r) => r.type === "NEAR_DEATH_RESCUE" && r.targetPlayerId === pid);
                if (rescue) {
                    if (!rescue.deferredMollyDraws)
                        rescue.deferredMollyDraws = {};
                    rescue.deferredMollyDraws[pid] =
                        (rescue.deferredMollyDraws[pid] ?? 0) + count;
                }
                continue;
            }
            SkillHooks.onPlayOutOfTurn(state, targetPlayer, events, count);
        }
        delete reaction.deferredMollyDraws;
    }
    // Sid Ketchum near-death rescue check
    static canSidKetchumRescue(state, victim) {
        if (victim.isDead || victim.isGhost)
            return false;
        return (SkillHooks.hasSkill(victim, "Sid Ketchum", state) &&
            victim.handCards.length >= 2);
    }
    // Vera Custer turn-start copy resolution
    static resolveVeraCusterCopy(state, player, targetCharId, events) {
        const pending = state.pendingTurnStartChoice;
        if (!pending ||
            pending.type !== "VERA_CUSTER_COPY" ||
            pending.playerId !== player.id) {
            return {
                success: false,
                message: "No pending Vera Custer copy choice for this player.",
            };
        }
        const chosen = pending.availableCharacters?.find((entry) => entry.character.id === targetCharId ||
            entry.character.name.toLowerCase() === targetCharId.toLowerCase());
        if (!chosen) {
            return { success: false, message: "Invalid target character to copy." };
        }
        player.copiedCharacter = { ...chosen.character };
        state.pendingTurnStartChoice = null;
        events.push({
            type: "VERA_CUSTER_COPIED",
            payload: {
                playerId: player.id,
                playerName: player.name,
                copiedCharacter: player.copiedCharacter,
                sourceOwnerPlayerId: chosen.ownerPlayerId,
                sourceOwnerName: chosen.ownerName,
            },
            timestamp: Date.now(),
        });
        return { success: true, events };
    }
    // Active character skills facade
    static handleActiveSkill(state, command, events, deckManager) {
        const { ActiveSkills } = require("./handlers/active_skills");
        return ActiveSkills.handleActiveSkill(state, command, events, deckManager);
    }
}
exports.SkillHooks = SkillHooks;
