import { DomainEvent, PlayerCommand } from "../types/actions";
import { SanitizedGameState, SanitizedPlayerState } from "../state/fog_of_war";
import {
  BotDecisionContext,
  BotDifficulty,
  BotTurnMemory,
} from "./bot_types";
import { BotBeliefTracker } from "./bot_belief_tracker";
import {
  buildCommandSignature,
  getAlivePlayers,
  getPlayerById,
} from "./bot_state_utils";
import {
  solveActiveChain,
  solveCharacterSelect,
  solvePhase1Choice,
  solveReaction,
  solveTurnStartChoice,
} from "./bot_reaction_solver";
import {
  planPhase2Action,
  solvePhase3Discard,
} from "./bot_action_planner";

export class BotDecisionEngine {
  public readonly botId: string;
  public readonly difficulty: BotDifficulty;
  private readonly beliefTracker: BotBeliefTracker;
  private readonly turnMemory: BotTurnMemory;

  constructor(botId: string, difficulty: BotDifficulty = "hard") {
    this.botId = botId;
    this.difficulty = difficulty;
    this.beliefTracker = new BotBeliefTracker();
    this.turnMemory = {
      turnKey: "",
      lastStateSeq: -1,
      actionsTaken: 0,
      docHolydayUsed: 0,
      joseDelgadoUsed: 0,
      rejectedSignatures: new Set<string>(),
    };
  }

  // Reset per-match beliefs and turn memory
  public reset(): void {
    this.beliefTracker.reset();
    this.turnMemory.turnKey = "";
    this.turnMemory.lastStateSeq = -1;
    this.turnMemory.actionsTaken = 0;
    this.turnMemory.docHolydayUsed = 0;
    this.turnMemory.joseDelgadoUsed = 0;
    this.turnMemory.rejectedSignatures.clear();
  }

  // Feed public events filtered for this bot
  public observe(events: DomainEvent[], snapshot: SanitizedGameState): void {
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
  public recordRejection(stateSeq: number, command: PlayerCommand): void {
    if (this.turnMemory.lastStateSeq !== stateSeq) {
      this.turnMemory.lastStateSeq = stateSeq;
      this.turnMemory.rejectedSignatures.clear();
    }
    this.turnMemory.rejectedSignatures.add(buildCommandSignature(command));
  }

  // Expose beliefs for diagnostics and benchmarks
  public getBeliefSnapshot(): Map<string, { deputy: number; outlaw: number; renegade: number }> {
    return new Map(this.beliefTracker.getBeliefMap());
  }

  // Produce next legal command for this bot or null if idle
  public decideNextCommand(snapshot: SanitizedGameState): PlayerCommand | null {
    if (snapshot.gameOver || snapshot.matchPhase === "FINISHED") {
      return null;
    }

    this.syncTurnMemory(snapshot);
    this.beliefTracker.syncWithSnapshot(snapshot, this.botId);

    // Point 1: Character selection
    if (snapshot.matchPhase === "CHARACTER_SELECT") {
      return solveCharacterSelect(snapshot, this.botId);
    }

    const me = getPlayerById(snapshot, this.botId);
    if (!me || me.isDead) return null;

    const ctx = this.buildContext(snapshot, me);

    // Point 4: Active chain interrupts (Lucky Duke, El Gringo, Brawl, General Store)
    const hasAnyActiveChain = Boolean(
      snapshot.pendingLuckyDukePick ||
        snapshot.pendingElGringoPick ||
        snapshot.pendingBrawlPick ||
        snapshot.generalStore
    );
    if (hasAnyActiveChain) {
      return solveActiveChain(ctx);
    }

    // Point 5: Pending reaction interrupts
    if (snapshot.pendingReactionTargets.length > 0 || snapshot.myPendingReaction) {
      return solveReaction(ctx);
    }

    // Point 2: Turn-start choices (Vera Custer, Blood Brothers)
    if (snapshot.pendingTurnStartChoice) {
      return solveTurnStartChoice(ctx);
    }

    // Point 3: Phase 1 choices (Kit Carlson, draw options, Peyote, Ranch)
    if (snapshot.pendingPhase1Choice) {
      return solvePhase1Choice(ctx);
    }

    // Point 6: Own active turn (Phase 2 or Phase 3)
    if (snapshot.turnPlayerId !== this.botId) {
      return null;
    }

    if (snapshot.currentPhase === 3) {
      return solvePhase3Discard(ctx);
    }

    if (snapshot.currentPhase === 2) {
      const cmd = planPhase2Action(ctx);
      if (cmd.type !== "END_TURN") {
        this.turnMemory.actionsTaken += 1;
      }
      return cmd;
    }

    return null;
  }

  // Identify player IDs currently expected to act
  public static getExpectedActorIds(snapshot: SanitizedGameState): string[] {
    if (snapshot.gameOver || snapshot.matchPhase === "FINISHED") return [];

    if (snapshot.matchPhase === "CHARACTER_SELECT") {
      const submitted = new Set(snapshot.pendingCharacterSelect?.submittedPlayerIds || []);
      return snapshot.players
        .filter((p) => !submitted.has(p.id))
        .map((p) => p.id);
    }

    if (snapshot.pendingLuckyDukePick) return [snapshot.pendingLuckyDukePick.playerId];
    if (snapshot.pendingElGringoPick) return [snapshot.pendingElGringoPick.victimId];
    if (snapshot.pendingBrawlPick) return [snapshot.pendingBrawlPick.actorPlayerId];
    if (snapshot.generalStore?.currentPickerId) return [snapshot.generalStore.currentPickerId];

    if (snapshot.pendingReactionTargets.length > 0) {
      return [snapshot.pendingReactionTargets[0].targetPlayerId];
    }

    if (snapshot.pendingTurnStartChoice) return [snapshot.pendingTurnStartChoice.playerId];
    if (snapshot.pendingPhase1Choice) return [snapshot.pendingPhase1Choice.playerId];

    if (snapshot.turnPlayerId) return [snapshot.turnPlayerId];
    return [];
  }

  private syncTurnMemory(snapshot: SanitizedGameState): void {
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

  private buildContext(
    snapshot: SanitizedGameState,
    me: SanitizedPlayerState
  ): BotDecisionContext {
    return {
      botId: this.botId,
      difficulty: this.difficulty,
      snapshot,
      me,
      myRole: snapshot.myState?.role ?? (me.role !== "UNKNOWN" ? me.role : "outlaw"),
      hand: snapshot.myState?.handCards ?? me.handCards ?? [],
      alivePlayers: getAlivePlayers(snapshot, true),
      beliefs: this.beliefTracker.getBeliefMap(),
      swingScores: this.beliefTracker.getSwingScores(),
      turnMemory: this.turnMemory,
      preferredPeyoteColor: this.beliefTracker.getPreferredPeyoteColor(snapshot),
    };
  }
}
