"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapClientCard = mapClientCard;
exports.mapClientEquipments = mapClientEquipments;
exports.buildTableState = buildTableState;
const distance_calculator_1 = require("../engine/board/distance_calculator");
// Convert EngineCard for client UI
function mapClientCard(card) {
    if (!card)
        return undefined;
    return {
        ...card,
        range: card.weaponRange,
    };
}
// Convert equipment slots for UI
function mapClientEquipments(equipments) {
    const eq = equipments || {};
    return {
        weapon: mapClientCard(eq.weapon),
        horseDef: mapClientCard(eq.horseDef),
        horseOff: mapClientCard(eq.horseOff),
        barrel: mapClientCard(eq.barrel),
        extra: mapClientCard(eq.extra),
        extras: Array.isArray(eq.extras)
            ? eq.extras.map((c) => mapClientCard(c))
            : [],
    };
}
// Convert sanitized snapshot to client TableState
function buildTableState(snapshot, playerId, engine, combatLog, matchPaused, isPlayerOnline, matchId, hostId, structuredCombatLog = [], isPlayerBot) {
    const simState = engine.getState();
    const myPlayer = snapshot.players.find((p) => p.id === playerId);
    const mySimPlayer = simState.players.get(playerId);
    const weaponRange = mySimPlayer
        ? distance_calculator_1.DistanceCalculator.getAttackerWeaponRange(simState, mySimPlayer)
        : 1;
    const nameById = new Map();
    snapshot.players.forEach((p) => nameById.set(p.id, p.name));
    const mappedPlayers = snapshot.players.map((p) => {
        const dist = distance_calculator_1.DistanceCalculator.calculateDistance(simState, playerId, p.id);
        const isInRange = dist <= weaponRange;
        const online = isPlayerOnline ? isPlayerOnline(p.id) : !p.isDead;
        const isBot = isPlayerBot ? isPlayerBot(p.id) : false;
        return {
            id: p.id,
            name: p.name,
            seatIndex: p.seatIndex,
            isHost: Boolean(hostId && hostId === p.id),
            isBot,
            isReady: true,
            isOnline: online && (!p.isDead || Boolean(p.isGhost)),
            isDead: p.isDead,
            isGhost: Boolean(p.isGhost),
            hp: p.hp,
            maxHp: p.maxHp,
            role: p.role === "UNKNOWN" ? undefined : p.role,
            isSheriff: p.isSheriff,
            characters: p.characters,
            copiedCharacter: p.copiedCharacter ?? null,
            forcedPlayCardId: p.forcedPlayCardId ?? null,
            handCount: p.handCount,
            handCards: p.handCards?.map((c) => mapClientCard(c)),
            equipments: mapClientEquipments(p.equipments),
            greenCards: (p.greenCards || []).map((g) => ({
                ...g,
                card: mapClientCard(g.card),
            })),
            judgements: (p.judgements || []).map((j) => ({
                id: j.id,
                type: j.type,
                card: j.card ? mapClientCard(j.card) : undefined,
            })),
            hasJail: (p.judgements || []).some((j) => j.type === "JAIL"),
            hasDynamite: (p.judgements || []).some((j) => j.type === "DYNAMITE"),
            distanceFromMe: dist === Infinity ? 99 : dist,
            isInRange,
        };
    });
    let police = 0;
    let outlaw = 0;
    let renegade = 0;
    simState.players.forEach((p) => {
        if (!p.isDead && !p.isGhost) {
            if (p.role === "sheriff" || p.role === "deputy")
                police++;
            else if (p.role === "outlaw")
                outlaw++;
            else if (p.role === "renegade")
                renegade++;
        }
    });
    const now = Date.now();
    const rawArena = snapshot.arenaChain || {
        chainId: "",
        status: "IDLE",
        entries: [],
        stepLockUntil: 0,
        settleUntil: 0,
    };
    const mappedArenaEntries = (rawArena.entries || []).map((entry) => ({
        ...entry,
        card: mapClientCard(entry.card),
    }));
    const mappedArenaChain = {
        chainId: rawArena.chainId,
        status: rawArena.status,
        entries: mappedArenaEntries,
        stepLockRemainingMs: rawArena.stepLockUntil > now ? rawArena.stepLockUntil - now : 0,
        settleRemainingMs: rawArena.settleUntil > now ? rawArena.settleUntil - now : 0,
    };
    const mappedInFlight = mappedArenaEntries.map((entry) => ({
        id: entry.id,
        card: entry.card,
        sourcePlayerName: entry.actorPlayerName,
        targetPlayerName: entry.targetPlayerName,
        actionText: entry.actionLabel,
        kind: entry.kind,
        outcome: entry.outcome,
        meta: {
            actor: entry.actorPlayerName,
            target: entry.targetPlayerName,
            kind: entry.kind,
            outcome: entry.outcome,
            actionLabel: entry.actionLabel,
        },
    }));
    const mappedMyPending = snapshot.myPendingReaction
        ? {
            ...snapshot.myPendingReaction,
            sourcePlayerName: snapshot.myPendingReaction.sourcePlayerId === "SYSTEM"
                ? "Event"
                : snapshot.myPendingReaction.sourcePlayerId === "ENV_DAMAGE"
                    ? "Environment"
                    : nameById.get(snapshot.myPendingReaction.sourcePlayerId) || "Unknown",
            sourceCard: mapClientCard(snapshot.myPendingReaction.sourceCard),
            ...(snapshot.myPendingReaction.ricochetTargetArea
                ? { ricochetTargetArea: snapshot.myPendingReaction.ricochetTargetArea }
                : {}),
            ...(snapshot.myPendingReaction.ricochetTargetCardId
                ? { ricochetTargetCardId: snapshot.myPendingReaction.ricochetTargetCardId }
                : {}),
        }
        : null;
    const mappedPendingReactions = (snapshot.pendingReactionTargets || []).map(({ sourceCard: _sourceCard, ...summary }) => summary);
    const mappedGeneralStore = snapshot.generalStore
        ? {
            ...snapshot.generalStore,
            originPlayerName: nameById.get(snapshot.generalStore.originPlayerId) || "Unknown",
            currentPickerName: snapshot.generalStore.currentPickerId
                ? nameById.get(snapshot.generalStore.currentPickerId) || "Unknown"
                : null,
            pool: snapshot.generalStore.pool.map((c) => mapClientCard(c)),
        }
        : null;
    const mappedBrawlPick = snapshot.pendingBrawlPick
        ? {
            actorPlayerId: snapshot.pendingBrawlPick.actorPlayerId,
            actorPlayerName: nameById.get(snapshot.pendingBrawlPick.actorPlayerId) || "Unknown",
            currentTargetId: snapshot.pendingBrawlPick.currentTargetId,
            currentTargetName: nameById.get(snapshot.pendingBrawlPick.currentTargetId) || "Unknown",
            remainingCount: snapshot.pendingBrawlPick.remainingCount,
            sourceCard: mapClientCard(snapshot.pendingBrawlPick.sourceCard),
        }
        : null;
    const mappedLuckyDukePick = snapshot.pendingLuckyDukePick
        ? {
            playerId: snapshot.pendingLuckyDukePick.playerId,
            playerName: nameById.get(snapshot.pendingLuckyDukePick.playerId) || "Unknown",
            reason: snapshot.pendingLuckyDukePick.reason,
            drawnCards: snapshot.pendingLuckyDukePick.drawnCards.map((c) => ({
                ...mapClientCard(c),
                matches: c.matches,
            })),
        }
        : null;
    const mappedElGringoPick = snapshot.pendingElGringoPick
        ? {
            victimId: snapshot.pendingElGringoPick.victimId,
            victimName: nameById.get(snapshot.pendingElGringoPick.victimId) || "Unknown",
            attackerId: snapshot.pendingElGringoPick.attackerId,
            attackerName: nameById.get(snapshot.pendingElGringoPick.attackerId) || "Unknown",
            remainingSteals: snapshot.pendingElGringoPick.remainingSteals,
        }
        : null;
    const hostName = hostId ? nameById.get(hostId) : undefined;
    return {
        roomId: snapshot.roomId,
        matchId,
        isHost: Boolean(hostId && hostId === playerId),
        stateSeq: snapshot.stateSeq,
        hostName,
        hostInfo: hostName ? `Host: ${hostName}` : snapshot.roomId,
        matchPhase: snapshot.matchPhase,
        roundNumber: snapshot.roundNumber,
        myPlayerId: playerId,
        players: mappedPlayers,
        activePlayerId: snapshot.turnPlayerId,
        sheriffId: snapshot.sheriffId,
        direction: snapshot.direction,
        currentPhase: snapshot.currentPhase,
        deckCount: snapshot.deckCount,
        discardCount: snapshot.discardCount,
        topDiscard: mapClientCard(snapshot.topDiscardCard),
        activeEvent: snapshot.activeEvent,
        eventDeckCount: snapshot.eventDeckCount,
        is3PlayerVariant: snapshot.is3PlayerVariant,
        expansions: snapshot.expansions,
        dualCharacterMode: snapshot.dualCharacterMode,
        hpRule: snapshot.hpRule,
        pendingCharacterSelect: snapshot.pendingCharacterSelect,
        pendingTurnStartChoice: snapshot.pendingTurnStartChoice,
        pendingPhase1Choice: snapshot.pendingPhase1Choice,
        inFlightCards: mappedInFlight,
        arenaChain: mappedArenaChain,
        combatLog: combatLog.slice(0, 50),
        structuredCombatLog: structuredCombatLog.slice(0, 50),
        roleCounts: { police, outlaw, renegade },
        myRole: snapshot.myState?.role || undefined,
        myHp: myPlayer?.hp ?? 0,
        myMaxHp: myPlayer?.maxHp ?? 0,
        myIsGhost: Boolean(myPlayer?.isGhost),
        myCopiedCharacter: myPlayer?.copiedCharacter ?? null,
        myForcedPlayCardId: myPlayer?.forcedPlayCardId ?? null,
        myHand: (snapshot.myState?.handCards || []).map((c) => mapClientCard(c)),
        myEquipments: mapClientEquipments(myPlayer?.equipments),
        myGreenCards: (myPlayer?.greenCards || []).map((g) => ({
            ...g,
            card: mapClientCard(g.card),
        })),
        myJudgements: {
            hasJail: (myPlayer?.judgements || []).some((j) => j.type === "JAIL"),
            hasDynamite: (myPlayer?.judgements || []).some((j) => j.type === "DYNAMITE"),
        },
        myPendingReaction: mappedMyPending,
        pendingReactions: mappedPendingReactions,
        generalStore: mappedGeneralStore,
        pendingBrawlPick: mappedBrawlPick,
        pendingLuckyDukePick: mappedLuckyDukePick,
        pendingElGringoPick: mappedElGringoPick,
        gameOver: snapshot.gameOver || null,
        matchPaused,
    };
}
