"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BotDecisionEngine = void 0;
const bot_belief_tracker_1 = require("./bot_belief_tracker");
const bot_state_utils_1 = require("./bot_state_utils");
const bot_reaction_solver_1 = require("./bot_reaction_solver");
const bot_action_planner_1 = require("./bot_action_planner");
class BotDecisionEngine {
    botId;
    difficulty;
    beliefTracker;
    turnMemory;
    constructor(botId, difficulty = "hard") {
        this.botId = botId;
        this.difficulty = difficulty;
        this.beliefTracker = new bot_belief_tracker_1.BotBeliefTracker();
        this.turnMemory = {
            turnKey: "",
            lastStateSeq: -1,
            actionsTaken: 0,
            docHolydayUsed: 0,
            joseDelgadoUsed: 0,
            rejectedSignatures: new Set(),
        };
    }
    // Reset per-match beliefs and turn memory
    reset() {
        this.beliefTracker.reset();
        this.turnMemory.turnKey = "";
        this.turnMemory.lastStateSeq = -1;
        this.turnMemory.actionsTaken = 0;
        this.turnMemory.docHolydayUsed = 0;
        this.turnMemory.joseDelgadoUsed = 0;
        this.turnMemory.rejectedSignatures.clear();
    }
    // Feed public events filtered for this bot
    observe(events, snapshot) {
        this.syncTurnMemory(snapshot);
        this.beliefTracker.syncWithSnapshot(snapshot, this.botId);
        for (const ev of events) {
            if (ev.type === "ACTIVE_SKILL_USED" && ev.payload?.playerId === this.botId) {
                const skill = String(ev.payload?.skill || "");
                if (skill === "DOC_HOLYDAY_BANG" || skill === "Doc Holyday") {
                    this.turnMemory.docHolydayUsed += 1;
                }
                if (skill === "JOSE_DELGADO_DRAW" || skill === "Jose Delgado") {
                    this.turnMemory.joseDelgadoUsed += 1;
                }
            }
            if (ev.type === "DOC_HOLYDAY_BANG" && ev.payload?.playerId === this.botId) {
                this.turnMemory.docHolydayUsed += 1;
            }
        }
        if (events.length > 0) {
            this.beliefTracker.observeEvents(events, snapshot, this.botId);
        }
    }
    // Record command rejection to prevent retry loops
    recordRejection(stateSeq, command) {
        if (this.turnMemory.lastStateSeq !== stateSeq) {
            this.turnMemory.lastStateSeq = stateSeq;
            this.turnMemory.rejectedSignatures.clear();
        }
        this.turnMemory.rejectedSignatures.add((0, bot_state_utils_1.buildCommandSignature)(command));
    }
    // Expose beliefs for diagnostics and benchmarks
    getBeliefSnapshot() {
        return new Map(this.beliefTracker.getBeliefMap());
    }
    // Produce next legal command for this bot or null if idle
    decideNextCommand(snapshot) {
        if (snapshot.gameOver || snapshot.matchPhase === "FINISHED") {
            return null;
        }
        this.syncTurnMemory(snapshot);
        this.beliefTracker.syncWithSnapshot(snapshot, this.botId);
        // Point 1: Character selection
        if (snapshot.matchPhase === "CHARACTER_SELECT") {
            return (0, bot_reaction_solver_1.solveCharacterSelect)(snapshot, this.botId);
        }
        const me = (0, bot_state_utils_1.getPlayerById)(snapshot, this.botId);
        if (!me || me.isDead)
            return null;
        const ctx = this.buildContext(snapshot, me);
        // Point 4: Active chain interrupts (Lucky Duke, El Gringo, Brawl, General Store)
        const hasAnyActiveChain = Boolean(snapshot.pendingLuckyDukePick ||
            snapshot.pendingElGringoPick ||
            snapshot.pendingBrawlPick ||
            snapshot.generalStore);
        if (hasAnyActiveChain) {
            return (0, bot_reaction_solver_1.solveActiveChain)(ctx);
        }
        // Point 5: Pending reaction interrupts
        if (snapshot.pendingReactionTargets.length > 0 || snapshot.myPendingReaction) {
            return (0, bot_reaction_solver_1.solveReaction)(ctx);
        }
        // Point 2: Turn-start choices (Vera Custer, Blood Brothers)
        if (snapshot.pendingTurnStartChoice) {
            return (0, bot_reaction_solver_1.solveTurnStartChoice)(ctx);
        }
        // Point 3: Phase 1 choices (Kit Carlson, draw options, Peyote, Ranch)
        if (snapshot.pendingPhase1Choice) {
            return (0, bot_reaction_solver_1.solvePhase1Choice)(ctx);
        }
        // Point 6: Own active turn (Phase 2 or Phase 3)
        if (snapshot.turnPlayerId !== this.botId) {
            return null;
        }
        if (snapshot.currentPhase === 3) {
            return (0, bot_action_planner_1.solvePhase3Discard)(ctx);
        }
        if (snapshot.currentPhase === 2) {
            const cmd = (0, bot_action_planner_1.planPhase2Action)(ctx);
            if (cmd.type !== "END_TURN") {
                this.turnMemory.actionsTaken += 1;
            }
            return cmd;
        }
        return null;
    }
    // Identify player IDs currently expected to act
    static getExpectedActorIds(snapshot) {
        if (snapshot.gameOver || snapshot.matchPhase === "FINISHED")
            return [];
        if (snapshot.matchPhase === "CHARACTER_SELECT") {
            const submitted = new Set(snapshot.pendingCharacterSelect?.submittedPlayerIds || []);
            return snapshot.players
                .filter((p) => !submitted.has(p.id))
                .map((p) => p.id);
        }
        if (snapshot.pendingLuckyDukePick)
            return [snapshot.pendingLuckyDukePick.playerId];
        if (snapshot.pendingElGringoPick)
            return [snapshot.pendingElGringoPick.victimId];
        if (snapshot.pendingBrawlPick)
            return [snapshot.pendingBrawlPick.actorPlayerId];
        if (snapshot.generalStore?.currentPickerId)
            return [snapshot.generalStore.currentPickerId];
        if (snapshot.pendingReactionTargets.length > 0) {
            return [snapshot.pendingReactionTargets[0].targetPlayerId];
        }
        if (snapshot.pendingTurnStartChoice)
            return [snapshot.pendingTurnStartChoice.playerId];
        if (snapshot.pendingPhase1Choice)
            return [snapshot.pendingPhase1Choice.playerId];
        if (snapshot.turnPlayerId)
            return [snapshot.turnPlayerId];
        return [];
    }
    syncTurnMemory(snapshot) {
        const key = `${snapshot.roundNumber}:${snapshot.turnPlayerId}`;
        if (this.turnMemory.turnKey !== key) {
            this.turnMemory.turnKey = key;
            this.turnMemory.actionsTaken = 0;
            this.turnMemory.docHolydayUsed = 0;
            this.turnMemory.joseDelgadoUsed = 0;
            this.turnMemory.rejectedSignatures.clear();
        }
        if (this.turnMemory.lastStateSeq !== snapshot.stateSeq) {
            this.turnMemory.lastStateSeq = snapshot.stateSeq;
            this.turnMemory.rejectedSignatures.clear();
        }
    }
    buildContext(snapshot, me) {
        return {
            botId: this.botId,
            difficulty: this.difficulty,
            snapshot,
            me,
            myRole: snapshot.myState?.role ?? (me.role !== "UNKNOWN" ? me.role : "outlaw"),
            hand: snapshot.myState?.handCards ?? me.handCards ?? [],
            alivePlayers: (0, bot_state_utils_1.getAlivePlayers)(snapshot, true),
            beliefs: this.beliefTracker.getBeliefMap(),
            swingScores: this.beliefTracker.getSwingScores(),
            turnMemory: this.turnMemory,
            preferredPeyoteColor: this.beliefTracker.getPreferredPeyoteColor(snapshot),
        };
    }
}
exports.BotDecisionEngine = BotDecisionEngine;
