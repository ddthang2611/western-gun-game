"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventEngine = void 0;
const crypto_1 = __importDefault(require("crypto"));
const deck_manager_1 = require("../deck/deck_manager");
const seat_manager_1 = require("../board/seat_manager");
const skill_hooks_1 = require("../interact/skill_hooks");
const event_rule_registry_1 = require("./event_rule_registry");
const inventory_1 = require("../utils/inventory");
class EventEngine {
    // Build event deck with final card
    static setupEventDeck(eventCards, packs) {
        const activePacks = new Set(packs.filter((p) => p === "high_noon" || p === "fistful_of_cards"));
        if (activePacks.size === 0)
            return [];
        const filtered = eventCards.filter((e) => activePacks.has(e.pack));
        if (filtered.length === 0)
            return [];
        const normal = EventEngine.shuffleEvents(filtered.filter((e) => !e.isFinalCard));
        const finals = filtered.filter((e) => e.isFinalCard);
        const selectedNormals = normal.slice(0, Math.min(12, normal.length));
        if (finals.length > 0) {
            const finalCard = finals[crypto_1.default.randomInt(0, finals.length)];
            return [finalCard, ...selectedNormals];
        }
        return selectedNormals;
    }
    // Reveal event on Sheriff turn
    static advanceRoundEvent(state, events) {
        if (state.roundNumber < 2)
            return;
        if (state.eventDeck.length === 0 && state.activeEvent === null)
            return;
        if (state.activeEvent?.isFinalCard)
            return;
        const nextEvent = state.eventDeck.pop();
        if (!nextEvent)
            return;
        if (state.activeEvent) {
            state.eventDiscardPile.push(state.activeEvent);
        }
        state.direction = 1;
        state.vendettaExtraTurnUsed = false;
        state.activeEvent = nextEvent;
        events.push({
            type: "EVENT_REVEALED",
            payload: {
                event: nextEvent,
                roundNumber: state.roundNumber,
            },
            timestamp: Date.now(),
        });
        EventEngine.applyEntryEffect(state, nextEvent, events);
    }
    // Prepare turn start state and choices
    static prepareTurnStart(state, player, events) {
        if (state.turnPlayerId && state.turnPlayerId !== player.id) {
            state.vendettaExtraTurnUsed = false;
        }
        player.copiedCharacter = null;
        player.forcedPlayCardId = null;
        const code = state.activeEvent?.effectCode;
        if (code === "EVENT_FOC_DEAD_MAN" &&
            state.firstEliminatedPlayerId === player.id &&
            player.isDead) {
            player.isDead = false;
            player.isGhost = false;
            player.hp = Math.min(2, player.maxHp);
            const { cards: drawn, events: drawEvents } = deck_manager_1.DeckManager.drawCards(state, 2);
            events.push(...drawEvents);
            player.handCards.push(...drawn);
            state.firstEliminatedPlayerId = null;
            events.push({
                type: "EVENT_DEAD_MAN_REVIVED",
                payload: {
                    playerId: player.id,
                    playerName: player.name,
                    hp: player.hp,
                    drawnCount: drawn.length,
                },
                timestamp: Date.now(),
            });
        }
        else if (code === "EVENT_HN_GHOST_TOWN" && player.isDead) {
            player.isGhost = true;
            player.isDead = false;
            player.hp = 0;
            events.push({
                type: "EVENT_GHOST_TOWN_ENTER",
                payload: {
                    playerId: player.id,
                    playerName: player.name,
                },
                timestamp: Date.now(),
            });
        }
        if (player.isDead) {
            return {
                needsHighNoonDamage: false,
                fistfulBangCount: 0,
                pausedForChoice: false,
            };
        }
        const needsHighNoonDamage = code === "EVENT_HN_HIGH_NOON" && !player.isGhost;
        const fistfulBangCount = code === "EVENT_FOC_FISTFUL_OF_CARDS" && !player.isGhost
            ? player.handCards.length
            : 0;
        const pausedForChoice = EventEngine.maybeQueueVeraOrBloodBrothers(state, player, true);
        return {
            needsHighNoonDamage,
            fistfulBangCount,
            pausedForChoice,
        };
    }
    // Queue Blood Brothers or Vera choice
    static maybeQueueVeraOrBloodBrothers(state, player, checkBloodBrothers) {
        if (player.isDead)
            return false;
        if (checkBloodBrothers &&
            state.activeEvent?.effectCode === "EVENT_FOC_BLOOD_BROTHERS" &&
            !player.isGhost &&
            player.hp > 1) {
            const eligibleTargetIds = seat_manager_1.SeatManager.getAlivePlayers(state, false)
                .filter((p) => p.id !== player.id && !p.isGhost && p.hp > 0)
                .map((p) => p.id);
            if (eligibleTargetIds.length > 0) {
                state.pendingTurnStartChoice = {
                    type: "BLOOD_BROTHERS",
                    playerId: player.id,
                    eligibleTargetIds,
                };
                return true;
            }
        }
        if (skill_hooks_1.SkillHooks.hasSkill(player, "Vera Custer", state) &&
            !player.copiedCharacter) {
            const availableCharacters = [];
            const others = seat_manager_1.SeatManager.getAlivePlayers(state, false).filter((p) => p.id !== player.id && !p.isGhost);
            for (const other of others) {
                for (const character of other.characters) {
                    availableCharacters.push({
                        ownerPlayerId: other.id,
                        ownerName: other.name,
                        character,
                    });
                }
            }
            if (availableCharacters.length > 0) {
                state.pendingTurnStartChoice = {
                    type: "VERA_CUSTER_COPY",
                    playerId: player.id,
                    availableCharacters,
                };
                return true;
            }
        }
        return false;
    }
    // Resolve pending turn start choice
    static resolveTurnStartChoice(state, command, events) {
        const choice = state.pendingTurnStartChoice;
        if (!choice) {
            return { success: false, message: "No pending turn start choice." };
        }
        const player = state.players.get(command.playerId);
        if (!player)
            return { success: false, message: "Player not found." };
        if (player.isDead) {
            return { success: false, message: "Dead players cannot act." };
        }
        if (choice.playerId !== player.id) {
            return {
                success: false,
                message: "Turn start choice belongs to another player.",
            };
        }
        if (choice.type === "VERA_CUSTER_COPY") {
            const rawId = command.characterIds?.[0] ??
                command.payload?.characterId ??
                command.payload?.targetCharacterId ??
                command.payload?.targetCharId ??
                command.targetCardId ??
                command.cardId ??
                "";
            return skill_hooks_1.SkillHooks.resolveVeraCusterCopy(state, player, String(rawId), events);
        }
        if (choice.type === "BLOOD_BROTHERS") {
            const targetId = command.targetPlayerId ?? command.payload?.targetPlayerId;
            const shouldSkip = !targetId || command.payload?.skip === true;
            if (shouldSkip) {
                state.pendingTurnStartChoice = null;
                events.push({
                    type: "EVENT_BLOOD_BROTHERS_SKIPPED",
                    payload: { playerId: player.id, playerName: player.name },
                    timestamp: Date.now(),
                });
                EventEngine.maybeQueueVeraOrBloodBrothers(state, player, false);
                return { success: true, events };
            }
            if (player.isGhost || player.hp <= 1) {
                return {
                    success: false,
                    message: "Cannot sacrifice last life point.",
                };
            }
            if (choice.eligibleTargetIds &&
                !choice.eligibleTargetIds.includes(targetId)) {
                return {
                    success: false,
                    message: "Invalid Blood Brothers target player.",
                };
            }
            const target = state.players.get(targetId);
            if (!target || target.isDead || target.isGhost || target.hp <= 0) {
                return { success: false, message: "Target player is not in play." };
            }
            player.hp -= 1;
            target.hp = Math.min(target.hp + 1, target.maxHp);
            state.pendingTurnStartChoice = null;
            events.push({
                type: "EVENT_BLOOD_BROTHERS_RESOLVED",
                payload: {
                    fromPlayerId: player.id,
                    fromPlayerName: player.name,
                    targetPlayerId: target.id,
                    targetPlayerName: target.name,
                    fromHp: player.hp,
                    targetHp: target.hp,
                },
                timestamp: Date.now(),
            });
            skill_hooks_1.SkillHooks.onTakeDamage(state, player, undefined, 1, events);
            EventEngine.maybeQueueVeraOrBloodBrothers(state, player, false);
            return { success: true, events };
        }
        return { success: false, message: "Unsupported turn start choice." };
    }
    // Handle Ghost exit and Vendetta
    static onTurnEnd(state, player, events) {
        if (player.isGhost) {
            for (const card of player.handCards) {
                deck_manager_1.DeckManager.discardCard(state, card);
            }
            player.handCards = [];
            for (const eqCard of (0, inventory_1.getAllEquippedCards)(player)) {
                deck_manager_1.DeckManager.discardCard(state, eqCard);
            }
            player.equipments = { extras: [] };
            for (const green of player.greenCards) {
                deck_manager_1.DeckManager.discardCard(state, green.card);
            }
            player.greenCards = [];
            for (const judge of player.judgements) {
                deck_manager_1.DeckManager.discardCard(state, judge.card);
            }
            player.judgements = [];
            player.isGhost = false;
            player.isDead = true;
            player.hp = 0;
            state.vendettaExtraTurnUsed = false;
            events.push({
                type: "EVENT_GHOST_TOWN_EXIT",
                payload: {
                    playerId: player.id,
                    playerName: player.name,
                },
                timestamp: Date.now(),
            });
            return { extraTurnGranted: false };
        }
        if (state.activeEvent?.effectCode === "EVENT_FOC_VENDETTA" &&
            !player.isDead &&
            !state.vendettaExtraTurnUsed) {
            const check = skill_hooks_1.SkillHooks.executeDrawCheck(state, player, "VENDETTA", (card, st) => skill_hooks_1.SkillHooks.getEffectiveSuit(card, st) === "hearts");
            events.push(...check.events);
            if (check.success) {
                state.vendettaExtraTurnUsed = true;
                events.push({
                    type: "EVENT_VENDETTA_EXTRA_TURN",
                    payload: {
                        playerId: player.id,
                        playerName: player.name,
                    },
                    timestamp: Date.now(),
                });
                return { extraTurnGranted: true };
            }
        }
        state.vendettaExtraTurnUsed = false;
        return { extraTurnGranted: false };
    }
    // Check event card play restrictions
    static shouldBlockPlayCard(state, player, card) {
        return event_rule_registry_1.EventRuleRegistry.canPlayCard(state, player, card);
    }
    // Create Russian Roulette reaction entry
    static createRussianRouletteReaction(state, targetPlayerId) {
        const sourceCard = state.activeEvent
            ? EventEngine.createEventSourceCard(state.activeEvent)
            : EventEngine.createFallbackEventCard("foc_russian_roulette", "fistful_of_cards", "Russian Roulette");
        return {
            id: `react_roulette_${targetPlayerId}_${Date.now()}_${Math.random()
                .toString(36)
                .slice(2, 8)}`,
            type: "EVENT_RUSSIAN_ROULETTE",
            sourcePlayerId: state.sheriffId || "SYSTEM",
            targetPlayerId,
            sourceCard,
            requiredCard: "MISSED",
            requiredCount: 1,
            currentCount: 0,
            canUseBarrel: false,
            canUseJourdonnais: false,
            barrelChecked: false,
            jourdonnaisChecked: false,
            pendingDamage: 2,
            rouletteChainNext: true,
            createdAt: Date.now(),
        };
    }
    // Create Fistful of Cards reactions
    static createFistfulBangReactions(state, player, count) {
        if (count <= 0)
            return [];
        const sourceCard = state.activeEvent
            ? EventEngine.createEventSourceCard(state.activeEvent, "BANG!")
            : EventEngine.createFallbackEventCard("foc_fistful_of_cards", "fistful_of_cards", "BANG!");
        const equipEffective = skill_hooks_1.SkillHooks.isEquipmentEffective(player, player, state);
        const canUseBarrel = equipEffective && (0, inventory_1.hasBarrelCard)(player);
        const canUseJourdonnais = skill_hooks_1.SkillHooks.hasInnateBarrel(player, state);
        const reactions = [];
        for (let i = 0; i < count; i++) {
            reactions.push({
                id: `react_foc_${player.id}_${i}_${Date.now()}_${Math.random()
                    .toString(36)
                    .slice(2, 8)}`,
                type: "BANG_DEFENSE",
                sourcePlayerId: "SYSTEM",
                targetPlayerId: player.id,
                sourceCard,
                requiredCard: "MISSED",
                requiredCount: 1,
                currentCount: 0,
                canUseBarrel,
                canUseJourdonnais,
                barrelChecked: false,
                jourdonnaisChecked: false,
                pendingDamage: 1,
                createdAt: Date.now(),
            });
        }
        return reactions;
    }
    static applyEntryEffect(state, eventCard, events) {
        const code = eventCard.effectCode;
        if (code === "EVENT_HN_GOLD_RUSH") {
            state.direction = -1;
            events.push({
                type: "EVENT_DIRECTION_CHANGED",
                payload: { direction: -1, eventId: eventCard.id },
                timestamp: Date.now(),
            });
            return;
        }
        if (code === "EVENT_HN_THE_DOCTOR") {
            const alive = seat_manager_1.SeatManager.getAlivePlayers(state, false).filter((p) => !p.isGhost && p.hp > 0);
            if (alive.length === 0)
                return;
            const minHp = Math.min(...alive.map((p) => p.hp));
            const affectedPlayers = [];
            for (const player of alive) {
                if (player.hp === minHp) {
                    const prevHp = player.hp;
                    player.hp = Math.min(player.hp + 1, player.maxHp);
                    affectedPlayers.push({
                        playerId: player.id,
                        playerName: player.name,
                        healedAmount: player.hp - prevHp,
                        currentHp: player.hp,
                    });
                }
            }
            events.push({
                type: "EVENT_THE_DOCTOR_HEAL",
                payload: { minHp, affectedPlayers },
                timestamp: Date.now(),
            });
            return;
        }
        if (code === "EVENT_HN_THE_DALTONS") {
            const originId = state.sheriffId || state.turnPlayerId;
            const ordered = seat_manager_1.SeatManager.getClockwisePlayers(state, originId, true).filter((p) => !p.isDead && !p.isGhost);
            const sourceCard = EventEngine.createEventSourceCard(eventCard);
            for (const player of ordered) {
                if (EventEngine.hasBlueCardInPlay(player)) {
                    state.pendingReactions.push({
                        id: `react_daltons_${player.id}_${Date.now()}_${Math.random()
                            .toString(36)
                            .slice(2, 8)}`,
                        type: "EVENT_DALTONS_DISCARD",
                        sourcePlayerId: state.sheriffId || "SYSTEM",
                        targetPlayerId: player.id,
                        sourceCard,
                        requiredCard: "BLUE_EQUIP",
                        requiredCount: 1,
                        currentCount: 0,
                        canUseBarrel: false,
                        canUseJourdonnais: false,
                        barrelChecked: false,
                        jourdonnaisChecked: false,
                        createdAt: Date.now(),
                    });
                }
            }
            return;
        }
        if (code === "EVENT_FOC_RUSSIAN_ROULETTE") {
            const originId = state.sheriffId || state.turnPlayerId;
            const ordered = seat_manager_1.SeatManager.getClockwisePlayers(state, originId, true).filter((p) => !p.isDead && !p.isGhost);
            if (ordered.length > 0) {
                state.pendingReactions.push(EventEngine.createRussianRouletteReaction(state, ordered[0].id));
            }
        }
    }
    static hasBlueCardInPlay(player) {
        const hasEquip = (0, inventory_1.getAllEquippedCards)(player).length > 0;
        const hasBlueJudgement = player.judgements.some((j) => j.card.border === "blue");
        return hasEquip || hasBlueJudgement;
    }
    static createEventSourceCard(eventCard, nameOverride) {
        return {
            id: eventCard.id,
            seq: 0,
            templateId: eventCard.id,
            pack: eventCard.pack,
            name: nameOverride ?? eventCard.name,
            border: "brown",
            category: "event",
            rank: "A",
            suit: "clubs",
            desc: eventCard.desc,
            image: eventCard.image,
        };
    }
    static createFallbackEventCard(id, pack, name) {
        return {
            id,
            seq: 0,
            templateId: id,
            pack,
            name,
            border: "brown",
            category: "event",
            rank: "A",
            suit: "clubs",
            desc: "",
        };
    }
    static shuffleEvents(cards) {
        const list = [...cards];
        for (let i = list.length - 1; i > 0; i--) {
            const j = crypto_1.default.randomInt(0, i + 1);
            [list[i], list[j]] = [list[j], list[i]];
        }
        return list;
    }
}
exports.EventEngine = EventEngine;
