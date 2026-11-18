import { EngineCard } from "../engine/types/cards";
import { GameEngine } from "../engine/game_engine";
import { FilteredWorldSnapshot } from "../engine/state/fog_of_war";
import { DistanceCalculator } from "../engine/board/distance_calculator";

// Convert EngineCard for client UI
export function mapClientCard(card?: EngineCard): any {
  if (!card) return undefined;
  return {
    ...card,
    range: card.weaponRange,
  };
}

// Convert equipment slots for UI
export function mapClientEquipments(equipments?: any): any {
  const eq = equipments || {};
  return {
    weapon: mapClientCard(eq.weapon),
    horseDef: mapClientCard(eq.horseDef),
    horseOff: mapClientCard(eq.horseOff),
    barrel: mapClientCard(eq.barrel),
    extra: mapClientCard(eq.extra),
    extras: Array.isArray(eq.extras)
      ? eq.extras.map((c: EngineCard) => mapClientCard(c))
      : [],
  };
}

// Convert sanitized snapshot to client TableState
export function buildTableState(
  snapshot: FilteredWorldSnapshot,
  playerId: string,
  engine: GameEngine,
  combatLog: string[],
  matchPaused: boolean,
  isPlayerOnline?: (id: string) => boolean
): any {
  const simState = engine.getState();
  const myPlayer = snapshot.players.find((p) => p.id === playerId);
  const mySimPlayer = simState.players.get(playerId);
  const weaponRange = mySimPlayer
    ? DistanceCalculator.getAttackerWeaponRange(simState, mySimPlayer)
    : 1;

  const nameById = new Map<string, string>();
  snapshot.players.forEach((p) => nameById.set(p.id, p.name));

  const mappedPlayers = snapshot.players.map((p) => {
    const dist = DistanceCalculator.calculateDistance(simState, playerId, p.id);
    const isInRange = dist <= weaponRange;
    const online = isPlayerOnline ? isPlayerOnline(p.id) : !p.isDead;

    return {
      id: p.id,
      name: p.name,
      seatIndex: p.seatIndex,
      isHost: false,
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
      greenCards: (p.greenCards || []).map((g: any) => ({
        ...g,
        card: mapClientCard(g.card),
      })),
      judgements: (p.judgements || []).map((j: any) => ({
        id: j.id,
        type: j.type,
        card: j.card ? mapClientCard(j.card) : undefined,
      })),
      hasJail: (p.judgements || []).some((j: any) => j.type === "JAIL"),
      hasDynamite: (p.judgements || []).some((j: any) => j.type === "DYNAMITE"),
      distanceFromMe: dist === Infinity ? 99 : dist,
      isInRange,
    };
  });

  let police = 0;
  let outlaw = 0;
  let renegade = 0;
  simState.players.forEach((p) => {
    if (!p.isDead) {
      if (p.role === "sheriff" || p.role === "deputy") police++;
      else if (p.role === "outlaw") outlaw++;
      else if (p.role === "renegade") renegade++;
    }
  });

  const seenInFlightKeys = new Set<string>();
  const mappedInFlight = (snapshot.pendingReactionTargets || [])
    .filter((r) => {
      const key =
        r.sourceCard?.id ||
        `${r.sourcePlayerId}:${r.type}:${r.sourceCard?.name || ""}`;
      if (seenInFlightKeys.has(key)) return false;
      seenInFlightKeys.add(key);
      return true;
    })
    .map((r) => ({
      id: r.id,
      card: mapClientCard(r.sourceCard) ?? {
        id: r.id,
        name: r.type,
        border: "brown",
        rank: "A",
        suit: "hearts",
        desc: r.type,
      },
      sourcePlayerName: nameById.get(r.sourcePlayerId) || "Unknown",
      targetPlayerName: nameById.get(r.targetPlayerId) || "Unknown",
      actionText: `${r.type} (${r.currentCount}/${r.requiredCount})`,
    }));

  const mappedMyPending = snapshot.myPendingReaction
    ? {
        ...snapshot.myPendingReaction,
        sourcePlayerName:
          nameById.get(snapshot.myPendingReaction.sourcePlayerId) || "Unknown",
        sourceCard: mapClientCard(snapshot.myPendingReaction.sourceCard),
        ...(snapshot.myPendingReaction.ricochetTargetArea
          ? { ricochetTargetArea: snapshot.myPendingReaction.ricochetTargetArea }
          : {}),
        ...(snapshot.myPendingReaction.ricochetTargetCardId
          ? { ricochetTargetCardId: snapshot.myPendingReaction.ricochetTargetCardId }
          : {}),
      }
    : null;

  const mappedPendingReactions = (snapshot.pendingReactionTargets || []).map(
    ({ sourceCard: _sourceCard, ...summary }) => summary
  );

  const mappedGeneralStore = snapshot.generalStore
    ? {
        ...snapshot.generalStore,
        originPlayerName:
          nameById.get(snapshot.generalStore.originPlayerId) || "Unknown",
        currentPickerName: snapshot.generalStore.currentPickerId
          ? nameById.get(snapshot.generalStore.currentPickerId) || "Unknown"
          : null,
        pool: snapshot.generalStore.pool.map((c) => mapClientCard(c)),
      }
    : null;

  return {
    roomId: snapshot.roomId,
    stateSeq: snapshot.stateSeq,
    hostInfo: `Room: ${snapshot.roomId}`,
    matchPhase: snapshot.matchPhase,
    roundNumber: snapshot.roundNumber,
    myPlayerId: playerId,
    players: mappedPlayers,
    activePlayerId: snapshot.turnPlayerId,
    sheriffId: snapshot.sheriffId,
    direction: snapshot.direction,
    currentPhase: snapshot.currentPhase as 0 | 1 | 2 | 3,
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
    combatLog: combatLog.slice(0, 50),
    roleCounts: { police, outlaw, renegade },
    myRole: snapshot.myState?.role || undefined,
    myHp: myPlayer?.hp ?? 0,
    myMaxHp: myPlayer?.maxHp ?? 0,
    myIsGhost: Boolean(myPlayer?.isGhost),
    myCopiedCharacter: myPlayer?.copiedCharacter ?? null,
    myForcedPlayCardId: myPlayer?.forcedPlayCardId ?? null,
    myHand: (snapshot.myState?.handCards || []).map((c) => mapClientCard(c)),
    myEquipments: mapClientEquipments(myPlayer?.equipments),
    myGreenCards: (myPlayer?.greenCards || []).map((g: any) => ({
      ...g,
      card: mapClientCard(g.card),
    })),
    myJudgements: {
      hasJail: (myPlayer?.judgements || []).some((j: any) => j.type === "JAIL"),
      hasDynamite: (myPlayer?.judgements || []).some(
        (j: any) => j.type === "DYNAMITE"
      ),
    },
    myPendingReaction: mappedMyPending,
    pendingReactions: mappedPendingReactions,
    generalStore: mappedGeneralStore,
    gameOver: snapshot.gameOver || null,
    matchPaused,
  };
}
