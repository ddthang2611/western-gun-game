"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BotRunner = void 0;
const index_1 = require("../engine/bot/index");
class BotRunner {
    static DELAY_THINK_MS = 1350;
    static MAX_RETRIES_PER_SEQ = 3;
    bots = new Map();
    timer = null;
    retryCounts = new Map();
    constructor(botPlayerIds) {
        for (const botId of botPlayerIds) {
            // Bots always run at maximum intelligence
            this.bots.set(botId, new index_1.BotDecisionEngine(botId, "hard"));
        }
    }
    hasBots() {
        return this.bots.size > 0;
    }
    isBot(playerId) {
        return this.bots.has(playerId);
    }
    isScheduled() {
        return this.timer !== null;
    }
    stop() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        this.retryCounts.clear();
    }
    // Feed Fog-of-War filtered events to each bot
    observeEvents(events, engine) {
        if (!this.hasBots() || events.length === 0)
            return;
        for (const [botId, bot] of this.bots.entries()) {
            if (!engine.getState().players.has(botId))
                continue;
            const filtered = events
                .map((ev) => engine.filterEventForPlayer(ev, botId))
                .filter((ev) => Boolean(ev));
            if (filtered.length > 0) {
                bot.observe(filtered, engine.getFilteredSnapshot(botId));
            }
        }
    }
    // Schedule next single bot command respecting Arena pacing
    scheduleNextStep(engine, isPaused, executeCommand) {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        if (!this.hasBots())
            return;
        const simState = engine.getState();
        if (simState.gameOver || simState.matchPhase === "FINISHED")
            return;
        if (isPaused())
            return;
        const now = Date.now();
        const chain = simState.arenaChain;
        if (chain?.status === "SETTLING") {
            const waitMs = Math.max(120, (chain.settleUntil || 0) - now + 150);
            this.armTimer(waitMs, () => this.scheduleNextStep(engine, isPaused, executeCommand));
            return;
        }
        if ((chain?.stepLockUntil || 0) > now) {
            const waitMs = Math.max(120, (chain.stepLockUntil || 0) - now + 120);
            this.armTimer(waitMs, () => this.scheduleNextStep(engine, isPaused, executeCommand));
            return;
        }
        const firstBotId = this.bots.keys().next().value;
        if (!firstBotId || !simState.players.has(firstBotId))
            return;
        const probeSnap = engine.getFilteredSnapshot(firstBotId);
        const expectedActors = index_1.BotDecisionEngine.getExpectedActorIds(probeSnap);
        const activeBotId = expectedActors.find((id) => this.bots.has(id));
        if (!activeBotId)
            return;
        this.armTimer(BotRunner.DELAY_THINK_MS, () => {
            this.runSingleStep(activeBotId, engine, isPaused, executeCommand);
        });
    }
    armTimer(delayMs, fn) {
        this.timer = setTimeout(() => {
            this.timer = null;
            fn();
        }, delayMs);
        this.timer.unref?.();
    }
    runSingleStep(botId, engine, isPaused, executeCommand) {
        const simState = engine.getState();
        if (simState.gameOver || simState.matchPhase === "FINISHED")
            return;
        if (isPaused())
            return;
        const bot = this.bots.get(botId);
        if (!bot)
            return;
        const snap = engine.getFilteredSnapshot(botId);
        const cmd = bot.decideNextCommand(snap);
        if (!cmd)
            return;
        const retryKey = `${snap.stateSeq}:${botId}`;
        const ok = executeCommand(botId, cmd);
        if (ok) {
            this.retryCounts.delete(retryKey);
            return;
        }
        bot.recordRejection(snap.stateSeq, cmd);
        const attempts = (this.retryCounts.get(retryKey) ?? 0) + 1;
        this.retryCounts.set(retryKey, attempts);
        if (attempts <= BotRunner.MAX_RETRIES_PER_SEQ) {
            this.armTimer(120, () => this.runSingleStep(botId, engine, isPaused, executeCommand));
            return;
        }
        // Safe fallback to guarantee zero deadlocks
        const fallback = this.buildSafeFallback(botId, snap);
        if (fallback) {
            executeCommand(botId, fallback);
        }
    }
    buildSafeFallback(botId, snap) {
        if (snap.matchPhase === "CHARACTER_SELECT" && snap.pendingCharacterSelect) {
            const candidates = snap.pendingCharacterSelect.candidates || [];
            const required = snap.pendingCharacterSelect.requiredCount || 1;
            const characterIds = candidates.slice(0, required).map((c) => c.id);
            if (characterIds.length > 0) {
                return { playerId: botId, type: "SELECT_CHARACTERS", characterIds };
            }
        }
        // Handle activeChain card picks first
        if (snap.pendingLuckyDukePick) {
            if (snap.pendingLuckyDukePick.playerId !== botId)
                return null;
            const drawn = snap.pendingLuckyDukePick.drawnCards || [];
            const chosen = drawn.find((c) => c.matches) || drawn[0];
            if (chosen) {
                return { playerId: botId, type: "SELECT_STOLEN_CARD", cardId: chosen.id };
            }
            return null;
        }
        if (snap.pendingElGringoPick) {
            if (snap.pendingElGringoPick.victimId !== botId)
                return null;
            return {
                playerId: botId,
                type: "SELECT_STOLEN_CARD",
                targetPlayerId: snap.pendingElGringoPick.attackerId,
                targetArea: "HAND",
            };
        }
        if (snap.pendingBrawlPick) {
            if (snap.pendingBrawlPick.actorPlayerId !== botId)
                return null;
            const target = snap.players.find((p) => p.id === snap.pendingBrawlPick.currentTargetId);
            if (!target)
                return null;
            if (target.handCount > 0) {
                return {
                    playerId: botId,
                    type: "SELECT_STOLEN_CARD",
                    targetPlayerId: target.id,
                    targetArea: "HAND",
                };
            }
            const eq = target.equipments;
            const firstEquip = eq?.weapon ||
                eq?.barrel ||
                eq?.horseDef ||
                eq?.horseOff ||
                eq?.extra ||
                eq?.extras?.[0];
            if (firstEquip) {
                return {
                    playerId: botId,
                    type: "SELECT_STOLEN_CARD",
                    targetPlayerId: target.id,
                    targetArea: "EQUIPMENT",
                    targetCardId: firstEquip.id,
                };
            }
            if (target.greenCards?.length > 0) {
                return {
                    playerId: botId,
                    type: "SELECT_STOLEN_CARD",
                    targetPlayerId: target.id,
                    targetArea: "GREEN",
                    targetCardId: target.greenCards[0].card.id,
                };
            }
            if (target.judgements?.length > 0) {
                return {
                    playerId: botId,
                    type: "SELECT_STOLEN_CARD",
                    targetPlayerId: target.id,
                    targetArea: "JUDGEMENT",
                    targetCardId: target.judgements[0].card.id,
                };
            }
            return null;
        }
        if (snap.generalStore) {
            if (snap.generalStore.currentPickerId !== botId)
                return null;
            const firstPoolCard = snap.generalStore.pool?.[0];
            if (firstPoolCard) {
                return {
                    playerId: botId,
                    type: "SELECT_STOLEN_CARD",
                    cardId: firstPoolCard.id,
                };
            }
            return null;
        }
        if (snap.myPendingReaction?.targetPlayerId === botId) {
            if (snap.myPendingReaction.type === "EVENT_DALTONS_DISCARD") {
                const me = snap.players.find((p) => p.id === botId);
                const eq = me?.equipments;
                const firstBlue = eq?.weapon || eq?.horseDef || eq?.horseOff || eq?.barrel || eq?.extra || eq?.extras?.[0] || me?.judgements?.[0]?.card;
                if (firstBlue) {
                    return {
                        playerId: botId,
                        type: "RESOLVE_REACTION",
                        targetCardId: firstBlue.id,
                        payload: { cardId: firstBlue.id },
                    };
                }
            }
            const action = snap.myPendingReaction.type === "NEAR_DEATH_RESCUE"
                ? "DECLINE_RESCUE"
                : "TAKE_DAMAGE";
            return {
                playerId: botId,
                type: "RESOLVE_REACTION",
                payload: { action },
            };
        }
        if ((snap.pendingReactionTargets?.length ?? 0) > 0) {
            return null;
        }
        if (snap.pendingTurnStartChoice?.playerId === botId) {
            if (snap.pendingTurnStartChoice.type === "VERA_CUSTER_COPY") {
                const firstId = snap.pendingTurnStartChoice.availableCharacters?.[0]?.character.id;
                if (firstId) {
                    return { playerId: botId, type: "RESOLVE_TURN_START", characterIds: [firstId] };
                }
            }
            return { playerId: botId, type: "RESOLVE_TURN_START", payload: { skip: true } };
        }
        if (snap.pendingPhase1Choice?.playerId === botId) {
            const p1 = snap.pendingPhase1Choice;
            if (p1.mode === "KIT_CARLSON_PICK") {
                const count = Math.min(Number(p1.neededCount || 2), (p1.previewCards || []).length);
                return {
                    playerId: botId,
                    type: "RESOLVE_PHASE_1",
                    payload: { cardIds: (p1.previewCards || []).slice(0, count).map((c) => c.id) },
                };
            }
            if (p1.mode === "CHOOSE_DRAW_OPTION") {
                return {
                    playerId: botId,
                    type: "RESOLVE_PHASE_1",
                    payload: { choice: p1.options?.[0] || "NORMAL_DECK" },
                };
            }
            if (p1.mode === "PEYOTE_GUESS") {
                return { playerId: botId, type: "RESOLVE_PHASE_1", payload: { choice: "RED" } };
            }
            if (p1.mode === "RANCH_EXCHANGE") {
                return { playerId: botId, type: "RESOLVE_PHASE_1", payload: { skip: true } };
            }
        }
        if (snap.turnPlayerId === botId) {
            if (snap.currentPhase === 3) {
                const me = snap.players.find((p) => p.id === botId);
                const hangover = snap.activeEvent?.effectCode === "EVENT_HN_HANGOVER";
                const isSean = (c) => Boolean(c &&
                    (c.id === "char_sean_mallory" ||
                        c.id === "sean_mallory" ||
                        c.name?.trim().toLowerCase() === "sean mallory"));
                const hasSeanMallory = !hangover &&
                    Boolean(me?.characters?.some(isSean) || isSean(me?.copiedCharacter));
                const handLimit = hasSeanMallory ? 10 : Math.max(0, me?.hp ?? 0);
                const excess = Math.max(0, (snap.myState?.handCards.length || 0) - handLimit);
                const discardIds = (snap.myState?.handCards || []).slice(0, excess).map((c) => c.id);
                return { playerId: botId, type: "END_TURN", discardCardIds: discardIds };
            }
            if (snap.currentPhase === 2) {
                return { playerId: botId, type: "END_TURN" };
            }
        }
        return null;
    }
}
exports.BotRunner = BotRunner;
