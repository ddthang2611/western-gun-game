"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FogOfWarFilter = void 0;
class FogOfWarFilter {
    // Project Fog of War snapshot
    static projectStateForPlayer(state, targetPlayerId) {
        const playersList = [];
        let myState;
        state.players.forEach((player, pId) => {
            const isMe = pId === targetPlayerId;
            const shouldRevealRole = player.isSheriff || player.isDead || isMe || state.is3PlayerVariant;
            const eq = player.equipments || {};
            const sanitizedEquipments = {
                weapon: eq.weapon,
                horseDef: eq.horseDef,
                horseOff: eq.horseOff,
                barrel: eq.barrel,
                extra: eq.extra,
                extras: eq.extras ? [...eq.extras] : [],
            };
            const hideCharSelection = state.matchPhase === "CHARACTER_SELECT" && !isMe;
            const playerSnapshot = {
                id: player.id,
                name: player.name,
                seatIndex: player.seatIndex,
                role: shouldRevealRole ? player.role : "UNKNOWN",
                isSheriff: player.isSheriff,
                isDead: player.isDead,
                isGhost: Boolean(player.isGhost),
                hp: hideCharSelection ? 0 : player.hp,
                maxHp: hideCharSelection ? 0 : player.maxHp,
                characters: hideCharSelection ? [] : [...player.characters],
                copiedCharacter: player.copiedCharacter ?? null,
                forcedPlayCardId: player.forcedPlayCardId ?? null,
                handCount: player.handCards.length,
                handCards: isMe ? [...player.handCards] : undefined,
                equipments: sanitizedEquipments,
                greenCards: [...(player.greenCards || [])],
                judgements: [...(player.judgements || [])],
            };
            if (isMe) {
                myState = {
                    id: player.id,
                    role: player.role,
                    handCards: [...player.handCards],
                    isGhost: Boolean(player.isGhost),
                    copiedCharacter: player.copiedCharacter ?? null,
                    forcedPlayCardId: player.forcedPlayCardId ?? null,
                };
            }
            playersList.push(playerSnapshot);
        });
        const activeReactions = state.pendingReactions.filter((r) => {
            const target = state.players.get(r.targetPlayerId);
            return Boolean(target && !target.isDead);
        });
        const headReaction = activeReactions[0] || null;
        const myPendingReaction = headReaction && headReaction.targetPlayerId === targetPlayerId
            ? headReaction
            : null;
        const pendingReactionTargets = activeReactions.map((r) => ({
            id: r.id,
            type: r.type,
            sourcePlayerId: r.sourcePlayerId,
            targetPlayerId: r.targetPlayerId,
            requiredCard: r.requiredCard,
            requiredCount: r.requiredCount,
            currentCount: r.currentCount,
        }));
        const storeChain = state.activeChain[0];
        const generalStore = storeChain && Array.isArray(storeChain.storePool)
            ? {
                originPlayerId: storeChain.originPlayerId,
                pool: [...storeChain.storePool],
                draftOrder: [...storeChain.draftOrder],
                currentPickerIndex: storeChain.currentPickerIndex,
                currentPickerId: storeChain.draftOrder[storeChain.currentPickerIndex] || null,
            }
            : null;
        let pendingCharacterSelect = null;
        if (state.matchPhase === "CHARACTER_SELECT") {
            const entry = state.pendingCharacterSelect.get(targetPlayerId);
            if (entry) {
                const submittedPlayerIds = Array.from(state.pendingCharacterSelect.values())
                    .filter((item) => Boolean(item.selectedCharacterIds?.length))
                    .map((item) => item.playerId);
                pendingCharacterSelect = {
                    playerId: entry.playerId,
                    candidates: [...entry.candidates],
                    requiredCount: entry.requiredCount,
                    selectedCharacterIds: entry.selectedCharacterIds
                        ? [...entry.selectedCharacterIds]
                        : undefined,
                    submittedPlayerIds,
                    totalPlayers: state.pendingCharacterSelect.size,
                };
            }
        }
        let pendingPhase1Choice = null;
        if (state.pendingPhase1Choice) {
            const pc = state.pendingPhase1Choice;
            pendingPhase1Choice =
                pc.playerId === targetPlayerId
                    ? {
                        ...pc,
                        options: [...pc.options],
                        previewCards: pc.previewCards ? [...pc.previewCards] : undefined,
                        drawnSoFar: pc.drawnSoFar ? [...pc.drawnSoFar] : undefined,
                    }
                    : {
                        playerId: pc.playerId,
                        mode: pc.mode,
                        options: [...pc.options],
                        hasBlackJackFollowup: pc.hasBlackJackFollowup,
                        remainingBaseDraws: pc.remainingBaseDraws,
                        ranchUsed: pc.ranchUsed,
                    };
        }
        return {
            roomId: state.roomId,
            matchPhase: state.matchPhase,
            roundNumber: state.roundNumber,
            turnPlayerId: state.turnPlayerId,
            sheriffId: state.sheriffId,
            direction: state.direction,
            currentPhase: state.currentPhase,
            bangCountThisTurn: state.bangCountThisTurn,
            deckCount: state.drawDeck.length,
            discardCount: state.discardPile.length,
            topDiscardCard: state.discardPile[state.discardPile.length - 1],
            activeEvent: state.activeEvent,
            eventDeckCount: state.eventDeck.length,
            is3PlayerVariant: state.is3PlayerVariant,
            expansions: [...state.expansions],
            dualCharacterMode: state.dualCharacterMode,
            hpRule: state.hpRule,
            players: playersList,
            myState,
            pendingCharacterSelect,
            pendingTurnStartChoice: state.pendingTurnStartChoice,
            pendingPhase1Choice,
            activeChain: state.activeChain,
            myPendingReaction,
            pendingReactionTargets,
            generalStore,
            gameOver: state.gameOver,
        };
    }
    // Filter event by visibility permissions
    static filterEventForPlayer(event, targetPlayerId) {
        if (!event.visibleTo) {
            return event;
        }
        if (event.visibleTo.includes(targetPlayerId)) {
            return event;
        }
        return {
            type: event.type,
            payload: event.maskedPayload ?? {
                ...event.payload,
                card: {
                    id: "SECRET",
                    name: "Hidden Card",
                    suit: "UNKNOWN",
                    rank: "UNKNOWN",
                },
            },
            timestamp: event.timestamp,
        };
    }
}
exports.FogOfWarFilter = FogOfWarFilter;
