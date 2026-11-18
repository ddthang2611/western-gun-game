"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkillHooks = void 0;
const crypto_1 = __importDefault(require("crypto"));
const deck_manager_1 = require("../deck/deck_manager");
const event_rule_registry_1 = require("../events/event_rule_registry");
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
            SkillHooks.hasSkill(activeTurn, "Belle Star", state)) {
            return false;
        }
        return true;
    }
    // Slab the Killer attack modifier
    static getMissedRequiredForAttack(attacker, card, state) {
        if (card.name === "BANG!" && SkillHooks.hasSkill(attacker, "Slab the Killer", state)) {
            return 2;
        }
        return 1;
    }
    // Apache Kid Diamonds immunity check
    static isImmuneToCard(defender, card, attacker, state) {
        if (!attacker || attacker.id === defender.id) {
            return false;
        }
        const suit = SkillHooks.getEffectiveSuit(card, state);
        if (SkillHooks.hasSkill(defender, "Apache Kid", state) && suit === "diamonds") {
            return true;
        }
        return false;
    }
    // Calamity Janet and Elena Fuente
    static canSubstituteCard(player, card, targetRole, state) {
        if (targetRole === "MISSED" && SkillHooks.hasSkill(player, "Elena Fuente", state)) {
            return true;
        }
        if (SkillHooks.hasSkill(player, "Calamity Janet", state)) {
            if (targetRole === "MISSED" && card.name === "BANG!")
                return true;
            if (targetRole === "BANG" && card.name === "MISSED!")
                return true;
        }
        return false;
    }
    // Jourdonnais innate Barrel check
    static hasInnateBarrel(player, state) {
        return SkillHooks.hasSkill(player, "Jourdonnais", state);
    }
    // Willy the Kid unlimited BANG!
    static hasUnlimitedBang(player, state) {
        return SkillHooks.hasSkill(player, "Willy the Kid", state);
    }
    // Paul Regret defense distance bonus
    static getDistanceDefenseBonus(defender, state) {
        return SkillHooks.hasSkill(defender, "Paul Regret", state) ? 1 : 0;
    }
    // Rose Doolan offense distance bonus
    static getDistanceOffenseBonus(attacker, state) {
        return SkillHooks.hasSkill(attacker, "Rose Doolan", state) ? -1 : 0;
    }
    // Sean Mallory end-turn hand limit
    static getPhase3HandLimit(player, state) {
        return SkillHooks.hasSkill(player, "Sean Mallory", state) ? 10 : player.hp;
    }
    // Tequila Joe Beer heal amount
    static getBeerHealAmount(player, state) {
        return SkillHooks.hasSkill(player, "Tequila Joe", state) ? 2 : 1;
    }
    // Lucky Duke Draw! check execution
    static executeDrawCheck(state, player, reason, condition) {
        const events = [];
        const isLuckyDuke = SkillHooks.hasSkill(player, "Lucky Duke", state);
        const count = isLuckyDuke ? 2 : 1;
        const { cards: drawn, events: drawEvents } = deck_manager_1.DeckManager.drawCards(state, count);
        events.push(...drawEvents);
        let chosenCard = drawn[0];
        let success = false;
        if (drawn.length > 0) {
            success = condition(drawn[0], state);
            if (!success && isLuckyDuke && drawn.length > 1) {
                if (condition(drawn[1], state)) {
                    chosenCard = drawn[1];
                    success = true;
                }
            }
        }
        for (const card of drawn) {
            deck_manager_1.DeckManager.discardCard(state, card);
        }
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
            !attacker.isDead) {
            for (let i = 0; i < damageAmount; i++) {
                if (attacker.handCards.length === 0)
                    break;
                const randIdx = crypto_1.default.randomInt(0, attacker.handCards.length);
                const stolenCard = attacker.handCards.splice(randIdx, 1)[0];
                victim.handCards.push(stolenCard);
                events.push({
                    type: "EL_GRINGO_STOLEN",
                    visibleTo: [victim.id, attacker.id],
                    payload: {
                        victimId: victim.id,
                        attackerId: attacker.id,
                        card: stolenCard,
                    },
                    maskedPayload: {
                        victimId: victim.id,
                        attackerId: attacker.id,
                        card: {
                            id: "SECRET",
                            name: "Card from hand",
                            suit: "UNKNOWN",
                            rank: "UNKNOWN",
                        },
                    },
                    timestamp: Date.now(),
                });
            }
            SkillHooks.checkSuzyLafayette(state, attacker, events);
        }
    }
    // Molly Stark out-of-turn draw
    static onPlayOutOfTurn(state, player, events) {
        if (player.isDead || state.turnPlayerId === player.id)
            return;
        if (!SkillHooks.hasSkill(player, "Molly Stark", state))
            return;
        const { cards: drawn, events: drawEvents } = deck_manager_1.DeckManager.drawCards(state, 1);
        events.push(...drawEvents);
        if (drawn.length === 0)
            return;
        player.handCards.push(...drawn);
        events.push({
            type: "MOLLY_STARK_TRIGGERED",
            payload: {
                playerId: player.id,
                drawnCount: drawn.length,
            },
            timestamp: Date.now(),
        });
    }
    // Greg Digger and Herb Hunter
    static onPlayerEliminated(state, deadPlayer, events) {
        state.players.forEach((player) => {
            if (player.isDead || player.id === deadPlayer.id)
                return;
            if (!player.isGhost && player.hp > 0 && SkillHooks.hasSkill(player, "Greg Digger", state)) {
                const heal = Math.min(2, player.maxHp - player.hp);
                if (heal > 0) {
                    player.hp += heal;
                    events.push({
                        type: "GREG_DIGGER_HEALED",
                        payload: {
                            playerId: player.id,
                            playerName: player.name,
                            healedAmount: heal,
                            currentHp: player.hp,
                        },
                        timestamp: Date.now(),
                    });
                }
            }
            if (SkillHooks.hasSkill(player, "Herb Hunter", state)) {
                const { cards: drawn, events: drawEvents } = deck_manager_1.DeckManager.drawCards(state, 2);
                events.push(...drawEvents);
                if (drawn.length > 0) {
                    player.handCards.push(...drawn);
                    events.push({
                        type: "HERB_HUNTER_DRAW",
                        payload: {
                            playerId: player.id,
                            playerName: player.name,
                            drawnCount: drawn.length,
                        },
                        timestamp: Date.now(),
                    });
                }
            }
        });
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
    static handleActiveSkill(state, command, events) {
        const { ActiveSkills } = require("./handlers/active_skills");
        return ActiveSkills.handleActiveSkill(state, command, events);
    }
}
exports.SkillHooks = SkillHooks;
