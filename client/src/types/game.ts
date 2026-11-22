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

export type EquipmentSlotKey =
  | "weapon"
  | "barrel"
  | "horseDef"
  | "horseOff"
  | "hideout"
  | "binocular";

export type ArenaChainStatus = "IDLE" | "ACTIVE_CHAIN" | "SETTLING";

export type ArenaOriginZone =
  | "HAND"
  | "GREEN"
  | "EQUIPMENT"
  | "JUDGEMENT"
  | "DECK"
  | "DISCARD"
  | "HERO"
  | "EVENT";

export type ArenaDestinationZone =
  | "DISCARD"
  | "EQUIPMENT"
  | "GREEN"
  | "JUDGEMENT"
  | "HAND"
  | "DECK";

export type ArenaEntryKind =
  | "PLAYED_CARD"
  | "EQUIP_PLACEMENT"
  | "EXTRA_COST"
  | "CHECK_SOURCE"
  | "CHECK_RESULT"
  | "DEFENSE_CARD"
  | "DISCARD_CARD"
  | "REVEAL_CARD";

export type ArenaOutcomeTag =
  | "PASSED"
  | "FAILED"
  | "EXPLODED"
  | "ESCAPED"
  | "LOCKED"
  | "CORRECT"
  | "WRONG";

export type ArenaVfxType = "bullet" | "heal" | "jail" | "dynamite" | "draw";

export interface ArenaCardEntry {
  id: string;
  stepIndex: number;
  batchIndex: number;
  kind: ArenaEntryKind;
  card: Card;
  actorPlayerId: string;
  actorPlayerName: string;
  targetPlayerId?: string;
  targetPlayerName?: string;
  originZone: ArenaOriginZone;
  originSlotKey?: EquipmentSlotKey;
  destinationZone?: ArenaDestinationZone;
  destinationPlayerId?: string;
  destinationSlotKey?: EquipmentSlotKey;
  actionLabel: string;
  outcome?: ArenaOutcomeTag;
  vfxType?: ArenaVfxType;
  vfxTargetId?: string;
  vfxAoe?: boolean;
  addedAt: number;
}

export interface ArenaChainState {
  chainId: string;
  status: ArenaChainStatus;
  entries: ArenaCardEntry[];
  stepLockRemainingMs?: number;
  settleRemainingMs?: number;
}

export interface InFlightCard {
  id: string;
  card: Card;
  sourcePlayerName: string;
  targetPlayerName?: string;
  actionText: string;
  kind?: ArenaEntryKind;
  outcome?: ArenaOutcomeTag;
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
  pendingDamage?: number;
  ricochetTargetArea?: "EQUIPMENT" | "GREEN" | "JUDGEMENT";
  ricochetTargetCardId?: string;
  targetCard?: Card;
  checkSource?: "BARREL" | "JOURDONNAIS";
}

export type TargetSelectionPayload = {
  targetPlayerId: string;
  targetArea?: "HAND" | "EQUIPMENT" | "GREEN" | "JUDGEMENT";
  targetCardId?: string;
};

export type GameActionPayload = {
  cardId?: string;
  cardIds?: string[];
  greenCardId?: string;
  characterId?: string;
  characterIds?: string[];
  targetPlayerId?: string;
  targetArea?: "HAND" | "EQUIPMENT" | "GREEN" | "JUDGEMENT";
  targetCardId?: string;
  discardCardIds?: string[];
  targetSelections?: TargetSelectionPayload[];
  action?: string;
  choice?: string;
  guess?: "RED" | "BLACK";
  skip?: boolean;
  skillType?: string;
  skill?: string;
  checkSource?: "BARREL" | "JOURDONNAIS";
};

export interface LobbyPlayer {
  id: string;
  name: string;
  seatIndex: number;
  isHost: boolean;
  isReady: boolean;
  isOnline: boolean;
}

export interface GameSettings {
  dualCharacterEnabled: boolean;
  dualCharacterHpRule: "strict" | "balanced" | "juggernaut";
  expansions: string[];
}

export interface ExpansionOptionInfo {
  id: string;
  label: string;
  active: boolean;
}

export interface LobbyState {
  roomExists: boolean;
  roomId: string;
  roomName?: string;
  hostId: string;
  status: "waiting" | "in_game";
  players: LobbyPlayer[];
  settings: GameSettings;
  expansionCatalog?: ExpansionOptionInfo[];
  minPlayers: number;
  maxPlayers: number;
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
  matchId?: string;
  isHost?: boolean;
  hostInfo: string;
  stateSeq?: number;
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
  arenaChain?: ArenaChainState;
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
