import { GameEngine } from "../engine/game_engine";
import { BotDecisionEngine } from "../engine/bot/index";
import { DomainEvent, PlayerCommand } from "../engine/types/actions";

export type BotCommandExecutor = (
  botId: string,
  command: PlayerCommand
) => boolean;

export class BotRunner {
  private static readonly DELAY_THINK_MS = 1000;
  private static readonly MAX_RETRIES_PER_SEQ = 3;

  private readonly bots = new Map<string, BotDecisionEngine>();
  private timer: NodeJS.Timeout | null = null;
  private retryCounts = new Map<string, number>();

  constructor(botPlayerIds: string[]) {
    for (const botId of botPlayerIds) {
      // Bots always run at maximum intelligence
      this.bots.set(botId, new BotDecisionEngine(botId, "hard"));
    }
  }

  public hasBots(): boolean {
    return this.bots.size > 0;
  }

  public isBot(playerId: string): boolean {
    return this.bots.has(playerId);
  }

  public isScheduled(): boolean {
    return this.timer !== null;
  }

  public stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.retryCounts.clear();
  }

  // Feed Fog-of-War filtered events to each bot
  public observeEvents(events: DomainEvent[], engine: GameEngine): void {
    if (!this.hasBots() || events.length === 0) return;

    for (const [botId, bot] of this.bots.entries()) {
      if (!engine.getState().players.has(botId)) continue;
      const filtered = events
        .map((ev) => engine.filterEventForPlayer(ev, botId))
        .filter((ev): ev is DomainEvent => Boolean(ev));
      if (filtered.length > 0) {
        bot.observe(filtered, engine.getFilteredSnapshot(botId));
      }
    }
  }

  // Schedule next single bot command respecting Arena pacing
  public scheduleNextStep(
    engine: GameEngine,
    isPaused: () => boolean,
    executeCommand: BotCommandExecutor
  ): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (!this.hasBots()) return;
    const simState = engine.getState();
    if (simState.gameOver || simState.matchPhase === "FINISHED") return;
    if (isPaused()) return;

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

    const firstBotId = this.bots.keys().next().value as string | undefined;
    if (!firstBotId || !simState.players.has(firstBotId)) return;

    const probeSnap = engine.getFilteredSnapshot(firstBotId);
    const expectedActors = BotDecisionEngine.getExpectedActorIds(probeSnap);
    const activeBotId = expectedActors.find((id) => this.bots.has(id));
    if (!activeBotId) return;

    this.armTimer(BotRunner.DELAY_THINK_MS, () => {
      this.runSingleStep(activeBotId, engine, isPaused, executeCommand);
    });
  }

  private armTimer(delayMs: number, fn: () => void): void {
    this.timer = setTimeout(() => {
      this.timer = null;
      fn();
    }, delayMs);
    this.timer.unref?.();
  }

  private runSingleStep(
    botId: string,
    engine: GameEngine,
    isPaused: () => boolean,
    executeCommand: BotCommandExecutor
  ): void {
    const simState = engine.getState();
    if (simState.gameOver || simState.matchPhase === "FINISHED") return;
    if (isPaused()) return;

    const bot = this.bots.get(botId);
    if (!bot) return;

    const snap = engine.getFilteredSnapshot(botId);
    const cmd = bot.decideNextCommand(snap);
    if (!cmd) return;

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
      this.armTimer(120, () =>
        this.runSingleStep(botId, engine, isPaused, executeCommand)
      );
      return;
    }

    // Safe fallback to guarantee zero deadlocks
    const fallback = this.buildSafeFallback(botId, snap);
    if (fallback) {
      executeCommand(botId, fallback);
    }
  }

  private buildSafeFallback(
    botId: string,
    snap: ReturnType<GameEngine["getFilteredSnapshot"]>
  ): PlayerCommand | null {
    if (snap.matchPhase === "CHARACTER_SELECT" && snap.pendingCharacterSelect) {
      const candidates = snap.pendingCharacterSelect.candidates || [];
      const required = snap.pendingCharacterSelect.requiredCount || 1;
      const characterIds = candidates.slice(0, required).map((c) => c.id);
      if (characterIds.length > 0) {
        return { playerId: botId, type: "SELECT_CHARACTERS", characterIds };
      }
    }
    if (snap.myPendingReaction?.targetPlayerId === botId) {
      if (snap.myPendingReaction.type === "EVENT_DALTONS_DISCARD") {
        const me = snap.players.find((p) => p.id === botId);
        const eq = me?.equipments;
        const firstBlue =
          eq?.weapon || eq?.horseDef || eq?.horseOff || eq?.barrel || eq?.extra || eq?.extras?.[0] || me?.judgements?.[0]?.card;
        if (firstBlue) {
          return {
            playerId: botId,
            type: "RESOLVE_REACTION",
            targetCardId: firstBlue.id,
            payload: { cardId: firstBlue.id },
          };
        }
      }
      const action =
        snap.myPendingReaction.type === "NEAR_DEATH_RESCUE"
          ? "DECLINE_RESCUE"
          : "TAKE_DAMAGE";
      return {
        playerId: botId,
        type: "RESOLVE_REACTION",
        payload: { action },
      };
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
        const handLimit = me?.characters?.some((c) => c.id === "sean_mallory")
          ? 10
          : me?.hp ?? 0;
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
