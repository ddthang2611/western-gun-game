import type {
  Card,
  Character,
  EquipmentSlot,
  GreenCard,
  InFlightCard,
  Player,
  TableState,
} from "../../../types/game";
import type { BlueCardInPlayItem, CardPickerAction } from "../../../components/game";
import { getAllEquipments } from "../../../utils/equipments";
import {
  DISCARD_COST_CARDS,
  GREEN_DEFENSE_NAMES,
  MANIPULATE_CARDS,
  TARGETED_GREEN_CARDS,
  TARGETED_SINGLE_CARDS,
  countInPlayCards,
  isBangCardForHeroes,
} from "./cardRules";

export type SkillModeType =
  | "SID_KETCHUM_HEAL"
  | "CHUCK_WENGAM_SACRIFICE"
  | "JOSE_DELGADO_DRAW"
  | "DOC_HOLYDAY_BANG"
  | null;

export interface CardPickerConfig {
  isOpen: boolean;
  targetPlayer?: Player;
  action: CardPickerAction;
  cardName?: string;
  allowHand?: boolean;
  allowInPlay?: boolean;
  sourceGreenCardId?: string;
  stealContext?: {
    mode: "JESSE_STEAL_AND_DECK" | "PAT_BRENNAN_STEAL" | "EL_GRINGO";
    attackerId?: string;
    stolenCard?: Card;
  };
}

export const EMPTY_LIVE_TABLE: TableState = {
  roomId: "...",
  hostInfo: "Connecting...",
  roundNumber: 1,
  myPlayerId: "",
  players: [],
  activePlayerId: "",
  currentPhase: 0,
  deckCount: 0,
  discardCount: 0,
  inFlightCards: [],
  combatLog: [],
  roleCounts: { police: 0, outlaw: 0, renegade: 0 },
  myRole: undefined,
  myPendingReaction: null,
  pendingReactions: [],
  generalStore: null,
  gameOver: null,
  activeEvent: null,
  matchPaused: false,
};

export interface ComputeActionHintParams {
  skillMode: SkillModeType;
  skillDiscardIds: string[];
  selectedGreenCard?: GreenCard;
  selectedTargetId: string | null;
  selectedCard?: Card;
  currentPhase: number;
  requiresExtraDiscard: boolean;
  activeHandLength: number;
  discardCostIds: string[];
  isSniperBangSelected: boolean;
  canRicochetEquip: boolean;
}

// Derive contextual action hint banner
export function computeActionHint({
  skillMode,
  skillDiscardIds,
  selectedGreenCard,
  selectedTargetId,
  selectedCard,
  currentPhase,
  requiresExtraDiscard,
  activeHandLength,
  discardCostIds,
  isSniperBangSelected,
  canRicochetEquip,
}: ComputeActionHintParams): string | null {
  if (skillMode === "CHUCK_WENGAM_SACRIFICE") {
    return "Chuck Wengam: Sacrifice 1 HP to draw 2 cards - Click Confirm Skill";
  }
  if (skillMode === "JOSE_DELGADO_DRAW") {
    return `Jose Delgado: Select 1 blue card (${skillDiscardIds.length}/1) - Click Confirm Skill`;
  }
  if (skillMode === "SID_KETCHUM_HEAL") {
    return `Sid Ketchum: Select 2 cards (${skillDiscardIds.length}/2) - Click Confirm Skill`;
  }
  if (skillMode === "DOC_HOLYDAY_BANG") {
    return `Doc Holyday: Select 2 cards (${skillDiscardIds.length}/2) & a target - Click Confirm Skill`;
  }
  if (selectedGreenCard) {
    return TARGETED_GREEN_CARDS.has(selectedGreenCard.card.name) && !selectedTargetId
      ? `Green Ready: ${selectedGreenCard.card.name} - Select a target opponent, then click Play.`
      : `Green Ready: ${selectedGreenCard.card.name} - Click Play to activate.`;
  }
  if (selectedCard && selectedCard.border === "green" && currentPhase !== 3) {
    return GREEN_DEFENSE_NAMES.has(selectedCard.name)
      ? `Green Defense (${selectedCard.name}): Click Play to place in front of you (ready after your turn).`
      : `Green Card (${selectedCard.name}): Click Play to place in play (ready next turn).`;
  }
  if (requiresExtraDiscard && selectedCard) {
    if (activeHandLength < 2) {
      return `${selectedCard.name}: Requires 1 extra discard card, but your hand has no second card.`;
    }
    if (discardCostIds.length < 1) {
      return `${selectedCard.name}: Select 1 extra card in hand to discard (0/1).`;
    }
    if (
      TARGETED_SINGLE_CARDS.has(selectedCard.name) ||
      MANIPULATE_CARDS.has(selectedCard.name)
    ) {
      return selectedTargetId
        ? `${selectedCard.name}: Extra discard ready (1/1) - Click Play.`
        : `${selectedCard.name}: Extra discard ready (1/1) - Select a target opponent.`;
    }
    return `${selectedCard.name}: Extra discard ready (1/1) - Click Play.`;
  }
  if (isSniperBangSelected) {
    return discardCostIds.length > 0
      ? "Sniper: 2nd BANG! selected (requires 2 Missed!) - Select target & click Play."
      : "Sniper: Select target for normal shot, or pick 2nd BANG! first.";
  }
  if (canRicochetEquip) {
    return "Ricochet: Click Play to shoot HP, or Ricochet Equip to shoot a card in play.";
  }
  return null;
}

export interface ComputeTableViewModelParams {
  state: TableState;
  isMock: boolean;
  isWsConnected: boolean;
  myHand: Card[];
  myHeroes: Character[];
  myHp: number;
  myMaxHp: number;
  myEquipments: EquipmentSlot;
  myGreenCards: GreenCard[];
  myJudgements: { hasJail: boolean; hasDynamite: boolean };
  selectedHandCardId: string | null;
  selectedGreenCardId: string | null;
  selectedTargetId: string | null;
  discardCostIds: string[];
  phase3DiscardIds: string[];
  skillMode: SkillModeType;
  skillDiscardIds: string[];
  visibleArenaCards: InFlightCard[];
  isArenaBlockingActions: boolean;
  isStepAnimating: boolean;
  concealedInPlayCardIds: string[];
}

export interface TableViewModel {
  opponents: Player[];
  myPlayer: Player | undefined;
  activeHeroes: Character[];
  copiedHero: Character | null;
  effectiveSkillHeroes: Character[];
  activeHp: number;
  activeMaxHp: number;
  activeHand: Card[];
  activeEquipments: EquipmentSlot;
  activeGreenCards: GreenCard[];
  activeJudgements: { hasJail: boolean; hasDynamite: boolean };
  isMyTurn: boolean;
  isTurnLocked: boolean;
  isArenaLocked: boolean;
  isStepAnimating: boolean;
  isActionLocked: boolean;
  activePlayerName: string | undefined;
  handLimit: number;
  excessCardsCount: number;
  selectedCard: Card | undefined;
  selectedGreenCard: GreenCard | undefined;
  requiresExtraDiscard: boolean;
  isSniperActive: boolean;
  isRicochetActive: boolean;
  isSniperBangSelected: boolean;
  selectedTargetPlayer: Player | undefined;
  canRicochetEquip: boolean;
  myBlueCardsInPlay: BlueCardInPlayItem[];
  displayInFlightCards: InFlightCard[];
  activeSkillHint: string | null;
  isSkillMode: boolean;
  canConfirmSkill: boolean;
  canConfirmAction: boolean;
  forcedTargetMode: string | null;
}

export interface BaseTableContext {
  myPlayerIndex: number;
  myPlayer: Player | undefined;
  activeHeroes: Character[];
  copiedHero: Character | null;
  effectiveSkillHeroes: Character[];
  activeHp: number;
  activeHand: Card[];
  isMyTurn: boolean;
  isTurnLocked: boolean;
  isArenaLocked: boolean;
  isActionLocked: boolean;
}

// Derive player, hero, and turn lock context
export function deriveBaseTableContext(params: {
  state: TableState;
  isMock: boolean;
  isWsConnected: boolean;
  myHand: Card[];
  myHeroes: Character[];
  myHp: number;
  isArenaBlockingActions?: boolean;
}): BaseTableContext {
  const {
    state,
    isMock,
    isWsConnected,
    myHand,
    myHeroes,
    myHp,
    isArenaBlockingActions = false,
  } = params;
  const myPlayerIndex = state.players.findIndex((p) => p.id === state.myPlayerId);
  const myPlayer = myPlayerIndex === -1 ? undefined : state.players[myPlayerIndex];
  const activeHeroes = isMock
    ? myHeroes.length > 0
      ? myHeroes
      : myPlayer?.characters || []
    : myPlayer?.characters || myHeroes;
  const copiedHero = !isMock
    ? state.myCopiedCharacter ?? myPlayer?.copiedCharacter ?? null
    : null;
  const effectiveSkillHeroes =
    copiedHero && !activeHeroes.some((h) => h.id === copiedHero.id)
      ? [...activeHeroes, copiedHero]
      : activeHeroes;

  const activeHp = isMock ? myHp : myPlayer?.hp ?? myHp;
  const activeHand = isMock ? myHand : myPlayer?.handCards ?? myHand;
  const isMyTurn =
    isMock || (Boolean(state.myPlayerId) && state.activePlayerId === state.myPlayerId);
  const isTurnLocked = !isMock && (Boolean(state.matchPaused) || !isWsConnected);
  const isArenaLocked = Boolean(
    isArenaBlockingActions ||
      (state.arenaChain &&
        (state.arenaChain.status !== "IDLE" || state.arenaChain.entries.length > 0))
  );
  const isActionLocked =
    isTurnLocked ||
    isArenaLocked ||
    (!isMock && (!isMyTurn || state.currentPhase !== 2));

  return {
    myPlayerIndex,
    myPlayer,
    activeHeroes,
    copiedHero,
    effectiveSkillHeroes,
    activeHp,
    activeHand,
    isMyTurn,
    isTurnLocked,
    isArenaLocked,
    isActionLocked,
  };
}

// Compute derived table view state
export function computeTableViewModel({
  state,
  isMock,
  isWsConnected,
  myHand,
  myHeroes,
  myHp,
  myMaxHp,
  myEquipments,
  myGreenCards,
  myJudgements,
  selectedHandCardId,
  selectedGreenCardId,
  selectedTargetId,
  discardCostIds,
  phase3DiscardIds,
  skillMode,
  skillDiscardIds,
  visibleArenaCards,
  isArenaBlockingActions,
  isStepAnimating,
  concealedInPlayCardIds,
}: ComputeTableViewModelParams): TableViewModel {
  const base = deriveBaseTableContext({
    state,
    isMock,
    isWsConnected,
    myHand,
    myHeroes,
    myHp,
    isArenaBlockingActions,
  });
  const {
    myPlayerIndex,
    myPlayer,
    activeHeroes,
    copiedHero,
    effectiveSkillHeroes,
    activeHp,
    activeHand,
    isMyTurn,
    isTurnLocked,
    isArenaLocked,
    isActionLocked,
  } = base;
  const opponents =
    myPlayerIndex === -1
      ? state.players.filter((p) => p.id !== state.myPlayerId)
      : [
          ...state.players.slice(myPlayerIndex + 1),
          ...state.players.slice(0, myPlayerIndex),
        ];

  const activeMaxHp = isMock ? myMaxHp : myPlayer?.maxHp ?? myMaxHp;
  const activeEquipments = isMock ? myEquipments : myPlayer?.equipments || myEquipments;
  const activeGreenCards = isMock ? myGreenCards : myPlayer?.greenCards || myGreenCards;
  const concealedSet = concealedInPlayCardIds.length
    ? new Set(concealedInPlayCardIds)
    : undefined;
  const activeJudgements =
    !isMock && myPlayer
      ? concealedSet
        ? {
            hasJail: (myPlayer.judgements || []).some(
              (j) =>
                j.type === "JAIL" &&
                !concealedSet.has(j.id) &&
                !(j.card && concealedSet.has(j.card.id))
            ),
            hasDynamite: (myPlayer.judgements || []).some(
              (j) =>
                j.type === "DYNAMITE" &&
                !concealedSet.has(j.id) &&
                !(j.card && concealedSet.has(j.card.id))
            ),
          }
        : { hasJail: myPlayer.hasJail, hasDynamite: myPlayer.hasDynamite }
      : myJudgements;

  const activePlayerName = state.players.find(
    (p) => p.id === state.activePlayerId
  )?.name;
  const handLimit = effectiveSkillHeroes.some((h) => h.name === "Sean Mallory")
    ? 10
    : activeHp;
  const excessCardsCount = Math.max(0, activeHand.length - handLimit);

  const selectedCard = activeHand.find((c) => c.id === selectedHandCardId);
  const selectedGreenCard = activeGreenCards.find((g) => g.id === selectedGreenCardId);
  const requiresExtraDiscard = Boolean(
    selectedCard &&
      DISCARD_COST_CARDS.has(selectedCard.name) &&
      state.currentPhase !== 3
  );
  const isSniperActive = state.activeEvent?.effectCode === "EVENT_FOC_SNIPER";
  const isRicochetActive = state.activeEvent?.effectCode === "EVENT_FOC_RICOCHET";
  const isBangSelected = isBangCardForHeroes(selectedCard, effectiveSkillHeroes);
  const isSniperBangSelected = Boolean(
    isSniperActive && selectedCard && isBangSelected && state.currentPhase !== 3
  );
  const selectedTargetPlayer = selectedTargetId
    ? state.players.find((p) => p.id === selectedTargetId)
    : undefined;
  const canRicochetEquip = Boolean(
    isRicochetActive &&
      state.currentPhase === 2 &&
      selectedCard &&
      isBangSelected &&
      selectedTargetPlayer &&
      countInPlayCards(selectedTargetPlayer) > 0
  );

  const myBlueCardsInPlay: BlueCardInPlayItem[] = [
    ...getAllEquipments(activeEquipments).map((c) => ({
      id: c.id,
      label: c.name,
      card: c,
    })),
    ...activeGreenCards
      .filter((g) => g.card.border === "blue")
      .map((g) => ({ id: g.card.id, label: g.card.name, card: g.card })),
    ...(myPlayer?.judgements || [])
      .filter((j) => j.card && j.card.border === "blue")
      .map((j) => ({ id: j.card!.id, label: j.card!.name, card: j.card! })),
  ];

  const displayInFlightCards = visibleArenaCards;

  const activeSkillHint = computeActionHint({
    skillMode,
    skillDiscardIds,
    selectedGreenCard,
    selectedTargetId,
    selectedCard,
    currentPhase: state.currentPhase,
    requiresExtraDiscard,
    activeHandLength: activeHand.length,
    discardCostIds,
    isSniperBangSelected,
    canRicochetEquip,
  });

  const isSkillMode = skillMode !== null;
  const canConfirmSkill =
    !isTurnLocked &&
    !isArenaLocked &&
    !isActionLocked &&
    (skillMode === "CHUCK_WENGAM_SACRIFICE"
      ? !isMock || myHp > 1
      : skillMode === "JOSE_DELGADO_DRAW"
      ? skillDiscardIds.length === 1
      : skillMode === "SID_KETCHUM_HEAL"
      ? skillDiscardIds.length === 2
      : skillMode === "DOC_HOLYDAY_BANG"
      ? skillDiscardIds.length === 2 && Boolean(selectedTargetId)
      : false);

  const canConfirmAction =
    !isTurnLocked &&
    !isArenaLocked &&
    !isSkillMode &&
    Boolean(
      (!isMock && isMyTurn && state.currentPhase === 3 && phase3DiscardIds.length > 0) ||
        (selectedCard && (!requiresExtraDiscard || discardCostIds.length >= 1)) ||
        selectedGreenCard
    );

  const forcedTargetMode =
    skillMode === "DOC_HOLYDAY_BANG"
      ? "BANG!"
      : selectedCard?.name === "MISSED!" && isBangSelected
      ? "BANG!"
      : null;

  return {
    opponents,
    myPlayer,
    activeHeroes,
    copiedHero,
    effectiveSkillHeroes,
    activeHp,
    activeMaxHp,
    activeHand,
    activeEquipments,
    activeGreenCards,
    activeJudgements,
    isMyTurn,
    isTurnLocked,
    isArenaLocked,
    isStepAnimating,
    isActionLocked,
    activePlayerName,
    handLimit,
    excessCardsCount,
    selectedCard,
    selectedGreenCard,
    requiresExtraDiscard,
    isSniperActive,
    isRicochetActive,
    isSniperBangSelected,
    selectedTargetPlayer,
    canRicochetEquip,
    myBlueCardsInPlay,
    displayInFlightCards,
    activeSkillHint,
    isSkillMode,
    canConfirmSkill,
    canConfirmAction,
    forcedTargetMode,
  };
}
