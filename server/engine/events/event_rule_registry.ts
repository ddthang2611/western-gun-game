import { EngineCard, Suit } from "../types/cards";
import { EnginePlayer, SimulationState } from "../types/state";
import { CardRegistry } from "../cards/card_registry";

export interface DrawContext {
  state: SimulationState;
  player: EnginePlayer;
  overrideMode: "NONE" | "GHOST_TOWN" | "PEYOTE_GUESS";
  drawDelta: number;
  postDrawBonus: number;
  disableSecondCardTrigger: boolean;
  allowPedroDiscardDraw: boolean;
  allowHardLiquorHeal: boolean;
  allowLawOfTheWest: boolean;
  allowRanchExchange: boolean;
}

export interface EventRuleHandler {
  suppressesSkills?: boolean;
  negatesEquipment?: boolean;
  disablesBeerRescue?: boolean;
  modifyDrawContext?(ctx: DrawContext): void;
  canPlayCard?(state: SimulationState, player: EnginePlayer, card: EngineCard): string | null;
  modifyBangLimit?(state: SimulationState, player: EnginePlayer, baseLimit: number): number;
  modifySuit?(state: SimulationState, card: EngineCard): Suit | null;
}

const EVENT_RULES: Record<string, EventRuleHandler> = {
  EVENT_HN_BLESSING: {
    modifySuit: () => "hearts",
  },
  EVENT_HN_CURSE: {
    modifySuit: () => "spades",
  },
  EVENT_HN_HANGOVER: {
    suppressesSkills: true,
  },
  EVENT_HN_GHOST_TOWN: {
    modifyDrawContext: (ctx) => {
      if (ctx.player.isGhost) {
        ctx.overrideMode = "GHOST_TOWN";
      }
    },
  },
  EVENT_HN_THIRST: {
    modifyDrawContext: (ctx) => {
      ctx.drawDelta -= 1;
      ctx.disableSecondCardTrigger = true;
    },
  },
  EVENT_HN_TRAIN_ARRIVAL: {
    modifyDrawContext: (ctx) => {
      ctx.postDrawBonus += 1;
    },
  },
  EVENT_HN_SHOOTOUT: {
    modifyBangLimit: (_state, _player, baseLimit) => Math.max(baseLimit, 2),
  },
  EVENT_HN_THE_SERMON: {
    canPlayCard: (state, player, card) =>
      card.name === "BANG!" && state.turnPlayerId === player.id
        ? "The Sermon forbids playing BANG! during your turn"
        : null,
    modifyBangLimit: (state, player, baseLimit) =>
      state.turnPlayerId === player.id ? 0 : baseLimit,
  },
  EVENT_HN_THE_REVEREND: {
    disablesBeerRescue: true,
    canPlayCard: (_state, _player, card) =>
      card.name === "BEER" ? "The Reverend forbids playing BEER cards" : null,
  },
  EVENT_FOC_LASSO: {
    negatesEquipment: true,
  },
  EVENT_FOC_PEYOTE: {
    modifyDrawContext: (ctx) => {
      if (!ctx.player.isGhost) {
        ctx.overrideMode = "PEYOTE_GUESS";
      }
    },
  },
  EVENT_FOC_ABANDONED_MINE: {
    modifyDrawContext: (ctx) => {
      ctx.allowPedroDiscardDraw = false;
    },
  },
  EVENT_FOC_HARD_LIQUOR: {
    modifyDrawContext: (ctx) => {
      ctx.allowHardLiquorHeal = true;
    },
  },
  EVENT_FOC_LAW_OF_THE_WEST: {
    modifyDrawContext: (ctx) => {
      ctx.allowLawOfTheWest = true;
    },
  },
  EVENT_FOC_RANCH: {
    modifyDrawContext: (ctx) => {
      ctx.allowRanchExchange = true;
    },
  },
  EVENT_FOC_THE_JUDGE: {
    canPlayCard: (_state, _player, card) => {
      const isInPlayCard = CardRegistry.get(card)
        ? CardRegistry.isEquippableCard(card)
        : card.border === "blue" || card.border === "green";
      if (isInPlayCard) {
        return "The Judge forbids playing cards in front of any player";
      }
      return null;
    },
  },
};

export class EventRuleRegistry {
  // Lookup handler by effect code
  public static getRule(effectCode?: string | null): EventRuleHandler | undefined {
    return effectCode ? EVENT_RULES[effectCode] : undefined;
  }

  // Build Phase 1 draw context
  public static buildDrawContext(
    state: SimulationState,
    player: EnginePlayer
  ): DrawContext {
    const ctx: DrawContext = {
      state,
      player,
      overrideMode: player.isGhost ? "GHOST_TOWN" : "NONE",
      drawDelta: 0,
      postDrawBonus: 0,
      disableSecondCardTrigger: false,
      allowPedroDiscardDraw: true,
      allowHardLiquorHeal: false,
      allowLawOfTheWest: false,
      allowRanchExchange: false,
    };

    const rule = this.getRule(state.activeEvent?.effectCode);
    rule?.modifyDrawContext?.(ctx);
    return ctx;
  }

  // Check card play restriction
  public static canPlayCard(
    state: SimulationState,
    player: EnginePlayer,
    card: EngineCard
  ): string | null {
    const rule = this.getRule(state.activeEvent?.effectCode);
    return rule?.canPlayCard ? rule.canPlayCard(state, player, card) : null;
  }

  // Resolve BANG! limit per turn
  public static getBangLimit(
    state: SimulationState | undefined,
    player: EnginePlayer,
    baseLimit: number = 1
  ): number {
    const rule = this.getRule(state?.activeEvent?.effectCode);
    return rule?.modifyBangLimit && state
      ? rule.modifyBangLimit(state, player, baseLimit)
      : baseLimit;
  }

  // Resolve suit override
  public static getEffectiveSuit(
    state: SimulationState | undefined,
    card: EngineCard
  ): Suit {
    const rule = this.getRule(state?.activeEvent?.effectCode);
    return (rule?.modifySuit && state ? rule.modifySuit(state, card) : null) ?? card.suit;
  }

  // Check skill suppression
  public static suppressesSkills(state?: SimulationState): boolean {
    return Boolean(this.getRule(state?.activeEvent?.effectCode)?.suppressesSkills);
  }

  // Check equipment negation
  public static negatesEquipment(state?: SimulationState): boolean {
    return Boolean(this.getRule(state?.activeEvent?.effectCode)?.negatesEquipment);
  }

  // Check Beer rescue block
  public static disablesBeerRescue(state?: SimulationState): boolean {
    return Boolean(this.getRule(state?.activeEvent?.effectCode)?.disablesBeerRescue);
  }
}
