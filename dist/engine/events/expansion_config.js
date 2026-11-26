"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXPANSION_CONFIG = void 0;
exports.isExpansionActive = isExpansionActive;
exports.filterActiveExpansions = filterActiveExpansions;
exports.EXPANSION_CONFIG = [
    { id: "dodge_city", label: "Dodge City", active: true },
    { id: "high_noon", label: "High Noon", active: false },
    { id: "fistful_of_cards", label: "Fistful of Cards", active: false },
];
// Check expansion active status
function isExpansionActive(packId) {
    if (packId === "base")
        return true;
    return Boolean(exports.EXPANSION_CONFIG.find((e) => e.id === packId)?.active);
}
// Keep base and active expansions
function filterActiveExpansions(expansions) {
    const filtered = (expansions || []).filter((id) => isExpansionActive(id));
    return Array.from(new Set(["base", ...filtered]));
}
