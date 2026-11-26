import { CardRegistry } from "../cards/card_registry";
import { PlayerCommand } from "../types/actions";
import { EngineCard } from "../types/cards";
import { SanitizedPlayerState } from "../state/fog_of_war";
import {
  BOT_MAX_ACTIONS_PER_TURN,
  BotActionCandidate,
  BotDecisionContext,
} from "./bot_types";
import {
  buildCommandSignature,
  calculateDistance,
  canUseBeerHeal,
  getBangLimit,
  getEffectiveSuit,
  getLivingContenders,
  getPlayerById,
  getWeaponRange,
  hasEquippedByName,
  hasSkill,
  isCardBlockedByEvent,
  isEquipmentEffective,
  isImmuneToCard,
} from "./bot_state_utils";
import {
  estimateTargetDefense,
  evaluateBlueCardForJose,
  evaluateKeepValue,
} from "./bot_card_evaluator";
import {
  computeHostility,
  estimateLivingRoleCount,
  pickBestManipulationArea,
  scoreAttackTarget,
  scoreHealTarget,
  scoreJailTarget,
} from "./bot_target_scorer";

function norm(name: string): string {
  const u = (name || "").trim().toUpperCase();
  return u === "BINOCULARS" ? "BINOCULAR" : u;
}

// Point 6B: Solve Phase 3 excess discard
export function solvePhase3Discard(ctx: BotDecisionContext): PlayerCommand {
  const { snapshot, me, hand, botId } = ctx;
  const handLimit = hasSkill(me, "Sean Mallory", snapshot)
    ? 10
    : Math.max(0, me.hp);
  const excess = hand.length - handLimit;
  if (excess <= 0) {
    return { playerId: botId, type: "END_TURN" };
  }

  const ranked = [...hand].sort(
    (a, b) => evaluateKeepValue(a, ctx) - evaluateKeepValue(b, ctx)
  );
  const discardIds = ranked.slice(0, excess).map((c) => c.id);
  return {
    playerId: botId,
    type: "DISCARD_CARD",
    discardCardIds: discardIds,
  };
}

// Point 6A: Plan best Phase 2 action with multi-step lookahead
export function planPhase2Action(ctx: BotDecisionContext): PlayerCommand {
  const { botId, turnMemory, snapshot, me, hand } = ctx;

  if (turnMemory.actionsTaken >= BOT_MAX_ACTIONS_PER_TURN) {
    return { playerId: botId, type: "END_TURN" };
  }

  const candidates: BotActionCandidate[] = [];

  collectReadyGreenCandidates(ctx, candidates);
  collectHandCardCandidates(ctx, candidates);
  collectActiveSkillCandidates(ctx, candidates);

  // Apply forcedPlayCardId boost and Suzy Lafayette empty-hand bonus
  const forcedId = me.forcedPlayCardId;
  const isSuzy = hasSkill(me, "Suzy Lafayette", snapshot);

  for (const cand of candidates) {
    if (forcedId && cand.command.cardId === forcedId) {
      cand.score += 120;
    }
    if (isSuzy && cand.command.type === "PLAY_CARD") {
      const consumed = 1 + (cand.command.discardCardIds?.length ?? 0);
      if (hand.length > 0 && consumed >= hand.length) {
        cand.score += 35;
      }
    }
  }

  // Filter rejected signatures for current stateSeq and non-positive scores
  const viable = candidates
    .filter(
      (c) =>
        c.score > 4 &&
        !turnMemory.rejectedSignatures.has(c.signature)
    )
    .sort((a, b) => b.score - a.score);

  if (viable.length === 0) {
    return { playerId: botId, type: "END_TURN" };
  }

  return viable[0].command;
}

// Collect ready green card activations
function collectReadyGreenCandidates(
  ctx: BotDecisionContext,
  out: BotActionCandidate[]
): void {
  const { snapshot, me, botId } = ctx;
  const turnPlayer = getPlayerById(snapshot, snapshot.turnPlayerId);
  if (!isEquipmentEffective(me, turnPlayer, snapshot)) return;

  for (const entry of me.greenCards || []) {
    if (entry.isDelay) continue;
    if (!CardRegistry.isGreenActiveCard(entry.card)) continue;
    const name = norm(entry.card.name);

    if (name === "PONY EXPRESS") {
      pushCand(out, { playerId: botId, type: "ACTIVATE_GREEN_CARD", greenCardId: entry.id }, 96, "pony_express");
      continue;
    }

    if (name === "CANTEEN") {
      if (me.hp < me.maxHp && !me.isGhost) {
        const s = me.hp <= 1 ? 105 : me.hp <= 2 ? 82 : 44;
        pushCand(out, { playerId: botId, type: "ACTIVATE_GREEN_CARD", greenCardId: entry.id }, s, "canteen_heal");
      }
      continue;
    }

    if (name === "HOWITZER") {
      const net = scoreAoeAttack(entry.card, ctx);
      if (net > 18) {
        pushCand(out, { playerId: botId, type: "ACTIVATE_GREEN_CARD", greenCardId: entry.id }, net + 12, "howitzer_aoe");
      }
      continue;
    }

    if (name === "CAN CAN" || name === "CONESTOGA") {
      const isSteal = name === "CONESTOGA";
      for (const target of ctx.alivePlayers) {
        if (target.id === botId) continue;
        const sel = pickBestManipulationArea(target, isSteal, ctx, {
          allowHand: true,
          sourceCard: entry.card,
        });
        if (sel && sel.utility > 22) {
          pushCand(
            out,
            {
              playerId: botId,
              type: "ACTIVATE_GREEN_CARD",
              greenCardId: entry.id,
              targetPlayerId: target.id,
              targetArea: sel.targetArea,
              targetCardId: sel.targetCardId,
            },
            sel.utility + 14,
            `green_${name.toLowerCase()}`
          );
        }
      }
      continue;
    }

    // Green attack cards (Buffalo Rifle, Pepperbox, Derringer, Knife)
    const def = CardRegistry.get(entry.card);
    const distRule = def?.targeting.distance ?? "NONE";
    const range = getWeaponRange(snapshot, me);

    for (const target of ctx.alivePlayers) {
      if (target.id === botId) continue;
      const dist = calculateDistance(snapshot, me, target);
      if (distRule === "EXACT_1" && dist !== 1) continue;
      if (distRule === "WEAPON_RANGE" && dist > range) continue;

      const s = scoreAttackTarget(target, ctx, { card: entry.card });
      if (s > 12) {
        const bonus = name === "DERRINGER" ? 20 : 12;
        pushCand(
          out,
          {
            playerId: botId,
            type: "ACTIVATE_GREEN_CARD",
            greenCardId: entry.id,
            targetPlayerId: target.id,
          },
          s + bonus,
          `green_attack_${name.toLowerCase()}`
        );
      }
    }
  }
}

// Collect all legal hand plays with combo lookahead
function collectHandCardCandidates(
  ctx: BotDecisionContext,
  out: BotActionCandidate[]
): void {
  const { snapshot, me, hand, botId } = ctx;
  const bangLimit = getBangLimit(snapshot, me);
  const canBang = snapshot.bangCountThisTurn < bangLimit;
  const isCalamity = hasSkill(me, "Calamity Janet", snapshot);
  const range = getWeaponRange(snapshot, me);
  const eventCode = snapshot.activeEvent?.effectCode;

  for (const card of hand) {
    if (isCardBlockedByEvent(snapshot, me, card)) continue;

    const name = norm(card.name);
    const isBangSub = name === "MISSED!" && isCalamity;
    const def = isBangSub ? CardRegistry.get("BANG!") : CardRegistry.get(card);
    if (!def) continue;
    if (def.zone === "REACTION_ONLY" && !isBangSub) continue;

    // 1. Immediate draw cards (highest priority to reveal full options)
    if (name === "WELLS FARGO" || name === "STAGECOACH") {
      const s = name === "WELLS FARGO" ? 115 : 108;
      pushCand(out, { playerId: botId, type: "PLAY_CARD", cardId: card.id }, s, `draw_${name}`);
      continue;
    }

    if (name === "GENERAL STORE") {
      const s = hand.length <= 2 ? 56 : 26;
      pushCand(out, { playerId: botId, type: "PLAY_CARD", cardId: card.id }, s, "general_store");
      continue;
    }

    // 2. Equip blue / green / judgements
    if (def.zone === "EQUIP_BLUE" || def.zone === "EQUIP_GREEN" || def.zone === "JUDGEMENT") {
      evaluateEquipOrJudgement(card, def.zone, ctx, out);
      continue;
    }

    // 3. Healing brown cards
    if (name === "BEER") {
      if (canUseBeerHeal(snapshot) && me.hp < me.maxHp && !me.isGhost) {
        const s = me.hp <= 1 ? 104 : me.hp <= 2 ? 78 : 34;
        pushCand(out, { playerId: botId, type: "PLAY_CARD", cardId: card.id }, s, "play_beer");
      }
      continue;
    }

    if (name === "SALOON") {
      const s = scoreSaloonPlay(card, ctx);
      if (s > 16) {
        pushCand(out, { playerId: botId, type: "PLAY_CARD", cardId: card.id }, s, "play_saloon");
      }
      continue;
    }

    if (name === "WHISKY") {
      if (me.hp < me.maxHp && !me.isGhost && hand.length >= 2) {
        const costCard = pickCheapestExtraDiscard(card.id, ctx);
        if (costCard) {
          const healVal = me.hp <= 1 ? 128 : me.hp <= 2 ? 96 : me.maxHp - me.hp >= 2 ? 66 : 36;
          const cost = evaluateKeepValue(costCard, ctx);
          const net = me.hp <= 1 ? healVal : healVal - cost * 0.65;
          if (net > 16) {
            pushCand(
              out,
              { playerId: botId, type: "PLAY_CARD", cardId: card.id, discardCardIds: [costCard.id] },
              net,
              "play_whisky"
            );
          }
        }
      }
      continue;
    }

    if (name === "TEQUILA") {
      if (hand.length >= 2) {
        const costCard = pickCheapestExtraDiscard(card.id, ctx);
        if (costCard) {
          const cost = evaluateKeepValue(costCard, ctx);
          for (const target of ctx.alivePlayers) {
            if (target.isGhost || target.hp >= target.maxHp) continue;
            if (target.id !== botId && isImmuneToCard(target, card, me, snapshot)) continue;
            const healVal = scoreHealTarget(target, ctx);
            if (healVal <= 0) continue;
            const net = healVal >= 105 ? healVal : healVal - cost * 0.65;
            if (net > 16) {
              pushCand(
                out,
                {
                  playerId: botId,
                  type: "PLAY_CARD",
                  cardId: card.id,
                  targetPlayerId: target.id,
                  discardCardIds: [costCard.id],
                },
                net,
                "play_tequila"
              );
            }
          }
        }
      }
      continue;
    }

    // 4. Manipulation brown cards (Panic!, Cat Balou, Rag Time)
    if (name === "PANIC!" || name === "CAT BALOU" || name === "RAG TIME") {
      const needsExtra = def.extraHandDiscard > 0;
      const costCard = needsExtra ? pickCheapestExtraDiscard(card.id, ctx) : null;
      if (needsExtra && !costCard) continue;
      const extraCost = costCard ? evaluateKeepValue(costCard, ctx) * 0.6 : 0;
      const isSteal = name === "PANIC!" || name === "RAG TIME";

      for (const target of ctx.alivePlayers) {
        if (target.id === botId) continue;
        if (def.targeting.distance === "EXACT_1") {
          if (calculateDistance(snapshot, me, target) !== 1) continue;
        }
        const sel = pickBestManipulationArea(target, isSteal, ctx, {
          allowHand: true,
          sourceCard: card,
        });
        if (!sel) continue;
        const net = sel.utility - extraCost;
        if (net > 16) {
          pushCand(
            out,
            {
              playerId: botId,
              type: "PLAY_CARD",
              cardId: card.id,
              targetPlayerId: target.id,
              targetArea: sel.targetArea,
              targetCardId: sel.targetCardId,
              ...(costCard ? { discardCardIds: [costCard.id] } : {}),
            },
            net + 6,
            `manip_${name.toLowerCase()}`
          );
        }
      }
      continue;
    }

    // 5. AOE brown cards (Gatling, Indians!, Brawl)
    if (name === "GATLING" || name === "INDIANS!") {
      const net = scoreAoeAttack(card, ctx);
      if (net > 18) {
        pushCand(out, { playerId: botId, type: "PLAY_CARD", cardId: card.id }, net, `aoe_${name}`);
      }
      continue;
    }

    if (name === "BRAWL") {
      if (hand.length >= 2) {
        const costCard = pickCheapestExtraDiscard(card.id, ctx);
        if (costCard) {
          const brawlVal = scoreBrawlPlay(card, ctx);
          const net = brawlVal - evaluateKeepValue(costCard, ctx) * 0.65;
          if (net > 18) {
            pushCand(
              out,
              { playerId: botId, type: "PLAY_CARD", cardId: card.id, discardCardIds: [costCard.id] },
              net,
              "play_brawl"
            );
          }
        }
      }
      continue;
    }

    // 6. Duel
    if (name === "DUEL") {
      const myBangs = countBangCardsInHand(ctx, card.id);
      for (const target of ctx.alivePlayers) {
        if (target.id === botId) continue;
        const base = scoreAttackTarget(target, ctx, { card });
        if (base <= 12) continue;
        const oppExpectedBangs = target.handCount * 0.28;
        const winAdvantage = (myBangs - oppExpectedBangs) * 16;
        // Avoid self-destructive Duel at 1 HP without Bang advantage
        if (me.hp <= 1 && myBangs < oppExpectedBangs + 0.5) continue;
        const net = base + winAdvantage;
        if (net > 18) {
          pushCand(
            out,
            { playerId: botId, type: "PLAY_CARD", cardId: card.id, targetPlayerId: target.id },
            net,
            "play_duel"
          );
        }
      }
      continue;
    }

    // 7. Punch and Springfield (do not consume BANG! limit)
    if (name === "PUNCH") {
      for (const target of ctx.alivePlayers) {
        if (target.id === botId) continue;
        if (calculateDistance(snapshot, me, target) !== 1) continue;
        const s = scoreAttackTarget(target, ctx, { card });
        if (s > 12) {
          pushCand(
            out,
            { playerId: botId, type: "PLAY_CARD", cardId: card.id, targetPlayerId: target.id },
            s + 4,
            "play_punch"
          );
        }
      }
      continue;
    }

    if (name === "SPRINGFIELD") {
      if (hand.length >= 2) {
        const costCard = pickCheapestExtraDiscard(card.id, ctx);
        if (costCard) {
          const cost = evaluateKeepValue(costCard, ctx);
          for (const target of ctx.alivePlayers) {
            if (target.id === botId) continue;
            const base = scoreAttackTarget(target, ctx, { card });
            if (base <= 12) continue;
            const lethal = target.hp <= 1;
            const net = lethal ? base + 12 : base - cost * 0.6;
            if (net > 14) {
              pushCand(
                out,
                {
                  playerId: botId,
                  type: "PLAY_CARD",
                  cardId: card.id,
                  targetPlayerId: target.id,
                  discardCardIds: [costCard.id],
                },
                net,
                "play_springfield"
              );
            }
          }
        }
      }
      continue;
    }

    // 8. BANG! (and Calamity Janet MISSED! substitute + Ricochet + Sniper)
    if (name === "BANG!" || isBangSub) {
      // Event Ricochet shot against enemy in-play card (no range restriction)
      if (eventCode === "EVENT_FOC_RICOCHET") {
        for (const target of ctx.alivePlayers) {
          if (target.id === botId) continue;
          const sel = pickBestManipulationArea(target, false, ctx, {
            allowHand: false,
            sourceCard: card,
          });
          if (sel && sel.targetArea !== "HAND" && sel.targetCardId && sel.utility > 52) {
            pushCand(
              out,
              {
                playerId: botId,
                type: "PLAY_CARD",
                cardId: card.id,
                targetPlayerId: target.id,
                targetArea: sel.targetArea,
                targetCardId: sel.targetCardId,
              },
              sel.utility - 8,
              "ricochet_bang"
            );
          }
        }
      }

      // Standard BANG! shot
      if (canBang) {
        // Reserve Calamity MISSED! when low HP and holding few defenses
        const calamityPenalty = isBangSub && me.hp <= 2 ? 26 : isBangSub ? 10 : 0;
        for (const target of ctx.alivePlayers) {
          if (target.id === botId) continue;
          if (calculateDistance(snapshot, me, target) > range) continue;
          const base = scoreAttackTarget(target, ctx, { card }) - calamityPenalty;
          if (base > 10) {
            pushCand(
              out,
              { playerId: botId, type: "PLAY_CARD", cardId: card.id, targetPlayerId: target.id },
              base,
              isBangSub ? "calamity_bang" : "play_bang"
            );
          }
        }
      }

      // Event Sniper 2-BANG! unblockable-pressure burst
      if (eventCode === "EVENT_FOC_SNIPER") {
        const secondBang = hand.find(
          (c) =>
            c.id !== card.id &&
            (norm(c.name) === "BANG!" || (norm(c.name) === "MISSED!" && isCalamity))
        );
        if (secondBang) {
          for (const target of ctx.alivePlayers) {
            if (target.id === botId) continue;
            if (calculateDistance(snapshot, me, target) > range) continue;
            const base = scoreAttackTarget(target, ctx, { card });
            const defEst = estimateTargetDefense(target, snapshot);
            if (base > 40 && (target.hp <= 1 || defEst >= 1.0)) {
              pushCand(
                out,
                {
                  playerId: botId,
                  type: "PLAY_CARD",
                  cardId: card.id,
                  targetPlayerId: target.id,
                  discardCardIds: [secondBang.id],
                },
                base + 14,
                "sniper_double_bang"
              );
            }
          }
        }
      }
    }
  }
}

// Evaluate equipping blue/green cards or playing Jail/Dynamite
function evaluateEquipOrJudgement(
  card: EngineCard,
  zone: "EQUIP_BLUE" | "EQUIP_GREEN" | "JUDGEMENT",
  ctx: BotDecisionContext,
  out: BotActionCandidate[]
): void {
  const { snapshot, me, botId } = ctx;
  const name = norm(card.name);

  if (zone === "JUDGEMENT") {
    if (name === "JAIL") {
      for (const target of ctx.alivePlayers) {
        const s = scoreJailTarget(target, ctx, card);
        if (s > 18) {
          pushCand(
            out,
            { playerId: botId, type: "PLAY_CARD", cardId: card.id, targetPlayerId: target.id },
            s + 10,
            "play_jail"
          );
        }
      }
      return;
    }

    if (name === "DYNAMITE") {
      if ((me.judgements || []).some((j) => j.type === "DYNAMITE" || norm(j.card.name) === "DYNAMITE")) {
        return;
      }
      // Play Dynamite mainly when Lucky Duke or Outlaw/Renegade wanting chaos at high HP
      const isLucky = hasSkill(me, "Lucky Duke", snapshot);
      const living = getLivingContenders(snapshot).length;
      if ((isLucky && living >= 4) || (ctx.myRole === "outlaw" && living >= 5 && me.hp >= 3)) {
        pushCand(out, { playerId: botId, type: "PLAY_CARD", cardId: card.id }, isLucky ? 42 : 24, "play_dynamite");
      }
      return;
    }
  }

  if (zone === "EQUIP_GREEN") {
    if ((me.greenCards || []).some((g) => norm(g.card.name) === name)) return;
    const base = CardRegistry.isGreenDefenseCard(card) ? 74 : 68;
    const bonus = name === "PONY EXPRESS" || name === "BIBLE" ? 14 : 0;
    pushCand(out, { playerId: botId, type: "PLAY_CARD", cardId: card.id }, base + bonus, `place_green_${name}`);
    return;
  }

  // Blue equipment
  const def = CardRegistry.get(card);
  const isWeapon = def?.slotKey === "weapon" || Boolean(card.weaponRange);

  if (!isWeapon) {
    if (name === "BARREL" && me.equipments?.barrel) return;
    if (name === "MUSTANG" && me.equipments?.horseDef) return;
    if (name === "SCOPE" && me.equipments?.horseOff) return;
    if (hasEquippedByName(me, name)) return;

    let score = name === "BARREL" ? 96 : name === "MUSTANG" || name === "HIDEOUT" ? 90 : 82;

    // Range-unlock lookahead for Scope / Binocular
    if (name === "SCOPE" || name === "BINOCULAR") {
      score += computeRangeUnlockBonus(ctx, { addedEquip: card });
    }
    pushCand(out, { playerId: botId, type: "PLAY_CARD", cardId: card.id }, score, `equip_${name}`);
    return;
  }

  // Weapon replacement rules with strict Volcanic switch guard
  const curWeapon = me.equipments?.weapon;
  if (curWeapon && norm(curWeapon.name) === name) return;

  const curRange = getWeaponRange(snapshot, me);
  const newRange = card.weaponRange ?? def?.weaponRange ?? 1;
  const bangCount = countBangCardsInHand(ctx);
  const hasEnemyAtDist1 = ctx.alivePlayers.some(
    (p) => p.id !== botId && computeHostility(p, ctx) > 25 && calculateDistance(snapshot, me, p) <= 1
  );

  if (name === "VOLCANIC") {
    // Only replace long-range weapon with Volcanic when dist-1 enemy exists and >= 2 BANGs ready
    if (curRange >= 2 && !(hasEnemyAtDist1 && bangCount >= 2)) {
      return;
    }
    if (!hasEnemyAtDist1 && bangCount < 2) {
      return;
    }
    const burstScore = hasEnemyAtDist1 && bangCount >= 2 ? 98 + bangCount * 10 : 52;
    pushCand(out, { playerId: botId, type: "PLAY_CARD", cardId: card.id }, burstScore, "equip_volcanic");
    return;
  }

  // If currently holding Volcanic with active dist-1 burst, fire first before swapping
  const curIsVolcanic = curWeapon && norm(curWeapon.name) === "VOLCANIC";
  if (curIsVolcanic && hasEnemyAtDist1 && bangCount >= 2) {
    return;
  }

  if (newRange > curRange) {
    const unlock = computeRangeUnlockBonus(ctx, { overrideWeapon: card });
    const score = 68 + newRange * 6 + unlock;
    pushCand(out, { playerId: botId, type: "PLAY_CARD", cardId: card.id }, score, `equip_weapon_${name}`);
  }
}

// Collect active character skills (Chuck, Jose, Sid, Doc Holyday)
function collectActiveSkillCandidates(
  ctx: BotDecisionContext,
  out: BotActionCandidate[]
): void {
  const { snapshot, me, hand, botId, turnMemory } = ctx;

  // Chuck Wengam: -1 HP -> +2 cards
  if (hasSkill(me, "Chuck Wengam", snapshot) && !me.isGhost) {
    const hasBeer = canUseBeerHeal(snapshot) && hand.some((c) => norm(c.name) === "BEER");
    if (me.hp >= 3 || (me.hp === 2 && hasBeer && hand.length <= 2)) {
      const score = me.hp >= 4 ? 86 : me.hp === 3 && hand.length <= 3 ? 64 : 38;
      pushCand(
        out,
        { playerId: botId, type: "USE_ACTIVE_SKILL", payload: { skillType: "CHUCK_WENGAM_HP" } },
        score,
        "skill_chuck_wengam"
      );
    }
  }

  // Jose Delgado: discard 1 blue card -> +2 cards (max 2/turn)
  if (hasSkill(me, "Jose Delgado", snapshot) && turnMemory.joseDelgadoUsed < 2) {
    const blueCards = hand.filter((c) => c.border === "blue");
    if (blueCards.length > 0) {
      const cheapest = [...blueCards].sort(
        (a, b) => evaluateBlueCardForJose(a, ctx) - evaluateBlueCardForJose(b, ctx)
      )[0];
      const cost = evaluateBlueCardForJose(cheapest, ctx);
      if (cost < 55) {
        pushCand(
          out,
          {
            playerId: botId,
            type: "USE_ACTIVE_SKILL",
            cardId: cheapest.id,
            payload: { skillType: "JOSE_DELGADO_DRAW", cardId: cheapest.id },
          },
          104 - cost,
          "skill_jose_delgado"
        );
      }
    }
  }

  // Sid Ketchum: discard 2 cards -> +1 HP
  if (hasSkill(me, "Sid Ketchum", snapshot) && !me.isGhost && me.hp < me.maxHp && hand.length >= 2) {
    const sorted = [...hand].sort(
      (a, b) => evaluateKeepValue(a, ctx) - evaluateKeepValue(b, ctx)
    );
    const pairCost = evaluateKeepValue(sorted[0], ctx) + evaluateKeepValue(sorted[1], ctx);
    const healWorth = me.hp <= 1 ? 162 : me.hp <= 2 ? 115 : hand.length > me.hp + 1 ? 95 : 70;
    if (healWorth - pairCost > 8) {
      pushCand(
        out,
        {
          playerId: botId,
          type: "USE_ACTIVE_SKILL",
          discardCardIds: [sorted[0].id, sorted[1].id],
          payload: {
            skillType: "SID_KETCHUM_HEAL",
            discardCardIds: [sorted[0].id, sorted[1].id],
          },
        },
        healWorth - pairCost * 0.5,
        "skill_sid_ketchum"
      );
    }
  }

  // Doc Holyday: discard 2 cards -> free BANG! (max 1/turn, non-diamond vs Apache Kid)
  if (hasSkill(me, "Doc Holyday", snapshot) && turnMemory.docHolydayUsed < 1 && hand.length >= 2) {
    const range = getWeaponRange(snapshot, me);
    const sorted = [...hand].sort(
      (a, b) => evaluateKeepValue(a, ctx) - evaluateKeepValue(b, ctx)
    );

    for (const target of ctx.alivePlayers) {
      if (target.id === botId) continue;
      if (calculateDistance(snapshot, me, target) > range) continue;

      const pair = pickDocHolydayPair(sorted, target, ctx);
      if (!pair) continue;

      const base = scoreAttackTarget(target, ctx);
      if (base <= 20) continue;

      const pairCost = evaluateKeepValue(pair[0], ctx) + evaluateKeepValue(pair[1], ctx);
      const lethal = target.hp <= 1;
      const net = lethal ? base + 15 : base - pairCost * 0.52;
      if (net > 16) {
        pushCand(
          out,
          {
            playerId: botId,
            type: "USE_ACTIVE_SKILL",
            targetPlayerId: target.id,
            discardCardIds: [pair[0].id, pair[1].id],
            payload: {
              skillType: "DOC_HOLYDAY_BANG",
              targetPlayerId: target.id,
              discardCardIds: [pair[0].id, pair[1].id],
            },
          },
          net,
          "skill_doc_holyday"
        );
      }
    }
  }
}

// Pick Doc Holyday discard pair (prefer non-Diamond vs Apache Kid when available)
function pickDocHolydayPair(
  sortedHand: EngineCard[],
  target: SanitizedPlayerState,
  ctx: BotDecisionContext
): [EngineCard, EngineCard] | null {
  if (sortedHand.length < 2) return null;
  if (hasSkill(target, "Apache Kid", ctx.snapshot)) {
    const firstNonDiamond = sortedHand.find(
      (c) => getEffectiveSuit(c, ctx.snapshot) !== "diamonds"
    );
    if (firstNonDiamond) {
      const partner = sortedHand.find((c) => c.id !== firstNonDiamond.id);
      if (partner) return [firstNonDiamond, partner];
    }
  }
  return [sortedHand[0], sortedHand[1]];
}

// Compute weapon and scope unlock bonus
function computeRangeUnlockBonus(
  ctx: BotDecisionContext,
  mod: { addedEquip?: EngineCard; overrideWeapon?: EngineCard }
): number {
  const { snapshot, me, botId } = ctx;
  const readyAttacks = countBangCardsInHand(ctx);
  if (readyAttacks === 0) return 0;

  const curRange = getWeaponRange(snapshot, me);
  const nextRange = mod.overrideWeapon
    ? getWeaponRange(snapshot, me, mod.overrideWeapon)
    : curRange;

  let unlockedBest = 0;
  for (const target of ctx.alivePlayers) {
    if (target.id === botId) continue;
    const h = computeHostility(target, ctx);
    if (h <= 25) continue;
    const curDist = calculateDistance(snapshot, me, target);
    const nextDist = mod.addedEquip
      ? calculateDistance(snapshot, me, target, { addedAttackerEquip: mod.addedEquip })
      : curDist;
    if (curDist > curRange && nextDist <= nextRange) {
      unlockedBest = Math.max(unlockedBest, 42 + Math.min(2, readyAttacks) * 16 + (target.hp <= 1 ? 20 : 0));
    }
  }
  return ctx.difficulty === "normal" ? unlockedBest * 0.4 : unlockedBest;
}

// Score net value of Gatling / Indians! / Howitzer across all living targets
function scoreAoeAttack(card: EngineCard, ctx: BotDecisionContext): number {
  const { snapshot, me, botId } = ctx;
  let total = 0;
  let hitEnemies = 0;

  for (const target of ctx.alivePlayers) {
    if (target.id === botId) continue;
    if (isImmuneToCard(target, card, me, snapshot)) continue;

    const h = computeHostility(target, ctx);
    const b = ctx.beliefs.get(target.id) ?? { deputy: 0.25, outlaw: 0.5, renegade: 0.25 };
    const pDeputy = target.role === "deputy" ? 1 : target.role === "UNKNOWN" ? b.deputy : 0;
    const estOutlaws = estimateLivingRoleCount(ctx, "outlaw");

    // Hard safety blocks on AOE causing catastrophic lethal damage
    if (ctx.myRole === "sheriff" && target.hp <= 1 && pDeputy >= 0.35) {
      return -200;
    }
    if (ctx.myRole === "deputy" && target.isSheriff && target.hp <= 1) {
      return -200;
    }
    if (ctx.myRole === "renegade" && target.isSheriff && target.hp <= 1 && estOutlaws >= 0.5) {
      return -250;
    }

    if (h > 20) {
      hitEnemies += 1;
      total += h * 0.48 + (target.hp <= 1 ? 18 : 0);
    } else if (h < -20) {
      total += h * (target.hp <= 2 ? 0.75 : 0.45);
    }
  }

  return hitEnemies > 0 ? total : -50;
}

// Score net value of Brawl across targets with cards
function scoreBrawlPlay(card: EngineCard, ctx: BotDecisionContext): number {
  const { snapshot, me, botId } = ctx;
  let total = 0;
  for (const target of ctx.alivePlayers) {
    if (target.id === botId) continue;
    if (isImmuneToCard(target, card, me, snapshot)) continue;
    const sel = pickBestManipulationArea(target, false, ctx, { allowHand: true, sourceCard: card });
    if (sel) {
      total += sel.utility * 0.65;
    }
  }
  return total;
}

// Score net value of Saloon across all injured players
function scoreSaloonPlay(card: EngineCard, ctx: BotDecisionContext): number {
  const { snapshot, me, botId } = ctx;
  let total = 0;
  for (const target of ctx.alivePlayers) {
    if (target.isGhost || target.hp >= target.maxHp) continue;
    if (target.id !== botId && isImmuneToCard(target, card, me, snapshot)) continue;
    if (target.id === botId) {
      total += me.hp <= 1 ? 95 : me.hp <= 2 ? 62 : 24;
    } else {
      const h = computeHostility(target, ctx);
      if (h < -25) {
        total += target.hp <= 2 ? 65 : 30;
      } else if (h > 25) {
        total -= target.hp <= 2 ? 52 : 28;
      }
    }
  }
  return total;
}

function pickCheapestExtraDiscard(
  excludeCardId: string,
  ctx: BotDecisionContext
): EngineCard | null {
  const others = ctx.hand.filter((c) => c.id !== excludeCardId);
  if (others.length === 0) return null;
  others.sort((a, b) => evaluateKeepValue(a, ctx) - evaluateKeepValue(b, ctx));
  return others[0];
}

function countBangCardsInHand(
  ctx: BotDecisionContext,
  excludeId?: string
): number {
  const isCalamity = hasSkill(ctx.me, "Calamity Janet", ctx.snapshot);
  return ctx.hand.filter((c) => {
    if (c.id === excludeId) return false;
    const n = norm(c.name);
    return n === "BANG!" || (n === "MISSED!" && isCalamity);
  }).length;
}

function pushCand(
  out: BotActionCandidate[],
  command: PlayerCommand,
  score: number,
  reason: string
): void {
  out.push({
    command,
    score,
    reason,
    signature: buildCommandSignature(command),
  });
}
