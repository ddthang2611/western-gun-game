import crypto from "crypto";
import { WebSocket } from "ws";
import { GameEngine, SerializedEngineState } from "../engine/game_engine";
import {
  EngineCard,
  EngineEventCard,
  CardBorder,
  CardCategory,
  Rank,
  Suit,
} from "../engine/types/cards";
import { EngineCharacter, HpRuleType } from "../engine/types/state";
import { PlayerCommand, DomainEvent } from "../engine/types/actions";
import { InteractManager } from "../engine/interact/interact_manager";
import { SkillHooks } from "../engine/interact/skill_hooks";
import {
  getAllEquippedCards,
  pickFirstTargetCard,
} from "../engine/utils/inventory";
import { CatalogRepository } from "../db/catalog_repository";
import { SessionRepository } from "../db/session_repository";
import { MatchEventRow } from "../db/schema";
import { getRuntimeDatabase, isDatabaseUnlocked } from "../db/database";
import { LobbyPlayer, GameSettings } from "./protocol";
import { LobbyManager } from "./lobby_handler";
import { filterActiveExpansions } from "../engine/events/expansion_config";
import {
  StoredLogEntry,
  formatEventToLog,
  getLogsForPlayer,
  getStructuredLogsForPlayer,
} from "./combat_log_formatter";
import { buildTableState } from "./table_state_presenter";
import { SetupDealer } from "../engine/deck/setup_dealer";
import { BotRunner } from "./bot_runner";

export class GameSessionManager {
  private static instance: GameSessionManager;
  private static readonly INACTIVITY_TIMEOUT_MS = 60_000;
  private static readonly MAX_RESTORED_EVENTS = 100;

  private engines: Map<string, GameEngine> = new Map();
  private combatLogs: Map<string, StoredLogEntry[]> = new Map();
  private matchEventSeqs: Map<string, number> = new Map();
  private matchIds: Map<string, string> = new Map();
  private inactivityTimers: Map<string, NodeJS.Timeout> = new Map();
  private arenaTimers: Map<string, NodeJS.Timeout> = new Map();
  private botRunners: Map<string, BotRunner> = new Map();
  private recentPlayerCharacters: Map<string, string[]> = new Map();
  private roomCharacterShoes: Map<string, string[]> = new Map();

  public static getInstance(): GameSessionManager {
    if (!GameSessionManager.instance) {
      GameSessionManager.instance = new GameSessionManager();
    }
    return GameSessionManager.instance;
  }

  public hasActiveSession(roomId: string): boolean {
    return this.engines.has(roomId);
  }

  public getSession(roomId: string): GameEngine | undefined {
    return this.engines.get(roomId);
  }

  // Clear room inactivity timer
  private clearInactivityTimer(roomId: string): void {
    const existing = this.inactivityTimers.get(roomId);
    if (existing) {
      clearTimeout(existing);
      this.inactivityTimers.delete(roomId);
    }
  }

  // Track dealt candidates symmetrically to avoid immediate repeats
  private recordRecentPlayerCharacters(
    playerId: string,
    dealtIds: string[],
    poolSize: number
  ): void {
    if (dealtIds.length === 0) return;
    const prev = this.recentPlayerCharacters.get(playerId) || [];
    const seen = new Set(prev);
    const merged = [...prev];
    for (const id of dealtIds) {
      if (!seen.has(id)) {
        seen.add(id);
        merged.push(id);
      }
    }

    const maxHistory = Math.max(
      dealtIds.length,
      Math.min(poolSize - dealtIds.length, dealtIds.length * 2)
    );
    this.recentPlayerCharacters.set(playerId, merged.slice(-maxHistory));
  }

  // Stop and remove room bot runner
  private clearBotRunner(roomId: string): void {
    const existing = this.botRunners.get(roomId);
    if (existing) {
      existing.stop();
      this.botRunners.delete(roomId);
    }
  }

  // Synchronize bot scheduler with current state
  private syncBotRunner(
    roomId: string,
    engine: GameEngine,
    lobbyManager?: LobbyManager,
    forceReschedule = true
  ): void {
    const runner = this.botRunners.get(roomId);
    if (!runner || !runner.hasBots() || !lobbyManager) return;

    const simState = engine.getState();
    if (
      simState.gameOver ||
      simState.matchPhase === "FINISHED" ||
      this.isMatchPaused(engine, lobbyManager)
    ) {
      runner.stop();
      return;
    }

    if (!forceReschedule && runner.isScheduled()) {
      return;
    }

    runner.scheduleNextStep(
      engine,
      () => this.isMatchPaused(engine, lobbyManager),
      (botId, cmd) => this.handleBotCommand(roomId, botId, cmd, lobbyManager)
    );
  }

  // Execute bot command through authoritative session pipeline
  private handleBotCommand(
    roomId: string,
    botId: string,
    command: PlayerCommand,
    lobbyManager: LobbyManager
  ): boolean {
    const engine = this.engines.get(roomId);
    if (!engine) return false;
    if (this.isMatchPaused(engine, lobbyManager)) return false;

    const normalizedCommand: PlayerCommand = {
      ...command,
      playerId: botId,
      commandId: command.commandId || crypto.randomUUID(),
    };
    const result = engine.handleCommand(normalizedCommand);
    if (!result.success) return false;

    this.clearInactivityTimer(roomId);
    const events = result.events || [];
    this.persistEventsAndState(roomId, events, engine);
    if (events.length > 0) {
      this.emitDomainEvents(roomId, events, engine, lobbyManager);
    }
    this.broadcastGameSnapshot(roomId, engine, lobbyManager);
    return true;
  }

  // Clear room Card Arena settle timer
  private clearArenaTimer(roomId: string): void {
    const existing = this.arenaTimers.get(roomId);
    if (existing) {
      clearTimeout(existing);
      this.arenaTimers.delete(roomId);
    }
  }

  // Synchronize authoritative Card Arena settle timer
  private syncArenaTimer(
    roomId: string,
    engine: GameEngine,
    lobbyManager?: LobbyManager
  ): void {
    this.clearArenaTimer(roomId);
    if (!lobbyManager || !engine.isArenaPacingEnabled()) return;

    const simState = engine.getState();
    const chain = simState.arenaChain;
    if (!chain || chain.status !== "SETTLING") {
      return;
    }

    if (!simState.gameOver && this.isMatchPaused(engine, lobbyManager)) {
      return;
    }

    const remainingMs = Math.max(0, (chain.settleUntil || 0) - Date.now());
    const timer = setTimeout(() => {
      this.arenaTimers.delete(roomId);
      if (this.engines.get(roomId) !== engine) return;
      const currentState = engine.getState();
      if (!currentState.gameOver && this.isMatchPaused(engine, lobbyManager)) {
        return;
      }
      const cleared = engine.completeArenaSettling();
      if (cleared.changed) {
        this.persistEventsAndState(roomId, [], engine);
        this.broadcastGameSnapshot(roomId, engine, lobbyManager);
      }
    }, remainingMs);
    timer.unref?.();
    this.arenaTimers.set(roomId, timer);
  }

  // Schedule room inactivity timer when active
  private refreshInactivityTimer(
    roomId: string,
    engine: GameEngine,
    lobbyManager?: LobbyManager
  ): void {
    this.clearInactivityTimer(roomId);
    if (!lobbyManager) return;

    const simState = engine.getState();
    if (simState.gameOver || simState.matchPhase === "FINISHED") {
      return;
    }
    if (simState.arenaChain?.status === "SETTLING") {
      return;
    }
    if (this.isMatchPaused(engine, lobbyManager)) {
      return;
    }

    const timer = setTimeout(() => {
      this.handleInactivityTimeout(roomId, engine, lobbyManager);
    }, GameSessionManager.INACTIVITY_TIMEOUT_MS);
    timer.unref?.();
    this.inactivityTimers.set(roomId, timer);
  }

  // Auto-pass or auto-skip on inactivity
  private handleInactivityTimeout(
    roomId: string,
    engine: GameEngine,
    lobbyManager: LobbyManager
  ): void {
    this.inactivityTimers.delete(roomId);
    if (this.engines.get(roomId) !== engine) return;

    const simState = engine.getState();
    if (simState.gameOver || simState.matchPhase === "FINISHED") return;
    if (this.isMatchPaused(engine, lobbyManager)) return;
    if (simState.arenaChain?.status === "SETTLING") {
      this.syncArenaTimer(roomId, engine, lobbyManager);
      return;
    }

    const collectedEvents: DomainEvent[] = [];
    let mutated = false;

    if (simState.matchPhase === "CHARACTER_SELECT") {
      const pendingEntries = Array.from(simState.pendingCharacterSelect.values());
      for (const entry of pendingEntries) {
        if (entry.selectedCharacterIds?.length) continue;
        const autoIds = entry.candidates
          .slice(0, entry.requiredCount)
          .map((c) => c.id);
        const res = engine.handleCommand({
          playerId: entry.playerId,
          type: "SELECT_CHARACTERS",
          characterIds: autoIds,
        });
        if (res.success) {
          mutated = true;
          if (res.events?.length) collectedEvents.push(...res.events);
        }
      }
    } else {
      InteractManager.pruneStaleReactions(simState);

      if (simState.activeChain.length > 0) {
        const head = simState.activeChain[0];
        if (head?.type === "BRAWL_CARD_PICK") {
          const target = simState.players.get(head.currentTargetId);
          const pick = target ? pickFirstTargetCard(target) : null;
          if (target && pick) {
            const res = engine.handleCommand({
              playerId: head.actorPlayerId,
              type: "SELECT_STOLEN_CARD",
              targetPlayerId: target.id,
              targetArea: pick.targetArea,
              targetCardId: pick.targetCardId,
            });
            if (res.success) {
              mutated = true;
              if (res.events?.length) collectedEvents.push(...res.events);
            }
          }
        } else if (head?.type === "LUCKY_DUKE_PICK") {
          const preferred =
            head.drawnCards.find((c) =>
              SkillHooks.isDrawCheckSuccess(head.reason, c, simState)
            ) || head.drawnCards[0];
          if (preferred) {
            const res = engine.handleCommand({
              playerId: head.playerId,
              type: "SELECT_STOLEN_CARD",
              cardId: preferred.id,
            });
            if (res.success) {
              mutated = true;
              if (res.events?.length) collectedEvents.push(...res.events);
            }
          }
        } else if (head?.type === "EL_GRINGO_PICK") {
          const res = engine.handleCommand({
            playerId: head.victimId,
            type: "SELECT_STOLEN_CARD",
            targetPlayerId: head.attackerId,
            targetArea: "HAND",
          });
          if (res.success) {
            mutated = true;
            if (res.events?.length) collectedEvents.push(...res.events);
          }
        } else if (head && "storePool" in head) {
          const pickerId = head.draftOrder?.[head.currentPickerIndex];
          const cardId = head.storePool?.[0]?.id;
          if (pickerId && cardId) {
            const res = engine.handleCommand({
              playerId: pickerId,
              type: "SELECT_STOLEN_CARD",
              cardId,
            });
            if (res.success) {
              mutated = true;
              if (res.events?.length) collectedEvents.push(...res.events);
            }
          }
        }
      } else if (simState.pendingReactions.length > 0) {
        const head = simState.pendingReactions[0];
        let cmd: PlayerCommand;
        if (head.type === "EVENT_DALTONS_DISCARD") {
          const target = simState.players.get(head.targetPlayerId);
          const firstBlueId =
            (target ? getAllEquippedCards(target)[0]?.id : undefined) ??
            target?.judgements.find((j) => j.card.border === "blue")?.card.id;
          cmd = {
            playerId: head.targetPlayerId,
            type: "RESOLVE_REACTION",
            targetCardId: firstBlueId,
            payload: { cardId: firstBlueId },
          };
        } else {
          cmd = {
            playerId: head.targetPlayerId,
            type: "RESOLVE_REACTION",
            payload: { action: "TAKE_DAMAGE" },
          };
        }
        const res = engine.handleCommand(cmd);
        if (res.success) {
          mutated = true;
          if (res.events?.length) collectedEvents.push(...res.events);
        }
      } else if (simState.pendingTurnStartChoice) {
        const choice = simState.pendingTurnStartChoice;
        if (choice.type === "VERA_CUSTER_COPY") {
          const firstCharId = choice.availableCharacters?.[0]?.character.id;
          if (firstCharId) {
            const res = engine.handleCommand({
              playerId: choice.playerId,
              type: "RESOLVE_TURN_START",
              characterIds: [firstCharId],
            });
            if (res.success) {
              mutated = true;
              if (res.events?.length) collectedEvents.push(...res.events);
            }
          }
        } else {
          const res = engine.handleCommand({
            playerId: choice.playerId,
            type: "RESOLVE_TURN_START",
            payload: { skip: true },
          });
          if (res.success) {
            mutated = true;
            if (res.events?.length) collectedEvents.push(...res.events);
          }
        }
      } else if (simState.pendingPhase1Choice) {
        const p1 = simState.pendingPhase1Choice;
        let cmd: PlayerCommand | null = null;
        if (p1.mode === "KIT_CARLSON_PICK") {
          const keepCount = Math.min(
            Number(p1.neededCount || 2),
            (p1.previewCards || []).length
          );
          const cardIds = (p1.previewCards || [])
            .slice(0, keepCount)
            .map((c) => c.id);
          cmd = {
            playerId: p1.playerId,
            type: "RESOLVE_PHASE_1",
            payload: { cardIds },
          };
        } else if (p1.mode === "CHOOSE_DRAW_OPTION") {
          const preferred =
            p1.options.find(
              (o) =>
                o === "NORMAL_DECK" ||
                o === "NORMAL_DRAW" ||
                o === "BILL_NOFACE" ||
                o === "PIXIE_PETE" ||
                o === "KIT_CARLSON" ||
                o === "SKIP_DRAW_HEAL" ||
                o === "PEDRO_DISCARD_AND_DECK"
            ) || p1.options[0];
          cmd = {
            playerId: p1.playerId,
            type: "RESOLVE_PHASE_1",
            payload: { choice: preferred },
          };
        } else if (p1.mode === "PEYOTE_GUESS") {
          cmd = {
            playerId: p1.playerId,
            type: "RESOLVE_PHASE_1",
            payload: { choice: "RED" },
          };
        } else if (p1.mode === "RANCH_EXCHANGE") {
          cmd = {
            playerId: p1.playerId,
            type: "RESOLVE_PHASE_1",
            payload: { skip: true },
          };
        }
        if (cmd) {
          const res = engine.handleCommand(cmd);
          if (res.success) {
            mutated = true;
            if (res.events?.length) collectedEvents.push(...res.events);
          }
        }
      } else {
        const turnPlayer = simState.players.get(simState.turnPlayerId);
        if (turnPlayer && !turnPlayer.isDead) {
          if (turnPlayer.forcedPlayCardId) {
            turnPlayer.forcedPlayCardId = null;
          }
          const handLimit = SkillHooks.getPhase3HandLimit(turnPlayer, simState);
          const excess = Math.max(0, turnPlayer.handCards.length - handLimit);
          const discardIds =
            !turnPlayer.isGhost && excess > 0
              ? turnPlayer.handCards.slice(0, excess).map((c) => c.id)
              : undefined;
          const res = engine.handleCommand({
            playerId: turnPlayer.id,
            type: "END_TURN",
            discardCardIds: discardIds,
          });
          if (res.success) {
            mutated = true;
            if (res.events?.length) collectedEvents.push(...res.events);
          }
        }
      }
    }

    if (mutated) {
      this.persistEventsAndState(roomId, collectedEvents, engine);
      if (collectedEvents.length > 0) {
        this.emitDomainEvents(roomId, collectedEvents, engine, lobbyManager);
      }
      this.broadcastGameSnapshot(roomId, engine, lobbyManager);
    }
  }

  public endSession(roomId: string): void {
    this.clearInactivityTimer(roomId);
    this.clearArenaTimer(roomId);
    this.clearBotRunner(roomId);
    this.engines.delete(roomId);
    this.combatLogs.delete(roomId);
    this.matchEventSeqs.delete(roomId);
    this.matchIds.delete(roomId);
    try {
      SessionRepository.getInstance().deleteMatchData(roomId);
    } catch (err) {
      console.error("[GameSessionManager] Failed to clean up session:", err);
    }
  }

  // Load catalog definitions for engine
  private loadCatalogData(): {
    engineCards: EngineCard[];
    allCharacters: (EngineCharacter & { pack?: string })[];
    engineEvents: EngineEventCard[];
  } | null {
    if (!isDatabaseUnlocked()) return null;

    const catalog = CatalogRepository.getInstance();
    if (!catalog.isInitialized()) {
      catalog.initialize();
    }

    const catalogCards = catalog.getAllCards();
    if (catalogCards.length === 0) return null;

    const engineCards: EngineCard[] = catalogCards.map((c) => ({
      id: c.card_id,
      seq: c.seq,
      templateId: c.template_id,
      pack: c.pack,
      name: c.name_en,
      border: c.border as CardBorder,
      category: c.category as CardCategory,
      weaponRange: c.weapon_range || undefined,
      rank: c.rank as Rank,
      suit: c.suit as Suit,
      desc: c.desc_en,
      image: this.toAssetUrl(c.image_path),
      effectIcon: this.toAssetUrl(c.effect_icon_path),
    }));

    const allCharacters = catalog.getAllCharacters().map((c) => ({
      id: c.character_id,
      name: c.name,
      baseHp: c.base_hp,
      desc: c.desc_en,
      image: this.toAssetUrl(c.image_path),
      isActiveSkill: c.ability_trigger === "active_in_turn",
      skillName: c.ability_code,
      pack: c.pack,
    })) as (EngineCharacter & { pack?: string })[];

    const engineEvents: EngineEventCard[] = catalog.getAllEvents().map((ev) => ({
      id: ev.event_id,
      pack: ev.pack,
      name: ev.name,
      isFinalCard: Boolean(ev.is_final_card),
      effectCode: ev.effect_code,
      desc: ev.desc_en,
      image: this.toAssetUrl(ev.image_path),
    }));

    return { engineCards, allCharacters, engineEvents };
  }

  // Load bounded recent match events descending
  private loadRecentMatchEvents(roomId: string): MatchEventRow[] {
    try {
      const db = getRuntimeDatabase();
      return db
        .prepare(
          "SELECT * FROM match_events WHERE match_id = ? ORDER BY seq DESC LIMIT ?"
        )
        .all(roomId, GameSessionManager.MAX_RESTORED_EVENTS) as MatchEventRow[];
    } catch (err) {
      console.error("[GameSessionManager] Failed bounded event restore query:", err);
      const all = SessionRepository.getInstance().getMatchEvents(roomId);
      return all.slice(-GameSessionManager.MAX_RESTORED_EVENTS).reverse();
    }
  }

  // Restore saved match from runtime DB
  public restoreSessionFromDb(
    roomId: string,
    lobbyManager?: LobbyManager
  ): GameEngine | null {
    if (!isDatabaseUnlocked()) return null;
    if (this.engines.has(roomId)) {
      const existing = this.engines.get(roomId) || null;
      if (existing && lobbyManager) {
        this.syncArenaTimer(roomId, existing, lobbyManager);
        this.refreshInactivityTimer(roomId, existing, lobbyManager);
        this.syncBotRunner(roomId, existing, lobbyManager, false);
      }
      return existing;
    }

    const repo = SessionRepository.getInstance();
    const saved = repo.getGameState(roomId) as SerializedEngineState | null;
    if (!saved || !saved.roomId) return null;

    const catalogData = this.loadCatalogData();
    if (!catalogData) return null;

    const engine = GameEngine.restoreState(
      saved,
      catalogData.engineCards,
      catalogData.engineEvents,
      {
        defaultEnableCharacterSelect: true,
        defaultEnable3PlayerVariant: saved.is3PlayerVariant,
        expansions: saved.expansions,
        enableArenaPacing: true,
      }
    );

    this.engines.set(roomId, engine);
    if (!this.matchIds.has(roomId)) {
      this.matchIds.set(roomId, crypto.randomUUID());
    }
    const recentEvents = this.loadRecentMatchEvents(roomId);
    const maxSeq = recentEvents.reduce((max, row) => Math.max(max, row.seq), 0);
    this.matchEventSeqs.set(roomId, maxSeq);

    const restoredLogs: StoredLogEntry[] = [];
    const restoredEvents: DomainEvent[] = [];
    for (const row of recentEvents) {
      let payload: any = {};
      try {
        payload = JSON.parse(row.payload_json);
      } catch (err) {
        console.error("[GameSessionManager] Failed to parse match event JSON:", err);
        payload = {};
      }
      const timestamp = Date.parse(row.created_at) || Date.now();
      const entry = formatEventToLog(
        {
          type: row.event_type,
          payload,
          timestamp,
        },
        engine.getState().players
      );
      if (entry) restoredLogs.push(entry);

      // Scope private restored events
      let visibleTo: string[] | undefined;
      let maskedPayload: any;
      if (
        (row.event_type === "CARDS_DRAWN" ||
          (row.event_type === "PHASE_CHANGED" && Array.isArray(payload.drawnCards))) &&
        typeof payload.playerId === "string"
      ) {
        visibleTo = [payload.playerId];
        const { cards: _c, drawnCards: _d, ...rest } = payload;
        maskedPayload = rest;
      } else if (
        row.event_type === "EL_GRINGO_STOLEN" &&
        typeof payload.victimId === "string" &&
        typeof payload.attackerId === "string"
      ) {
        visibleTo = [payload.victimId, payload.attackerId];
        maskedPayload = {
          ...payload,
          card: { id: "SECRET", name: "Card from hand", suit: "UNKNOWN", rank: "UNKNOWN" },
        };
      }

      restoredEvents.push({
        type: row.event_type,
        payload,
        timestamp,
        visibleTo,
        maskedPayload,
      });
    }
    restoredEvents.reverse();
    this.combatLogs.set(
      roomId,
      restoredLogs.slice(0, GameSessionManager.MAX_RESTORED_EVENTS)
    );

    if (lobbyManager) {
      this.clearBotRunner(roomId);
      const botIds = lobbyManager
        .getBotIds()
        .filter((id) => engine.getState().players.has(id));
      if (botIds.length > 0) {
        const runner = new BotRunner(botIds);
        this.botRunners.set(roomId, runner);
        runner.observeEvents(restoredEvents, engine);
      }
      this.syncArenaTimer(roomId, engine, lobbyManager);
      this.refreshInactivityTimer(roomId, engine, lobbyManager);
      this.syncBotRunner(roomId, engine, lobbyManager);
    }

    return engine;
  }

  // Check if any living player offline
  public isMatchPaused(engine: GameEngine, lobbyManager?: LobbyManager): boolean {
    if (!lobbyManager) return false;
    const simState = engine.getState();
    if (simState.gameOver || simState.matchPhase === "FINISHED") {
      return false;
    }
    for (const player of simState.players.values()) {
      if (
        (!player.isDead || player.isGhost) &&
        !lobbyManager.isPlayerOnline(player.id)
      ) {
        return true;
      }
    }
    return false;
  }

  // Persist event batch and snapshot atomically
  private persistEventsAndState(
    roomId: string,
    events: DomainEvent[],
    engine: GameEngine
  ): void {
    const startSeq = this.matchEventSeqs.get(roomId) || 0;
    let seq = startSeq;
    try {
      const repo = SessionRepository.getInstance();
      const db = getRuntimeDatabase();
      const serialized = engine.serializeState();
      db.transaction(() => {
        for (const ev of events) {
          seq += 1;
          repo.logMatchEvent(roomId, seq, ev.type, ev.payload || {});
        }
        repo.saveGameState(roomId, serialized);
      })();
      this.matchEventSeqs.set(roomId, seq);
    } catch (err) {
      this.matchEventSeqs.set(roomId, startSeq);
      console.error("[GameSessionManager] Failed to persist match state:", err);
    }
  }

  // Initialize and start game session
  public startGame(
    roomId: string,
    players: LobbyPlayer[],
    settings: GameSettings,
    lobbyManager: LobbyManager
  ): { success: boolean; message?: string } {
    const catalogData = this.loadCatalogData();
    if (!catalogData) {
      return {
        success: false,
        message: isDatabaseUnlocked()
          ? "No cards loaded in catalog database."
          : "Catalog database is locked. Please unlock it first.",
      };
    }

    const { engineCards, allCharacters, engineEvents } = catalogData;
    const expansions = filterActiveExpansions(settings.expansions);
    const is3PVariant = players.length === 3;
    const playerList = players.map((p) => ({ id: p.id, name: p.name }));
    const filteredChars = SetupDealer.filterByExpansions(allCharacters, expansions);
    const activeChars =
      filteredChars.length >= players.length * (settings.dualCharacterEnabled ? 2 : 1)
        ? filteredChars
        : allCharacters;
    const activeCharIds = new Set(activeChars.map((c) => c.id));
    const currentShoe = (this.roomCharacterShoes.get(roomId) || []).filter((id) =>
      activeCharIds.has(id)
    );
    const remainingIds = new Set(
      currentShoe.length > 0 ? currentShoe : activeChars.map((c) => c.id)
    );
    const recentByPlayer = new Map<string, Set<string>>();
    for (const p of players) {
      const history = this.recentPlayerCharacters.get(p.id);
      if (history?.length) {
        recentByPlayer.set(p.id, new Set(history));
      }
    }

    try {
      const engine = new GameEngine(roomId, engineCards, engineEvents, {
        defaultEnableCharacterSelect: true,
        defaultEnable3PlayerVariant: is3PVariant,
        expansions,
        enableArenaPacing: true,
      });

      const matchResult = engine.startMatch(
        playerList,
        allCharacters,
        settings.dualCharacterEnabled,
        settings.dualCharacterHpRule as HpRuleType,
        {
          enableCharacterSelect: true,
          expansions,
          enable3PlayerVariant: is3PVariant,
          recentCharacterIdsByPlayer: recentByPlayer,
          remainingCharacterIds: remainingIds,
        }
      );

      const simState = engine.getState();
      const dealtThisMatch = new Set<string>();
      for (const p of players) {
        const dealt =
          simState.pendingCharacterSelect.get(p.id)?.candidates.map((c) => c.id) ||
          simState.players.get(p.id)?.characters.map((c) => c.id) ||
          [];
        for (const cid of dealt) dealtThisMatch.add(cid);
        this.recordRecentPlayerCharacters(p.id, dealt, activeChars.length);
      }
      let nextShoe = Array.from(remainingIds).filter((id) => !dealtThisMatch.has(id));
      if (nextShoe.length === 0) {
        nextShoe = activeChars
          .map((c) => c.id)
          .filter((id) => !dealtThisMatch.has(id));
      }
      this.roomCharacterShoes.set(roomId, nextShoe);

      this.clearInactivityTimer(roomId);
      this.clearArenaTimer(roomId);
      this.clearBotRunner(roomId);
      const nextMatchId = crypto.randomUUID();
      const initialEvents = matchResult.events || [];
      const repo = SessionRepository.getInstance();
      const db = getRuntimeDatabase();
      const serialized = engine.serializeState();
      let seq = 0;

      // Replace previous match data atomically
      db.transaction(() => {
        repo.deleteMatchData(roomId);
        for (const ev of initialEvents) {
          seq += 1;
          repo.logMatchEvent(roomId, seq, ev.type, ev.payload || {});
        }
        repo.saveGameState(roomId, serialized);
      })();

      this.engines.set(roomId, engine);
      const botIds = players.filter((p) => p.isBot).map((p) => p.id);
      if (botIds.length > 0) {
        this.botRunners.set(roomId, new BotRunner(botIds));
      }
      this.matchIds.set(roomId, nextMatchId);
      this.matchEventSeqs.set(roomId, seq);
      this.combatLogs.set(roomId, [
        {
          publicText:
            "---------- Match initialized. Waiting for character selection. ----------",
        },
      ]);

      if (initialEvents.length > 0) {
        this.emitDomainEvents(roomId, initialEvents, engine, lobbyManager);
      }
      this.broadcastGameSnapshot(roomId, engine, lobbyManager);

      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        message: err.message || "Failed to start match in GameEngine.",
      };
    }
  }

  // Handle normalized client game command
  public handlePlayerCommand(
    playerId: string,
    command: PlayerCommand,
    roomId: string,
    ws: WebSocket,
    lobbyManager: LobbyManager
  ): void {
    const engine = this.engines.get(roomId);
    if (!engine) {
      this.sendSocket(ws, "ERROR", {
        message: "No active game session found for this room.",
      });
      return;
    }

    if (this.isMatchPaused(engine, lobbyManager)) {
      this.sendSocket(ws, "ERROR", {
        message:
          "Match is paused while waiting for a disconnected player to reconnect.",
      });
      return;
    }

    const rawCmd = (
      command && typeof command === "object" ? command : {}
    ) as PlayerCommand & Record<string, any>;
    const nestedPayload =
      rawCmd.payload && typeof rawCmd.payload === "object"
        ? rawCmd.payload
        : rawCmd;

    const normalizedCommand: PlayerCommand = {
      ...nestedPayload,
      ...rawCmd,
      playerId,
      commandId:
        typeof rawCmd.commandId === "string"
          ? rawCmd.commandId
          : typeof nestedPayload.commandId === "string"
          ? nestedPayload.commandId
          : undefined,
      expectedStateSeq:
        typeof rawCmd.expectedStateSeq === "number"
          ? rawCmd.expectedStateSeq
          : typeof nestedPayload.expectedStateSeq === "number"
          ? nestedPayload.expectedStateSeq
          : undefined,
      greenCardId:
        rawCmd.greenCardId ??
        nestedPayload.greenCardId ??
        (rawCmd.type === "ACTIVATE_GREEN_CARD"
          ? rawCmd.cardId ?? nestedPayload.cardId
          : undefined),
      payload: nestedPayload,
    };

    const result = engine.handleCommand(normalizedCommand);

    if (!result.success) {
      this.sendSocket(ws, "ERROR", { message: result.message || "Action failed." });
      if (
        normalizedCommand.expectedStateSeq !== undefined &&
        normalizedCommand.expectedStateSeq !== engine.getState().stateSeq
      ) {
        this.sendPlayerSnapshot(engine, playerId, roomId, lobbyManager);
      }
      return;
    }

    this.clearInactivityTimer(roomId);

    this.sendSocket(ws, "GAME_ACTION_SUCCESS", {
      action: normalizedCommand.type,
      stateSeq: engine.getState().stateSeq,
      ...(result.deduplicated ? { deduplicated: true } : {}),
    });

    if (result.deduplicated) {
      this.sendPlayerSnapshot(engine, playerId, roomId, lobbyManager);
      return;
    }

    const events = result.events || [];
    this.persistEventsAndState(roomId, events, engine);
    if (events.length > 0) {
      this.emitDomainEvents(roomId, events, engine, lobbyManager);
    }
    this.broadcastGameSnapshot(roomId, engine, lobbyManager);
  }

  // Emit TABLE_STATE only to participant
  private emitPlayerSnapshot(
    engine: GameEngine,
    playerId: string,
    roomId: string,
    lobbyManager: LobbyManager
  ): void {
    const botRunner = this.botRunners.get(roomId);
    if (botRunner?.isBot(playerId)) return;
    if (!engine.getState().players.has(playerId)) return;

    const snapshot = engine.getFilteredSnapshot(playerId);
    const roomLogs = this.combatLogs.get(roomId) || [];
    const logs = getLogsForPlayer(roomLogs, playerId, 100);
    const structuredLogs = getStructuredLogsForPlayer(roomLogs, playerId, 100);
    const tableState = buildTableState(
      snapshot,
      playerId,
      engine,
      logs,
      this.isMatchPaused(engine, lobbyManager),
      (pId) => lobbyManager.isPlayerOnline(pId),
      this.matchIds.get(roomId),
      lobbyManager.getHostId(),
      structuredLogs,
      (pId) => botRunner?.isBot(pId) ?? false
    );

    lobbyManager.sendToPlayer(playerId, "TABLE_STATE", tableState);
  }

  // Send private snapshot to player
  public sendPlayerSnapshot(
    engine: GameEngine,
    playerId: string,
    roomId: string,
    lobbyManager: LobbyManager
  ): void {
    this.emitPlayerSnapshot(engine, playerId, roomId, lobbyManager);
    this.syncArenaTimer(roomId, engine, lobbyManager);
    this.refreshInactivityTimer(roomId, engine, lobbyManager);
    this.syncBotRunner(roomId, engine, lobbyManager, false);
  }

  // Broadcast snapshots strictly to participants
  public broadcastGameSnapshot(
    roomId: string,
    engine: GameEngine,
    lobbyManager: LobbyManager
  ): void {
    for (const playerId of engine.getState().players.keys()) {
      this.emitPlayerSnapshot(engine, playerId, roomId, lobbyManager);
    }
    this.syncArenaTimer(roomId, engine, lobbyManager);
    this.refreshInactivityTimer(roomId, engine, lobbyManager);
    this.syncBotRunner(roomId, engine, lobbyManager);
  }

  // Broadcast domain events and logs
  private emitDomainEvents(
    roomId: string,
    events: DomainEvent[],
    engine: GameEngine,
    lobbyManager: LobbyManager
  ): void {
    const botRunner = this.botRunners.get(roomId);
    if (botRunner && events.length > 0) {
      botRunner.observeEvents(events, engine);
    }

    const logs = this.combatLogs.get(roomId) || [];
    const players = engine.getState().players;
    const humanParticipantIds = Array.from(players.keys()).filter(
      (id) => !botRunner?.isBot(id)
    );

    for (const ev of events) {
      const logEntry = formatEventToLog(ev, players);
      if (logEntry) {
        logs.unshift(logEntry);
      }

      for (const pId of humanParticipantIds) {
        const outgoing =
          ev.visibleTo && ev.visibleTo.length > 0
            ? engine.filterEventForPlayer(ev, pId)
            : ev;
        lobbyManager.sendToPlayer(pId, "GAME_EVENT", outgoing);
      }

      if (ev.type === "GAME_OVER") {
        for (const pId of humanParticipantIds) {
          lobbyManager.sendToPlayer(pId, "GAME_OVER", ev.payload);
        }
      }
    }

    if (logs.length > GameSessionManager.MAX_RESTORED_EVENTS) {
      logs.length = GameSessionManager.MAX_RESTORED_EVENTS;
    }
    this.combatLogs.set(roomId, logs);

    if (events.length > 0) {
      for (const pId of humanParticipantIds) {
        lobbyManager.sendToPlayer(pId, "COMBAT_LOG_UPDATE", {
          combatLog: getLogsForPlayer(logs, pId, 50),
          structuredCombatLog: getStructuredLogsForPlayer(logs, pId, 50),
        });
      }
    }
  }

  // Normalize DB asset paths
  private toAssetUrl(rawPath?: string | null): string | undefined {
    if (!rawPath) return undefined;
    if (rawPath.startsWith("/")) return rawPath;
    return rawPath.startsWith("assets/") ? `/${rawPath}` : `/assets/${rawPath}`;
  }

  private sendSocket(ws: WebSocket, type: string, payload: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, payload }));
    }
  }
}
