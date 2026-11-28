import type { Card, Player } from "../../../types/game";
import type { FlyingCardItem } from "../components/CardFlightLayer";
import type { VfxBeam } from "../hooks/useTableAnimations";
import { ARENA_FLIGHT_MS } from "../hooks/useTableAnimations";

export interface GameEventMessage {
  type: string;
  payload?: Record<string, unknown>;
}

export interface GameEventChoreographyContext {
  getMyPlayerId: () => string;
  getPlayers: () => Player[];
  triggerVfx: (
    type: VfxBeam["type"],
    targetId?: string,
    aoeHeal?: boolean,
    sourceId?: string
  ) => void;
  enqueueFlight: (
    fromSelector: string,
    toSelector: string,
    options?: Omit<FlyingCardItem, "id" | "fromSelector" | "toSelector">
  ) => void;
  scheduleTimeout: (fn: () => void, ms: number) => void;
}

type EventPayload = Record<string, unknown>;
type RawCard = Partial<Card>;
type EventHandler = (p: EventPayload, ctx: GameEventChoreographyContext) => void;

const ARENA_ANCHOR = '[data-flight-anchor="card-arena"], .inflight-chain';
const DRAW_PILE_ANCHOR = '[data-flight-anchor="draw-pile"], .game-table__pile-card--stack';
const DISCARD_PILE_ANCHOR =
  '[data-flight-anchor="discard-pile"], .game-table__pile-card--discard';
const MY_HAND_ANCHOR =
  '[data-flight-anchor="my-hand-last"], [data-flight-anchor="my-hand"], .game-table__console-hand';
const MY_EQUIP_ANCHOR = '[data-flight-anchor="my-equip"], .game-table__console-equipments';
const MY_GREEN_ANCHOR = '[data-flight-anchor="my-green"], .game-table__console-green';

const DRAW_FLIGHT_MS = 850;
const DRAW_STAGGER_MS = 280;
const STEAL_FLIGHT_MS = 950;

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

function playerHandAnchor(myPlayerId: string, id?: string): string {
  if (id && id === myPlayerId) return MY_HAND_ANCHOR;
  return id ? `#seat-${id}` : MY_HAND_ANCHOR;
}

function playerZoneAnchor(
  myPlayerId: string,
  id: string | undefined,
  zone: "HAND" | "EQUIPMENT" | "GREEN" | "JUDGEMENT"
): string {
  const isMe = Boolean(id && id === myPlayerId);
  if (zone === "EQUIPMENT") {
    return isMe
      ? MY_EQUIP_ANCHOR
      : `[data-flight-anchor="opp-equip-${id}"], #seat-${id}`;
  }
  if (zone === "GREEN") {
    return isMe
      ? MY_GREEN_ANCHOR
      : `[data-flight-anchor="opp-green-${id}"], #seat-${id}`;
  }
  return playerHandAnchor(myPlayerId, id);
}

function isKnownSecretCard(card?: RawCard): card is RawCard & { image: string } {
  return Boolean(card && card.id !== "SECRET" && card.image);
}

const handleCardsDrawn: EventHandler = (p, ctx) => {
  const playerId = asStr(p.playerId);
  if (!playerId) return;
  const rawCount = Number(
    p.deckDrawnCount ?? p.drawnCount ?? p.count ?? p.pickedCount ?? 0
  );
  if (!Number.isFinite(rawCount) || rawCount <= 0) return;
  const targetAnchor = playerHandAnchor(ctx.getMyPlayerId(), playerId);
  const count = Math.min(5, Math.floor(rawCount));
  // Wait for triggering card to land in Card Arena first
  const baseDelay = p.sourceCard ? ARENA_FLIGHT_MS + 60 : 40;
  for (let i = 0; i < count; i++) {
    ctx.scheduleTimeout(() => {
      ctx.enqueueFlight(DRAW_PILE_ANCHOR, targetAnchor, {
        faceDown: true,
        durationMs: DRAW_FLIGHT_MS,
        startScale: 0.72,
        endScale: 0.9,
        fadeOutAtEnd: true,
      });
    }, baseDelay + i * DRAW_STAGGER_MS);
  }
};

const handlePhaseChanged: EventHandler = (p, ctx) => {
  const playerId = asStr(p.playerId);
  const rawCount = Number(p.deckDrawnCount ?? p.drawnCount ?? 0);
  if (p.phase !== 1 || !Number.isFinite(rawCount) || rawCount <= 0 || !playerId) {
    return;
  }
  const targetAnchor = playerHandAnchor(ctx.getMyPlayerId(), playerId);
  const count = Math.min(5, Math.floor(rawCount));
  for (let i = 0; i < count; i++) {
    ctx.scheduleTimeout(() => {
      ctx.enqueueFlight(DRAW_PILE_ANCHOR, targetAnchor, {
        faceDown: true,
        durationMs: DRAW_FLIGHT_MS,
        startScale: 0.72,
        endScale: 0.9,
        fadeOutAtEnd: true,
      });
    }, 60 + i * DRAW_STAGGER_MS);
  }
};

const createInPlayStolenHandler =
  (zone: "EQUIPMENT" | "GREEN" | "JUDGEMENT"): EventHandler =>
  (p, ctx) => {
    const sourcePlayerId = asStr(p.sourcePlayerId);
    const targetPlayerId = asStr(p.targetPlayerId);
    if (!sourcePlayerId || !targetPlayerId) return;
    const myId = ctx.getMyPlayerId();
    const card = asCard(p.card);
    ctx.scheduleTimeout(() => {
      ctx.enqueueFlight(
        playerZoneAnchor(myId, targetPlayerId, zone),
        playerHandAnchor(myId, sourcePlayerId),
        {
          faceDown: false,
          cardImage: normImg(card?.image),
          label: card?.name,
          durationMs: STEAL_FLIGHT_MS,
          startScale: 0.65,
          endScale: 0.9,
          fadeOutAtEnd: true,
        }
      );
    }, ARENA_FLIGHT_MS + 60);
  };

const GAME_EVENT_HANDLERS: Record<string, EventHandler> = {
  // Non-card passive/event heals
  GREG_DIGGER_HEALED: (p, ctx) => {
    const pid = asStr(p.playerId);
    ctx.triggerVfx("heal", pid, false, pid);
  },
  EVENT_HARD_LIQUOR_HEAL: (p, ctx) => {
    const pid = asStr(p.playerId);
    ctx.triggerVfx("heal", pid, false, pid);
  },
  EVENT_THE_DOCTOR_HEAL: (_p, ctx) => {
    ctx.triggerVfx("heal", undefined, true);
  },

  PHASE_CHANGED: handlePhaseChanged,

  CARDS_DRAWN: handleCardsDrawn,
  BART_CASSIDY_TRIGGERED: handleCardsDrawn,
  SUZY_LAFAYETTE_TRIGGERED: handleCardsDrawn,
  MOLLY_STARK_TRIGGERED: handleCardsDrawn,
  HERB_HUNTER_DRAW: handleCardsDrawn,
  EVENT_RANCH_EXCHANGE: (p, ctx) => {
    const playerId = asStr(p.playerId);
    const drawnCount = Number(p.drawnCount ?? 0);
    if (!playerId || !Number.isFinite(drawnCount) || drawnCount <= 0) return;
    handleCardsDrawn(
      {
        playerId,
        deckDrawnCount: drawnCount,
        sourceCard: Number(p.discardedCount ?? 0) > 0 ? { id: "ranch" } : undefined,
      },
      ctx
    );
  },
  ABANDONED_MINE_DRAW: (p, ctx) => {
    const playerId = asStr(p.playerId);
    if (!playerId) return;
    const card = asCard(p.card);
    const hasKnownArt = isKnownSecretCard(card);
    const targetAnchor = playerHandAnchor(ctx.getMyPlayerId(), playerId);
    ctx.scheduleTimeout(() => {
      ctx.enqueueFlight(DISCARD_PILE_ANCHOR, targetAnchor, {
        faceDown: !hasKnownArt,
        cardImage: hasKnownArt ? normImg(card.image) : undefined,
        label: hasKnownArt ? card.name : undefined,
        durationMs: STEAL_FLIGHT_MS,
        startScale: 0.72,
        endScale: 0.9,
        fadeOutAtEnd: true,
      });
    }, 60);
  },
  OUTLAW_BOUNTY_REWARD: (p, ctx) => {
    const killerId = asStr(p.killerId);
    const rewardCount = Number(p.rewardCount ?? 0);
    if (!killerId || !Number.isFinite(rewardCount) || rewardCount <= 0) return;
    handleCardsDrawn({ playerId: killerId, deckDrawnCount: rewardCount }, ctx);
  },

  PEDRO_RAMIREZ_DRAW: (p, ctx) => {
    const playerId = asStr(p.playerId);
    if (!playerId) return;
    const card = asCard(p.card);
    const targetAnchor = playerHandAnchor(ctx.getMyPlayerId(), playerId);
    ctx.scheduleTimeout(() => {
      ctx.enqueueFlight(DISCARD_PILE_ANCHOR, targetAnchor, {
        faceDown: false,
        cardImage: normImg(card?.image),
        label: card?.name,
        durationMs: STEAL_FLIGHT_MS,
        startScale: 0.72,
        endScale: 0.9,
        fadeOutAtEnd: true,
      });
    }, 60);
  },

  GENERAL_STORE_CARD_PICKED: (p, ctx) => {
    const playerId = asStr(p.playerId);
    if (!playerId) return;
    const card = asCard(p.card);
    const targetAnchor = playerHandAnchor(ctx.getMyPlayerId(), playerId);
    ctx.enqueueFlight(ARENA_ANCHOR, targetAnchor, {
      faceDown: false,
      cardImage: normImg(card?.image),
      label: card?.name,
      durationMs: STEAL_FLIGHT_MS,
      startScale: 0.9,
      endScale: 0.9,
      fadeOutAtEnd: true,
    });
  },

  EL_GRINGO_STOLEN: (p, ctx) => {
    const attackerId = asStr(p.attackerId);
    const victimId = asStr(p.victimId);
    if (!attackerId || !victimId) return;
    const myId = ctx.getMyPlayerId();
    const card = asCard(p.card);
    const isKnown = isKnownSecretCard(card);
    ctx.scheduleTimeout(() => {
      ctx.enqueueFlight(
        playerHandAnchor(myId, attackerId),
        playerHandAnchor(myId, victimId),
        {
          faceDown: !isKnown,
          cardImage: isKnown ? normImg(card.image) : undefined,
          label: isKnown ? card.name : undefined,
          durationMs: STEAL_FLIGHT_MS,
          startScale: 0.85,
          endScale: 0.9,
          fadeOutAtEnd: true,
        }
      );
    }, 120);
  },

  // Hand steals stay secret (Fog of War) and fly directly from victim -> thief
  CARD_STOLEN_FROM_HAND: (p, ctx) => {
    const sourcePlayerId = asStr(p.sourcePlayerId);
    const targetPlayerId = asStr(p.targetPlayerId);
    if (!sourcePlayerId || !targetPlayerId) return;
    const myId = ctx.getMyPlayerId();
    const card = asCard(p.card);
    const isKnown = isKnownSecretCard(card);
    ctx.scheduleTimeout(() => {
      ctx.enqueueFlight(
        playerHandAnchor(myId, targetPlayerId),
        playerHandAnchor(myId, sourcePlayerId),
        {
          faceDown: !isKnown,
          cardImage: isKnown ? normImg(card.image) : undefined,
          label: isKnown ? card.name : undefined,
          durationMs: STEAL_FLIGHT_MS,
          startScale: 0.85,
          endScale: 0.9,
          fadeOutAtEnd: true,
        }
      );
    }, ARENA_FLIGHT_MS + 60);
  },

  EQUIPMENT_STOLEN: createInPlayStolenHandler("EQUIPMENT"),
  GREEN_CARD_STOLEN: createInPlayStolenHandler("GREEN"),
  JUDGEMENT_STOLEN: createInPlayStolenHandler("JUDGEMENT"),

  VULTURE_SAM_SCAVENGED: (p, ctx) => {
    const scavengerId = asStr(p.scavengerId);
    const rawCount = Number(p.cardsCount ?? p.cardCount ?? 0);
    if (!scavengerId || !Number.isFinite(rawCount) || rawCount <= 0) return;
    const count = Math.min(5, Math.floor(rawCount));
    const myId = ctx.getMyPlayerId();
    const victimId = asStr(p.victimId);
    const fromAnchor = victimId ? playerHandAnchor(myId, victimId) : ARENA_ANCHOR;
    for (let i = 0; i < count; i++) {
      ctx.scheduleTimeout(() => {
        ctx.enqueueFlight(fromAnchor, playerHandAnchor(myId, scavengerId), {
          faceDown: true,
          durationMs: STEAL_FLIGHT_MS,
          startScale: 0.8,
          endScale: 0.9,
          fadeOutAtEnd: true,
        });
      }, 200 + i * DRAW_STAGGER_MS);
    }
  },
};

// Dispatch non-arena typed GAME_EVENT choreography handler
export function dispatchGameEventChoreography(
  ev: GameEventMessage,
  ctx: GameEventChoreographyContext
): void {
  const handler = GAME_EVENT_HANDLERS[ev.type];
  if (!handler) return;
  handler(ev.payload || {}, ctx);
}
