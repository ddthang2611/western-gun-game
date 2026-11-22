import { EngineCard } from "../types/cards";
import { EnginePlayer, EquipmentSlotKey, SimulationState } from "../types/state";
import { ReactionType } from "../interact/interact_types";
import { normalizeEquipName } from "../utils/inventory";

export type CardZone =
  | "HAND"
  | "GREEN_IN_PLAY"
  | "EQUIP_BLUE"
  | "EQUIP_GREEN"
  | "JUDGEMENT"
  | "REACTION_ONLY";

export type TargetScope =
  | "NONE"
  | "SELF"
  | "SINGLE_OTHER"
  | "SINGLE_ANY"
  | "ALL_OTHERS"
  | "ALL_LIVING";

export type TargetDistanceRule = "NONE" | "EXACT_1" | "WEAPON_RANGE";

export type CardSelectionMode =
  | "NONE"
  | "STEAL_ONE"
  | "DESTROY_ONE"
  | "DESTROY_EACH_TARGET";

export interface CardTargetingMeta {
  scope: TargetScope;
  distance: TargetDistanceRule;
  cardSelection?: CardSelectionMode;
  allowSelf?: boolean;
}

export interface CardCombatMeta {
  countsAsBang: boolean;
  bangLimitApplied: boolean;
  reactionType?: ReactionType;
  allowBarrel?: boolean;
  allowJourdonnais?: boolean;
  drawOnPlay?: number;
}

export interface CardDefinition {
  name: string;
  zone: CardZone;
  extraHandDiscard: number;
  targeting: CardTargetingMeta;
  combat: CardCombatMeta;
  checkApacheKid: boolean;
  healAmount?: number;
  drawOnPlay?: number;
  slotKey?: EquipmentSlotKey;
  weaponRange?: number;
  greenKind?: "ACTIVE" | "DEFENSE";
  manipulation?: "STEAL" | "DESTROY";
}

const DEFAULT_COMBAT: CardCombatMeta = {
  countsAsBang: false,
  bangLimitApplied: false,
};

const DEFAULT_TARGETING: CardTargetingMeta = {
  scope: "NONE",
  distance: "NONE",
};

function def(
  name: string,
  zone: CardZone,
  overrides: Partial<CardDefinition> = {}
): CardDefinition {
  return {
    name,
    zone,
    extraHandDiscard: 0,
    targeting: DEFAULT_TARGETING,
    combat: DEFAULT_COMBAT,
    checkApacheKid: false,
    ...overrides,
  };
}

// Playable card metadata registry
const CARD_DEFINITIONS: CardDefinition[] = [
  // Brown action cards
  def("BANG!", "HAND", {
    targeting: { scope: "SINGLE_OTHER", distance: "WEAPON_RANGE" },
    combat: {
      countsAsBang: true,
      bangLimitApplied: true,
      reactionType: "BANG_DEFENSE",
      allowBarrel: true,
      allowJourdonnais: true,
    },
    checkApacheKid: true,
  }),
  def("PUNCH", "HAND", {
    targeting: { scope: "SINGLE_OTHER", distance: "EXACT_1" },
    combat: {
      countsAsBang: false,
      bangLimitApplied: false,
      reactionType: "BANG_DEFENSE",
      allowBarrel: true,
      allowJourdonnais: true,
    },
    checkApacheKid: true,
  }),
  def("SPRINGFIELD", "HAND", {
    extraHandDiscard: 1,
    targeting: { scope: "SINGLE_OTHER", distance: "NONE" },
    combat: {
      countsAsBang: false,
      bangLimitApplied: false,
      reactionType: "BANG_DEFENSE",
      allowBarrel: true,
      allowJourdonnais: true,
    },
    checkApacheKid: true,
  }),
  def("DUEL", "HAND", {
    targeting: { scope: "SINGLE_OTHER", distance: "NONE" },
    combat: {
      countsAsBang: false,
      bangLimitApplied: false,
      reactionType: "DUEL_RESPONSE",
      allowBarrel: false,
      allowJourdonnais: false,
    },
    checkApacheKid: true,
  }),
  def("INDIANS!", "HAND", {
    targeting: { scope: "ALL_OTHERS", distance: "NONE" },
    combat: {
      countsAsBang: false,
      bangLimitApplied: false,
      reactionType: "INDIANS_DEFENSE",
      allowBarrel: false,
      allowJourdonnais: false,
    },
    checkApacheKid: true,
  }),
  def("GATLING", "HAND", {
    targeting: { scope: "ALL_OTHERS", distance: "NONE" },
    combat: {
      countsAsBang: false,
      bangLimitApplied: false,
      reactionType: "GATLING_DEFENSE",
      allowBarrel: true,
      allowJourdonnais: true,
    },
    checkApacheKid: true,
  }),
  def("BRAWL", "HAND", {
    extraHandDiscard: 1,
    targeting: {
      scope: "ALL_OTHERS",
      distance: "NONE",
      cardSelection: "DESTROY_EACH_TARGET",
    },
    checkApacheKid: true,
  }),
  def("PANIC!", "HAND", {
    targeting: {
      scope: "SINGLE_OTHER",
      distance: "EXACT_1",
      cardSelection: "STEAL_ONE",
    },
    checkApacheKid: true,
    manipulation: "STEAL",
  }),
  def("CAT BALOU", "HAND", {
    targeting: {
      scope: "SINGLE_OTHER",
      distance: "NONE",
      cardSelection: "DESTROY_ONE",
    },
    checkApacheKid: true,
    manipulation: "DESTROY",
  }),
  def("RAG TIME", "HAND", {
    extraHandDiscard: 1,
    targeting: {
      scope: "SINGLE_OTHER",
      distance: "NONE",
      cardSelection: "STEAL_ONE",
    },
    checkApacheKid: true,
    manipulation: "STEAL",
  }),
  def("STAGECOACH", "HAND", {
    targeting: { scope: "SELF", distance: "NONE" },
    combat: { countsAsBang: false, bangLimitApplied: false, drawOnPlay: 2 },
    drawOnPlay: 2,
  }),
  def("WELLS FARGO", "HAND", {
    targeting: { scope: "SELF", distance: "NONE" },
    combat: { countsAsBang: false, bangLimitApplied: false, drawOnPlay: 3 },
    drawOnPlay: 3,
  }),
  def("GENERAL STORE", "HAND", {
    targeting: { scope: "ALL_LIVING", distance: "NONE" },
  }),
  def("BEER", "HAND", {
    targeting: { scope: "SELF", distance: "NONE", allowSelf: true },
    healAmount: 1,
  }),
  def("SALOON", "HAND", {
    targeting: { scope: "ALL_LIVING", distance: "NONE", allowSelf: true },
    healAmount: 1,
    checkApacheKid: true,
  }),
  def("WHISKY", "HAND", {
    extraHandDiscard: 1,
    targeting: { scope: "SELF", distance: "NONE", allowSelf: true },
    healAmount: 2,
  }),
  def("TEQUILA", "HAND", {
    extraHandDiscard: 1,
    targeting: { scope: "SINGLE_ANY", distance: "NONE", allowSelf: true },
    healAmount: 1,
    checkApacheKid: true,
  }),

  // Reaction-only brown cards
  def("MISSED!", "REACTION_ONLY"),
  def("DODGE", "REACTION_ONLY", {
    combat: { countsAsBang: false, bangLimitApplied: false, drawOnPlay: 1 },
    drawOnPlay: 1,
  }),

  // Blue weapons
  def("VOLCANIC", "EQUIP_BLUE", {
    targeting: { scope: "SELF", distance: "NONE" },
    slotKey: "weapon",
    weaponRange: 1,
  }),
  def("SCHOFIELD", "EQUIP_BLUE", {
    targeting: { scope: "SELF", distance: "NONE" },
    slotKey: "weapon",
    weaponRange: 2,
  }),
  def("REMINGTON", "EQUIP_BLUE", {
    targeting: { scope: "SELF", distance: "NONE" },
    slotKey: "weapon",
    weaponRange: 3,
  }),
  def("REV. CARABINE", "EQUIP_BLUE", {
    targeting: { scope: "SELF", distance: "NONE" },
    slotKey: "weapon",
    weaponRange: 4,
  }),
  def("WINCHESTER", "EQUIP_BLUE", {
    targeting: { scope: "SELF", distance: "NONE" },
    slotKey: "weapon",
    weaponRange: 5,
  }),

  // Blue passive equipment
  def("BARREL", "EQUIP_BLUE", {
    targeting: { scope: "SELF", distance: "NONE" },
    slotKey: "barrel",
  }),
  def("MUSTANG", "EQUIP_BLUE", {
    targeting: { scope: "SELF", distance: "NONE" },
    slotKey: "horseDef",
  }),
  def("SCOPE", "EQUIP_BLUE", {
    targeting: { scope: "SELF", distance: "NONE" },
    slotKey: "horseOff",
  }),
  def("HIDEOUT", "EQUIP_BLUE", {
    targeting: { scope: "SELF", distance: "NONE" },
    slotKey: "hideout",
  }),
  def("BINOCULAR", "EQUIP_BLUE", {
    targeting: { scope: "SELF", distance: "NONE" },
    slotKey: "binocular",
  }),

  // Judgement cards
  def("JAIL", "JUDGEMENT", {
    targeting: { scope: "SINGLE_OTHER", distance: "NONE" },
    checkApacheKid: true,
  }),
  def("DYNAMITE", "JUDGEMENT", {
    targeting: { scope: "SELF", distance: "NONE" },
  }),

  // Green active cards
  def("PONY EXPRESS", "EQUIP_GREEN", {
    greenKind: "ACTIVE",
    targeting: { scope: "SELF", distance: "NONE" },
    combat: { countsAsBang: false, bangLimitApplied: false, drawOnPlay: 3 },
    drawOnPlay: 3,
  }),
  def("CANTEEN", "EQUIP_GREEN", {
    greenKind: "ACTIVE",
    targeting: { scope: "SELF", distance: "NONE", allowSelf: true },
    healAmount: 1,
  }),
  def("BUFFALO RIFLE", "EQUIP_GREEN", {
    greenKind: "ACTIVE",
    targeting: { scope: "SINGLE_OTHER", distance: "NONE" },
    combat: {
      countsAsBang: false,
      bangLimitApplied: false,
      reactionType: "BANG_DEFENSE",
      allowBarrel: true,
      allowJourdonnais: true,
    },
    checkApacheKid: true,
  }),
  def("PEPPERBOX", "EQUIP_GREEN", {
    greenKind: "ACTIVE",
    targeting: { scope: "SINGLE_OTHER", distance: "WEAPON_RANGE" },
    combat: {
      countsAsBang: false,
      bangLimitApplied: false,
      reactionType: "BANG_DEFENSE",
      allowBarrel: true,
      allowJourdonnais: true,
    },
    checkApacheKid: true,
  }),
  def("DERRINGER", "EQUIP_GREEN", {
    greenKind: "ACTIVE",
    targeting: { scope: "SINGLE_OTHER", distance: "EXACT_1" },
    combat: {
      countsAsBang: false,
      bangLimitApplied: false,
      reactionType: "BANG_DEFENSE",
      allowBarrel: true,
      allowJourdonnais: true,
      drawOnPlay: 1,
    },
    drawOnPlay: 1,
    checkApacheKid: true,
  }),
  def("KNIFE", "EQUIP_GREEN", {
    greenKind: "ACTIVE",
    targeting: { scope: "SINGLE_OTHER", distance: "EXACT_1" },
    combat: {
      countsAsBang: false,
      bangLimitApplied: false,
      reactionType: "BANG_DEFENSE",
      allowBarrel: true,
      allowJourdonnais: true,
    },
    checkApacheKid: true,
  }),
  def("HOWITZER", "EQUIP_GREEN", {
    greenKind: "ACTIVE",
    targeting: { scope: "ALL_OTHERS", distance: "NONE" },
    combat: {
      countsAsBang: false,
      bangLimitApplied: false,
      reactionType: "GATLING_DEFENSE",
      allowBarrel: true,
      allowJourdonnais: true,
    },
    checkApacheKid: true,
  }),
  def("CAN CAN", "EQUIP_GREEN", {
    greenKind: "ACTIVE",
    targeting: {
      scope: "SINGLE_OTHER",
      distance: "NONE",
      cardSelection: "DESTROY_ONE",
    },
    checkApacheKid: true,
    manipulation: "DESTROY",
  }),
  def("CONESTOGA", "EQUIP_GREEN", {
    greenKind: "ACTIVE",
    targeting: {
      scope: "SINGLE_OTHER",
      distance: "NONE",
      cardSelection: "STEAL_ONE",
    },
    checkApacheKid: true,
    manipulation: "STEAL",
  }),

  // Green defense cards
  def("SOMBRERO", "EQUIP_GREEN", {
    greenKind: "DEFENSE",
    targeting: { scope: "SELF", distance: "NONE" },
  }),
  def("IRON PLATE", "EQUIP_GREEN", {
    greenKind: "DEFENSE",
    targeting: { scope: "SELF", distance: "NONE" },
  }),
  def("TEN GALLON HAT", "EQUIP_GREEN", {
    greenKind: "DEFENSE",
    targeting: { scope: "SELF", distance: "NONE" },
  }),
  def("BIBLE", "EQUIP_GREEN", {
    greenKind: "DEFENSE",
    targeting: { scope: "SELF", distance: "NONE" },
    combat: { countsAsBang: false, bangLimitApplied: false, drawOnPlay: 1 },
    drawOnPlay: 1,
  }),
];

const REGISTRY_BY_NAME = new Map<string, CardDefinition>(
  CARD_DEFINITIONS.map((entry) => [entry.name, entry])
);

function resolveCardName(cardOrName: EngineCard | string): string {
  const raw = typeof cardOrName === "string" ? cardOrName : cardOrName?.name || "";
  return normalizeEquipName(raw.trim().toUpperCase());
}

export class CardRegistry {
  // Lookup definition by card or name
  public static get(cardOrName: EngineCard | string): CardDefinition | undefined {
    return REGISTRY_BY_NAME.get(resolveCardName(cardOrName));
  }

  // Return all registered card definitions
  public static getAllDefinitions(): readonly CardDefinition[] {
    return CARD_DEFINITIONS;
  }

  // Check if extra discard required
  public static requiresExtraDiscard(cardOrName: EngineCard | string): boolean {
    return (this.get(cardOrName)?.extraHandDiscard ?? 0) > 0;
  }

  // Get required extra discard count
  public static getExtraDiscardCount(cardOrName: EngineCard | string): number {
    return this.get(cardOrName)?.extraHandDiscard ?? 0;
  }

  // Check steal or destroy card
  public static isManipulationCard(cardOrName: EngineCard | string): boolean {
    return Boolean(this.get(cardOrName)?.manipulation);
  }

  // Check area-targeting card
  public static isAreaCard(cardOrName: EngineCard | string): boolean {
    const name = resolveCardName(cardOrName);
    return name === "RICOCHET" || this.isManipulationCard(name);
  }

  // Check green defense card
  public static isGreenDefenseCard(cardOrName: EngineCard | string): boolean {
    return this.get(cardOrName)?.greenKind === "DEFENSE";
  }

  // Check green active card
  public static isGreenActiveCard(cardOrName: EngineCard | string): boolean {
    return this.get(cardOrName)?.greenKind === "ACTIVE";
  }

  // Check in-play equippable card
  public static isEquippableCard(cardOrName: EngineCard | string): boolean {
    const zone = this.get(cardOrName)?.zone;
    return zone === "EQUIP_BLUE" || zone === "EQUIP_GREEN" || zone === "JUDGEMENT";
  }

  // Check weapon card
  public static isWeaponCard(cardOrName: EngineCard | string): boolean {
    return this.get(cardOrName)?.slotKey === "weapon";
  }

  // Resolve equipment slot key
  public static getSlotKey(cardOrName: EngineCard | string): EquipmentSlotKey | undefined {
    return this.get(cardOrName)?.slotKey;
  }

  // Check self-targeting permission
  public static allowsSelfTarget(cardOrName: EngineCard | string): boolean {
    return Boolean(this.get(cardOrName)?.targeting.allowSelf);
  }

  // Check Phase 2 template playability
  public static canPlayInPhase2(
    card: EngineCard,
    state?: SimulationState,
    player?: EnginePlayer
  ): boolean {
    const entry = this.get(card);
    if (!entry) return false;
    if (entry.zone !== "REACTION_ONLY") return true;
    if (
      entry.name === "MISSED!" &&
      player &&
      state &&
      state.activeEvent?.effectCode !== "EVENT_HN_HANGOVER" &&
      (player.characters.some((c) => c.name === "Calamity Janet") ||
        player.copiedCharacter?.name === "Calamity Janet")
    ) {
      return true;
    }
    return false;
  }
}
