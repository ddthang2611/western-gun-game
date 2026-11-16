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
  originPlayerId: string;
  storePool: EngineCard[];
  draftOrder: string[];
  currentPickerIndex: number;
}

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
