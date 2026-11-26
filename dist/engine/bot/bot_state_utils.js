"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPlayerById = getPlayerById;
exports.getAlivePlayers = getAlivePlayers;
exports.getLivingContenders = getLivingContenders;
exports.hasSkill = hasSkill;
exports.isEquipmentEffective = isEquipmentEffective;
exports.getEffectiveSuit = getEffectiveSuit;
exports.isImmuneToCard = isImmuneToCard;
exports.getEquippedBlueCards = getEquippedBlueCards;
exports.hasEquippedByName = hasEquippedByName;
exports.getAllInPlayCards = getAllInPlayCards;
exports.calculateDistance = calculateDistance;
exports.getWeaponRange = getWeaponRange;
exports.getBangLimit = getBangLimit;
exports.isCardBlockedByEvent = isCardBlockedByEvent;
exports.canUseBeerHeal = canUseBeerHeal;
exports.isHandMissedCard = isHandMissedCard;
exports.isHandBangCard = isHandBangCard;
exports.buildCommandSignature = buildCommandSignature;
const card_registry_1 = require("../cards/card_registry");
function normalizeName(name) {
    const upper = (name || "").trim().toUpperCase();
    if (upper === "BINOCULARS")
        return "BINOCULAR";
    return upper;
}
// Find player in sanitized snapshot
function getPlayerById(snapshot, playerId) {
    if (!playerId)
        return undefined;
    return snapshot.players.find((p) => p.id === playerId);
}
// Get living players sorted by seat
function getAlivePlayers(snapshot, includeGhosts = true) {
    return snapshot.players
        .filter((p) => !p.isDead && (includeGhosts ? p.hp > 0 || p.isGhost : !p.isGhost && p.hp > 0))
        .sort((a, b) => a.seatIndex - b.seatIndex);
}
// Get non-ghost living contenders
function getLivingContenders(snapshot) {
    return getAlivePlayers(snapshot, false);
}
// Check character skill with hangover guard
function hasSkill(player, skillName, snapshot) {
    if (!player)
        return false;
    if (snapshot.activeEvent?.effectCode === "EVENT_HN_HANGOVER")
        return false;
    const target = skillName.trim().toLowerCase();
    const hasBase = (player.characters || []).some((c) => c.name.trim().toLowerCase() === target);
    if (hasBase)
        return true;
    if (player.copiedCharacter?.name.trim().toLowerCase() === target)
        return true;
    return false;
}
// Check equipment active status
function isEquipmentEffective(target, turnPlayer, snapshot) {
    if (snapshot.activeEvent?.effectCode === "EVENT_FOC_LASSO")
        return false;
    if (turnPlayer &&
        turnPlayer.id !== target.id &&
        hasSkill(turnPlayer, "Belle Star", snapshot)) {
        return false;
    }
    return true;
}
// Resolve card suit under active event
function getEffectiveSuit(card, snapshot) {
    const code = snapshot.activeEvent?.effectCode;
    if (code === "EVENT_HN_BLESSING")
        return "hearts";
    if (code === "EVENT_HN_CURSE")
        return "spades";
    return card.suit;
}
// Check Apache Kid diamond immunity
function isImmuneToCard(target, card, attacker, snapshot) {
    if (target.id === attacker.id)
        return false;
    if (!hasSkill(target, "Apache Kid", snapshot))
        return false;
    return getEffectiveSuit(card, snapshot) === "diamonds";
}
// List all equipped blue cards
function getEquippedBlueCards(player) {
    const eq = player.equipments || {};
    const list = [];
    if (eq.weapon)
        list.push(eq.weapon);
    if (eq.horseDef)
        list.push(eq.horseDef);
    if (eq.horseOff)
        list.push(eq.horseOff);
    if (eq.barrel)
        list.push(eq.barrel);
    if (eq.extra)
        list.push(eq.extra);
    if (Array.isArray(eq.extras)) {
        for (const c of eq.extras) {
            if (c && !list.some((x) => x.id === c.id))
                list.push(c);
        }
    }
    return list;
}
// Check duplicate equipped card name
function hasEquippedByName(player, cardName) {
    const target = normalizeName(cardName);
    return getEquippedBlueCards(player).some((c) => normalizeName(c.name) === target);
}
// List all cards in front of player
function getAllInPlayCards(player) {
    const entries = [];
    for (const card of getEquippedBlueCards(player)) {
        entries.push({ area: "EQUIPMENT", card });
    }
    for (const g of player.greenCards || []) {
        entries.push({
            area: "GREEN",
            card: g.card,
            isDelay: g.isDelay,
            greenEntryId: g.id,
        });
    }
    for (const j of player.judgements || []) {
        entries.push({ area: "JUDGEMENT", card: j.card });
    }
    return entries;
}
// Calculate distance with optional hypothetical overrides
function calculateDistance(snapshot, attacker, defender, override) {
    if (attacker.id === defender.id)
        return 0;
    const alive = getAlivePlayers(snapshot, true);
    const fromIdx = alive.findIndex((p) => p.id === attacker.id);
    const toIdx = alive.findIndex((p) => p.id === defender.id);
    if (fromIdx === -1 || toIdx === -1)
        return Infinity;
    const isAmbush = snapshot.activeEvent?.effectCode === "EVENT_FOC_AMBUSH";
    const count = alive.length;
    const diff = Math.abs(fromIdx - toIdx);
    const baseDistance = isAmbush ? 1 : Math.min(diff, count - diff);
    const turnPlayer = getPlayerById(snapshot, snapshot.turnPlayerId);
    let defMod = 0;
    if (isEquipmentEffective(defender, turnPlayer, snapshot)) {
        const defCards = getEquippedBlueCards(defender).filter((c) => c.id !== override?.removedDefenderCardId);
        const hasMustang = defCards.some((c) => normalizeName(c.name) === "MUSTANG");
        const hasHideout = defCards.some((c) => normalizeName(c.name) === "HIDEOUT");
        if (hasMustang)
            defMod += 1;
        if (hasHideout)
            defMod += 1;
    }
    if (!isAmbush && hasSkill(defender, "Paul Regret", snapshot)) {
        defMod += 1;
    }
    let offMod = 0;
    if (isEquipmentEffective(attacker, turnPlayer, snapshot)) {
        const offCards = [...getEquippedBlueCards(attacker)];
        if (override?.addedAttackerEquip) {
            offCards.push(override.addedAttackerEquip);
        }
        const hasScope = offCards.some((c) => normalizeName(c.name) === "SCOPE");
        const hasBinocular = offCards.some((c) => normalizeName(c.name) === "BINOCULAR");
        if (hasScope)
            offMod += 1;
        if (hasBinocular)
            offMod += 1;
    }
    if (!isAmbush && hasSkill(attacker, "Rose Doolan", snapshot)) {
        offMod += 1;
    }
    return Math.max(1, baseDistance + defMod - offMod);
}
// Get effective attacker weapon range
function getWeaponRange(snapshot, attacker, overrideWeapon) {
    const turnPlayer = getPlayerById(snapshot, snapshot.turnPlayerId);
    const weapon = overrideWeapon ?? attacker.equipments?.weapon;
    if (weapon && isEquipmentEffective(attacker, turnPlayer, snapshot)) {
        return weapon.weaponRange || 1;
    }
    return 1;
}
// Get allowed BANG! count per turn
function getBangLimit(snapshot, player) {
    const code = snapshot.activeEvent?.effectCode;
    if (code === "EVENT_HN_THE_SERMON" && snapshot.turnPlayerId === player.id) {
        return 0;
    }
    const turnPlayer = getPlayerById(snapshot, snapshot.turnPlayerId);
    const hasVolcanic = normalizeName(player.equipments?.weapon?.name || "") === "VOLCANIC" &&
        isEquipmentEffective(player, turnPlayer, snapshot);
    let baseLimit = hasVolcanic || hasSkill(player, "Willy the Kid", snapshot) ? Infinity : 1;
    if (code === "EVENT_HN_SHOOTOUT") {
        baseLimit = Math.max(baseLimit, 2);
    }
    return baseLimit;
}
// Check if active event blocks playing card
function isCardBlockedByEvent(snapshot, player, card) {
    const code = snapshot.activeEvent?.effectCode;
    const name = normalizeName(card.name);
    if (code === "EVENT_HN_THE_SERMON" && snapshot.turnPlayerId === player.id) {
        if (name === "BANG!")
            return true;
        if (name === "MISSED!" && hasSkill(player, "Calamity Janet", snapshot))
            return true;
    }
    if (code === "EVENT_HN_THE_REVEREND" && name === "BEER") {
        return true;
    }
    if (code === "EVENT_FOC_THE_JUDGE") {
        const def = card_registry_1.CardRegistry.get(card);
        const isInPlay = def
            ? card_registry_1.CardRegistry.isEquippableCard(card)
            : card.border === "blue" || card.border === "green";
        if (isInPlay)
            return true;
    }
    return false;
}
// Check if Beer heal is permitted
function canUseBeerHeal(snapshot) {
    if (snapshot.activeEvent?.effectCode === "EVENT_HN_THE_REVEREND")
        return false;
    return getLivingContenders(snapshot).length > 2;
}
// Check if card can act as Missed!
function isHandMissedCard(card, player, snapshot, reactionType) {
    const name = normalizeName(card.name);
    if (name === "MISSED!")
        return true;
    if (name === "DODGE" && reactionType !== "EVENT_RUSSIAN_ROULETTE")
        return true;
    if (name === "BANG!" &&
        reactionType !== "EVENT_RUSSIAN_ROULETTE" &&
        hasSkill(player, "Calamity Janet", snapshot)) {
        return true;
    }
    if (reactionType !== "EVENT_RUSSIAN_ROULETTE" &&
        hasSkill(player, "Elena Fuente", snapshot)) {
        return true;
    }
    return false;
}
// Check if card can act as BANG! in reaction
function isHandBangCard(card, player, snapshot) {
    const name = normalizeName(card.name);
    if (name === "BANG!")
        return true;
    if (name === "MISSED!" && hasSkill(player, "Calamity Janet", snapshot)) {
        return true;
    }
    return false;
}
// Build stable deduplication signature for command
function buildCommandSignature(cmd) {
    const discards = (cmd.discardCardIds || []).join(",");
    const chars = (cmd.characterIds || []).join(",");
    const action = cmd.payload?.action ?? cmd.payload?.choice ?? cmd.payload?.skillType ?? "";
    return [
        cmd.type,
        cmd.cardId ?? "",
        cmd.greenCardId ?? "",
        cmd.targetPlayerId ?? "",
        cmd.targetArea ?? "",
        cmd.targetCardId ?? "",
        discards,
        chars,
        String(action),
    ].join("|");
}
