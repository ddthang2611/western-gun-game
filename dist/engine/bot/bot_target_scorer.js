"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.get3PQuarryRole = get3PQuarryRole;
exports.estimateLivingRoleCount = estimateLivingRoleCount;
exports.computeThreat = computeThreat;
exports.computeHostility = computeHostility;
exports.scoreAttackTarget = scoreAttackTarget;
exports.scoreJailTarget = scoreJailTarget;
exports.scoreHealTarget = scoreHealTarget;
exports.pickBestManipulationArea = pickBestManipulationArea;
const bot_state_utils_1 = require("./bot_state_utils");
const bot_card_evaluator_1 = require("./bot_card_evaluator");
// Resolve circular quarry role in 3-player variant
function get3PQuarryRole(myRole) {
    if (myRole === "deputy")
        return "renegade";
    if (myRole === "renegade")
        return "outlaw";
    if (myRole === "outlaw")
        return "deputy";
    return "outlaw";
}
// Estimate living count for hidden role across table
function estimateLivingRoleCount(ctx, role) {
    let sum = 0;
    for (const p of ctx.alivePlayers) {
        if (p.isGhost)
            continue;
        if (p.id === ctx.botId) {
            if (ctx.myRole === role)
                sum += 1;
        }
        else if (p.role === role) {
            sum += 1;
        }
        else if (p.role === "UNKNOWN") {
            sum += ctx.beliefs.get(p.id)?.[role] ?? 0;
        }
    }
    return sum;
}
// Compute player threat index T(i)
function computeThreat(player, snapshot) {
    const weaponRange = (0, bot_state_utils_1.getWeaponRange)(snapshot, player);
    const hasVolcanic = (player.equipments?.weapon?.name || "").toUpperCase() === "VOLCANIC";
    const weaponBonus = hasVolcanic ? 1.15 : weaponRange * 0.22;
    let equipBonus = 0;
    if (player.equipments?.barrel)
        equipBonus += 0.6;
    if (player.equipments?.horseDef)
        equipBonus += 0.5;
    if (player.equipments?.horseOff)
        equipBonus += 0.35;
    equipBonus += (player.greenCards?.length || 0) * 0.3;
    let heroBonus = 0;
    if ((0, bot_state_utils_1.hasSkill)(player, "Willy the Kid", snapshot) ||
        (0, bot_state_utils_1.hasSkill)(player, "Slab the Killer", snapshot) ||
        (0, bot_state_utils_1.hasSkill)(player, "Bill Noface", snapshot) ||
        (0, bot_state_utils_1.hasSkill)(player, "Chuck Wengam", snapshot)) {
        heroBonus += 0.55;
    }
    return (1.0 +
        0.35 * Math.max(0, player.hp) +
        0.25 * Math.min(player.handCount, 6) +
        weaponBonus +
        equipBonus +
        heroBonus);
}
// Compute role-specific hostility H(i) in [-100, +100]
function computeHostility(target, ctx) {
    if (target.id === ctx.botId || target.isDead)
        return -100;
    const contenders = (0, bot_state_utils_1.getLivingContenders)(ctx.snapshot);
    // 3-player quarry rules
    if (ctx.snapshot.is3PlayerVariant) {
        if (contenders.length <= 2)
            return 100;
        const quarry = get3PQuarryRole(ctx.myRole);
        return target.role === quarry ? 100 : 10;
    }
    // Last two contenders in standard mode
    if (contenders.length <= 2) {
        if (ctx.myRole === "deputy" && target.isSheriff)
            return -100;
        return 100;
    }
    const b = ctx.beliefs.get(target.id) ?? { deputy: 0.25, outlaw: 0.5, renegade: 0.25 };
    const pDeputy = target.role === "deputy" ? 1 : target.role === "UNKNOWN" ? b.deputy : 0;
    const pOutlaw = target.role === "outlaw" ? 1 : target.role === "UNKNOWN" ? b.outlaw : 0;
    const pRenegade = target.role === "renegade" ? 1 : target.role === "UNKNOWN" ? b.renegade : 0;
    const estOutlaws = estimateLivingRoleCount(ctx, "outlaw");
    if (ctx.myRole === "sheriff") {
        const renWeight = estOutlaws < 0.25 ? 100 : 55;
        let h = 100 * pOutlaw + renWeight * pRenegade - 95 * pDeputy;
        // Detect disguised Renegade late game when Outlaws are gone
        if (estOutlaws < 0.25 && contenders.length <= 3) {
            const swing = ctx.swingScores.get(target.id) ?? 0;
            if (swing > 0.3 && target.hp >= 2) {
                h += Math.min(25, swing * 12);
            }
        }
        return clamp(h, -100, 100);
    }
    if (ctx.myRole === "deputy") {
        if (target.isSheriff)
            return -100;
        const h = 100 * pOutlaw + 65 * pRenegade - 85 * pDeputy;
        return clamp(h, -100, 100);
    }
    if (ctx.myRole === "outlaw") {
        if (target.isSheriff)
            return 100;
        const h = 75 * pDeputy + 45 * pRenegade - 70 * pOutlaw;
        return clamp(h, -100, 100);
    }
    // Renegade two-phase equilibrium strategy
    if (ctx.myRole === "renegade") {
        if (target.isSheriff) {
            if (estOutlaws >= 0.8 && target.hp <= 2)
                return -80;
            if (estOutlaws >= 0.8 && target.hp === 3)
                return -25;
            if (estOutlaws <= 1.2 && target.hp >= 4)
                return 30;
            return -15;
        }
        const h = 95 * pOutlaw + 80 * pDeputy + 20 * pRenegade;
        return clamp(h, -100, 100);
    }
    return 20;
}
// Compute full attack priority score with safety locks
function scoreAttackTarget(target, ctx, options = {}) {
    if (target.id === ctx.botId || target.isDead || (!target.isGhost && target.hp <= 0)) {
        return -Infinity;
    }
    if (options.card && (0, bot_state_utils_1.isImmuneToCard)(target, options.card, ctx.me, ctx.snapshot)) {
        return -Infinity;
    }
    const contenders = (0, bot_state_utils_1.getLivingContenders)(ctx.snapshot);
    const maxThreat = Math.max(1, ...contenders.map((p) => computeThreat(p, ctx.snapshot)));
    const threatNorm = computeThreat(target, ctx.snapshot) / maxThreat;
    let hostility = computeHostility(target, ctx);
    const estOutlaws = estimateLivingRoleCount(ctx, "outlaw");
    const isPotentialKill = options.isLethalAttempt ?? target.hp <= 1;
    const targetDef = (0, bot_card_evaluator_1.estimateTargetDefense)(target, ctx.snapshot);
    const b = ctx.beliefs.get(target.id) ?? { deputy: 0.25, outlaw: 0.5, renegade: 0.25 };
    const pDeputy = target.role === "deputy" ? 1 : target.role === "UNKNOWN" ? b.deputy : 0;
    const pOutlaw = target.role === "outlaw" ? 1 : target.role === "UNKNOWN" ? b.outlaw : 0;
    let finishBonus = 0;
    let penalty = 0;
    // 3P Quarry guard against killing non-quarry
    if (ctx.snapshot.is3PlayerVariant && contenders.length === 3) {
        const quarryRole = get3PQuarryRole(ctx.myRole);
        if (target.role === quarryRole) {
            if (isPotentialKill)
                finishBonus += 50;
        }
        else if (isPotentialKill) {
            const quarryPlayer = contenders.find((p) => p.role === quarryRole);
            const quarryStrong = quarryPlayer ? quarryPlayer.hp >= 2 : true;
            if (quarryStrong)
                penalty += 160;
        }
    }
    else if (ctx.snapshot.is3PlayerVariant && contenders.length === 2) {
        if (isPotentialKill)
            finishBonus += 80;
    }
    // Sheriff anti-Deputy kill lock
    if (ctx.myRole === "sheriff" && isPotentialKill && pDeputy >= 0.28) {
        penalty += 180;
    }
    // Renegade early Sheriff kill lock while Outlaws live
    if (ctx.myRole === "renegade" &&
        target.isSheriff &&
        contenders.length >= 3 &&
        estOutlaws > 0.25) {
        if (target.hp <= 1) {
            penalty += 300;
        }
        else if (target.hp === 2 && estOutlaws >= 0.8) {
            penalty += 150;
        }
    }
    // Outlaw tactical bounty exception on dying fellow Outlaw
    if (ctx.myRole === "outlaw" && !target.isSheriff && pOutlaw >= 0.5 && isPotentialKill) {
        const sheriff = (0, bot_state_utils_1.getPlayerById)(ctx.snapshot, ctx.snapshot.sheriffId);
        const sheriffKillable = Boolean(sheriff && !sheriff.isDead && sheriff.hp <= 2);
        if (sheriffKillable && targetDef <= 0.6) {
            hostility = 45;
            finishBonus += 35;
        }
    }
    // Standard finishing bonus on clear enemies
    if (hostility >= 50 && isPotentialKill) {
        finishBonus += 42 - Math.min(24, targetDef * 12);
    }
    else if (hostility >= 50 && target.hp <= 2) {
        finishBonus += 14;
    }
    // Penalty for hitting El Gringo when holding few critical cards
    if (!options.ignoreElGringo && (0, bot_state_utils_1.hasSkill)(target, "El Gringo", ctx.snapshot)) {
        if (ctx.hand.length <= 2) {
            const maxKeep = Math.max(0, ...ctx.hand.map((c) => (0, bot_card_evaluator_1.evaluateKeepValue)(c, ctx)));
            if (maxKeep >= 78 && !isPotentialKill) {
                penalty += 26;
            }
        }
    }
    // Slightly prefer softer targets when equal hostility
    const defensePenalty = Math.min(18, targetDef * 6);
    return hostility * (0.6 + 0.4 * threatNorm) + finishBonus - penalty - defensePenalty;
}
// Score Jail target (forbids Sheriff in 4-8P)
function scoreJailTarget(target, ctx, jailCard) {
    if (target.id === ctx.botId || target.isDead || target.isGhost)
        return -Infinity;
    // Engine forbids putting Sheriff in Jail
    if (target.isSheriff)
        return -Infinity;
    if ((target.judgements || []).some((j) => j.type === "JAIL"))
        return -Infinity;
    if ((0, bot_state_utils_1.isImmuneToCard)(target, jailCard, ctx.me, ctx.snapshot))
        return -Infinity;
    const threat = computeThreat(target, ctx.snapshot);
    if (ctx.snapshot.is3PlayerVariant) {
        const h = computeHostility(target, ctx);
        return h * 0.9 + threat * 12;
    }
    const b = ctx.beliefs.get(target.id) ?? { deputy: 0.25, outlaw: 0.5, renegade: 0.25 };
    const pDeputy = target.role === "deputy" ? 1 : target.role === "UNKNOWN" ? b.deputy : 0;
    const pRenegade = target.role === "renegade" ? 1 : target.role === "UNKNOWN" ? b.renegade : 0;
    if (ctx.myRole === "outlaw") {
        return 80 * pDeputy + 50 * pRenegade + 16 * threat;
    }
    const h = computeHostility(target, ctx);
    if (h <= 5)
        return -100;
    return h * 0.95 + 14 * threat;
}
// Score heal target for Tequila or Blood Brothers
function scoreHealTarget(target, ctx) {
    if (target.isDead || target.isGhost || target.hp >= target.maxHp)
        return -Infinity;
    if (target.id === ctx.botId) {
        if (ctx.me.hp <= 1)
            return 110;
        if (ctx.me.hp <= 2)
            return 80;
        return 42;
    }
    if (ctx.snapshot.is3PlayerVariant)
        return -100;
    const estOutlaws = estimateLivingRoleCount(ctx, "outlaw");
    if (ctx.myRole === "deputy" && target.isSheriff) {
        if (target.hp <= 1)
            return 125;
        if (target.hp <= 2)
            return 96;
        return 52;
    }
    if (ctx.myRole === "renegade" && target.isSheriff && estOutlaws >= 0.8) {
        if (target.hp <= 1)
            return 105;
        if (target.hp <= 2)
            return 68;
        return -20;
    }
    const h = computeHostility(target, ctx);
    if (h <= -60 && target.hp <= 2) {
        return 65;
    }
    return -100;
}
// Pick best card area for steal/destroy with range-unlock lookahead
function pickBestManipulationArea(target, isSteal, ctx, options = {}) {
    const allowHand = options.allowHand ?? true;
    if (options.sourceCard && (0, bot_state_utils_1.isImmuneToCard)(target, options.sourceCard, ctx.me, ctx.snapshot)) {
        return null;
    }
    const hostility = computeHostility(target, ctx);
    const isEnemy = hostility > 15;
    const inPlay = (0, bot_state_utils_1.getAllInPlayCards)(target);
    let best = null;
    for (const entry of inPlay) {
        let base = (0, bot_card_evaluator_1.evaluateInPlayCardValue)(entry.card, entry.area, target, isEnemy);
        if (isSteal && isEnemy) {
            base += (0, bot_card_evaluator_1.evaluateKeepValue)(entry.card, ctx) * 0.25;
        }
        // Lookahead bonus when stripping Mustang/Hideout/Barrel/Bible unlocks attacks
        if (isEnemy) {
            const unlockBonus = computeStripUnlockBonus(target, entry.card, ctx);
            base += unlockBonus;
        }
        const weighted = isEnemy
            ? base * (0.55 + 0.45 * Math.min(1, hostility / 100))
            : base;
        if (!best || weighted > best.utility) {
            best = {
                targetArea: entry.area,
                targetCardId: entry.card.id,
                utility: weighted,
            };
        }
    }
    if (allowHand && target.handCount > 0) {
        let handUtil = isEnemy ? 58 + (target.handCount <= 2 ? 16 : 0) : -65;
        if (isSteal && isEnemy)
            handUtil += 18;
        const weighted = isEnemy
            ? handUtil * (0.55 + 0.45 * Math.min(1, hostility / 100))
            : handUtil;
        if (!best || weighted > best.utility) {
            best = {
                targetArea: "HAND",
                utility: weighted,
            };
        }
    }
    return best;
}
// Estimate strip unlock bonus
function computeStripUnlockBonus(target, removedCard, ctx) {
    const name = (removedCard.name || "").toUpperCase();
    const readyBangCount = ctx.hand.filter((c) => {
        const n = c.name.toUpperCase();
        return (n === "BANG!" ||
            n === "PUNCH" ||
            (n === "MISSED!" && (0, bot_state_utils_1.hasSkill)(ctx.me, "Calamity Janet", ctx.snapshot)));
    }).length;
    if (readyBangCount === 0)
        return 0;
    const curDist = (0, bot_state_utils_1.calculateDistance)(ctx.snapshot, ctx.me, target);
    const newDist = (0, bot_state_utils_1.calculateDistance)(ctx.snapshot, ctx.me, target, {
        removedDefenderCardId: removedCard.id,
    });
    const range = (0, bot_state_utils_1.getWeaponRange)(ctx.snapshot, ctx.me);
    let bonus = 0;
    if (curDist > range && newDist <= range) {
        bonus += 38 + Math.min(2, readyBangCount) * 14;
    }
    else if (curDist > 1 && newDist === 1 && ctx.hand.some((c) => c.name.toUpperCase() === "PANIC!")) {
        bonus += 24;
    }
    if (name === "BARREL" || name === "BIBLE") {
        bonus += 22 + (target.hp <= 2 ? 16 : 0);
    }
    return ctx.difficulty === "normal" ? bonus * 0.4 : bonus;
}
function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}
