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
import { FilteredWorldSnapshot } from "../engine/state/fog_of_war";
import { DistanceCalculator } from "../engine/board/distance_calculator";
import { CatalogRepository } from "../db/catalog_repository";
import { SessionRepository } from "../db/session_repository";
import { isDatabaseUnlocked } from "../db/database";
import { LobbyPlayer, GameSettings } from "./protocol";
import { LobbyManager } from "./lobby_handler";

export class GameSessionManager {
  private static instance: GameSessionManager;
  private engines: Map<string, GameEngine> = new Map();
  private combatLogs: Map<string, string[]> = new Map();
  private matchEventSeqs: Map<string, number> = new Map();

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

  public endSession(roomId: string): void {
    this.engines.delete(roomId);
    this.combatLogs.delete(roomId);
    this.matchEventSeqs.delete(roomId);
    try {
      const repo = SessionRepository.getInstance();
      repo.deleteGameState(roomId);
      repo.deleteMatchEvents(roomId);
    } catch {
      // Ignore cleanup failure
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

  // Restore saved match from runtime DB
  public restoreSessionFromDb(roomId: string): GameEngine | null {
    if (!isDatabaseUnlocked()) return null;
    if (this.engines.has(roomId)) {
      return this.engines.get(roomId) || null;
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
      }
    );

    this.engines.set(roomId, engine);
    const pastEvents = repo.getMatchEvents(roomId);
    const maxSeq = pastEvents.reduce((max, row) => Math.max(max, row.seq), 0);
    this.matchEventSeqs.set(roomId, maxSeq);

    const restoredLogs: string[] = [];
    for (const row of pastEvents) {
      let payload: any = {};
      try {
        payload = JSON.parse(row.payload_json);
      } catch {
        payload = {};
      }
      const line = this.formatEventToLog({
        type: row.event_type,
        payload,
        timestamp: Date.parse(row.created_at) || Date.now(),
      });
      if (line) restoredLogs.unshift(line);
    }
    this.combatLogs.set(roomId, restoredLogs.slice(0, 100));
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
      if ((!player.isDead || player.isGhost) && !lobbyManager.isPlayerOnline(player.id)) {
        return true;
      }
    }
    return false;
  }

  // Persist authoritative match snapshot
  private persistGameState(roomId: string, engine: GameEngine): void {
    try {
      SessionRepository.getInstance().saveGameState(roomId, engine.serializeState());
    } catch {
      // Ignore persistence error
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
    const expansions = Array.from(
      new Set(["base", ...(settings.expansions || [])])
    );
    const is3PVariant = players.length === 3;
    const playerList = players.map((p) => ({ id: p.id, name: p.name }));

    try {
      const repo = SessionRepository.getInstance();
      repo.deleteMatchEvents(roomId);
      this.matchEventSeqs.set(roomId, 0);

      const engine = new GameEngine(roomId, engineCards, engineEvents, {
        defaultEnableCharacterSelect: true,
        defaultEnable3PlayerVariant: is3PVariant,
        expansions,
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
        }
      );

      this.engines.set(roomId, engine);
      this.combatLogs.set(roomId, [
        `[${new Date().toLocaleTimeString()}] Match initialized. Waiting for character selection.`,
      ]);
      this.persistGameState(roomId, engine);

      this.broadcastGameSnapshot(roomId, engine, lobbyManager);
      if (matchResult.events && matchResult.events.length > 0) {
        this.processDomainEvents(roomId, matchResult.events, engine, lobbyManager);
      }

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
        message: "Match is paused while waiting for a disconnected player to reconnect.",
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
      return;
    }

    this.sendSocket(ws, "GAME_ACTION_SUCCESS", {
      action: normalizedCommand.type,
    });

    if (result.events && result.events.length > 0) {
      this.processDomainEvents(roomId, result.events, engine, lobbyManager);
    }

    this.persistGameState(roomId, engine);
    this.broadcastGameSnapshot(roomId, engine, lobbyManager);
  }

  // Send private snapshot to player
  public sendPlayerSnapshot(
    engine: GameEngine,
    playerId: string,
    roomId: string,
    lobbyManager: LobbyManager
  ): void {
    const snapshot = engine.getFilteredSnapshot(playerId);
    const logs = this.combatLogs.get(roomId) || [];
    const tableState = this.buildTableState(
      snapshot,
      playerId,
      engine,
      logs,
      lobbyManager
    );

    lobbyManager.sendToPlayer(playerId, "WORLD_SNAPSHOT", snapshot);
    lobbyManager.sendToPlayer(playerId, "TABLE_STATE", tableState);
    lobbyManager.sendToPlayer(playerId, "GAME_STATE", tableState);
  }

  // Broadcast snapshots to all players
  public broadcastGameSnapshot(
    roomId: string,
    engine: GameEngine,
    lobbyManager: LobbyManager
  ): void {
    const connectedPlayerIds = lobbyManager.getConnectedPlayerIds();
    connectedPlayerIds.forEach((playerId) => {
      this.sendPlayerSnapshot(engine, playerId, roomId, lobbyManager);
    });
  }

  // Broadcast domain events and logs
  private processDomainEvents(
    roomId: string,
    events: DomainEvent[],
    engine: GameEngine,
    lobbyManager: LobbyManager
  ): void {
    const logs = this.combatLogs.get(roomId) || [];
    let seq = this.matchEventSeqs.get(roomId) || 0;
    const repo = SessionRepository.getInstance();

    events.forEach((ev) => {
      seq += 1;
      try {
        repo.logMatchEvent(roomId, seq, ev.type, ev.payload || {});
      } catch {
        // Ignore event log error
      }

      const logText = this.formatEventToLog(ev);
      if (logText) {
        logs.unshift(logText);
      }

      if (ev.visibleTo && ev.visibleTo.length > 0) {
        const allPlayerIds = lobbyManager.getConnectedPlayerIds();
        allPlayerIds.forEach((pId) => {
          const filteredEvent = engine.filterEventForPlayer(ev, pId);
          lobbyManager.sendToPlayer(pId, "GAME_EVENT", filteredEvent);
        });
      } else {
        lobbyManager.broadcastMessage("GAME_EVENT", ev);
      }

      if (ev.type === "GAME_OVER") {
        lobbyManager.broadcastMessage("GAME_OVER", ev.payload);
      }
    });

    this.matchEventSeqs.set(roomId, seq);

    if (logs.length > 100) {
      logs.length = 100;
    }
    this.combatLogs.set(roomId, logs);

    if (events.length > 0) {
      lobbyManager.broadcastMessage("COMBAT_LOG_UPDATE", {
        combatLog: logs.slice(0, 50),
      });
    }
  }

  // Format public domain events cleanly
  private formatEventToLog(ev: DomainEvent): string | null {
    const time = new Date().toLocaleTimeString();
    const p = ev.payload;
    if (!p) return null;

    switch (ev.type) {
      case "CHARACTER_SELECT_STARTED":
        return `[${time}] Character selection started for ${p.playerCount} players.`;
      case "CHARACTERS_SELECTED": {
        const charNames = Array.isArray(p.characters)
          ? p.characters.map((c: any) => c.name).join(" & ")
          : "characters";
        return `[${time}] ${p.playerName} chose ${charNames} (${p.maxHp} Max HP).`;
      }
      case "MATCH_STARTED":
        return `[${time}] Match started!${p.is3PlayerVariant ? " 3-player quarry mode active." : " Sheriff is leading the town."}`;
      case "EVENT_REVEALED":
        return `[${time}] Round ${p.roundNumber} event revealed: ${p.event?.name || "Event"}.`;
      case "EVENT_DEAD_MAN_REVIVED":
        return `[${time}] Dead Man revived ${p.playerName} with ${p.hp} HP!`;
      case "EVENT_GHOST_TOWN_ENTER":
        return `[${time}] Ghost Town allowed ${p.playerName} to act as a ghost.`;
      case "EVENT_GHOST_TOWN_EXIT":
        return `[${time}] ${p.playerName} returned to rest after Ghost Town.`;
      case "EVENT_VENDETTA_EXTRA_TURN":
        return `[${time}] Vendetta granted ${p.playerName} an extra turn!`;
      case "EVENT_BLOOD_BROTHERS_RESOLVED":
        return `[${time}] Blood Brothers: ${p.fromPlayerName} gave 1 HP to ${p.targetPlayerName}.`;
      case "EVENT_BLOOD_BROTHERS_SKIPPED":
        return `[${time}] Blood Brothers: ${p.playerName} skipped life transfer.`;
      case "EVENT_DIRECTION_CHANGED":
        return `[${time}] Gold Rush reversed turn direction!`;
      case "EVENT_THE_DOCTOR_HEAL":
        return `[${time}] The Doctor healed lowest HP players.`;
      case "EVENT_RANCH_EXCHANGE":
        return `[${time}] Ranch: ${p.playerName} exchanged ${p.discardedCount} cards.`;
      case "EVENT_HARD_LIQUOR_HEAL":
        return `[${time}] Hard Liquor: ${p.playerName} skipped Phase 1 draw to heal 1 HP.`;
      case "EVENT_PEYOTE_GUESS":
        return `[${time}] Peyote (${p.playerName}): guessed ${p.guess}, drew ${p.card?.name || "card"} (${p.correct ? "correct" : "wrong"}).`;
      case "EVENT_TRAIN_ARRIVAL_DRAW":
        return `[${time}] Train Arrival gave ${p.playerName} 1 bonus card.`;
      case "VERA_CUSTER_COPIED":
        return `[${time}] Vera Custer copied ${p.copiedCharacter?.name || "a hero"} from ${p.sourceOwnerName}.`;
      case "TURN_STARTED":
        return `[${time}] Round ${p.roundNumber}: ${p.playerName}'s turn started.`;
      case "TURN_ENDED":
        return `[${time}] ${p.playerName}'s turn ended.`;
      case "TURN_SKIPPED":
        return `[${time}] ${p.playerName}'s turn skipped (${p.reason || "effect"}).`;
      case "PHASE_CHANGED":
        return `[${time}] Phase changed to Phase ${p.phase}${p.drawnCount ? ` (Drew ${p.drawnCount} cards)` : ""}.`;
      case "DRAW_CHECK_RESULT": {
        const cardStr = p.chosenCard
          ? `${p.chosenCard.rank} of ${p.chosenCard.suit}`
          : "card";
        const resStr = p.success ? "PASSED" : "FAILED";
        return `[${time}] ${p.playerName} check (${p.reason}): ${cardStr} -> ${resStr}.`;
      }
      case "JUDGEMENT_RESOLVED": {
        const cardStr = p.drawnCard
          ? `${p.drawnCard.rank} of ${p.drawnCard.suit}`
          : "card";
        return `[${time}] ${p.playerName} ${p.judgementType}: ${cardStr} -> ${p.result}.`;
      }
      case "DYNAMITE_EXPLODED":
        return `[${time}] Dynamite exploded on ${p.playerName} for ${p.damage} damage!`;
      case "DYNAMITE_PASSED":
        return `[${time}] Dynamite passed from ${p.fromPlayerName || p.fromPlayerId} to ${p.toPlayerName || p.toPlayerId}.`;
      case "JAIL_ESCAPED":
        return `[${time}] ${p.playerName} escaped from Jail!`;
      case "JAIL_FAILED_SKIP_TURN":
        return `[${time}] ${p.playerName} failed Jail check and lost their turn.`;
      case "BANG_ATTACK_LAUNCHED":
        return `[${time}] ${p.attackerName} fired BANG! at ${p.targetName} (Needs ${p.requiredMissedCount} Missed).`;
      case "DOC_HOLYDAY_BANG":
        return `[${time}] Doc Holyday (${p.playerName}) shot ${p.targetName}!`;
      case "RICOCHET_SHOT_LAUNCHED":
        return `[${time}] ${p.attackerName || p.attackerId} fired Ricochet at ${p.targetName || p.targetId}.`;
      case "RICOCHET_SHOT_RESOLVED":
        return `[${time}] Ricochet resolved against ${p.targetId}.`;
      case "PUNCH_LAUNCHED":
        return `[${time}] ${p.attackerId} punched ${p.targetId}!`;
      case "SPRINGFIELD_LAUNCHED":
        return `[${time}] ${p.attackerId} sniped ${p.targetId} with Springfield!`;
      case "ATTACK_EVADED":
        return `[${time}] ${p.targetId} successfully evaded the attack!`;
      case "PLAYER_HIT":
      case "PLAYER_DAMAGED":
        return `[${time}] ${p.victimName} took ${p.damage} damage! (Remaining HP: ${p.currentHp})`;
      case "FATAL_DAMAGE_REVIVED_WITH_BEER":
        return `[${time}] ${p.playerId} consumed Beer at death's door to survive!`;
      case "PLAYER_ELIMINATED":
        return `[${time}] ${p.playerName} was eliminated! Role revealed: ${p.revealedRole}.`;
      case "GAME_OVER":
        return `[${time}] GAME OVER! Winner: ${p.winner}. ${p.message}`;
      case "HEAL_RESOLVED":
        return `[${time}] ${p.playerName} recovered ${p.healedAmount} HP (HP: ${p.currentHp}/${p.maxHp}).`;
      case "BEER_NO_EFFECT_2P":
        return `[${time}] Beer has no effect in a 2-player showdown.`;
      case "SALOON_HEALED":
        return `[${time}] ${p.sourcePlayerName} served Saloon drinks! All living players recovered 1 HP.`;
      case "AOE_INDIANS_TRIGGERED":
        return `[${time}] ${p.sourcePlayerName} sent Indians! All other players must discard a BANG!.`;
      case "AOE_GATLING_TRIGGERED":
        return `[${time}] ${p.sourcePlayerName} fired Gatling! All other players must play a Missed!.`;
      case "BRAWL_RESOLVED":
        return `[${time}] ${p.sourcePlayerName || p.sourcePlayerId} triggered Brawl!`;
      case "GENERAL_STORE_OPENED":
        return `[${time}] ${p.originPlayerName} opened General Store! ${p.pool?.length || 0} cards available.`;
      case "GENERAL_STORE_CARD_PICKED":
        return `[${time}] ${p.playerName} drafted ${p.card?.name || "a card"} from General Store.`;
      case "CARD_STOLEN_FROM_HAND":
        return `[${time}] ${p.sourcePlayerName} stole a card from ${p.targetPlayerName}'s hand.`;
      case "CARD_DESTROYED_FROM_HAND":
        return `[${time}] ${p.sourcePlayerName} destroyed a card from ${p.targetPlayerName}'s hand.`;
      case "EQUIPMENT_EQUIPPED":
        return `[${time}] ${p.playerName} equipped ${p.card?.name || "equipment"}.`;
      case "GREEN_CARD_EQUIPPED":
        return `[${time}] ${p.playerName || p.playerId} placed green card ${p.card?.name || "card"}.`;
      case "GREEN_CARD_ACTIVATED":
        return `[${time}] ${p.playerName || p.playerId} activated green card ${p.cardName || p.card?.name || "card"}.`;
      case "JAIL_ATTACHED":
        return `[${time}] ${p.targetPlayerId} was thrown into Jail!`;
      case "DYNAMITE_ATTACHED":
        return `[${time}] Dynamite lit and ticking!`;
      case "BLACK_JACK_REVEAL":
        return `[${time}] Black Jack (${p.playerName}) revealed ${p.card?.name || "second card"}${p.triggered ? " and drew 1 bonus card" : ""}.`;
      case "LAW_OF_THE_WEST_REVEAL":
        return `[${time}] Law of the West: ${p.playerName} must play ${p.card?.name || "revealed card"}.`;
      case "KIT_CARLSON_PICKED":
        return `[${time}] ${p.playerName} drafted ${p.pickedCount ?? 2} cards with Kit Carlson.`;
      case "PEDRO_RAMIREZ_DRAW":
        return `[${time}] ${p.playerName} drew ${p.card?.name || "top discard"} via Pedro Ramirez.`;
      case "JESSE_JONES_STEAL":
        return `[${time}] Jesse Jones (${p.playerName}) stole first card from ${p.targetPlayerName}.`;
      case "PAT_BRENNAN_STEAL":
        return `[${time}] Pat Brennan (${p.playerName}) took ${p.card?.name || "a card"} from ${p.targetPlayerName}.`;
      case "VULTURE_SAM_SCAVENGED":
        return `[${time}] Vulture Sam claimed ${p.cardCount ?? 0} cards from ${p.victimName || p.victimId}.`;
      case "GREG_DIGGER_HEALED":
        return `[${time}] Greg Digger healed ${p.healedAmount ?? 2} HP after elimination.`;
      case "HERB_HUNTER_DRAW":
        return `[${time}] Herb Hunter drew ${p.drawnCount ?? 2} bonus cards.`;
      case "SUZY_LAFAYETTE_TRIGGERED":
        return `[${time}] Suzy Lafayette drew 1 card on empty hand.`;
      case "BART_CASSIDY_TRIGGERED":
        return `[${time}] Bart Cassidy drew ${p.drawnCount ?? 1} card from damage.`;
      case "EL_GRINGO_STOLEN":
        return `[${time}] El Gringo stole a card from attacker.`;
      case "MOLLY_STARK_TRIGGERED":
        return `[${time}] Molly Stark drew 1 card from out-of-turn play.`;
      case "APACHE_KID_IMMUNITY":
        return `[${time}] Apache Kid resisted Diamond card effect.`;
      case "RUSSIAN_ROULETTE_SURVIVED":
        return `[${time}] ${p.playerName || p.playerId} survived Russian Roulette.`;
      case "RUSSIAN_ROULETTE_HIT":
        return `[${time}] Russian Roulette hit ${p.playerName || p.playerId} for 2 damage!`;
      case "ACTIVE_SKILL_USED":
        return `[${time}] ${p.playerId} used character ability: ${p.skill}.`;
      case "CARD_DISCARDED_PHASE_3":
        return `[${time}] ${p.playerId} discarded excess card ${p.card?.name || "card"} in Phase 3.`;
      default:
        return null;
    }
  }

  // Normalize DB asset paths
  private toAssetUrl(rawPath?: string | null): string | undefined {
    if (!rawPath) return undefined;
    if (rawPath.startsWith("/")) return rawPath;
    return rawPath.startsWith("assets/") ? `/${rawPath}` : `/assets/${rawPath}`;
  }

  // Convert EngineCard for client UI
  private mapClientCard(card?: EngineCard): any {
    if (!card) return undefined;
    return {
      ...card,
      range: card.weaponRange,
    };
  }

  // Convert equipment slots for UI
  private mapClientEquipments(equipments?: any): any {
    const eq = equipments || {};
    return {
      weapon: this.mapClientCard(eq.weapon),
      horseDef: this.mapClientCard(eq.horseDef),
      horseOff: this.mapClientCard(eq.horseOff),
      barrel: this.mapClientCard(eq.barrel),
      extra: this.mapClientCard(eq.extra),
      extras: Array.isArray(eq.extras)
        ? eq.extras.map((c: EngineCard) => this.mapClientCard(c))
        : [],
    };
  }

  // Convert snapshot to client TableState
  private buildTableState(
    snapshot: FilteredWorldSnapshot,
    playerId: string,
    engine: GameEngine,
    combatLog: string[],
    lobbyManager?: LobbyManager
  ): any {
    const simState = engine.getState();
    const myPlayer = snapshot.players.find((p) => p.id === playerId);
    const mySimPlayer = simState.players.get(playerId);
    const weaponRange = mySimPlayer
      ? DistanceCalculator.getAttackerWeaponRange(simState, mySimPlayer)
      : 1;

    const nameById = new Map<string, string>();
    snapshot.players.forEach((p) => nameById.set(p.id, p.name));

    const mappedPlayers = snapshot.players.map((p) => {
      const dist = DistanceCalculator.calculateDistance(simState, playerId, p.id);
      const isInRange = dist <= weaponRange;
      const isOnline = lobbyManager
        ? lobbyManager.isPlayerOnline(p.id)
        : !p.isDead;

      return {
        id: p.id,
        name: p.name,
        seatIndex: p.seatIndex,
        isHost: false,
        isReady: true,
        isOnline: isOnline && (!p.isDead || Boolean(p.isGhost)),
        isDead: p.isDead,
        isGhost: Boolean(p.isGhost),
        hp: p.hp,
        maxHp: p.maxHp,
        role: p.role === "UNKNOWN" ? undefined : p.role,
        isSheriff: p.isSheriff,
        characters: p.characters,
        copiedCharacter: p.copiedCharacter ?? null,
        forcedPlayCardId: p.forcedPlayCardId ?? null,
        handCount: p.handCount,
        handCards: p.handCards?.map((c) => this.mapClientCard(c)),
        equipments: this.mapClientEquipments(p.equipments),
        greenCards: (p.greenCards || []).map((g: any) => ({
          ...g,
          card: this.mapClientCard(g.card),
        })),
        judgements: (p.judgements || []).map((j: any) => ({
          id: j.id,
          type: j.type,
          card: j.card ? this.mapClientCard(j.card) : undefined,
        })),
        hasJail: (p.judgements || []).some((j: any) => j.type === "JAIL"),
        hasDynamite: (p.judgements || []).some((j: any) => j.type === "DYNAMITE"),
        distanceFromMe: dist === Infinity ? 99 : dist,
        isInRange,
      };
    });

    let police = 0;
    let outlaw = 0;
    let renegade = 0;
    simState.players.forEach((p) => {
      if (!p.isDead) {
        if (p.role === "sheriff" || p.role === "deputy") police++;
        else if (p.role === "outlaw") outlaw++;
        else if (p.role === "renegade") renegade++;
      }
    });

    const seenInFlightKeys = new Set<string>();
    const mappedInFlight = simState.pendingReactions
      .filter((r: any) => {
        const key =
          r.sourceCard?.id ||
          `${r.sourcePlayerId}:${r.type}:${r.sourceCard?.name || ""}`;
        if (seenInFlightKeys.has(key)) return false;
        seenInFlightKeys.add(key);
        return true;
      })
      .map((r: any) => ({
        id: r.id,
        card: this.mapClientCard(r.sourceCard),
        sourcePlayerName: nameById.get(r.sourcePlayerId) || "Unknown",
        targetPlayerName: nameById.get(r.targetPlayerId) || "Unknown",
        actionText: `${r.type} (${r.currentCount}/${r.requiredCount})`,
      }));

    const mappedMyPending = snapshot.myPendingReaction
      ? {
          ...snapshot.myPendingReaction,
          sourcePlayerName:
            nameById.get(snapshot.myPendingReaction.sourcePlayerId) || "Unknown",
          sourceCard: this.mapClientCard(snapshot.myPendingReaction.sourceCard),
        }
      : null;

    const mappedGeneralStore = snapshot.generalStore
      ? {
          ...snapshot.generalStore,
          originPlayerName:
            nameById.get(snapshot.generalStore.originPlayerId) || "Unknown",
          currentPickerName: snapshot.generalStore.currentPickerId
            ? nameById.get(snapshot.generalStore.currentPickerId) || "Unknown"
            : null,
          pool: snapshot.generalStore.pool.map((c) => this.mapClientCard(c)),
        }
      : null;

    return {
      roomId: snapshot.roomId,
      hostInfo: `Room: ${snapshot.roomId}`,
      matchPhase: snapshot.matchPhase,
      roundNumber: snapshot.roundNumber,
      myPlayerId: playerId,
      players: mappedPlayers,
      activePlayerId: snapshot.turnPlayerId,
      sheriffId: snapshot.sheriffId,
      direction: snapshot.direction,
      currentPhase: snapshot.currentPhase as 0 | 1 | 2 | 3,
      deckCount: snapshot.deckCount,
      discardCount: snapshot.discardCount,
      topDiscard: this.mapClientCard(snapshot.topDiscardCard),
      activeEvent: snapshot.activeEvent,
      eventDeckCount: snapshot.eventDeckCount,
      is3PlayerVariant: snapshot.is3PlayerVariant,
      expansions: snapshot.expansions,
      dualCharacterMode: snapshot.dualCharacterMode,
      hpRule: snapshot.hpRule,
      pendingCharacterSelect: snapshot.pendingCharacterSelect,
      pendingTurnStartChoice: snapshot.pendingTurnStartChoice,
      pendingPhase1Choice: snapshot.pendingPhase1Choice,
      inFlightCards: mappedInFlight,
      combatLog: combatLog.slice(0, 50),
      roleCounts: { police, outlaw, renegade },
      myRole: snapshot.myState?.role || undefined,
      myHp: myPlayer?.hp ?? 0,
      myMaxHp: myPlayer?.maxHp ?? 0,
      myIsGhost: Boolean(myPlayer?.isGhost),
      myCopiedCharacter: myPlayer?.copiedCharacter ?? null,
      myForcedPlayCardId: myPlayer?.forcedPlayCardId ?? null,
      myHand: (snapshot.myState?.handCards || []).map((c) =>
        this.mapClientCard(c)
      ),
      myEquipments: this.mapClientEquipments(myPlayer?.equipments),
      myGreenCards: (myPlayer?.greenCards || []).map((g: any) => ({
        ...g,
        card: this.mapClientCard(g.card),
      })),
      myJudgements: {
        hasJail: (myPlayer?.judgements || []).some((j: any) => j.type === "JAIL"),
        hasDynamite: (myPlayer?.judgements || []).some(
          (j: any) => j.type === "DYNAMITE"
        ),
      },
      myPendingReaction: mappedMyPending,
      pendingReactions: snapshot.pendingReactionTargets,
      generalStore: mappedGeneralStore,
      gameOver: snapshot.gameOver || null,
      matchPaused: this.isMatchPaused(engine, lobbyManager),
    };
  }

  private sendSocket(ws: WebSocket, type: string, payload: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, payload }));
    }
  }
}
