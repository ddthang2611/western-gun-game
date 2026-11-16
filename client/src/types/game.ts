export type Suit = "spades" | "hearts" | "diamonds" | "clubs";
export type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";
export type CardBorder = "brown" | "blue" | "green";
export type RoleType = "sheriff" | "deputy" | "outlaw" | "renegade";

export interface Card {
  id: string;
  name: string;
  border: CardBorder;
  rank: Rank;
  suit: Suit;
  desc: string;
  image?: string;
  effectIcon?: string;
  range?: number;
}

export interface Character {
  id: string;
  name: string;
  baseHp: number;
  desc: string;
  image?: string;
  isActiveSkill?: boolean;
  skillName?: string;
}

export interface EquipmentSlot {
  weapon?: Card;
  horseDef?: Card; // Mustang (+1)
  horseOff?: Card; // Scope (-1)
  barrel?: Card;   // Barrel
  extra?: Card;    // Binocular, Hideout, etc.
  extras?: Card[];
}

export interface GreenCard {
  id: string;
  card: Card;
  isDelay: boolean; // true if placed on the current turn, false if ready to activate
}

export interface JudgementEntry {
  id: string;
  type: "JAIL" | "DYNAMITE";
  card?: Card;
}

export interface ActiveEventInfo {
  id: string;
  pack?: string;
  name: string;
  effectCode?: string;
  isFinalCard?: boolean;
  desc: string;
  image?: string;
}

export interface Player {
  id: string;
  name: string;
  seatIndex: number;
  isHost: boolean;
  isReady: boolean;
  isOnline: boolean;
  isDead?: boolean;
  isGhost?: boolean;
  hp: number;
  maxHp: number;
  role?: RoleType;
  isSheriff: boolean;
  characters: Character[];
  copiedCharacter?: Character | null;
  forcedPlayCardId?: string | null;
  handCount: number;
  handCards?: Card[];
  equipments: EquipmentSlot;
  greenCards: GreenCard[];
  judgements?: JudgementEntry[];
  hasJail: boolean;
  hasDynamite: boolean;
  distanceFromMe?: number;
  isInRange?: boolean;
}

export interface PendingCharacterChoiceInfo {
  playerId: string;
  candidates: Character[];
  requiredCount: number;
  selectedCharacterIds?: string[];
  submittedPlayerIds: string[];
  totalPlayers: number;
}

export interface PendingTurnStartChoiceInfo {
  type: "VERA_CUSTER_COPY" | "BLOOD_BROTHERS";
  playerId: string;
  availableCharacters?: Array<{ ownerPlayerId: string; ownerName: string; character: Character }>;
  eligibleTargetIds?: string[];
}

export interface PendingPhase1ChoiceInfo {
  playerId: string;
  mode: "CHOOSE_DRAW_OPTION" | "KIT_CARLSON_PICK" | "PEYOTE_GUESS" | "RANCH_EXCHANGE";
  options: string[];
  neededCount?: number;
  previewCards?: Card[];
  drawnSoFar?: Card[];
  hasBlackJackFollowup?: boolean;
  remainingBaseDraws?: number;
  ranchUsed?: boolean;
}

export interface InFlightCard {
  id: string;
  card: Card;
  sourcePlayerName: string;
  targetPlayerName?: string;
  actionText: string;
}

export interface PendingReactionInfo {
  id: string;
  type: "BANG_DEFENSE" | "INDIANS_DEFENSE" | "GATLING_DEFENSE" | "DUEL_RESPONSE" | string;
  sourcePlayerId: string;
  sourcePlayerName?: string;
  targetPlayerId: string;
  sourceCard: Card;
  requiredCard: "MISSED" | "BANG" | "CHOICE" | "ANY_HAND" | "BLUE_EQUIP" | "SID_RESCUE";
  requiredCount: number;
  currentCount: number;
  canUseBarrel: boolean;
  canUseJourdonnais: boolean;
  barrelChecked: boolean;
  jourdonnaisChecked: boolean;
}

export interface PublicPendingReaction {
  id: string;
  type: string;
  sourcePlayerId: string;
  targetPlayerId: string;
  requiredCard: string;
  requiredCount: number;
  currentCount: number;
}

export interface GeneralStoreInfo {
  originPlayerId: string;
  originPlayerName?: string;
  pool: Card[];
  draftOrder: string[];
  currentPickerIndex: number;
  currentPickerId: string | null;
  currentPickerName?: string | null;
}

export interface GameOverInfo {
  winner: string | null;
  message: string;
}

export interface TableState {
  roomId: string;
  hostInfo: string;
  matchPhase?: "CHARACTER_SELECT" | "PLAYING" | "FINISHED";
  roundNumber?: number;
  myPlayerId: string;
  players: Player[];
  activePlayerId: string;
  sheriffId?: string;
  direction?: 1 | -1;
  currentPhase: 0 | 1 | 2 | 3; // 0: Judgement, 1: Draw, 2: Action, 3: Discard
  deckCount: number;
  discardCount: number;
  topDiscard?: Card;
  inFlightCards: InFlightCard[];
  combatLog: string[];
  roleCounts: {
    police: number;
    outlaw: number;
    renegade: number;
  };
  myRole?: RoleType;
  myIsGhost?: boolean;
  myCopiedCharacter?: Character | null;
  myForcedPlayCardId?: string | null;
  is3PlayerVariant?: boolean;
  expansions?: string[];
  dualCharacterMode?: boolean;
  hpRule?: "strict" | "balanced" | "juggernaut";
  pendingCharacterSelect?: PendingCharacterChoiceInfo | null;
  pendingTurnStartChoice?: PendingTurnStartChoiceInfo | null;
  pendingPhase1Choice?: PendingPhase1ChoiceInfo | null;
  selectedHandCardId?: string;
  selectedTargetPlayerId?: string;
  myPendingReaction?: PendingReactionInfo | null;
  pendingReactions?: PublicPendingReaction[];
  generalStore?: GeneralStoreInfo | null;
  gameOver?: GameOverInfo | null;
  activeEvent?: ActiveEventInfo | null;
  matchPaused?: boolean;
}
