import { EngineCard, EngineEventCard, ActiveJudgement, ActiveGreenCard } from "./cards";

export type RoleType = "sheriff" | "deputy" | "outlaw" | "renegade";
export type TurnPhase = 0 | 1 | 2 | 3;
export type MatchPhase = "CHARACTER_SELECT" | "PLAYING" | "FINISHED";
export type HpRuleType = "strict" | "balanced" | "juggernaut";

export interface EngineCharacter {
  id: string;
  pack?: string;
  name: string;
  baseHp: number;
  desc: string;
  image?: string;
  isActiveSkill?: boolean;
  skillName?: string;
}

export interface PlayerEquipments {
  weapon?: EngineCard;
  horseDef?: EngineCard;
  horseOff?: EngineCard;
  barrel?: EngineCard;
  extra?: EngineCard;
  extras?: EngineCard[];
}

export interface EnginePlayer {
  id: string;
  name: string;
  seatIndex: number;
  role: RoleType;
  isSheriff: boolean;
  isDead: boolean;
  isGhost?: boolean;
  hp: number;
  maxHp: number;
  characters: EngineCharacter[];
  copiedCharacter?: EngineCharacter | null;
  forcedPlayCardId?: string | null;
  handCards: EngineCard[];
  equipments: PlayerEquipments;
  greenCards: ActiveGreenCard[];
  judgements: ActiveJudgement[];
}

export interface PendingCharacterChoice {
  playerId: string;
  candidates: EngineCharacter[];
  requiredCount: number;
  selectedCharacterIds?: string[];
}

export interface PendingTurnStartChoice {
  type: "VERA_CUSTER_COPY" | "BLOOD_BROTHERS";
  playerId: string;
  availableCharacters?: Array<{ ownerPlayerId: string; ownerName: string; character: EngineCharacter }>;
  eligibleTargetIds?: string[];
}

export interface PendingPhase1Choice {
  playerId: string;
  mode:
    | "CHOOSE_DRAW_OPTION"
    | "KIT_CARLSON_PICK"
    | "PEYOTE_GUESS"
    | "RANCH_EXCHANGE";
  options: string[];
  neededCount?: number;
  previewCards?: EngineCard[];
  drawnSoFar?: EngineCard[];
  hasBlackJackFollowup?: boolean;
  remainingBaseDraws?: number;
  ranchUsed?: boolean;
}

export interface SimulationState {
  roomId: string;
  stateSeq: number;
  matchPhase: MatchPhase;
  roundNumber: number;
  turnPlayerId: string;
  sheriffId: string;
  direction: 1 | -1;
  currentPhase: TurnPhase;
  bangCountThisTurn: number;
  docHolydayUsedThisTurn: number;
  joseDelgadoCountThisTurn: number;
  attachedSeqCounter: number;
  dualCharacterMode: boolean;
  hpRule: HpRuleType;
  is3PlayerVariant: boolean;
  expansions: string[];
  players: Map<string, EnginePlayer>;
  drawDeck: EngineCard[];
  discardPile: EngineCard[];
  eventDeck: EngineEventCard[];
  eventDiscardPile: EngineEventCard[];
  activeEvent: EngineEventCard | null;
  firstEliminatedPlayerId: string | null;
  vendettaExtraTurnUsed: boolean;
  pendingCharacterSelect: Map<string, PendingCharacterChoice>;
  pendingTurnStartChoice: PendingTurnStartChoice | null;
  pendingPhase1Choice: PendingPhase1Choice | null;
  activeChain: any[];
  pendingReactions: any[];
  gameOver?: {
    winner: string | null;
    message: string;
  };
}
