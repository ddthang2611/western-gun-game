import { EngineCard } from "../types/cards";
import { EnginePlayer } from "../types/state";

export type ReactionType =
  | "BANG_DEFENSE"
  | "INDIANS_DEFENSE"
  | "GATLING_DEFENSE"
  | "DUEL_RESPONSE"
  | "GENERAL_STORE_DRAFT"
  | "DISCARD_RESPONSE"
  | "NEAR_DEATH_RESCUE"
  | "EVENT_DALTONS_DISCARD"
  | "EVENT_RUSSIAN_ROULETTE"
  | "EVENT_RICOCHET_DEFENSE";

export type AoeScope = "ALL_OTHERS" | "ALL_PLAYERS" | "CUSTOM";

export interface PendingReaction {
  id: string;
  type: ReactionType;
  sourcePlayerId: string;
  targetPlayerId: string;
  sourceCard: EngineCard;
  requiredCard: "MISSED" | "BANG" | "CHOICE" | "ANY_HAND" | "BLUE_EQUIP" | "SID_RESCUE";
  requiredCount: number;
  currentCount: number;
  canUseBarrel: boolean;
  canUseJourdonnais: boolean;
  barrelChecked: boolean;
  jourdonnaisChecked: boolean;
  pendingDamage?: number;
  ricochetTargetArea?: "EQUIPMENT" | "GREEN" | "JUDGEMENT";
  ricochetTargetCardId?: string;
  rouletteChainNext?: boolean;
  rouletteStartPlayerId?: string;
  duelInitiatorId?: string;
  deferredMollyDraws?: Record<string, number>;
  canUseBeer?: boolean;
  canUseSidKetchum?: boolean;
  originalDamage?: number;
  rescueBeersUsed?: number;
  createdAt: number;
}

export interface ReactionConfig {
  type: ReactionType;
  requiredCard: "MISSED" | "BANG" | "CHOICE" | "ANY_HAND" | "BLUE_EQUIP" | "SID_RESCUE";
  requiredCount?: number;
  allowBarrel?: boolean;
  allowJourdonnais?: boolean;
}

export interface GeneralStoreDraftState {
  type?: "GENERAL_STORE_DRAFT";
  originPlayerId: string;
  storePool: EngineCard[];
  draftOrder: string[];
  currentPickerIndex: number;
}

export interface BrawlCardPickState {
  type: "BRAWL_CARD_PICK";
  actorPlayerId: string;
  sourceCard: EngineCard;
  remainingTargetIds: string[];
  currentTargetId: string;
  affectedCount: number;
}

export type LuckyDukeReason = "BARREL" | "JOURDONNAIS" | "JAIL" | "DYNAMITE" | "VENDETTA";

export interface LuckyDukePickState {
  type: "LUCKY_DUKE_PICK";
  playerId: string;
  reason: LuckyDukeReason;
  drawnCards: EngineCard[];
  judgementCard?: EngineCard;
  judgementId?: string;
  sourceReactionId?: string;
}

export interface ElGringoPickState {
  type: "EL_GRINGO_PICK";
  victimId: string;
  attackerId: string;
  remainingSteals: number;
}

export type PendingInteraction =
  | GeneralStoreDraftState
  | BrawlCardPickState
  | LuckyDukePickState
  | ElGringoPickState;

export interface DuelState {
  initiatorPlayerId: string;
  targetPlayerId: string;
  currentTurnPlayerId: string;
  duelCard: EngineCard;
}

export interface ActionContext {
  attacker: EnginePlayer;
  defender?: EnginePlayer;
  card: EngineCard;
  targetArea?: "HAND" | "EQUIPMENT" | "GREEN" | "JUDGEMENT";
  targetCardId?: string;
}
