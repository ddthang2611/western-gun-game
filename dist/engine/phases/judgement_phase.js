"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JudgementPhase = void 0;
const deck_manager_1 = require("../deck/deck_manager");
const seat_manager_1 = require("../board/seat_manager");
const skill_hooks_1 = require("../interact/skill_hooks");
const atomic_effects_1 = require("../interact/primitives/atomic_effects");
const DYNAMITE_RANKS = new Set(["2", "3", "4", "5", "6", "7", "8", "9"]);
class JudgementPhase {
    // Check Dynamite explosion condition
    static isDynamiteExploded(card, state) {
        return (skill_hooks_1.SkillHooks.getEffectiveSuit(card, state) === "spades" &&
            DYNAMITE_RANKS.has(card.rank));
    }
    // Check Jail escape condition
    static isJailEscaped(card, state) {
        return skill_hooks_1.SkillHooks.getEffectiveSuit(card, state) === "hearts";
    }
    // Discard card respecting Abandoned Mine
    static discardJudgementCard(state, card) {
        if (state.activeEvent?.effectCode === "EVENT_FOC_ABANDONED_MINE") {
            deck_manager_1.DeckManager.placeOnTopOfDeck(state, card);
        }
        else {
            deck_manager_1.DeckManager.discardCard(state, card);
        }
    }
    // Execute Phase 0 judgements
    static executePhase0(state, player, events) {
        if (player.isGhost || player.judgements.length === 0) {
            return { turnSkipped: false, playerDied: false, waitingForRescue: false };
        }
        // Resolve Dynamite strictly before Jail
        const orderedJudgements = [...player.judgements].sort((a, b) => {
            const pA = a.type === "DYNAMITE" ? 0 : 1;
            const pB = b.type === "DYNAMITE" ? 0 : 1;
            if (pA !== pB)
                return pA - pB;
            return b.attachedSeq - a.attachedSeq;
        });
        for (const judgement of orderedJudgements) {
            if (player.isDead || state.pendingReactions.length > 0) {
                break;
            }
            if (judgement.type === "DYNAMITE") {
                player.judgements = player.judgements.filter((j) => j.id !== judgement.id);
                const check = skill_hooks_1.SkillHooks.executeDrawCheck(state, player, "DYNAMITE", (card, st) => !this.isDynamiteExploded(card, st));
                events.push(...check.events);
                const exploded = !check.success;
                events.push({
                    type: "JUDGEMENT_RESOLVED",
                    payload: {
                        playerId: player.id,
                        playerName: player.name,
                        judgementType: "DYNAMITE",
                        judgementCard: judgement.card,
                        drawnCard: check.chosenCard,
                        result: exploded ? "EXPLODED" : "PASSED",
                        damage: exploded ? 3 : 0,
                    },
                    timestamp: Date.now(),
                });
                if (exploded) {
                    this.discardJudgementCard(state, judgement.card);
                    events.push({
                        type: "DYNAMITE_EXPLODED",
                        payload: {
                            playerId: player.id,
                            playerName: player.name,
                            card: judgement.card,
                            damage: 3,
                        },
                        timestamp: Date.now(),
                    });
                    atomic_effects_1.AtomicEffects.applyDamage(state, undefined, player, 3, events);
                    if (player.isDead) {
                        return { turnSkipped: true, playerDied: true, waitingForRescue: false };
                    }
                    if (state.pendingReactions.some((r) => r.type === "NEAR_DEATH_RESCUE")) {
                        return { turnSkipped: false, playerDied: false, waitingForRescue: true };
                    }
                }
                else {
                    const candidates = seat_manager_1.SeatManager.getClockwisePlayers(state, player.id, false);
                    const nextSeat = candidates.find((c) => !c.judgements.some((j) => j.type === "DYNAMITE")) ??
                        seat_manager_1.SeatManager.getPlayerOnLeft(state, player.id);
                    state.attachedSeqCounter += 1;
                    const passedJudgement = {
                        id: judgement.id,
                        card: judgement.card,
                        type: "DYNAMITE",
                        attachedSeq: state.attachedSeqCounter,
                        attachedTimestamp: Date.now(),
                    };
                    nextSeat.judgements.push(passedJudgement);
                    events.push({
                        type: "DYNAMITE_PASSED",
                        payload: {
                            fromPlayerId: player.id,
                            fromPlayerName: player.name,
                            toPlayerId: nextSeat.id,
                            toPlayerName: nextSeat.name,
                            card: judgement.card,
                            newSeq: state.attachedSeqCounter,
                        },
                        timestamp: Date.now(),
                    });
                }
            }
            else if (judgement.type === "JAIL") {
                if (player.isDead || state.pendingReactions.length > 0) {
                    break;
                }
                player.judgements = player.judgements.filter((j) => j.id !== judgement.id);
                this.discardJudgementCard(state, judgement.card);
                const check = skill_hooks_1.SkillHooks.executeDrawCheck(state, player, "JAIL", (card, st) => this.isJailEscaped(card, st));
                events.push(...check.events);
                events.push({
                    type: "JUDGEMENT_RESOLVED",
                    payload: {
                        playerId: player.id,
                        playerName: player.name,
                        judgementType: "JAIL",
                        judgementCard: judgement.card,
                        drawnCard: check.chosenCard,
                        result: check.success ? "ESCAPED" : "LOCKED",
                    },
                    timestamp: Date.now(),
                });
                if (!check.success) {
                    events.push({
                        type: "JAIL_FAILED_SKIP_TURN",
                        payload: {
                            playerId: player.id,
                            playerName: player.name,
                            card: judgement.card,
                        },
                        timestamp: Date.now(),
                    });
                    return { turnSkipped: true, playerDied: false, waitingForRescue: false };
                }
                events.push({
                    type: "JAIL_ESCAPED",
                    payload: {
                        playerId: player.id,
                        playerName: player.name,
                        card: judgement.card,
                    },
                    timestamp: Date.now(),
                });
            }
        }
        return { turnSkipped: false, playerDied: false, waitingForRescue: false };
    }
}
exports.JudgementPhase = JudgementPhase;
