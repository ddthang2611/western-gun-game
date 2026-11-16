"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventRuleRegistry = void 0;
const EVENT_RULES = {
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
        canPlayCard: (state, player, card) => card.name === "BANG!" && state.turnPlayerId === player.id
            ? "The Sermon forbids playing BANG! during your turn"
            : null,
        modifyBangLimit: (state, player, baseLimit) => state.turnPlayerId === player.id ? 0 : baseLimit,
    },
    EVENT_HN_THE_REVEREND: {
        disablesBeerRescue: true,
        canPlayCard: (_state, _player, card) => card.name === "BEER" ? "The Reverend forbids playing BEER cards" : null,
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
            if (card.border === "blue" ||
                card.border === "green" ||
                card.category === "weapon" ||
                card.category === "equipment" ||
                card.category === "green_delayed" ||
                card.category === "green_delay") {
                return "The Judge forbids playing cards in front of any player";
            }
            return null;
        },
    },
};
class EventRuleRegistry {
    // Lookup handler by effect code
    static getRule(effectCode) {
        return effectCode ? EVENT_RULES[effectCode] : undefined;
    }
    // Build Phase 1 draw context
    static buildDrawContext(state, player) {
        const ctx = {
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
    static canPlayCard(state, player, card) {
        const rule = this.getRule(state.activeEvent?.effectCode);
        return rule?.canPlayCard ? rule.canPlayCard(state, player, card) : null;
    }
    // Resolve BANG! limit per turn
    static getBangLimit(state, player, baseLimit = 1) {
        const rule = this.getRule(state?.activeEvent?.effectCode);
        return rule?.modifyBangLimit && state
            ? rule.modifyBangLimit(state, player, baseLimit)
            : baseLimit;
    }
    // Resolve suit override
    static getEffectiveSuit(state, card) {
        const rule = this.getRule(state?.activeEvent?.effectCode);
        return (rule?.modifySuit && state ? rule.modifySuit(state, card) : null) ?? card.suit;
    }
    // Check skill suppression
    static suppressesSkills(state) {
        return Boolean(this.getRule(state?.activeEvent?.effectCode)?.suppressesSkills);
    }
    // Check equipment negation
    static negatesEquipment(state) {
        return Boolean(this.getRule(state?.activeEvent?.effectCode)?.negatesEquipment);
    }
    // Check Beer rescue block
    static disablesBeerRescue(state) {
        return Boolean(this.getRule(state?.activeEvent?.effectCode)?.disablesBeerRescue);
    }
}
exports.EventRuleRegistry = EventRuleRegistry;
