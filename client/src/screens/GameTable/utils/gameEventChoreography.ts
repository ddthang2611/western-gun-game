import type { Card, InFlightCard, Player } from "../../../types/game";
import type { FlyingCardItem } from "../components/CardFlightLayer";
import type { VfxBeam } from "../hooks/useTableAnimations";

export interface GameEventMessage {
  type: string;
  payload?: Record<string, unknown>;
}

export interface GameEventChoreographyContext {
  getMyPlayerId: () => string;
  getPlayers: () => Player[];
  triggerVfx: (type: VfxBeam["type"], targetId?: string, aoeHeal?: boolean) => void;
  enqueueFlight: (
    fromSelector: string,
    toSelector: string,
    options?: Omit<FlyingCardItem, "id" | "fromSelector" | "toSelector">
  ) => void;
  scheduleStaggered: (fn: () => void, stepMs?: number) => void;
  scheduleTimeout: (fn: () => void, ms: number) => void;
  addEphemeralCards: (entries: InFlightCard[]) => void;
  removeEphemeralCards: (ids: Set<string>) => void;
  onDiscardReveal: (card: Card) => void;
  onOpenElGringoPicker: (
    attacker: Player,
    attackerId: string,
    stolenCard?: Card
  ) => void;
}

type EventPayload = Record<string, unknown>;
type RawCard = Partial<Card>;
type EventHandler = (p: EventPayload, ctx: GameEventChoreographyContext) => void;

const ARENA_ANCHOR = ".inflight-chain";
const DRAW_PILE_ANCHOR = '[data-flight-anchor="draw-pile"], .game-table__pile-card--stack';
const DISCARD_PILE_ANCHOR =
  '[data-flight-anchor="discard-pile"], .game-table__pile-card--discard';
const MY_HAND_ANCHOR =
  '[data-flight-anchor="my-hand-last"], [data-flight-anchor="my-hand"], .game-table__console-hand';

function normImg(img?: unknown): string | undefined {
  if (typeof img !== "string" || !img) return undefined;
  return img.startsWith("/") || img.startsWith("http") ? img : `/${img}`;
}

function asStr(val: unknown): string | undefined {
  return typeof val === "string" && val ? val : undefined;
}

function asCard(val: unknown): RawCard | undefined {
  return val && typeof val === "object" ? (val as RawCard) : undefined;
}

function playerAnchor(myPlayerId: string, id?: string): string {
  if (id && id === myPlayerId) return MY_HAND_ANCHOR;
  return id ? `#seat-${id}` : MY_HAND_ANCHOR;
}

function isKnownSecretCard(card?: RawCard): card is RawCard & { image: string } {
  return Boolean(card && card.id !== "SECRET" && card.image);
}

const handleBulletAttack: EventHandler = (p, ctx) => {
  ctx.triggerVfx("bullet", asStr(p.targetId));
};

const handleHealSingle: EventHandler = (p, ctx) => {
  ctx.triggerVfx("heal", asStr(p.playerId), false);
};

const handleDynamiteVfx: EventHandler = (p, ctx) => {
  ctx.triggerVfx("dynamite", asStr(p.playerId));
};

const handleCardsDrawn: EventHandler = (p, ctx) => {
  const playerId = asStr(p.playerId);
  if (!playerId) return;
  const targetAnchor = playerAnchor(ctx.getMyPlayerId(), playerId);
  const count = Math.max(
    1,
    Math.min(5, Number(p.drawnCount || p.count || p.pickedCount || 1))
  );
  ctx.scheduleStaggered(() => {
    for (let i = 0; i < count; i++) {
      ctx.scheduleTimeout(() => {
        ctx.enqueueFlight(ARENA_ANCHOR, targetAnchor, {
          faceDown: true,
          durationMs: 1500,
        });
      }, i * 280);
    }
  }, 1050);
};

const handlePhaseChanged: EventHandler = (p, ctx) => {
  const playerId = asStr(p.playerId);
  if (p.phase !== 1 || Number(p.drawnCount ?? 0) <= 0 || !playerId) return;
  const targetAnchor = playerAnchor(ctx.getMyPlayerId(), playerId);
  const count = Math.max(1, Math.min(5, Number(p.drawnCount || 1)));
  ctx.scheduleStaggered(() => {
    ctx.triggerVfx("draw");
    for (let i = 0; i < count; i++) {
      ctx.scheduleTimeout(() => {
        ctx.enqueueFlight(ARENA_ANCHOR, targetAnchor, {
          faceDown: true,
          durationMs: 1500,
        });
      }, i * 280);
    }
  }, 1150);
};

const handleInPlayStolen: EventHandler = (p, ctx) => {
  const sourcePlayerId = asStr(p.sourcePlayerId);
  const targetPlayerId = asStr(p.targetPlayerId);
  if (!sourcePlayerId || !targetPlayerId) return;
  const myId = ctx.getMyPlayerId();
  const card = asCard(p.card);
  ctx.scheduleStaggered(() => {
    ctx.enqueueFlight(
      playerAnchor(myId, targetPlayerId),
      playerAnchor(myId, sourcePlayerId),
      {
        faceDown: false,
        cardImage: normImg(card?.image),
        label: card?.name,
        durationMs: 1350,
      }
    );
  }, 1050);
};

// Skip discard pile exit flights
const handleDestroyedOrDiscarded: EventHandler = () => undefined;

const handleDrawCheckResult: EventHandler = (p, ctx) => {
  if (p.reason === "DYNAMITE" || p.reason === "JAIL") return;
  const drawnList = Array.isArray(p.drawnCards) && p.drawnCards.length > 0
    ? (p.drawnCards as RawCard[])
    : p.chosenCard
    ? [p.chosenCard as RawCard]
    : [];
  if (drawnList.length === 0) return;

  const playerId = asStr(p.playerId);
  const playerName = asStr(p.playerName) || "Player";
  const reasonStr = asStr(p.reason);
  const success = Boolean(p.success);

  let sourceEntry: InFlightCard | null = null;
  if (reasonStr) {
    const reasonUpper = reasonStr.toUpperCase();
    const reasonSlug = reasonUpper.toLowerCase().replace(/[^a-z0-9]/g, "_");
    const isJourdonnais = reasonUpper === "JOURDONNAIS";
    const actor = ctx.getPlayers().find((pl) => pl.id === playerId);
    const sourceCard: Card = {
      id: `src_${reasonSlug}_${Date.now()}_${Math.random()}`,
      name: reasonUpper,
      rank: "Q",
      suit: "spades",
      border: reasonUpper === "BARREL" || isJourdonnais ? "blue" : "green",
      image: isJourdonnais
        ? normImg(actor?.characters?.[0]?.image) || "/assets/images/ui/card_back.png"
        : "/assets/images/ui/card_back.png",
      desc: `Draw check for ${reasonUpper}.`,
    };
    sourceEntry = {
      id: `inf_src_${Date.now()}_${Math.random()}`,
      card: sourceCard,
      sourcePlayerName: playerName,
      actionText: isJourdonnais ? "Jourdonnais Check" : `${reasonUpper} Check`,
    };
  }

  const checkEntries: InFlightCard[] = drawnList.map((rawCard, idx) => {
    const clientCard: Card = {
      id: rawCard.id || `chk_${Date.now()}_${idx}`,
      name: rawCard.name || (reasonStr ? `${reasonStr} CHECK` : "DRAW CHECK"),
      suit: rawCard.suit || "spades",
      rank: rawCard.rank || "Q",
      border: rawCard.border || "blue",
      image: normImg(rawCard.image) || "/assets/images/ui/card_back.png",
      desc: `${playerName} draw check for ${reasonStr || "action"}.`,
    };
    const outcomeText = success ? "PASSED" : "FAILED";
    const sourceTag = reasonStr === "JOURDONNAIS" ? "Jourdonnais" : "Flipped";
    return {
      id: `chk_${Date.now()}_${idx}_${Math.random()}`,
      card: clientCard,
      sourcePlayerName: `${playerName} (${sourceTag})`,
      actionText: `${rawCard.rank} of ${rawCard.suit} (${outcomeText})`,
      isFlipReveal: true,
    };
  });

  const lastCard = checkEntries[checkEntries.length - 1].card;
  const fromAnchor = playerAnchor(ctx.getMyPlayerId(), playerId);
  const entryIds = new Set(
    [sourceEntry?.id, ...checkEntries.map((e) => e.id)].filter(Boolean) as string[]
  );

  ctx.scheduleStaggered(() => {
    ctx.enqueueFlight(fromAnchor, ARENA_ANCHOR, {
      faceDown: false,
      cardImage: sourceEntry?.card.image || lastCard.image,
      label: sourceEntry?.card.name || lastCard.name,
      durationMs: 1000,
    });
    if (sourceEntry) {
      ctx.scheduleTimeout(() => {
        ctx.addEphemeralCards([sourceEntry!]);
      }, 900);
    }
    ctx.scheduleTimeout(() => {
      ctx.enqueueFlight(DRAW_PILE_ANCHOR, ARENA_ANCHOR, {
        faceDown: true,
        durationMs: 1000,
      });
    }, 600);
    ctx.scheduleTimeout(() => {
      ctx.addEphemeralCards(checkEntries);
    }, 1550);
    ctx.scheduleTimeout(() => {
      ctx.removeEphemeralCards(entryIds);
      ctx.onDiscardReveal(lastCard);
    }, 4800);
  }, 1500);
};

const handleJudgementResolved: EventHandler = (p, ctx) => {
  const rawCard = asCard(p.drawnCard);
  if (!rawCard) return;

  const isExploded = p.result === "EXPLODED";
  const isEscaped = p.result === "ESCAPED";
  const jType = String(p.judgementType || "DYNAMITE").toUpperCase();
  const rawSource = asCard(p.judgementCard);
  const playerId = asStr(p.playerId);
  const playerName = asStr(p.playerName) || "Player";
  const resultLabel = asStr(p.result) || "";

  const sourceCard: Card = rawSource
    ? {
        id: rawSource.id || `src_judge_${Date.now()}`,
        name: rawSource.name || jType,
        suit: rawSource.suit || "spades",
        rank: rawSource.rank || "J",
        border: rawSource.border || "blue",
        image: normImg(rawSource.image) || "/assets/images/ui/card_back.png",
        desc: rawSource.desc || `${jType} judgement.`,
      }
    : {
        id: `src_judge_${Date.now()}`,
        name: jType,
        rank: jType === "DYNAMITE" ? "2" : "J",
        suit: jType === "DYNAMITE" ? "hearts" : "spades",
        border: "blue",
        image: "/assets/images/ui/card_back.png",
        desc: `${jType} judgement.`,
      };

  const sourceEntry: InFlightCard = {
    id: `inf_jsrc_${Date.now()}_${Math.random()}`,
    card: sourceCard,
    sourcePlayerName: playerName,
    actionText: `${jType} Judgement`,
  };

  const clientCard: Card = {
    id: rawCard.id || `judge_${Date.now()}`,
    name: rawCard.name || `${jType} CHECK`,
    suit: rawCard.suit || "spades",
    rank: rawCard.rank || "A",
    border: rawCard.border || "blue",
    image: normImg(rawCard.image) || "/assets/images/ui/card_back.png",
    desc: `${playerName} ${jType} result: ${resultLabel}`,
  };

  const checkEntry: InFlightCard = {
    id: `judge_${Date.now()}_${Math.random()}`,
    card: clientCard,
    sourcePlayerName: `${playerName} (Flipped)`,
    actionText: `${rawCard.rank} of ${rawCard.suit} — ${resultLabel}`,
    isFlipReveal: true,
  };

  const fromAnchor = playerAnchor(ctx.getMyPlayerId(), playerId);
  const entryIds = new Set([sourceEntry.id, checkEntry.id]);

  ctx.scheduleStaggered(() => {
    ctx.enqueueFlight(fromAnchor, ARENA_ANCHOR, {
      faceDown: false,
      cardImage: sourceCard.image,
      label: sourceCard.name,
      durationMs: 1050,
    });
    ctx.scheduleTimeout(() => {
      ctx.addEphemeralCards([sourceEntry]);
    }, 950);
    ctx.scheduleTimeout(() => {
      ctx.enqueueFlight(DRAW_PILE_ANCHOR, ARENA_ANCHOR, {
        faceDown: true,
        durationMs: 1000,
      });
    }, 650);
    ctx.scheduleTimeout(() => {
      ctx.addEphemeralCards([checkEntry]);
      if (isExploded) {
        ctx.triggerVfx("dynamite", playerId);
      }
    }, 1600);
    ctx.scheduleTimeout(() => {
      ctx.removeEphemeralCards(entryIds);
      if (isExploded || !isEscaped) {
        ctx.onDiscardReveal(clientCard);
      }
    }, 5000);
  }, 1600);
};

const GAME_EVENT_HANDLERS: Record<string, EventHandler> = {
  BANG_ATTACK_LAUNCHED: handleBulletAttack,
  PUNCH_LAUNCHED: handleBulletAttack,
  SPRINGFIELD_LAUNCHED: handleBulletAttack,
  AOE_GATLING_TRIGGERED: handleBulletAttack,
  AOE_INDIANS_TRIGGERED: handleBulletAttack,

  HEAL_RESOLVED: handleHealSingle,
  FATAL_DAMAGE_REVIVED_WITH_BEER: handleHealSingle,
  SALOON_HEALED: (_p, ctx) => {
    ctx.triggerVfx("heal", undefined, true);
  },
  JAIL_ATTACHED: (p, ctx) => {
    ctx.triggerVfx("jail", asStr(p.targetPlayerId));
  },
  DYNAMITE_ATTACHED: handleDynamiteVfx,
  DYNAMITE_EXPLODED: handleDynamiteVfx,

  PHASE_CHANGED: handlePhaseChanged,

  CARDS_DRAWN: handleCardsDrawn,
  BART_CASSIDY_TRIGGERED: handleCardsDrawn,
  SUZY_LAFAYETTE_TRIGGERED: handleCardsDrawn,
  MOLLY_STARK_TRIGGERED: handleCardsDrawn,
  HERB_HUNTER_DRAW: handleCardsDrawn,
  KIT_CARLSON_PICKED: handleCardsDrawn,
  EVENT_TRAIN_ARRIVAL_DRAW: handleCardsDrawn,
  ABANDONED_MINE_DRAW: handleCardsDrawn,

  BLACK_JACK_REVEAL: (p, ctx) => {
    const playerId = asStr(p.playerId);
    if (!playerId) return;
    const card = asCard(p.card);
    const targetAnchor = playerAnchor(ctx.getMyPlayerId(), playerId);
    ctx.scheduleStaggered(() => {
      ctx.enqueueFlight(ARENA_ANCHOR, targetAnchor, {
        faceDown: false,
        cardImage: normImg(card?.image),
        label: card?.name,
        durationMs: 1350,
      });
    }, 1000);
  },

  PEDRO_RAMIREZ_DRAW: (p, ctx) => {
    const playerId = asStr(p.playerId);
    if (!playerId) return;
    const card = asCard(p.card);
    const targetAnchor = playerAnchor(ctx.getMyPlayerId(), playerId);
    ctx.scheduleStaggered(() => {
      ctx.enqueueFlight(DISCARD_PILE_ANCHOR, targetAnchor, {
        faceDown: false,
        cardImage: normImg(card?.image),
        label: card?.name,
        durationMs: 1350,
      });
    }, 1000);
  },

  GENERAL_STORE_CARD_PICKED: (p, ctx) => {
    const playerId = asStr(p.playerId);
    if (!playerId) return;
    const card = asCard(p.card);
    const targetAnchor = playerAnchor(ctx.getMyPlayerId(), playerId);
    ctx.scheduleStaggered(() => {
      ctx.enqueueFlight(ARENA_ANCHOR, targetAnchor, {
        faceDown: false,
        cardImage: normImg(card?.image),
        label: card?.name,
        durationMs: 1300,
      });
    }, 950);
  },

  JESSE_JONES_STEAL: (p, ctx) => {
    const playerId = asStr(p.playerId);
    const targetPlayerId = asStr(p.targetPlayerId);
    if (!playerId || !targetPlayerId) return;
    const myId = ctx.getMyPlayerId();
    ctx.scheduleStaggered(() => {
      ctx.enqueueFlight(
        playerAnchor(myId, targetPlayerId),
        playerAnchor(myId, playerId),
        { faceDown: true, durationMs: 1350 }
      );
    }, 1050);
  },

  EL_GRINGO_STOLEN: (p, ctx) => {
    const attackerId = asStr(p.attackerId);
    const victimId = asStr(p.victimId);
    if (!attackerId || !victimId) return;
    const myId = ctx.getMyPlayerId();
    const card = asCard(p.card);
    const attackerObj = ctx.getPlayers().find((pl) => pl.id === attackerId);
    if (victimId === myId && attackerObj) {
      ctx.onOpenElGringoPicker(attackerObj, attackerId, card as Card | undefined);
      return;
    }
    const isKnown = isKnownSecretCard(card);
    ctx.scheduleStaggered(() => {
      ctx.enqueueFlight(playerAnchor(myId, attackerId), playerAnchor(myId, victimId), {
        faceDown: !isKnown,
        cardImage: isKnown ? normImg(card.image) : undefined,
        label: isKnown ? card.name : undefined,
        durationMs: 1500,
      });
    }, 1150);
  },

  CARD_STOLEN_FROM_HAND: (p, ctx) => {
    const sourcePlayerId = asStr(p.sourcePlayerId);
    const targetPlayerId = asStr(p.targetPlayerId);
    if (!sourcePlayerId || !targetPlayerId) return;
    const myId = ctx.getMyPlayerId();
    const card = asCard(p.card);
    const isKnown = isKnownSecretCard(card);
    ctx.scheduleStaggered(() => {
      ctx.enqueueFlight(
        playerAnchor(myId, targetPlayerId),
        playerAnchor(myId, sourcePlayerId),
        {
          faceDown: !isKnown,
          cardImage: isKnown ? normImg(card.image) : undefined,
          label: isKnown ? card.name : undefined,
          durationMs: 1350,
        }
      );
    }, 1050);
  },

  EQUIPMENT_STOLEN: handleInPlayStolen,
  GREEN_CARD_STOLEN: handleInPlayStolen,
  JUDGEMENT_STOLEN: handleInPlayStolen,

  CARD_DESTROYED_FROM_HAND: handleDestroyedOrDiscarded,
  EQUIPMENT_DESTROYED: handleDestroyedOrDiscarded,
  GREEN_CARD_DESTROYED: handleDestroyedOrDiscarded,
  JUDGEMENT_DESTROYED: handleDestroyedOrDiscarded,
  CARD_DISCARDED_PHASE_3: handleDestroyedOrDiscarded,

  DYNAMITE_PASSED: (p, ctx) => {
    const fromPlayerId = asStr(p.fromPlayerId);
    const toPlayerId = asStr(p.toPlayerId);
    if (!fromPlayerId || !toPlayerId) return;
    const myId = ctx.getMyPlayerId();
    const card = asCard(p.card);
    ctx.scheduleStaggered(() => {
      ctx.enqueueFlight(
        playerAnchor(myId, fromPlayerId),
        playerAnchor(myId, toPlayerId),
        {
          faceDown: false,
          cardImage: normImg(card?.image) || "/assets/images/ui/card_back.png",
          label: "DYNAMITE",
          durationMs: 1300,
        }
      );
    }, 1000);
  },

  VULTURE_SAM_SCAVENGED: (p, ctx) => {
    const scavengerId = asStr(p.scavengerId);
    if (!scavengerId) return;
    const myId = ctx.getMyPlayerId();
    const victimId = asStr(p.victimId);
    const fromAnchor = victimId ? playerAnchor(myId, victimId) : ARENA_ANCHOR;
    ctx.scheduleStaggered(() => {
      ctx.enqueueFlight(fromAnchor, playerAnchor(myId, scavengerId), {
        faceDown: true,
        durationMs: 1350,
      });
    }, 1050);
  },

  DRAW_CHECK_RESULT: handleDrawCheckResult,
  JUDGEMENT_RESOLVED: handleJudgementResolved,

  CARD_PLAYED_TO_ARENA: (p, ctx) => {
    const rawCard = asCard(p.card);
    if (!rawCard) return;
    const clientCard: Card = {
      id: rawCard.id || `arena_${Date.now()}`,
      name: rawCard.name || "CARD",
      suit: rawCard.suit || "spades",
      rank: rawCard.rank || "A",
      border: rawCard.border || "brown",
      image: normImg(rawCard.image) || "/assets/images/ui/card_back.png",
      desc: rawCard.desc || rawCard.name || "Card played",
    };
    const targetPlayerName = asStr(p.targetPlayerName);
    const arenaEntry: InFlightCard = {
      id: `arena_${rawCard.id || Date.now()}_${Math.random()}`,
      card: clientCard,
      sourcePlayerName: asStr(p.playerName) || "Player",
      targetPlayerName,
      actionText: targetPlayerName
        ? `${clientCard.name} -> ${targetPlayerName}`
        : clientCard.name,
    };
    const myId = ctx.getMyPlayerId();
    const actorId = asStr(p.playerId);
    const targetPlayerId = asStr(p.targetPlayerId);
    const fromAnchor = playerAnchor(myId, actorId);
    const placementDest =
      clientCard.name === "JAIL" && targetPlayerId
        ? playerAnchor(myId, targetPlayerId)
        : playerAnchor(myId, actorId);
    const isPlacement = Boolean(p.isPlacement);

    ctx.scheduleStaggered(() => {
      ctx.enqueueFlight(fromAnchor, ARENA_ANCHOR, {
        faceDown: false,
        cardImage: clientCard.image,
        label: clientCard.name,
        durationMs: 1000,
      });
      ctx.scheduleTimeout(() => {
        ctx.addEphemeralCards([arenaEntry]);
      }, 900);
      ctx.scheduleTimeout(() => {
        if (isPlacement) {
          ctx.enqueueFlight(ARENA_ANCHOR, placementDest, {
            faceDown: false,
            cardImage: clientCard.image,
            label: clientCard.name,
            durationMs: 1150,
          });
        }
        ctx.removeEphemeralCards(new Set([arenaEntry.id]));
      }, 4200);
    }, 1200);
  },

  EVENT_PEYOTE_GUESS: (p, ctx) => {
    const rawCard = asCard(p.card);
    if (!rawCard) return;
    const clientCard: Card = {
      id: rawCard.id || `peyote_${Date.now()}`,
      name: rawCard.name || "PEYOTE",
      suit: rawCard.suit || "spades",
      rank: rawCard.rank || "A",
      border: rawCard.border || "brown",
      image: normImg(rawCard.image) || "/assets/images/ui/card_back.png",
      desc: rawCard.desc || "Peyote draw",
    };
    const peyoteEntry: InFlightCard = {
      id: `peyote_${Date.now()}_${Math.random()}`,
      card: clientCard,
      sourcePlayerName: `${asStr(p.playerName) || "Player"} (Peyote)`,
      actionText: `${rawCard.rank} of ${rawCard.suit} (${
        p.correct ? "CORRECT" : "WRONG"
      })`,
      isFlipReveal: true,
    };
    ctx.scheduleStaggered(() => {
      ctx.enqueueFlight(DRAW_PILE_ANCHOR, ARENA_ANCHOR, {
        faceDown: true,
        durationMs: 1000,
      });
      ctx.scheduleTimeout(() => {
        ctx.addEphemeralCards([peyoteEntry]);
      }, 950);
      ctx.scheduleTimeout(() => {
        ctx.removeEphemeralCards(new Set([peyoteEntry.id]));
      }, 4500);
    }, 1100);
  },
};

// Dispatch typed GAME_EVENT choreography handler
export function dispatchGameEventChoreography(
  ev: GameEventMessage,
  ctx: GameEventChoreographyContext
): void {
  const handler = GAME_EVENT_HANDLERS[ev.type];
  if (!handler) return;
  handler(ev.payload || {}, ctx);
}
