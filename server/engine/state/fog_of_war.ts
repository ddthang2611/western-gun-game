import {
  SimulationState,
  EnginePlayer,
  EngineCharacter,
  RoleType,
  MatchPhase,
  HpRuleType,
  TurnPhase,
  PendingTurnStartChoice,
  PendingPhase1Choice,
  PlayerEquipments,
} from "../types/state";
import {
  EngineCard,
  EngineEventCard,
  ActiveGreenCard,
  ActiveJudgement,
} from "../types/cards";
import { DomainEvent } from "../types/actions";

export interface SanitizedPlayerState {
  id: string;
  name: string;
  seatIndex: number;
  role: RoleType | "UNKNOWN";
  isSheriff: boolean;
  isDead: boolean;
  isGhost: boolean;
  hp: number;
  maxHp: number;
  characters: EngineCharacter[];
  copiedCharacter: EngineCharacter | null;
  forcedPlayCardId: string | null;
  handCount: number;
  handCards?: EngineCard[];
  equipments: PlayerEquipments;
  greenCards: ActiveGreenCard[];
  judgements: ActiveJudgement[];
}

export type FilteredPlayerSnapshot = SanitizedPlayerState;

export interface PublicReactionSummary {
  id: string;
  type: string;
  sourcePlayerId: string;
  targetPlayerId: string;
  requiredCard: string;
  requiredCount: number;
  currentCount: number;
}

export interface GeneralStoreSnapshot {
  originPlayerId: string;
  pool: EngineCard[];
  draftOrder: string[];
  currentPickerIndex: number;
  currentPickerId: string | null;
}

export interface SanitizedPendingCharacterChoice {
  playerId: string;
  candidates: EngineCharacter[];
  requiredCount: number;
  selectedCharacterIds?: string[];
  submittedPlayerIds: string[];
  totalPlayers: number;
}

export interface SanitizedGameState {
  roomId: string;
  matchPhase: MatchPhase;
  roundNumber: number;
  turnPlayerId: string;
  sheriffId: string;
  direction: 1 | -1;
  currentPhase: TurnPhase;
  bangCountThisTurn: number;
  deckCount: number;
  discardCount: number;
  topDiscardCard?: EngineCard;
  activeEvent: EngineEventCard | null;
  eventDeckCount: number;
  is3PlayerVariant: boolean;
  expansions: string[];
  dualCharacterMode: boolean;
  hpRule: HpRuleType;
  players: SanitizedPlayerState[];
  myState?: {
    id: string;
    role: RoleType;
    handCards: EngineCard[];
    isGhost: boolean;
    copiedCharacter: EngineCharacter | null;
    forcedPlayCardId: string | null;
  };
  pendingCharacterSelect: SanitizedPendingCharacterChoice | null;
  pendingTurnStartChoice: PendingTurnStartChoice | null;
  pendingPhase1Choice: PendingPhase1Choice | null;
  activeChain: any[];
  myPendingReaction: any | null;
  pendingReactionTargets: PublicReactionSummary[];
  generalStore: GeneralStoreSnapshot | null;
  gameOver?: {
    winner: string | null;
    message: string;
  };
}

export type FilteredWorldSnapshot = SanitizedGameState;

export class FogOfWarFilter {
  // Project Fog of War snapshot
  public static projectStateForPlayer(
    state: SimulationState,
    targetPlayerId: string
  ): SanitizedGameState {
    const playersList: SanitizedPlayerState[] = [];
    let myState: SanitizedGameState["myState"];

    state.players.forEach((player: EnginePlayer, pId: string) => {
      const isMe = pId === targetPlayerId;
      const shouldRevealRole =
        player.isSheriff || player.isDead || isMe || state.is3PlayerVariant;

      const eq = player.equipments || {};
      const sanitizedEquipments: PlayerEquipments = {
        weapon: eq.weapon,
        horseDef: eq.horseDef,
        horseOff: eq.horseOff,
        barrel: eq.barrel,
        extra: eq.extra,
        extras: eq.extras ? [...eq.extras] : [],
      };

      const hideCharSelection = state.matchPhase === "CHARACTER_SELECT" && !isMe;

      const playerSnapshot: SanitizedPlayerState = {
        id: player.id,
        name: player.name,
        seatIndex: player.seatIndex,
        role: shouldRevealRole ? player.role : "UNKNOWN",
        isSheriff: player.isSheriff,
        isDead: player.isDead,
        isGhost: Boolean(player.isGhost),
        hp: hideCharSelection ? 0 : player.hp,
        maxHp: hideCharSelection ? 0 : player.maxHp,
        characters: hideCharSelection ? [] : [...player.characters],
        copiedCharacter: player.copiedCharacter ?? null,
        forcedPlayCardId: player.forcedPlayCardId ?? null,
        handCount: player.handCards.length,
        handCards: isMe ? [...player.handCards] : undefined,
        equipments: sanitizedEquipments,
        greenCards: [...(player.greenCards || [])],
        judgements: [...(player.judgements || [])],
      };

      if (isMe) {
        myState = {
          id: player.id,
          role: player.role,
          handCards: [...player.handCards],
          isGhost: Boolean(player.isGhost),
          copiedCharacter: player.copiedCharacter ?? null,
          forcedPlayCardId: player.forcedPlayCardId ?? null,
        };
      }

      playersList.push(playerSnapshot);
    });

    const activeReactions = state.pendingReactions.filter((r: any) => {
      const target = state.players.get(r.targetPlayerId);
      return Boolean(target && !target.isDead);
    });
    const headReaction = activeReactions[0] || null;
    const myPendingReaction =
      headReaction && headReaction.targetPlayerId === targetPlayerId
        ? headReaction
        : null;

    const pendingReactionTargets: PublicReactionSummary[] = activeReactions.map(
      (r: any) => ({
        id: r.id,
        type: r.type,
        sourcePlayerId: r.sourcePlayerId,
        targetPlayerId: r.targetPlayerId,
        requiredCard: r.requiredCard,
        requiredCount: r.requiredCount,
        currentCount: r.currentCount,
      })
    );

    const storeChain = state.activeChain[0];
    const generalStore: GeneralStoreSnapshot | null =
      storeChain && Array.isArray(storeChain.storePool)
        ? {
            originPlayerId: storeChain.originPlayerId,
            pool: [...storeChain.storePool],
            draftOrder: [...storeChain.draftOrder],
            currentPickerIndex: storeChain.currentPickerIndex,
            currentPickerId: storeChain.draftOrder[storeChain.currentPickerIndex] || null,
          }
        : null;

    let pendingCharacterSelect: SanitizedPendingCharacterChoice | null = null;
    if (state.matchPhase === "CHARACTER_SELECT") {
      const entry = state.pendingCharacterSelect.get(targetPlayerId);
      if (entry) {
        const submittedPlayerIds = Array.from(state.pendingCharacterSelect.values())
          .filter((item) => Boolean(item.selectedCharacterIds?.length))
          .map((item) => item.playerId);

        pendingCharacterSelect = {
          playerId: entry.playerId,
          candidates: [...entry.candidates],
          requiredCount: entry.requiredCount,
          selectedCharacterIds: entry.selectedCharacterIds
            ? [...entry.selectedCharacterIds]
            : undefined,
          submittedPlayerIds,
          totalPlayers: state.pendingCharacterSelect.size,
        };
      }
    }

    let pendingPhase1Choice: PendingPhase1Choice | null = null;
    if (state.pendingPhase1Choice) {
      const pc = state.pendingPhase1Choice;
      pendingPhase1Choice =
        pc.playerId === targetPlayerId
          ? {
              ...pc,
              options: [...pc.options],
              previewCards: pc.previewCards ? [...pc.previewCards] : undefined,
              drawnSoFar: pc.drawnSoFar ? [...pc.drawnSoFar] : undefined,
            }
          : {
              playerId: pc.playerId,
              mode: pc.mode,
              options: [...pc.options],
              hasBlackJackFollowup: pc.hasBlackJackFollowup,
              remainingBaseDraws: pc.remainingBaseDraws,
              ranchUsed: pc.ranchUsed,
            };
    }

    return {
      roomId: state.roomId,
      matchPhase: state.matchPhase,
      roundNumber: state.roundNumber,
      turnPlayerId: state.turnPlayerId,
      sheriffId: state.sheriffId,
      direction: state.direction,
      currentPhase: state.currentPhase,
      bangCountThisTurn: state.bangCountThisTurn,
      deckCount: state.drawDeck.length,
      discardCount: state.discardPile.length,
      topDiscardCard: state.discardPile[state.discardPile.length - 1],
      activeEvent: state.activeEvent,
      eventDeckCount: state.eventDeck.length,
      is3PlayerVariant: state.is3PlayerVariant,
      expansions: [...state.expansions],
      dualCharacterMode: state.dualCharacterMode,
      hpRule: state.hpRule,
      players: playersList,
      myState,
      pendingCharacterSelect,
      pendingTurnStartChoice: state.pendingTurnStartChoice,
      pendingPhase1Choice,
      activeChain: state.activeChain,
      myPendingReaction,
      pendingReactionTargets,
      generalStore,
      gameOver: state.gameOver,
    };
  }

  // Filter event by visibility permissions
  public static filterEventForPlayer(
    event: DomainEvent,
    targetPlayerId: string
  ): DomainEvent {
    if (!event.visibleTo) {
      return event;
    }

    if (event.visibleTo.includes(targetPlayerId)) {
      return event;
    }

    return {
      type: event.type,
      payload: event.maskedPayload ?? {
        ...event.payload,
        card: {
          id: "SECRET",
          name: "Hidden Card",
          suit: "UNKNOWN",
          rank: "UNKNOWN",
        },
      },
      timestamp: event.timestamp,
    };
  }
}
