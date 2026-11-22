"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeEquipName = normalizeEquipName;
exports.getAllEquippedCards = getAllEquippedCards;
exports.hasEquippedCardByName = hasEquippedCardByName;
exports.hasBarrelCard = hasBarrelCard;
exports.removeEquippedCardById = removeEquippedCardById;
exports.hasBlueCardInPlay = hasBlueCardInPlay;
exports.countPlayerTotalCards = countPlayerTotalCards;
exports.hasTargetCardInArea = hasTargetCardInArea;
exports.pickFirstTargetCard = pickFirstTargetCard;
// Normalize paired extra equipment names
function normalizeEquipName(name) {
    return name === "BINOCULARS" ? "BINOCULAR" : name;
}
// Collect unique equipped cards on player
function getAllEquippedCards(player) {
    const eq = player.equipments;
    if (!eq)
        return [];
    const seen = new Set();
    const list = [];
    const pushUnique = (card) => {
        if (!card || seen.has(card.id))
            return;
        seen.add(card.id);
        list.push(card);
    };
    pushUnique(eq.weapon);
    pushUnique(eq.horseDef);
    pushUnique(eq.horseOff);
    pushUnique(eq.barrel);
    pushUnique(eq.extra);
    for (const item of eq.extras || []) {
        pushUnique(item);
    }
    return list;
}
// Check if card name is equipped
function hasEquippedCardByName(player, cardName) {
    const normalized = normalizeEquipName(cardName);
    return getAllEquippedCards(player).some((card) => normalizeEquipName(card.name) === normalized);
}
// Check whether player has a Barrel
function hasBarrelCard(player) {
    return (Boolean(player.equipments?.barrel) ||
        hasEquippedCardByName(player, "BARREL"));
}
// Remove equipped card by ID
function removeEquippedCardById(player, targetCardId) {
    const eq = player.equipments;
    if (!eq)
        return null;
    if (targetCardId !== undefined) {
        if (eq.weapon?.id === targetCardId) {
            const removed = eq.weapon;
            eq.weapon = undefined;
            return removed;
        }
        if (eq.horseDef?.id === targetCardId) {
            const removed = eq.horseDef;
            eq.horseDef = undefined;
            return removed;
        }
        if (eq.horseOff?.id === targetCardId) {
            const removed = eq.horseOff;
            eq.horseOff = undefined;
            return removed;
        }
        if (eq.barrel?.id === targetCardId) {
            const removed = eq.barrel;
            eq.barrel = undefined;
            return removed;
        }
        if (eq.extras && eq.extras.length > 0) {
            const extraIdx = eq.extras.findIndex((c) => c.id === targetCardId);
            if (extraIdx !== -1) {
                const removed = eq.extras.splice(extraIdx, 1)[0];
                if (eq.extra?.id === removed.id) {
                    eq.extra = eq.extras[0];
                }
                return removed;
            }
        }
        if (eq.extra?.id === targetCardId) {
            const removed = eq.extra;
            eq.extra = eq.extras?.[0];
            return removed;
        }
        return null;
    }
    if (eq.weapon) {
        const removed = eq.weapon;
        eq.weapon = undefined;
        return removed;
    }
    if (eq.horseDef) {
        const removed = eq.horseDef;
        eq.horseDef = undefined;
        return removed;
    }
    if (eq.horseOff) {
        const removed = eq.horseOff;
        eq.horseOff = undefined;
        return removed;
    }
    if (eq.barrel) {
        const removed = eq.barrel;
        eq.barrel = undefined;
        return removed;
    }
    if (eq.extras && eq.extras.length > 0) {
        const removed = eq.extras.shift();
        if (eq.extra?.id === removed.id) {
            eq.extra = eq.extras[0];
        }
        return removed;
    }
    if (eq.extra) {
        const removed = eq.extra;
        eq.extra = undefined;
        return removed;
    }
    return null;
}
// Check whether player has blue cards
function hasBlueCardInPlay(player) {
    if (getAllEquippedCards(player).length > 0) {
        return true;
    }
    return (player.judgements || []).some((j) => j.card.border === "blue");
}
// Count all cards on player
function countPlayerTotalCards(player) {
    return (player.handCards.length +
        getAllEquippedCards(player).length +
        (player.greenCards?.length || 0) +
        (player.judgements?.length || 0));
}
// Check target card presence in area
function hasTargetCardInArea(player, targetArea, targetCardId) {
    if (targetArea === "HAND")
        return player.handCards.length > 0;
    if (!targetCardId)
        return false;
    if (targetArea === "EQUIPMENT") {
        return getAllEquippedCards(player).some((c) => c.id === targetCardId);
    }
    if (targetArea === "GREEN") {
        return (player.greenCards || []).some((g) => g.id === targetCardId || g.card.id === targetCardId);
    }
    if (targetArea === "JUDGEMENT") {
        return (player.judgements || []).some((j) => j.id === targetCardId || j.card.id === targetCardId);
    }
    return false;
}
// Pick fallback target area and card
function pickFirstTargetCard(player) {
    if (player.handCards.length > 0)
        return { targetArea: "HAND" };
    const firstEquip = getAllEquippedCards(player)[0];
    if (firstEquip)
        return { targetArea: "EQUIPMENT", targetCardId: firstEquip.id };
    const firstGreen = player.greenCards?.[0];
    if (firstGreen)
        return { targetArea: "GREEN", targetCardId: firstGreen.id };
    const firstJudge = player.judgements?.[0];
    if (firstJudge)
        return { targetArea: "JUDGEMENT", targetCardId: firstJudge.id };
    return null;
}
