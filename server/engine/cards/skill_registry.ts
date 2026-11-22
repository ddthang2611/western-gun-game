import { EnginePlayer, SimulationState } from "../types/state";
import { EventRuleRegistry } from "../events/event_rule_registry";

export type Phase1SkillTrait =
  | "EXCLUSIVE_KIT_CARLSON"
  | "EXCLUSIVE_BILL_NOFACE"
  | "EXCLUSIVE_PIXIE_PETE"
  | "EXCLUSIVE_PAT_BRENNAN"
  | "FIRST_CARD_JESSE_JONES"
  | "FIRST_CARD_PEDRO_RAMIREZ"
  | "SECOND_CARD_BLACK_JACK";

export type ActiveSkillCode =
  | "SID_KETCHUM_HEAL"
  | "CHUCK_WENGAM_HP"
  | "JOSE_DELGADO_DRAW"
  | "DOC_HOLYDAY_BANG";

export interface PassiveSkillModifiers {
  offenseDistanceBonus?: number;
  defenseDistanceBonus?: number;
  unlimitedBang?: boolean;
  phase3HandLimit?: number;
  beerHealAmount?: number;
  standardBangMissedRequired?: number;
  negateOthersInPlayDuringOwnTurn?: boolean;
  immuneToOtherPlayersSuit?: "diamonds";
  innateBarrel?: boolean;
  drawCheckFlipCount?: number;
}

export interface CardSubstitutionMeta {
  allowAnyHandAsMissed?: boolean;
  allowBangAsMissed?: boolean;
  allowMissedAsBang?: boolean;
}

export interface ReactiveSkillTriggers {
  onEmptyHandDraw?: number;
  onOutOfTurnHandCardDeferredDraw?: number;
  onDamageDrawPerHp?: number;
  onDamageStealAttackerPerHp?: number;
  onEliminationTakeAllCards?: boolean;
  onEliminationHeal?: number;
  onEliminationDraw?: number;
  onTurnStartCopyLivingSkill?: boolean;
}

export interface ActiveSkillSpec {
  code: ActiveSkillCode;
  characterName: string;
  maxUsesPerTurn?: number;
  handDiscardCost: number;
  requiresBlueHandCard?: boolean;
  hpSacrificeCost?: number;
  minHpBeforeUse?: number;
  requiresInjured?: boolean;
  requiresWeaponRangeTarget?: boolean;
  drawCount?: number;
  healAmount?: number;
  firesSuitlessBang?: boolean;
}

export interface CharacterSkillDefinition {
  id: string;
  name: string;
  pack: "base" | "dodge_city";
  baseHp: number;
  passive?: PassiveSkillModifiers;
  substitution?: CardSubstitutionMeta;
  phase1Trait?: Phase1SkillTrait;
  activeSkill?: ActiveSkillSpec;
  triggers?: ReactiveSkillTriggers;
}

// Declarative 31-character skill registry
const SKILL_DEFINITIONS: CharacterSkillDefinition[] = [
  {
    id: "char_bart_cassidy",
    name: "Bart Cassidy",
    pack: "base",
    baseHp: 4,
    triggers: { onDamageDrawPerHp: 1 },
  },
  {
    id: "char_black_jack",
    name: "Black Jack",
    pack: "base",
    baseHp: 4,
    phase1Trait: "SECOND_CARD_BLACK_JACK",
  },
  {
    id: "char_calamity_janet",
    name: "Calamity Janet",
    pack: "base",
    baseHp: 4,
    substitution: { allowBangAsMissed: true, allowMissedAsBang: true },
  },
  {
    id: "char_el_gringo",
    name: "El Gringo",
    pack: "base",
    baseHp: 3,
    triggers: { onDamageStealAttackerPerHp: 1 },
  },
  {
    id: "char_jesse_jones",
    name: "Jesse Jones",
    pack: "base",
    baseHp: 4,
    phase1Trait: "FIRST_CARD_JESSE_JONES",
  },
  {
    id: "char_jourdonnais",
    name: "Jourdonnais",
    pack: "base",
    baseHp: 4,
    passive: { innateBarrel: true },
  },
  {
    id: "char_kit_carlson",
    name: "Kit Carlson",
    pack: "base",
    baseHp: 4,
    phase1Trait: "EXCLUSIVE_KIT_CARLSON",
  },
  {
    id: "char_lucky_duke",
    name: "Lucky Duke",
    pack: "base",
    baseHp: 4,
    passive: { drawCheckFlipCount: 2 },
  },
  {
    id: "char_paul_regret",
    name: "Paul Regret",
    pack: "base",
    baseHp: 3,
    passive: { defenseDistanceBonus: 1 },
  },
  {
    id: "char_pedro_ramirez",
    name: "Pedro Ramirez",
    pack: "base",
    baseHp: 4,
    phase1Trait: "FIRST_CARD_PEDRO_RAMIREZ",
  },
  {
    id: "char_rose_doolan",
    name: "Rose Doolan",
    pack: "base",
    baseHp: 4,
    passive: { offenseDistanceBonus: -1 },
  },
  {
    id: "char_sid_ketchum",
    name: "Sid Ketchum",
    pack: "base",
    baseHp: 4,
    activeSkill: {
      code: "SID_KETCHUM_HEAL",
      characterName: "Sid Ketchum",
      handDiscardCost: 2,
      requiresInjured: true,
      healAmount: 1,
    },
  },
  {
    id: "char_slab_the_killer",
    name: "Slab the Killer",
    pack: "base",
    baseHp: 4,
    passive: { standardBangMissedRequired: 2 },
  },
  {
    id: "char_suzy_lafayette",
    name: "Suzy Lafayette",
    pack: "base",
    baseHp: 4,
    triggers: { onEmptyHandDraw: 1 },
  },
  {
    id: "char_vulture_sam",
    name: "Vulture Sam",
    pack: "base",
    baseHp: 4,
    triggers: { onEliminationTakeAllCards: true },
  },
  {
    id: "char_willy_the_kid",
    name: "Willy the Kid",
    pack: "base",
    baseHp: 4,
    passive: { unlimitedBang: true },
  },
  {
    id: "char_apache_kid",
    name: "Apache Kid",
    pack: "dodge_city",
    baseHp: 3,
    passive: { immuneToOtherPlayersSuit: "diamonds" },
  },
  {
    id: "char_belle_star",
    name: "Belle Star",
    pack: "dodge_city",
    baseHp: 4,
    passive: { negateOthersInPlayDuringOwnTurn: true },
  },
  {
    id: "char_bill_noface",
    name: "Bill Noface",
    pack: "dodge_city",
    baseHp: 4,
    phase1Trait: "EXCLUSIVE_BILL_NOFACE",
  },
  {
    id: "char_chuck_wengam",
    name: "Chuck Wengam",
    pack: "dodge_city",
    baseHp: 4,
    activeSkill: {
      code: "CHUCK_WENGAM_HP",
      characterName: "Chuck Wengam",
      handDiscardCost: 0,
      hpSacrificeCost: 1,
      minHpBeforeUse: 2,
      drawCount: 2,
    },
  },
  {
    id: "char_doc_holyday",
    name: "Doc Holyday",
    pack: "dodge_city",
    baseHp: 4,
    activeSkill: {
      code: "DOC_HOLYDAY_BANG",
      characterName: "Doc Holyday",
      maxUsesPerTurn: 1,
      handDiscardCost: 2,
      requiresWeaponRangeTarget: true,
      firesSuitlessBang: true,
    },
  },
  {
    id: "char_elena_fuente",
    name: "Elena Fuente",
    pack: "dodge_city",
    baseHp: 3,
    substitution: { allowAnyHandAsMissed: true },
  },
  {
    id: "char_greg_digger",
    name: "Greg Digger",
    pack: "dodge_city",
    baseHp: 4,
    triggers: { onEliminationHeal: 2 },
  },
  {
    id: "char_herb_hunter",
    name: "Herb Hunter",
    pack: "dodge_city",
    baseHp: 4,
    triggers: { onEliminationDraw: 2 },
  },
  {
    id: "char_jose_delgado",
    name: "Jose Delgado",
    pack: "dodge_city",
    baseHp: 4,
    activeSkill: {
      code: "JOSE_DELGADO_DRAW",
      characterName: "Jose Delgado",
      maxUsesPerTurn: 2,
      handDiscardCost: 1,
      requiresBlueHandCard: true,
      drawCount: 2,
    },
  },
  {
    id: "char_molly_stark",
    name: "Molly Stark",
    pack: "dodge_city",
    baseHp: 4,
    triggers: { onOutOfTurnHandCardDeferredDraw: 1 },
  },
  {
    id: "char_pat_brennan",
    name: "Pat Brennan",
    pack: "dodge_city",
    baseHp: 4,
    phase1Trait: "EXCLUSIVE_PAT_BRENNAN",
  },
  {
    id: "char_pixie_pete",
    name: "Pixie Pete",
    pack: "dodge_city",
    baseHp: 3,
    phase1Trait: "EXCLUSIVE_PIXIE_PETE",
  },
  {
    id: "char_sean_mallory",
    name: "Sean Mallory",
    pack: "dodge_city",
    baseHp: 3,
    passive: { phase3HandLimit: 10 },
  },
  {
    id: "char_tequila_joe",
    name: "Tequila Joe",
    pack: "dodge_city",
    baseHp: 4,
    passive: { beerHealAmount: 2 },
  },
  {
    id: "char_vera_custer",
    name: "Vera Custer",
    pack: "dodge_city",
    baseHp: 3,
    triggers: { onTurnStartCopyLivingSkill: true },
  },
];

const BY_KEY = new Map<string, CharacterSkillDefinition>();
for (const entry of SKILL_DEFINITIONS) {
  BY_KEY.set(entry.name.toLowerCase(), entry);
  BY_KEY.set(entry.id.toLowerCase(), entry);
}

const ACTIVE_SKILL_BY_CODE = new Map<string, ActiveSkillSpec>();
for (const entry of SKILL_DEFINITIONS) {
  if (entry.activeSkill) {
    ACTIVE_SKILL_BY_CODE.set(entry.activeSkill.code, entry.activeSkill);
  }
}
ACTIVE_SKILL_BY_CODE.set(
  "CHUCK_WENGAM_SACRIFICE",
  ACTIVE_SKILL_BY_CODE.get("CHUCK_WENGAM_HP")!
);

export class SkillRegistry {
  // Lookup character skill definition
  public static get(nameOrId: string): CharacterSkillDefinition | undefined {
    return BY_KEY.get((nameOrId || "").trim().toLowerCase());
  }

  // Return all 31 skill definitions
  public static getAllDefinitions(): readonly CharacterSkillDefinition[] {
    return SKILL_DEFINITIONS;
  }

  // Lookup active skill spec
  public static getActiveSkillSpec(skillType: string): ActiveSkillSpec | undefined {
    return ACTIVE_SKILL_BY_CODE.get((skillType || "").trim().toUpperCase());
  }

  // Resolve active descriptors for player
  public static getActiveDefinitions(
    player: EnginePlayer,
    state?: SimulationState
  ): CharacterSkillDefinition[] {
    if (EventRuleRegistry.suppressesSkills(state)) {
      return [];
    }

    const result: CharacterSkillDefinition[] = [];
    const seen = new Set<string>();

    for (const ch of player.characters || []) {
      const def = this.get(ch.name) ?? this.get(ch.id);
      if (def && !seen.has(def.id)) {
        seen.add(def.id);
        result.push(def);
      }
    }

    if (player.copiedCharacter) {
      const copied =
        this.get(player.copiedCharacter.name) ?? this.get(player.copiedCharacter.id);
      if (copied && !seen.has(copied.id)) {
        seen.add(copied.id);
        result.push(copied);
      }
    }

    return result;
  }
}
