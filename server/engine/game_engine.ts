import {
  SimulationState,
  EnginePlayer,
  EngineCharacter,
  HpRuleType,
  PendingCharacterChoice,
} from "./types/state";
import { EngineCard, EngineEventCard } from "./types/cards";
import { PlayerCommand, CommandResult, DomainEvent } from "./types/actions";
import { DeckManager } from "./deck/deck_manager";
import { SetupDealer } from "./deck/setup_dealer";
import { TurnManager } from "./phases/turn_manager";
import { EventEngine } from "./events/event_engine";
import { filterActiveExpansions } from "./events/expansion_config";
import { FogOfWarFilter, FilteredWorldSnapshot } from "./state/fog_of_war";
import { WinConditionEvaluator } from "./elimination/win_condition";
import { InteractManager } from "./interact/interact_manager";

export interface GameEngineOptions {
  defaultEnableCharacterSelect?: boolean;
  defaultEnable3PlayerVariant?: boolean;
  expansions?: string[];
}

export interface SerializedEngineState
  extends Omit<SimulationState, "players" | "pendingCharacterSelect"> {
  players: Array<[string, EnginePlayer]>;
  pendingCharacterSelect: Array<[string, PendingCharacterChoice]>;
}

export class GameEngine {
  private static readonly MAX_PROCESSED_COMMANDS = 200;
  private state: SimulationState;
  private allRawCards: EngineCard[];
  private allEventCards: EngineEventCard[];
  private defaultEnableCharSelect: boolean;
  private defaultEnable3PVariant?: boolean;
  private processedCommandIds: string[] = [];
  private processedCommandSet: Set<string> = new Set();

  constructor(
    roomId: string,
    initialCards: EngineCard[] = [],
    eventCards: EngineEventCard[] = [],
    options?: GameEngineOptions
  ) {
    this.allRawCards = [...initialCards];
    this.allEventCards = [...eventCards];
    this.defaultEnableCharSelect = Boolean(options?.defaultEnableCharacterSelect);
    this.defaultEnable3PVariant = options?.defaultEnable3PlayerVariant;

    this.state = {
      roomId,
      stateSeq: 0,
      matchPhase: "PLAYING",
      roundNumber: 1,
      turnPlayerId: "",
      sheriffId: "",
      direction: 1,
      currentPhase: 0,
      bangCountThisTurn: 0,
      docHolydayUsedThisTurn: 0,
      joseDelgadoCountThisTurn: 0,
      attachedSeqCounter: 0,
      dualCharacterMode: false,
      hpRule: "strict",
      is3PlayerVariant: false,
      expansions: options?.expansions
        ? [...options.expansions]
        : filterActiveExpansions(["base", "dodge_city", "high_noon", "fistful_of_cards"]),
      players: new Map<string, EnginePlayer>(),
      drawDeck: DeckManager.shuffleCards(this.allRawCards),
      discardPile: [],
      eventDeck: [],
      eventDiscardPile: [],
      activeEvent: null,
      firstEliminatedPlayerId: null,
      vendettaExtraTurnUsed: false,
      pendingCharacterSelect: new Map(),
      pendingTurnStartChoice: null,
      pendingPhase1Choice: null,
      activeChain: [],
      pendingReactions: [],
    };
  }

  // Initialize match state and start
  public startMatch(
    playerList: { id: string; name: string }[],
    allCharacters: EngineCharacter[],
    dualCharacterMode: boolean = false,
    hpRule: HpRuleType = "strict",
    options?: {
      enableCharacterSelect?: boolean;
      expansions?: string[];
      enable3PlayerVariant?: boolean;
    }
  ): CommandResult & { initialSnapshot?: FilteredWorldSnapshot } {
    const expansions = options?.expansions
      ? [...options.expansions]
      : [...this.state.expansions];
    const enableCharSelect =
      options?.enableCharacterSelect ?? this.defaultEnableCharSelect;
    const enable3PVariant =
      playerList.length === 3 &&
      (options?.enable3PlayerVariant ?? this.defaultEnable3PVariant ?? true);

    this.state.expansions = expansions;
    this.state.stateSeq = 0;
    this.processedCommandIds = [];
    this.processedCommandSet.clear();
    this.state.dualCharacterMode = dualCharacterMode;
    this.state.hpRule = hpRule;
    this.state.is3PlayerVariant = enable3PVariant;
    this.state.roundNumber = 1;
    this.state.turnPlayerId = "";
    this.state.sheriffId = "";
    this.state.direction = 1;
    this.state.currentPhase = 0;
    this.state.bangCountThisTurn = 0;
    this.state.docHolydayUsedThisTurn = 0;
    this.state.joseDelgadoCountThisTurn = 0;
    this.state.attachedSeqCounter = 0;
    this.state.activeEvent = null;
    this.state.firstEliminatedPlayerId = null;
    this.state.vendettaExtraTurnUsed = false;
    this.state.pendingCharacterSelect.clear();
    this.state.pendingTurnStartChoice = null;
    this.state.pendingPhase1Choice = null;
    this.state.activeChain = [];
    this.state.pendingReactions = [];
    this.state.gameOver = undefined;
    this.state.discardPile = [];
    this.state.eventDiscardPile = [];
    this.state.drawDeck = SetupDealer.buildDeck(this.allRawCards, expansions);
    this.state.eventDeck = EventEngine.setupEventDeck(this.allEventCards, expansions);

    const { players, sheriffId } = SetupDealer.initializePlayers(
      this.state,
      playerList,
      allCharacters,
      dualCharacterMode,
      hpRule,
      {
        enableCharacterSelect: enableCharSelect,
        expansions,
        is3PlayerVariant: enable3PVariant,
      }
    );

    this.state.players = players;
    this.state.sheriffId = sheriffId;

    const initialEvents: DomainEvent[] = [];

    if (enableCharSelect) {
      initialEvents.push({
        type: "CHARACTER_SELECT_STARTED",
        payload: {
          roomId: this.state.roomId,
          playerCount: playerList.length,
          sheriffId,
          dualCharacterMode,
          hpRule,
          is3PlayerVariant: enable3PVariant,
        },
        timestamp: Date.now(),
      });
    } else {
      initialEvents.push({
        type: "MATCH_STARTED",
        payload: {
          roomId: this.state.roomId,
          playerCount: playerList.length,
          sheriffId,
          is3PlayerVariant: enable3PVariant,
        },
        timestamp: Date.now(),
      });

      const sheriff = players.get(sheriffId);
      if (sheriff) {
        TurnManager.startTurn(this.state, sheriff, initialEvents);
      }
      this.appendWinEventIfNeeded(initialEvents);
    }

    return {
      success: true,
      events: initialEvents,
      initialSnapshot: sheriffId ? this.getFilteredSnapshot(sheriffId) : undefined,
    };
  }

  // Backward compatible command dispatcher
  public executeCommand(command: PlayerCommand): CommandResult {
    return this.handleCommand(command);
  }

  // Record processed command ID
  private recordCommandId(commandKey: string | null): void {
    if (!commandKey || this.processedCommandSet.has(commandKey)) return;
    if (this.processedCommandIds.length >= GameEngine.MAX_PROCESSED_COMMANDS) {
      const oldest = this.processedCommandIds.shift();
      if (oldest) {
        this.processedCommandSet.delete(oldest);
      }
    }
    this.processedCommandIds.push(commandKey);
    this.processedCommandSet.add(commandKey);
  }

  // Authoritative command router
  public handleCommand(command: PlayerCommand): CommandResult {
    const player = this.state.players.get(command.playerId);
    if (!player) return { success: false, message: "Player not found." };

    const rawCmdId =
      typeof command.commandId === "string" ? command.commandId.trim() : "";
    const commandKey = rawCmdId ? `${command.playerId}:${rawCmdId}` : null;
    if (commandKey && this.processedCommandSet.has(commandKey)) {
      return { success: true, events: [], deduplicated: true };
    }

    if (this.state.gameOver || this.state.matchPhase === "FINISHED") {
      return { success: false, message: "Match has already ended." };
    }

    if (
      command.type !== "SELECT_CHARACTERS" &&
      command.expectedStateSeq !== undefined &&
      command.expectedStateSeq !== this.state.stateSeq
    ) {
      return {
        success: false,
        message: `Stale state sequence: expected ${command.expectedStateSeq}, current ${this.state.stateSeq}.`,
      };
    }

    const events: DomainEvent[] = [];
    const result = this.routeCommand(player, command, events);
    if (!result.success) {
      return result;
    }

    this.appendWinEventIfNeeded(events);
    if (
      command.type === "RESOLVE_REACTION" ||
      command.type === "SELECT_STOLEN_CARD" ||
      command.type === "RESOLVE_TURN_START"
    ) {
      this.resumePhase0IfReady(events);
    }

    if (
      this.state.matchPhase === "PLAYING" &&
      !this.state.gameOver &&
      this.state.pendingReactions.length === 0 &&
      this.state.activeChain.length === 0
    ) {
      const turnPlayer = this.state.players.get(this.state.turnPlayerId);
      if (turnPlayer?.isDead) {
        TurnManager.advanceToNextTurn(this.state, turnPlayer.id, events);
        this.appendWinEventIfNeeded(events);
      }
    }

    this.state.stateSeq = (this.state.stateSeq ?? 0) + 1;
    this.recordCommandId(commandKey);
    return { success: true, events };
  }

  // Route validated command to handler
  private routeCommand(
    player: EnginePlayer,
    command: PlayerCommand,
    events: DomainEvent[]
  ): CommandResult {
    if (command.type === "SELECT_CHARACTERS") {
      const rawIds = command.characterIds ?? command.payload?.characterIds ?? [];
      const selectRes = SetupDealer.resolveCharacterSelection(
        this.state,
        command.playerId,
        rawIds,
        events
      );
      if (!selectRes.success) {
        return { success: false, message: selectRes.message, events };
      }
      this.mergeResultEvents(events, selectRes.events);

      if (this.state.matchPhase === "PLAYING" && !this.state.turnPlayerId) {
        const sheriff = this.state.players.get(this.state.sheriffId);
        if (sheriff) {
          TurnManager.startTurn(this.state, sheriff, events);
        }
      }
      return { success: true, events };
    }

    if (this.state.matchPhase !== "PLAYING") {
      return {
        success: false,
        message: "Match is still in character selection phase.",
      };
    }

    if (player.isDead) {
      return {
        success: false,
        message: "Eliminated players cannot execute commands.",
      };
    }

    if (command.type === "RESOLVE_REACTION") {
      const res = InteractManager.resolveReaction(this.state, command);
      this.mergeResultEvents(events, res.events);
      if (!res.success) {
        return { success: false, message: res.message, events };
      }
      return { success: true, events };
    }

    if (command.type === "SELECT_STOLEN_CARD") {
      const res = InteractManager.resolveDraftSelection(this.state, command);
      this.mergeResultEvents(events, res.events);
      if (!res.success) {
        return { success: false, message: res.message, events };
      }
      return { success: true, events };
    }

    InteractManager.pruneStaleReactions(this.state);
    if (this.state.pendingReactions.length > 0 || this.state.activeChain.length > 0) {
      return {
        success: false,
        message: "Resolve pending reactions or active draft first.",
      };
    }

    if (command.type === "RESOLVE_TURN_START") {
      const res = EventEngine.resolveTurnStartChoice(this.state, command, events);
      this.mergeResultEvents(events, res.events);
      if (!res.success) {
        return { success: false, message: res.message, events };
      }
      return { success: true, events };
    }

    if (this.state.pendingTurnStartChoice) {
      return {
        success: false,
        message: "Resolve pending turn start choice first.",
      };
    }

    if (command.type === "RESOLVE_PHASE_1") {
      const res = TurnManager.resolvePhase1Choice(this.state, command, events);
      this.mergeResultEvents(events, res.events);
      if (!res.success) {
        return { success: false, message: res.message, events };
      }
      return { success: true, events };
    }

    if (this.state.pendingPhase1Choice) {
      return {
        success: false,
        message: "Resolve pending Phase 1 choice first.",
      };
    }

    if (command.type === "END_TURN") {
      const res = TurnManager.endTurn(this.state, command, events);
      this.mergeResultEvents(events, res.events);
      if (!res.success) {
        return { success: false, message: res.message, events };
      }
      return { success: true, events };
    }

    if (command.type === "DISCARD_CARD") {
      if (this.state.turnPlayerId !== player.id || this.state.currentPhase !== 3) {
        return {
          success: false,
          message: "Can only discard excess cards in Phase 3.",
        };
      }

      const rawBatch = command.discardCardIds ?? command.payload?.discardCardIds;
      const singleCardId = command.cardId ?? command.payload?.cardId;
      const targetIds: string[] = Array.isArray(rawBatch) && rawBatch.length > 0
        ? rawBatch.map(String)
        : singleCardId
        ? [String(singleCardId)]
        : [];

      return TurnManager.discardExcessPhase3Cards(
        this.state,
        player,
        targetIds,
        events,
        { requireExactToLimit: false }
      );
    }

    if (command.type === "PLAY_CARD") {
      if (this.state.turnPlayerId !== player.id || this.state.currentPhase !== 2) {
        return {
          success: false,
          message: "Can only play cards during your Action Phase (Phase 2).",
        };
      }

      const res = InteractManager.resolveCardPlay(this.state, command);
      this.mergeResultEvents(events, res.events);
      if (!res.success) {
        return { success: false, message: res.message, events };
      }
      return { success: true, events };
    }

    if (command.type === "ACTIVATE_GREEN_CARD") {
      if (this.state.turnPlayerId !== player.id || this.state.currentPhase !== 2) {
        return {
          success: false,
          message: "Can only activate green cards during your Action Phase (Phase 2).",
        };
      }

      const res = InteractManager.resolveActivateGreenCard(this.state, command, events);
      this.mergeResultEvents(events, res.events);
      if (!res.success) {
        return { success: false, message: res.message, events };
      }
      return { success: true, events };
    }

    if (command.type === "USE_ACTIVE_SKILL") {
      if (this.state.turnPlayerId !== player.id || this.state.currentPhase !== 2) {
        return {
          success: false,
          message: "Can only use active skills during Phase 2 of your turn.",
        };
      }

      const res = InteractManager.executeActiveSkill(this.state, command);
      this.mergeResultEvents(events, res.events);
      if (!res.success) {
        return { success: false, message: res.message, events };
      }
      return { success: true, events };
    }

    return {
      success: false,
      message: `Unsupported command type: ${command.type}`,
    };
  }

  // Merge non-duplicate event arrays
  private mergeResultEvents(
    target: DomainEvent[],
    source?: DomainEvent[]
  ): void {
    if (source && source !== target && source.length > 0) {
      target.push(...source);
    }
  }

  // Resume Phase 0 after pauses
  private resumePhase0IfReady(events: DomainEvent[]): void {
    if (this.state.gameOver || this.state.matchPhase !== "PLAYING") return;
    InteractManager.pruneStaleReactions(this.state);
    if (this.state.pendingReactions.length > 0 || this.state.activeChain.length > 0) return;

    const turnPlayer = this.state.players.get(this.state.turnPlayerId);
    if (!turnPlayer) return;

    if (this.state.pendingTurnStartChoice) {
      const choice = this.state.pendingTurnStartChoice;
      const choiceOwner = this.state.players.get(choice.playerId);
      const invalidBlood =
        choice.type === "BLOOD_BROTHERS" &&
        (!choiceOwner ||
          choiceOwner.isDead ||
          choiceOwner.isGhost ||
          choiceOwner.hp <= 1);
      const invalidOwner = !choiceOwner || choiceOwner.isDead;
      if (invalidBlood || invalidOwner) {
        this.state.pendingTurnStartChoice = null;
        if (!turnPlayer.isDead) {
          EventEngine.maybeQueueVeraOrBloodBrothers(this.state, turnPlayer, false);
        }
      }
    }

    if (
      this.state.currentPhase === 0 &&
      !this.state.pendingTurnStartChoice &&
      !this.state.pendingPhase1Choice
    ) {
      TurnManager.continueTurnAfterTurnStart(this.state, turnPlayer, events);
      this.appendWinEventIfNeeded(events);
    }
  }

  // Record victory condition when met
  private appendWinEventIfNeeded(events: DomainEvent[]): void {
    const winCheck = WinConditionEvaluator.evaluate(this.state);
    if (!winCheck.gameOver) return;
    this.state.gameOver = {
      winner: winCheck.winner,
      message: winCheck.message || "",
    };
    this.state.matchPhase = "FINISHED";
    this.state.pendingReactions = [];
    this.state.activeChain = [];
    this.state.pendingTurnStartChoice = null;
    this.state.pendingPhase1Choice = null;
    if (!events.some((e) => e.type === "GAME_OVER")) {
      events.push({
        type: "GAME_OVER",
        payload: {
          winner: winCheck.winner,
          message: winCheck.message,
        },
        timestamp: Date.now(),
      });
    }
  }

  // Project Fog of War snapshot
  public getFilteredSnapshot(playerId: string): FilteredWorldSnapshot {
    return FogOfWarFilter.projectStateForPlayer(this.state, playerId);
  }

  // Filter domain event by visibility
  public filterEventForPlayer(
    event: DomainEvent,
    targetPlayerId: string
  ): DomainEvent {
    return FogOfWarFilter.filterEventForPlayer(event, targetPlayerId);
  }

  public getState(): SimulationState {
    return this.state;
  }

  // Serialize state with Map entries
  public serializeState(): SerializedEngineState {
    const raw = {
      ...this.state,
      players: Array.from(this.state.players.entries()),
      pendingCharacterSelect: Array.from(this.state.pendingCharacterSelect.entries()),
    };
    return JSON.parse(JSON.stringify(raw)) as SerializedEngineState;
  }

  // Restore engine from serialized snapshot
  public static restoreState(
    saved: SerializedEngineState,
    initialCards: EngineCard[] = [],
    eventCards: EngineEventCard[] = [],
    options?: GameEngineOptions
  ): GameEngine {
    const cloned = JSON.parse(JSON.stringify(saved)) as SerializedEngineState;
    const engine = new GameEngine(cloned.roomId, initialCards, eventCards, {
      defaultEnableCharacterSelect: options?.defaultEnableCharacterSelect ?? true,
      defaultEnable3PlayerVariant: options?.defaultEnable3PlayerVariant ?? cloned.is3PlayerVariant,
      expansions: options?.expansions ?? cloned.expansions,
    });

    engine.state = {
      ...cloned,
      stateSeq: typeof cloned.stateSeq === "number" ? cloned.stateSeq : 0,
      players: new Map<string, EnginePlayer>(Array.isArray(cloned.players) ? cloned.players : []),
      pendingCharacterSelect: new Map<string, PendingCharacterChoice>(
        Array.isArray(cloned.pendingCharacterSelect) ? cloned.pendingCharacterSelect : []
      ),
      drawDeck: Array.isArray(cloned.drawDeck) ? cloned.drawDeck : [],
      discardPile: Array.isArray(cloned.discardPile) ? cloned.discardPile : [],
      eventDeck: Array.isArray(cloned.eventDeck) ? cloned.eventDeck : [],
      eventDiscardPile: Array.isArray(cloned.eventDiscardPile) ? cloned.eventDiscardPile : [],
      activeChain: Array.isArray(cloned.activeChain) ? cloned.activeChain : [],
      pendingReactions: Array.isArray(cloned.pendingReactions) ? cloned.pendingReactions : [],
      expansions: Array.isArray(cloned.expansions) ? cloned.expansions : ["base"],
      activeEvent: cloned.activeEvent ?? null,
      firstEliminatedPlayerId: cloned.firstEliminatedPlayerId ?? null,
      pendingTurnStartChoice: cloned.pendingTurnStartChoice ?? null,
      pendingPhase1Choice: cloned.pendingPhase1Choice ?? null,
    };

    return engine;
  }
}
