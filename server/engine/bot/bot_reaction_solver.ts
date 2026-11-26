import { CardRegistry } from "../cards/card_registry";
import { PlayerCommand } from "../types/actions";
import { EngineCard } from "../types/cards";
import { SanitizedGameState, SanitizedPlayerState } from "../state/fog_of_war";
import { BotDecisionContext } from "./bot_types";
import {
  canUseBeerHeal,
  getAllInPlayCards,
  getEquippedBlueCards,
  getPlayerById,
  hasSkill,
  isEquipmentEffective,
  isHandBangCard,
  isHandMissedCard,
} from "./bot_state_utils";
import {
  evaluateCharacterForRole,
  evaluateInPlayCardValue,
  evaluateKeepValue,
} from "./bot_card_evaluator";
import {
  computeHostility,
  pickBestManipulationArea,
  scoreHealTarget,
} from "./bot_target_scorer";

// Point 1: Solve character selection
export function solveCharacterSelect(
  snapshot: SanitizedGameState,
  botId: string
): PlayerCommand | null {
  const pending = snapshot.pendingCharacterSelect;
  if (!pending || pending.playerId !== botId) return null;
  if (pending.selectedCharacterIds && pending.selectedCharacterIds.length >= pending.requiredCount) {
    return null;
  }

  const role = snapshot.myState?.role ?? "outlaw";
  const ranked = [...pending.candidates].sort(
    (a, b) =>
      evaluateCharacterForRole(b, role, snapshot.is3PlayerVariant) -
      evaluateCharacterForRole(a, role, snapshot.is3PlayerVariant)
  );
  const chosen = ranked.slice(0, pending.requiredCount).map((c) => c.id);

  return {
    playerId: botId,
    type: "SELECT_CHARACTERS",
    characterIds: chosen,
  };
}

// Point 2: Solve Vera Custer copy and Blood Brothers transfer
export function solveTurnStartChoice(
  ctx: BotDecisionContext
): PlayerCommand | null {
  const choice = ctx.snapshot.pendingTurnStartChoice;
  if (!choice || choice.playerId !== ctx.botId) return null;

  if (choice.type === "VERA_CUSTER_COPY") {
    const avail = choice.availableCharacters || [];
    if (avail.length === 0) return null;

    const bangCount = ctx.hand.filter((c) => c.name.toUpperCase() === "BANG!").length;
    const lowHp = ctx.me.hp <= 2;

    let best = avail[0];
    let bestScore = -Infinity;

    for (const item of avail) {
      let s = evaluateCharacterForRole(
        item.character,
        ctx.myRole,
        ctx.snapshot.is3PlayerVariant
      );
      const name = item.character.name.toLowerCase();
      if (bangCount >= 2 && (name === "willy the kid" || name === "slab the killer")) {
        s += 32;
      }
      if (lowHp && (name === "sid ketchum" || name === "jourdonnais" || name === "tequila joe")) {
        s += 28;
      }
      if (name === "bill noface" && ctx.me.maxHp - ctx.me.hp >= 2) {
        s += 30;
      }
      if (name === "pixie pete" || name === "black jack" || name === "suzy lafayette") {
        s += 14;
      }
      if (s > bestScore) {
        bestScore = s;
        best = item;
      }
    }

    return {
      playerId: ctx.botId,
      type: "RESOLVE_TURN_START",
      characterIds: [best.character.id],
      payload: { characterId: best.character.id },
    };
  }

  if (choice.type === "BLOOD_BROTHERS") {
    const eligible = choice.eligibleTargetIds || [];
    if (ctx.me.hp >= 3 && !ctx.me.isGhost && eligible.length > 0) {
      let bestId: string | null = null;
      let bestScore = 75;
      for (const tid of eligible) {
        const target = getPlayerById(ctx.snapshot, tid);
        if (!target || target.hp > 2) continue;
        const s = scoreHealTarget(target, ctx);
        if (s > bestScore) {
          bestScore = s;
          bestId = tid;
        }
      }
      if (bestId) {
        return {
          playerId: ctx.botId,
          type: "RESOLVE_TURN_START",
          targetPlayerId: bestId,
        };
      }
    }

    return {
      playerId: ctx.botId,
      type: "RESOLVE_TURN_START",
      payload: { skip: true },
    };
  }

  return null;
}

// Point 3: Solve Phase 1 draw and exchange choices
export function solvePhase1Choice(
  ctx: BotDecisionContext
): PlayerCommand | null {
  const pc = ctx.snapshot.pendingPhase1Choice;
  if (!pc || pc.playerId !== ctx.botId) return null;

  if (pc.mode === "PEYOTE_GUESS") {
    return {
      playerId: ctx.botId,
      type: "RESOLVE_PHASE_1",
      payload: { choice: ctx.preferredPeyoteColor },
    };
  }

  if (pc.mode === "KIT_CARLSON_PICK") {
    const preview = pc.previewCards || [];
    const needed = Math.min(pc.neededCount ?? 2, preview.length);
    // Keep highest K(c); avoid leaving Hearts on top of deck for next player
    const scored = preview.map((card) => {
      let keep = evaluateKeepValue(card, ctx);
      if (card.suit === "hearts") {
        // Slightly prefer keeping Hearts so next seat does not auto-pass Jail/Barrel
        keep += 4;
      }
      return { card, keep };
    });
    scored.sort((a, b) => b.keep - a.keep);
    const pickedIds = scored.slice(0, needed).map((s) => s.card.id);
    return {
      playerId: ctx.botId,
      type: "RESOLVE_PHASE_1",
      payload: { cardIds: pickedIds },
    };
  }

  if (pc.mode === "RANCH_EXCHANGE") {
    const toSwap = ctx.hand
      .filter((c) => evaluateKeepValue(c, ctx) < 42)
      .map((c) => c.id);
    if (toSwap.length === 0) {
      return {
        playerId: ctx.botId,
        type: "RESOLVE_PHASE_1",
        payload: { skip: true },
      };
    }
    return {
      playerId: ctx.botId,
      type: "RESOLVE_PHASE_1",
      discardCardIds: toSwap,
    };
  }

  if (pc.mode === "CHOOSE_DRAW_OPTION") {
    const opts = pc.options || [];

    if (opts.includes("PIXIE_PETE")) {
      return {
        playerId: ctx.botId,
        type: "RESOLVE_PHASE_1",
        payload: { choice: "PIXIE_PETE" },
      };
    }

    if (opts.includes("BILL_NOFACE")) {
      const wounds = Math.max(0, ctx.me.maxHp - ctx.me.hp);
      if (1 + wounds >= 2) {
        return {
          playerId: ctx.botId,
          type: "RESOLVE_PHASE_1",
          payload: { choice: "BILL_NOFACE" },
        };
      }
    }

    if (opts.includes("SKIP_DRAW_HEAL") && ctx.me.hp <= 2 && ctx.hand.length >= 2) {
      return {
        playerId: ctx.botId,
        type: "RESOLVE_PHASE_1",
        payload: { choice: "SKIP_DRAW_HEAL" },
      };
    }

    if (opts.includes("PAT_BRENNAN_STEAL") || opts.includes("PAT_BRENNAN")) {
      let bestTargetId: string | null = null;
      let bestArea: "EQUIPMENT" | "GREEN" | "JUDGEMENT" | null = null;
      let bestCardId: string | null = null;
      let bestScore = 84;

      for (const p of ctx.alivePlayers) {
        if (p.isGhost) continue;
        const sel = pickBestManipulationArea(p, true, ctx, { allowHand: false });
        if (sel && sel.targetArea !== "HAND" && sel.targetCardId && sel.utility > bestScore) {
          bestScore = sel.utility;
          bestTargetId = p.id;
          bestArea = sel.targetArea;
          bestCardId = sel.targetCardId;
        }
      }

      if (bestTargetId && bestArea && bestCardId) {
        const optionName = opts.includes("PAT_BRENNAN_STEAL")
          ? "PAT_BRENNAN_STEAL"
          : "PAT_BRENNAN";
        return {
          playerId: ctx.botId,
          type: "RESOLVE_PHASE_1",
          targetPlayerId: bestTargetId,
          targetArea: bestArea,
          targetCardId: bestCardId,
          payload: { choice: optionName },
        };
      }
    }

    if (opts.includes("PEDRO_DISCARD_AND_DECK") && ctx.snapshot.topDiscardCard) {
      const topVal = evaluateKeepValue(ctx.snapshot.topDiscardCard, ctx);
      if (topVal > 52) {
        return {
          playerId: ctx.botId,
          type: "RESOLVE_PHASE_1",
          payload: { choice: "PEDRO_DISCARD_AND_DECK" },
        };
      }
    }

    if (opts.includes("JESSE_STEAL_AND_DECK")) {
      let bestEnemy: SanitizedPlayerState | null = null;
      let bestEnemyScore = 20;
      for (const p of ctx.alivePlayers) {
        if (p.id === ctx.botId || p.isGhost || p.handCount <= 0) continue;
        const h = computeHostility(p, ctx);
        const score = h + (p.handCount <= 2 ? 15 : 0);
        if (score > bestEnemyScore) {
          bestEnemyScore = score;
          bestEnemy = p;
        }
      }
      if (bestEnemy) {
        return {
          playerId: ctx.botId,
          type: "RESOLVE_PHASE_1",
          targetPlayerId: bestEnemy.id,
          payload: { choice: "JESSE_STEAL_AND_DECK" },
        };
      }
    }

    if (opts.includes("KIT_CARLSON")) {
      return {
        playerId: ctx.botId,
        type: "RESOLVE_PHASE_1",
        payload: { choice: "KIT_CARLSON" },
      };
    }

    const normal = opts.find((o) => o === "NORMAL_DRAW" || o === "NORMAL_DECK") ?? opts[0];
    return {
      playerId: ctx.botId,
      type: "RESOLVE_PHASE_1",
      payload: { choice: normal },
    };
  }

  return null;
}

// Point 4: Solve active chain picks (Store, Brawl, Lucky Duke, El Gringo)
export function solveActiveChain(
  ctx: BotDecisionContext
): PlayerCommand | null {
  const { snapshot, botId } = ctx;

  if (snapshot.pendingLuckyDukePick?.playerId === botId) {
    const drawn = snapshot.pendingLuckyDukePick.drawnCards || [];
    if (drawn.length === 0) return null;
    const passing = drawn.filter((c) => c.matches);
    const pool = passing.length > 0 ? passing : drawn;
    // Chosen card lands on top of discard; pick lowest K(c) to deny Pedro Ramirez
    const chosen = [...pool].sort(
      (a, b) => evaluateKeepValue(a, ctx) - evaluateKeepValue(b, ctx)
    )[0];
    return {
      playerId: botId,
      type: "SELECT_STOLEN_CARD",
      cardId: chosen.id,
    };
  }

  if (snapshot.pendingElGringoPick?.victimId === botId) {
    return {
      playerId: botId,
      type: "SELECT_STOLEN_CARD",
    };
  }

  if (snapshot.pendingBrawlPick?.actorPlayerId === botId) {
    const targetId = snapshot.pendingBrawlPick.currentTargetId;
    const target = getPlayerById(snapshot, targetId);
    if (!target) return null;

    const sel = pickBestManipulationArea(target, false, ctx, { allowHand: true });
    if (sel) {
      return {
        playerId: botId,
        type: "SELECT_STOLEN_CARD",
        targetPlayerId: target.id,
        targetArea: sel.targetArea,
        targetCardId: sel.targetCardId,
      };
    }

    // Safe fallback guaranteed valid
    if (target.handCount > 0) {
      return {
        playerId: botId,
        type: "SELECT_STOLEN_CARD",
        targetPlayerId: target.id,
        targetArea: "HAND",
      };
    }
    const firstInPlay = getAllInPlayCards(target)[0];
    if (firstInPlay) {
      return {
        playerId: botId,
        type: "SELECT_STOLEN_CARD",
        targetPlayerId: target.id,
        targetArea: firstInPlay.area,
        targetCardId: firstInPlay.card.id,
      };
    }
    return null;
  }

  if (snapshot.generalStore?.currentPickerId === botId) {
    const gs = snapshot.generalStore;
    if (gs.pool.length === 0) return null;

    const nextPickerId = gs.draftOrder[gs.currentPickerIndex + 1];
    const nextPicker = getPlayerById(snapshot, nextPickerId);
    const nextIsEnemy = Boolean(nextPicker && computeHostility(nextPicker, ctx) > 25);

    let bestCard = gs.pool[0];
    let bestScore = -Infinity;
    for (const card of gs.pool) {
      let score = evaluateKeepValue(card, ctx);
      if (nextIsEnemy && nextPicker) {
        score += estimateDenyBonus(card, nextPicker) * 0.35;
      }
      if (score > bestScore) {
        bestScore = score;
        bestCard = card;
      }
    }

    return {
      playerId: botId,
      type: "SELECT_STOLEN_CARD",
      cardId: bestCard.id,
    };
  }

  return null;
}

// Point 5: Solve pending defensive or rescue reactions
export function solveReaction(
  ctx: BotDecisionContext
): PlayerCommand | null {
  const reaction = ctx.snapshot.myPendingReaction;
  if (!reaction || reaction.targetPlayerId !== ctx.botId) return null;

  const { snapshot, me, hand, botId } = ctx;

  // 5A. Near-death rescue feasibility solver
  if (reaction.type === "NEAR_DEATH_RESCUE") {
    return solveNearDeathRescue(ctx, reaction);
  }

  // 5B. The Daltons forced blue discard
  if (reaction.type === "EVENT_DALTONS_DISCARD") {
    const blues = getEquippedBlueCards(me);
    const judgements = (me.judgements || []).map((j) => j.card);
    const candidates = [...blues, ...judgements];
    if (candidates.length === 0) {
      return { playerId: botId, type: "RESOLVE_REACTION", payload: { action: "TAKE_DAMAGE" } };
    }
    const worst = [...candidates].sort((a, b) => {
      // Drop Jail or Dynamite first if blue judgement is eligible, otherwise cheapest blue
      const nameA = a.name.toUpperCase();
      const nameB = b.name.toUpperCase();
      if (nameA === "DYNAMITE" || nameA === "JAIL") return -1;
      if (nameB === "DYNAMITE" || nameB === "JAIL") return 1;
      return evaluateKeepValue(a, ctx) - evaluateKeepValue(b, ctx);
    })[0];
    return {
      playerId: botId,
      type: "RESOLVE_REACTION",
      targetCardId: worst.id,
      cardId: worst.id,
    };
  }

  // 5C. Try free Barrel / Jourdonnais checks first
  const turnPlayer = getPlayerById(snapshot, snapshot.turnPlayerId);
  const attacker = getPlayerById(snapshot, reaction.sourcePlayerId);
  const equipEffective = isEquipmentEffective(me, turnPlayer ?? attacker, snapshot);

  if (reaction.type !== "EVENT_RUSSIAN_ROULETTE") {
    if (reaction.canUseBarrel && !reaction.barrelChecked && equipEffective && me.equipments?.barrel) {
      return {
        playerId: botId,
        type: "RESOLVE_REACTION",
        payload: { action: "BARREL_CHECK", checkSource: "BARREL" },
      };
    }
    if (
      reaction.canUseJourdonnais &&
      !reaction.jourdonnaisChecked &&
      hasSkill(me, "Jourdonnais", snapshot)
    ) {
      return {
        playerId: botId,
        type: "RESOLVE_REACTION",
        payload: { action: "BARREL_CHECK", checkSource: "JOURDONNAIS" },
      };
    }
  }

  // 5D. Russian Roulette (2 damage if missed)
  if (reaction.type === "EVENT_RUSSIAN_ROULETTE") {
    const missed = hand.find((c) => c.name.toUpperCase() === "MISSED!");
    if (missed) {
      return { playerId: botId, type: "RESOLVE_REACTION", cardId: missed.id };
    }
    return { playerId: botId, type: "RESOLVE_REACTION", payload: { action: "TAKE_DAMAGE" } };
  }

  // 5E. Duel response stopping rule
  if (reaction.type === "DUEL_RESPONSE") {
    const bangs = hand
      .filter((c) => isHandBangCard(c, me, snapshot))
      .sort((a, b) => evaluateKeepValue(a, ctx) - evaluateKeepValue(b, ctx));
    if (bangs.length === 0) {
      return { playerId: botId, type: "RESOLVE_REACTION", payload: { action: "TAKE_DAMAGE" } };
    }
    const expectedOppBangs = attacker ? attacker.handCount * 0.28 + 0.35 : 0.8;
    const isLethal = me.hp <= 1;
    const shouldFight = isLethal || bangs.length >= expectedOppBangs || (me.hp <= 2 && bangs.length >= 1);
    if (shouldFight) {
      return { playerId: botId, type: "RESOLVE_REACTION", cardId: bangs[0].id };
    }
    return { playerId: botId, type: "RESOLVE_REACTION", payload: { action: "TAKE_DAMAGE" } };
  }

  // 5F. Indians! response
  if (reaction.type === "INDIANS_DEFENSE") {
    const bangs = hand
      .filter((c) => isHandBangCard(c, me, snapshot))
      .sort((a, b) => evaluateKeepValue(a, ctx) - evaluateKeepValue(b, ctx));
    if (bangs.length === 0) {
      return { playerId: botId, type: "RESOLVE_REACTION", payload: { action: "TAKE_DAMAGE" } };
    }
    const cheapest = bangs[0];
    if (me.hp <= 2 || evaluateKeepValue(cheapest, ctx) < 76) {
      return { playerId: botId, type: "RESOLVE_REACTION", cardId: cheapest.id };
    }
    return { playerId: botId, type: "RESOLVE_REACTION", payload: { action: "TAKE_DAMAGE" } };
  }

  // 5G. BANG! / Gatling / Ricochet defense with 2-Missed commitment solver
  if (reaction.requiredCard === "MISSED") {
    const needed = Math.max(1, (reaction.requiredCount ?? 1) - (reaction.currentCount ?? 0));

    const readyGreenDefs = equipEffective
      ? (me.greenCards || []).filter(
          (g) => !g.isDelay && CardRegistry.isGreenDefenseCard(g.card)
        )
      : [];

    const handMisseds = hand.filter((c) =>
      isHandMissedCard(c, me, snapshot, reaction.type)
    );

    const totalSources = readyGreenDefs.length + handMisseds.length;
    if (totalSources === 0) {
      return { playerId: botId, type: "RESOLVE_REACTION", payload: { action: "TAKE_DAMAGE" } };
    }

    // For Ricochet, compare defending vs losing targeted card
    if (reaction.type === "EVENT_RICOCHET_DEFENSE") {
      const targetCard = getAllInPlayCards(me).find(
        (e) => e.card.id === reaction.targetCardId
      );
      const lossVal = targetCard
        ? evaluateInPlayCardValue(targetCard.card, targetCard.area, me, true)
        : 55;
      if (lossVal < 40 && readyGreenDefs.length === 0) {
        return { playerId: botId, type: "RESOLVE_REACTION", payload: { action: "TAKE_DAMAGE" } };
      }
    }

    // Slab the Killer / Sniper 2-Missed commitment guard
    if (needed >= 2 && totalSources < needed) {
      const fishingBible = readyGreenDefs.find(
        (g) => g.card.name.toUpperCase() === "BIBLE"
      );
      const fishingDodge = handMisseds.find(
        (c) => c.name.toUpperCase() === "DODGE"
      );
      const canFishDraw = Boolean(fishingBible || fishingDodge);

      // Avoid wasting a plain single Missed! when guaranteed to fail and not dying
      if (!canFishDraw && me.hp >= 2) {
        return {
          playerId: botId,
          type: "RESOLVE_REACTION",
          payload: { action: "TAKE_DAMAGE" },
        };
      }
      if (canFishDraw) {
        if (fishingBible) {
          return {
            playerId: botId,
            type: "RESOLVE_REACTION",
            greenCardId: fishingBible.id,
            payload: { action: "USE_GREEN_DEFENSE", greenCardId: fishingBible.id },
          };
        }
        if (fishingDodge) {
          return {
            playerId: botId,
            type: "RESOLVE_REACTION",
            cardId: fishingDodge.id,
          };
        }
      }
    }

    // Prefer ready green defense cards before spending hand cards
    if (readyGreenDefs.length > 0) {
      const chosenGreen = [...readyGreenDefs].sort((a, b) => {
        const aBible = a.card.name.toUpperCase() === "BIBLE" ? 1 : 0;
        const bBible = b.card.name.toUpperCase() === "BIBLE" ? 1 : 0;
        return needed >= 2 ? bBible - aBible : aBible - bBible;
      })[0];
      return {
        playerId: botId,
        type: "RESOLVE_REACTION",
        greenCardId: chosenGreen.id,
        payload: { action: "USE_GREEN_DEFENSE", greenCardId: chosenGreen.id },
      };
    }

    // Pick lowest-cost hand Missed! (preferring plain MISSED! over DODGE/BANG!/Elena sacrifice)
    const sortedHand = [...handMisseds].sort(
      (a, b) => scoreDefenseCardCost(a, ctx) - scoreDefenseCardCost(b, ctx)
    );
    return {
      playerId: botId,
      type: "RESOLVE_REACTION",
      cardId: sortedHand[0].id,
    };
  }

  return {
    playerId: botId,
    type: "RESOLVE_REACTION",
    payload: { action: "TAKE_DAMAGE" },
  };
}

// Feasibility solver for NEAR_DEATH_RESCUE (Beer + Sid Ketchum)
function solveNearDeathRescue(
  ctx: BotDecisionContext,
  reaction: any
): PlayerCommand {
  const { snapshot, me, hand, botId } = ctx;
  const allowBeer = canUseBeerHeal(snapshot) && Boolean(reaction.canUseBeer ?? true);
  const beers = allowBeer
    ? hand.filter((c) => c.name.toUpperCase() === "BEER")
    : [];
  const beerHealEach = hasSkill(me, "Tequila Joe", snapshot) ? 2 : 1;
  const hasSid = hasSkill(me, "Sid Ketchum", snapshot) && Boolean(reaction.canUseSidKetchum ?? true);

  const nonBeerCount = hand.length - beers.length;
  const maxBeerHeal = beers.length * beerHealEach;
  const maxSidHeal = hasSid ? Math.floor(nonBeerCount / 2) : 0;
  // Also consider using Beer cards as Sid pairs if Beer itself is disabled
  const totalMaxHeal = allowBeer
    ? maxBeerHeal + maxSidHeal
    : hasSid
    ? Math.floor(hand.length / 2)
    : 0;

  if (me.hp + totalMaxHeal <= 0) {
    return {
      playerId: botId,
      type: "RESOLVE_REACTION",
      payload: { action: "DECLINE_RESCUE" },
    };
  }

  if (beers.length > 0) {
    return {
      playerId: botId,
      type: "RESOLVE_REACTION",
      cardId: beers[0].id,
    };
  }

  if (hasSid && hand.length >= 2) {
    const neededHp = Math.max(1, 1 - me.hp);
    const pairCount = Math.min(Math.floor(hand.length / 2), neededHp);
    const sorted = [...hand].sort(
      (a, b) => evaluateKeepValue(a, ctx) - evaluateKeepValue(b, ctx)
    );
    const discardIds = sorted.slice(0, pairCount * 2).map((c) => c.id);
    return {
      playerId: botId,
      type: "RESOLVE_REACTION",
      discardCardIds: discardIds,
    };
  }

  return {
    playerId: botId,
    type: "RESOLVE_REACTION",
    payload: { action: "DECLINE_RESCUE" },
  };
}

function scoreDefenseCardCost(card: EngineCard, ctx: BotDecisionContext): number {
  const name = card.name.toUpperCase();
  if (name === "MISSED!") return 10;
  if (name === "DODGE") return 18;
  if (name === "BANG!") return 32;
  return 40 + evaluateKeepValue(card, ctx);
}

function estimateDenyBonus(
  card: EngineCard,
  nextPicker: SanitizedPlayerState
): number {
  const name = card.name.toUpperCase();
  if (nextPicker.hp <= 2 && (name === "BEER" || name === "WHISKY" || name === "MISSED!" || name === "DODGE")) {
    return 85;
  }
  if (name === "WELLS FARGO" || name === "STAGECOACH" || name === "BARREL" || name === "VOLCANIC") {
    return 75;
  }
  if (name === "GATLING" || name === "INDIANS!" || name === "PANIC!" || name === "CAT BALOU") {
    return 65;
  }
  return 35;
}
