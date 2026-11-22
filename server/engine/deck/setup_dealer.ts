import crypto from "crypto";
import {
  RoleType,
  EnginePlayer,
  EngineCharacter,
  SimulationState,
  HpRuleType,
} from "../types/state";
import { EngineCard, EngineEventCard } from "../types/cards";
import { CommandResult, DomainEvent } from "../types/actions";
import { DeckManager } from "./deck_manager";

export interface PlayerInitInfo {
  id: string;
  name: string;
}

export interface InitializePlayerOptions {
  enableCharacterSelect?: boolean;
  expansions?: string[];
  is3PlayerVariant?: boolean;
}

export interface SetupOptions {
  playerIds: PlayerInitInfo[];
  dualCharacterMode: boolean;
  hpRule: HpRuleType;
  allCharacters: EngineCharacter[];
  deckManager: DeckManager;
  enableCharacterSelect?: boolean;
  expansions?: string[];
  is3PlayerVariant?: boolean;
  state?: SimulationState;
}

export class SetupDealer {
  // Role distribution by player count
  public static getRoleDistribution(
    playerCount: number,
    is3PlayerVariant: boolean = false
  ): RoleType[] {
    if (playerCount === 3 && is3PlayerVariant) {
      return ["deputy", "outlaw", "renegade"];
    }

    switch (playerCount) {
      case 1:
        return ["sheriff"];
      case 2:
        return ["sheriff", "outlaw"];
      case 3:
        return ["sheriff", "outlaw", "renegade"];
      case 4:
        return ["sheriff", "renegade", "outlaw", "outlaw"];
      case 5:
        return ["sheriff", "renegade", "outlaw", "outlaw", "deputy"];
      case 6:
        return ["sheriff", "renegade", "outlaw", "outlaw", "outlaw", "deputy"];
      case 7:
        return ["sheriff", "renegade", "outlaw", "outlaw", "outlaw", "deputy", "deputy"];
      case 8:
        return ["sheriff", "renegade", "renegade", "outlaw", "outlaw", "outlaw", "deputy", "deputy"];
      default:
        throw new Error(`Unsupported player count: ${playerCount}. Must be 3 to 8 players.`);
    }
  }

  // Calculate max HP by rules
  public static calculateMaxHp(
    chars: EngineCharacter[],
    isSheriff: boolean,
    hpRule: HpRuleType = "strict"
  ): number {
    if (chars.length === 0) return 4;
    if (chars.length === 1) return chars[0].baseHp + (isSheriff ? 1 : 0);

    const hp1 = chars[0].baseHp;
    const hp2 = chars[1].baseHp;
    let base = 4;

    if (hpRule === "strict") {
      base = Math.min(hp1, hp2);
    } else if (hpRule === "balanced") {
      base = Math.min(hp1, hp2) + 1;
    } else {
      base = hp1 + hp2 - 2;
    }

    return base + (isSheriff ? 1 : 0);
  }

  // Filter items by active expansions
  public static filterByExpansions<T extends { pack?: string }>(
    items: T[],
    expansions?: string[]
  ): T[] {
    if (!expansions || expansions.length === 0) return [...items];
    const allowed = new Set(["base", ...expansions]);
    return items.filter((item) => !item.pack || allowed.has(item.pack));
  }

  // Build shuffled card deck
  public static buildDeck(allCards: EngineCard[], expansions?: string[]): EngineCard[] {
    return this.shuffleArray(this.filterByExpansions(allCards, expansions));
  }

  // Cryptographically secure Fisher-Yates shuffle
  private static shuffleArray<T>(arr: T[]): T[] {
    const list = [...arr];
    for (let i = list.length - 1; i > 0; i--) {
      const j = crypto.randomInt(0, i + 1);
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  // Draw unique characters from pool
  private static drawCharacters(
    pool: EngineCharacter[],
    fallbackSource: EngineCharacter[],
    count: number
  ): EngineCharacter[] {
    const picked: EngineCharacter[] = [];
    const usedIds = new Set<string>();

    while (picked.length < count && pool.length > 0) {
      const char = pool.pop()!;
      if (!usedIds.has(char.id)) {
        usedIds.add(char.id);
        picked.push(char);
      }
    }

    if (picked.length < count && fallbackSource.length > 0) {
      const extraPool = this.shuffleArray(fallbackSource);
      for (const char of extraPool) {
        if (picked.length >= count) break;
        if (!usedIds.has(char.id)) {
          usedIds.add(char.id);
          picked.push(char);
        }
      }
    }

    return picked;
  }

  // Initialize match players (options signature)
  public static initializePlayers(options: SetupOptions): {
    players: Map<string, EnginePlayer>;
    sheriffId: string;
  };
  // Initialize match players (state signature)
  public static initializePlayers(
    state: SimulationState,
    playerInfos: PlayerInitInfo[],
    allCharacters: EngineCharacter[],
    dualCharacterMode?: boolean,
    hpRule?: HpRuleType,
    options?: InitializePlayerOptions
  ): {
    players: Map<string, EnginePlayer>;
    sheriffId: string;
  };
  public static initializePlayers(
    stateOrOptions: SimulationState | SetupOptions,
    playerInfosArg?: PlayerInitInfo[],
    allCharactersArg?: EngineCharacter[],
    dualCharacterModeArg: boolean = false,
    hpRuleArg: HpRuleType = "strict",
    optionsArg?: InitializePlayerOptions
  ): {
    players: Map<string, EnginePlayer>;
    sheriffId: string;
  } {
    let state: SimulationState | undefined;
    let playerInfos: PlayerInitInfo[];
    let allCharacters: EngineCharacter[];
    let dualCharacterMode: boolean;
    let hpRule: HpRuleType;
    let deckManager: DeckManager | undefined;
    let enableCharacterSelect = false;
    let expansions: string[] | undefined;
    let is3PlayerVariant = false;

    if ("playerIds" in stateOrOptions) {
      state = stateOrOptions.state;
      playerInfos = stateOrOptions.playerIds;
      allCharacters = stateOrOptions.allCharacters;
      dualCharacterMode = stateOrOptions.dualCharacterMode;
      hpRule = stateOrOptions.hpRule;
      deckManager = stateOrOptions.deckManager;
      enableCharacterSelect = Boolean(stateOrOptions.enableCharacterSelect);
      expansions = stateOrOptions.expansions ?? state?.expansions;
      is3PlayerVariant = Boolean(stateOrOptions.is3PlayerVariant ?? state?.is3PlayerVariant);
    } else {
      state = stateOrOptions;
      playerInfos = playerInfosArg || [];
      allCharacters = allCharactersArg || [];
      dualCharacterMode = dualCharacterModeArg;
      hpRule = hpRuleArg;
      enableCharacterSelect = Boolean(optionsArg?.enableCharacterSelect);
      expansions = optionsArg?.expansions ?? state.expansions;
      is3PlayerVariant = Boolean(optionsArg?.is3PlayerVariant ?? state.is3PlayerVariant);
    }

    const use3PVariant = playerInfos.length === 3 && is3PlayerVariant;
    const roles = this.shuffleArray(this.getRoleDistribution(playerInfos.length, use3PVariant));

    const requiredCount = dualCharacterMode ? 2 : 1;
    const candidateCount = requiredCount === 2 ? 4 : 3;
    const neededChars =
      playerInfos.length * (enableCharacterSelect ? candidateCount : requiredCount);

    const filteredChars = this.filterByExpansions(allCharacters, expansions);
    const charSource = filteredChars.length >= neededChars ? filteredChars : allCharacters;
    const characterPool = this.shuffleArray(charSource);

    if (state) {
      state.dualCharacterMode = dualCharacterMode;
      state.hpRule = hpRule;
      state.is3PlayerVariant = use3PVariant;
      state.pendingCharacterSelect.clear();
    }

    const players = new Map<string, EnginePlayer>();
    let sheriffId = "";
    let deputyId = "";

    playerInfos.forEach((user, index) => {
      const role = roles[index];
      const isSheriff = !use3PVariant && role === "sheriff";
      if (isSheriff) sheriffId = user.id;
      if (role === "deputy" && !deputyId) deputyId = user.id;

      if (enableCharacterSelect && state) {
        const candidates = this.drawCharacters(characterPool, charSource, candidateCount);
        state.pendingCharacterSelect.set(user.id, {
          playerId: user.id,
          candidates,
          requiredCount,
        });

        players.set(user.id, {
          id: user.id,
          name: user.name,
          seatIndex: index,
          role,
          isSheriff,
          isDead: false,
          isGhost: false,
          hp: 0,
          maxHp: 0,
          characters: [],
          copiedCharacter: null,
          forcedPlayCardId: null,
          handCards: [],
          equipments: { extras: [] },
          greenCards: [],
          judgements: [],
        });
        return;
      }

      const assignedChars = this.drawCharacters(characterPool, charSource, requiredCount);
      const maxHp = this.calculateMaxHp(assignedChars, isSheriff, hpRule);

      let initialHand: EngineCard[] = [];
      if (deckManager) {
        initialHand = deckManager.draw(maxHp).cards;
      } else if (state) {
        initialHand = DeckManager.drawCards(state, maxHp).cards;
      }

      players.set(user.id, {
        id: user.id,
        name: user.name,
        seatIndex: index,
        role,
        isSheriff,
        isDead: false,
        isGhost: false,
        hp: maxHp,
        maxHp,
        characters: assignedChars,
        copiedCharacter: null,
        forcedPlayCardId: null,
        handCards: initialHand,
        equipments: { extras: [] },
        greenCards: [],
        judgements: [],
      });
    });

    if (use3PVariant && deputyId) {
      sheriffId = deputyId;
    } else if (!sheriffId && playerInfos.length > 0) {
      sheriffId = playerInfos[0].id;
    }

    if (state) {
      state.players = players;
      state.sheriffId = sheriffId;
      state.matchPhase = enableCharacterSelect ? "CHARACTER_SELECT" : "PLAYING";
    }

    return { players, sheriffId };
  }

  // Resolve player character choice
  public static resolveCharacterSelection(
    state: SimulationState,
    playerId: string,
    characterIds: string[],
    events: DomainEvent[] = [],
    deckManager?: DeckManager
  ): CommandResult {
    if (state.matchPhase !== "CHARACTER_SELECT") {
      return { success: false, message: "Match is not in character selection phase." };
    }

    const player = state.players.get(playerId);
    if (!player) {
      return { success: false, message: "Player not found." };
    }

    const entry = state.pendingCharacterSelect.get(playerId);
    if (!entry) {
      return { success: false, message: "No pending character selection for player." };
    }

    if (entry.selectedCharacterIds) {
      return { success: false, message: "Characters already selected for player." };
    }

    if (!Array.isArray(characterIds) || characterIds.length !== entry.requiredCount) {
      return {
        success: false,
        message: `Must select exactly ${entry.requiredCount} character(s).`,
      };
    }

    if (new Set(characterIds).size !== characterIds.length) {
      return { success: false, message: "Selected characters must be distinct." };
    }

    const claimedIds = new Set<string>();
    state.players.forEach((other, oid) => {
      if (oid === playerId) return;
      for (const c of other.characters) {
        claimedIds.add(c.id);
      }
    });
    state.pendingCharacterSelect.forEach((otherEntry, oid) => {
      if (oid === playerId || !otherEntry.selectedCharacterIds) return;
      for (const cid of otherEntry.selectedCharacterIds) {
        claimedIds.add(cid);
      }
    });

    const chosen: EngineCharacter[] = [];
    for (const cid of characterIds) {
      if (claimedIds.has(cid)) {
        return {
          success: false,
          message: "Selected character was already chosen by another player.",
        };
      }
      const match = entry.candidates.find((c) => c.id === cid);
      if (!match) {
        return { success: false, message: "Selected character is not in candidates." };
      }
      chosen.push(match);
    }

    player.characters = chosen;
    player.maxHp = this.calculateMaxHp(chosen, player.isSheriff, state.hpRule);
    player.hp = player.maxHp;
    entry.selectedCharacterIds = [...characterIds];

    events.push({
      type: "CHARACTERS_SELECTED",
      payload: {
        playerId: player.id,
        playerName: player.name,
        characters: chosen,
        maxHp: player.maxHp,
      },
      visibleTo: [player.id],
      maskedPayload: {
        playerId: player.id,
        playerName: player.name,
        characters: [],
        maxHp: 0,
      },
      timestamp: Date.now(),
    });

    const allSelected =
      state.pendingCharacterSelect.size > 0 &&
      Array.from(state.pendingCharacterSelect.values()).every(
        (item) => item.selectedCharacterIds?.length === item.requiredCount
      );

    if (allSelected) {
      state.pendingCharacterSelect.clear();
      state.matchPhase = "PLAYING";
      this.dealStartingHands(state, events, deckManager);

      events.push({
        type: "MATCH_STARTED",
        payload: {
          roomId: state.roomId,
          playerCount: state.players.size,
          sheriffId: state.sheriffId,
          is3PlayerVariant: state.is3PlayerVariant,
        },
        timestamp: Date.now(),
      });
    }

    return { success: true, events };
  }

  // Deal starting hand cards
  public static dealStartingHands(
    state: SimulationState,
    events: DomainEvent[] = [],
    deckManager?: DeckManager
  ): void {
    const orderedPlayers = Array.from(state.players.values()).sort(
      (a, b) => a.seatIndex - b.seatIndex
    );

    for (const player of orderedPlayers) {
      const cardCount = Math.max(0, player.hp);
      if (cardCount === 0) continue;

      const drawn = deckManager
        ? deckManager.draw(cardCount)
        : DeckManager.drawCards(state, cardCount);
      player.handCards.push(...drawn.cards);
      events.push(...drawn.events);
    }
  }
}
