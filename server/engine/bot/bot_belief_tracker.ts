import { SetupDealer } from "../deck/setup_dealer";
import { DomainEvent } from "../types/actions";
import { EngineCard } from "../types/cards";
import { SanitizedGameState } from "../state/fog_of_war";
import { RoleType } from "../types/state";
import { BotRoleBelief } from "./bot_types";
import { getPlayerById } from "./bot_state_utils";

type HiddenRole = "deputy" | "outlaw" | "renegade";

const HIDDEN_ROLES: HiddenRole[] = ["deputy", "outlaw", "renegade"];
const BELIEF_FLOOR = 0.02;

interface LikelihoodWeights {
  deputy: number;
  outlaw: number;
  renegade: number;
}

export class BotBeliefTracker {
  private beliefs = new Map<string, BotRoleBelief>();
  private swingScores = new Map<string, number>();
  private seenCardIds = new Set<string>();
  private seenRedCount = 0;
  private seenBlackCount = 0;
  private initialized = false;

  // Reset tracker for new match
  public reset(): void {
    this.beliefs.clear();
    this.swingScores.clear();
    this.seenCardIds.clear();
    this.seenRedCount = 0;
    this.seenBlackCount = 0;
    this.initialized = false;
  }

  public getBeliefMap(): Map<string, BotRoleBelief> {
    return this.beliefs;
  }

  public getSwingScores(): Map<string, number> {
    return this.swingScores;
  }

  // Synchronize priors and revealed roles from snapshot
  public syncWithSnapshot(snapshot: SanitizedGameState, botId: string): void {
    const remainingCounts = this.computeRemainingHiddenCounts(snapshot, botId);

    if (!this.initialized) {
      const unknownPlayers = snapshot.players.filter(
        (p) => p.role === "UNKNOWN" && p.id !== botId
      );
      const totalUnknown = Math.max(1, unknownPlayers.length);

      for (const p of snapshot.players) {
        this.swingScores.set(p.id, 0);
        if (p.role !== "UNKNOWN") {
          this.beliefs.set(p.id, this.exactRoleBelief(p.role));
        } else {
          this.beliefs.set(p.id, {
            deputy: remainingCounts.deputy / totalUnknown,
            outlaw: remainingCounts.outlaw / totalUnknown,
            renegade: remainingCounts.renegade / totalUnknown,
          });
        }
      }
      this.initialized = true;
    } else {
      for (const p of snapshot.players) {
        if (p.role !== "UNKNOWN") {
          this.beliefs.set(p.id, this.exactRoleBelief(p.role));
        } else if (!this.beliefs.has(p.id)) {
          this.beliefs.set(p.id, { deputy: 0.25, outlaw: 0.5, renegade: 0.25 });
        }
      }
    }

    this.recordVisibleCardsFromSnapshot(snapshot);
    this.enforceGlobalConstraints(snapshot, botId, remainingCounts);
  }

  // Update Bayesian beliefs from public domain events
  public observeEvents(
    events: DomainEvent[],
    snapshot: SanitizedGameState,
    botId: string
  ): void {
    if (!this.initialized) {
      this.syncWithSnapshot(snapshot, botId);
    }

    for (const ev of events) {
      this.recordCardsFromEvent(ev);
      this.processEventForBeliefs(ev, snapshot, botId);
    }

    const remainingCounts = this.computeRemainingHiddenCounts(snapshot, botId);
    this.enforceGlobalConstraints(snapshot, botId, remainingCounts);
  }

  // Estimate preferred Peyote guess from seen cards
  public getPreferredPeyoteColor(snapshot: SanitizedGameState): "RED" | "BLACK" {
    const code = snapshot.activeEvent?.effectCode;
    if (code === "EVENT_HN_BLESSING") return "RED";
    if (code === "EVENT_HN_CURSE") return "BLACK";

    // Standard deck split is near 50/50 red vs black
    const totalPerColor = 40;
    const remRed = Math.max(1, totalPerColor - this.seenRedCount);
    const remBlack = Math.max(1, totalPerColor - this.seenBlackCount);
    return remRed >= remBlack ? "RED" : "BLACK";
  }

  // Compute remaining hidden role counts from public info
  private computeRemainingHiddenCounts(
    snapshot: SanitizedGameState,
    botId: string
  ): Record<HiddenRole, number> {
    const counts: Record<HiddenRole, number> = {
      deputy: 0,
      outlaw: 0,
      renegade: 0,
    };

    const totalPlayers = snapshot.players.length;
    if (totalPlayers < 3 || totalPlayers > 8) return counts;

    const distribution = SetupDealer.getRoleDistribution(
      totalPlayers,
      snapshot.is3PlayerVariant
    );
    for (const r of distribution) {
      if (r === "deputy" || r === "outlaw" || r === "renegade") {
        counts[r] += 1;
      }
    }

    for (const p of snapshot.players) {
      const role = p.id === botId ? snapshot.myState?.role ?? p.role : p.role;
      if (role === "deputy" || role === "outlaw" || role === "renegade") {
        counts[role] = Math.max(0, counts[role] - 1);
      }
    }
    return counts;
  }

  private exactRoleBelief(role: RoleType): BotRoleBelief {
    return {
      deputy: role === "deputy" ? 1 : 0,
      outlaw: role === "outlaw" ? 1 : 0,
      renegade: role === "renegade" ? 1 : 0,
    };
  }

  // Apply Bayesian likelihood shift for one event
  private processEventForBeliefs(
    ev: DomainEvent,
    snapshot: SanitizedGameState,
    botId: string
  ): void {
    const payload = ev.payload || {};
    const actorId: string | undefined =
      payload.sourcePlayerId ?? payload.fromPlayerId ?? payload.playerId ?? payload.attackerId;
    const targetId: string | undefined = payload.targetPlayerId ?? payload.victimId;

    if (!actorId || actorId === botId) return;
    const actor = getPlayerById(snapshot, actorId);
    if (!actor || actor.role !== "UNKNOWN") return;

    const target = getPlayerById(snapshot, targetId);
    const targetIsSheriff = Boolean(target?.isSheriff);
    const targetBelief = targetId ? this.beliefs.get(targetId) : undefined;
    const targetLikelyOutlaw = (targetBelief?.outlaw ?? 0) >= 0.65;
    const targetLikelyDeputy = (targetBelief?.deputy ?? 0) >= 0.55;
    const sheriffHp = targetIsSheriff ? target?.hp ?? 4 : 4;
    const estimatedOutlaws = this.estimateLivingRoleSum(snapshot, "outlaw");

    if (
      ev.type === "BANG_PLAYED" ||
      ev.type === "DUEL_STARTED" ||
      ev.type === "ATTACK_INITIATED" ||
      ev.type === "DOC_HOLYDAY_BANG"
    ) {
      if (!target || target.id === actor.id) return;
      if (targetIsSheriff) {
        if (sheriffHp <= 2 && estimatedOutlaws >= 0.8) {
          this.multiplyBelief(actorId, { deputy: 0.02, outlaw: 3.5, renegade: 0.25 });
        } else {
          this.multiplyBelief(actorId, { deputy: 0.08, outlaw: 2.6, renegade: 0.85 });
        }
      } else if (targetLikelyOutlaw) {
        this.multiplyBelief(actorId, { deputy: 2.0, outlaw: 0.45, renegade: 1.8 });
        this.addSwing(actorId, 0.35);
      } else if (targetLikelyDeputy) {
        this.multiplyBelief(actorId, { deputy: 0.3, outlaw: 2.1, renegade: 1.45 });
        this.addSwing(actorId, 0.2);
      }
      return;
    }

    if (
      ev.type === "CARD_DESTROYED" ||
      ev.type === "CARD_STOLEN" ||
      ev.type === "PANIC_RESOLVED" ||
      ev.type === "CAT_BALOU_RESOLVED"
    ) {
      if (!target || target.id === actor.id) return;
      const cardName = String(payload.card?.name ?? payload.destroyedCard?.name ?? "").toUpperCase();
      const area = String(payload.targetArea ?? "");
      const removedHazard = cardName === "DYNAMITE" || cardName === "JAIL" || area === "JUDGEMENT";

      if (targetIsSheriff) {
        if (removedHazard) {
          this.multiplyBelief(actorId, { deputy: 3.2, outlaw: 0.1, renegade: 1.4 });
          this.addSwing(actorId, 0.4);
        } else {
          this.multiplyBelief(actorId, { deputy: 0.12, outlaw: 2.1, renegade: 0.75 });
        }
      } else if (targetLikelyOutlaw && !removedHazard) {
        this.multiplyBelief(actorId, { deputy: 1.65, outlaw: 0.55, renegade: 1.45 });
      } else if (targetLikelyDeputy && !removedHazard) {
        this.multiplyBelief(actorId, { deputy: 0.35, outlaw: 1.9, renegade: 1.3 });
      }
      return;
    }

    if (ev.type === "JAIL_PLACED" || (ev.type === "JUDGEMENT_PLACED" && payload.card?.name === "JAIL")) {
      if (!target || target.id === actor.id) return;
      if (targetLikelyOutlaw) {
        this.multiplyBelief(actorId, { deputy: 1.9, outlaw: 0.4, renegade: 1.7 });
      } else if (targetLikelyDeputy) {
        this.multiplyBelief(actorId, { deputy: 0.3, outlaw: 2.2, renegade: 1.3 });
      }
      return;
    }

    if (
      ev.type === "TEQUILA_RESOLVED" ||
      ev.type === "HEAL_RESOLVED" ||
      ev.type === "EVENT_BLOOD_BROTHERS_RESOLVED"
    ) {
      if (!target || target.id === actor.id) return;
      if (targetIsSheriff) {
        this.multiplyBelief(actorId, { deputy: 3.6, outlaw: 0.05, renegade: 1.6 });
        this.addSwing(actorId, 0.5);
      } else if (targetLikelyOutlaw) {
        this.multiplyBelief(actorId, { deputy: 0.25, outlaw: 2.3, renegade: 0.7 });
      }
      return;
    }

    if (
      ev.type === "GATLING_PLAYED" ||
      ev.type === "INDIANS_PLAYED" ||
      ev.type === "BRAWL_RESOLVED" ||
      ev.type === "HOWITZER_PLAYED"
    ) {
      this.multiplyBelief(actorId, { deputy: 0.85, outlaw: 1.2, renegade: 1.15 });
    }
  }

  private multiplyBelief(playerId: string, w: LikelihoodWeights): void {
    const current = this.beliefs.get(playerId);
    if (!current) return;
    current.deputy = Math.max(BELIEF_FLOOR, current.deputy * w.deputy);
    current.outlaw = Math.max(BELIEF_FLOOR, current.outlaw * w.outlaw);
    current.renegade = Math.max(BELIEF_FLOOR, current.renegade * w.renegade);
    this.normalizeRow(current);
  }

  private addSwing(playerId: string, delta: number): void {
    const prev = this.swingScores.get(playerId) ?? 0;
    this.swingScores.set(playerId, prev + delta);
  }

  private normalizeRow(b: BotRoleBelief): void {
    const sum = b.deputy + b.outlaw + b.renegade;
    if (sum <= 0) {
      b.deputy = 1 / 3;
      b.outlaw = 1 / 3;
      b.renegade = 1 / 3;
      return;
    }
    b.deputy /= sum;
    b.outlaw /= sum;
    b.renegade /= sum;
  }

  // Two-pass iterative proportional fitting across unknown seats
  private enforceGlobalConstraints(
    snapshot: SanitizedGameState,
    botId: string,
    remainingCounts: Record<HiddenRole, number>
  ): void {
    const unknownIds = snapshot.players
      .filter((p) => p.role === "UNKNOWN" && p.id !== botId)
      .map((p) => p.id);

    if (unknownIds.length === 0) return;

    // Zero out roles with zero remaining seats
    for (const id of unknownIds) {
      const b = this.beliefs.get(id);
      if (!b) continue;
      for (const r of HIDDEN_ROLES) {
        if (remainingCounts[r] <= 0) {
          b[r] = 0;
        } else if (b[r] < BELIEF_FLOOR) {
          b[r] = BELIEF_FLOOR;
        }
      }
      this.normalizeRow(b);
    }

    // Two-pass column/row IPF scaling
    for (let pass = 0; pass < 2; pass++) {
      for (const r of HIDDEN_ROLES) {
        const targetSum = remainingCounts[r];
        if (targetSum <= 0) continue;
        let colSum = 0;
        for (const id of unknownIds) {
          colSum += this.beliefs.get(id)?.[r] ?? 0;
        }
        if (colSum > 0) {
          const scale = targetSum / colSum;
          for (const id of unknownIds) {
            const b = this.beliefs.get(id);
            if (b) b[r] *= scale;
          }
        }
      }
      for (const id of unknownIds) {
        const b = this.beliefs.get(id);
        if (b) this.normalizeRow(b);
      }
    }
  }

  private estimateLivingRoleSum(
    snapshot: SanitizedGameState,
    role: HiddenRole
  ): number {
    let total = 0;
    for (const p of snapshot.players) {
      if (p.isDead || p.hp <= 0) continue;
      if (p.role === role) {
        total += 1;
      } else if (p.role === "UNKNOWN") {
        total += this.beliefs.get(p.id)?.[role] ?? 0;
      }
    }
    return total;
  }

  private recordVisibleCardsFromSnapshot(snapshot: SanitizedGameState): void {
    if (snapshot.topDiscardCard) {
      this.trackPublicCard(snapshot.topDiscardCard);
    }
    if (snapshot.myState?.handCards) {
      for (const c of snapshot.myState.handCards) {
        this.trackPublicCard(c);
      }
    }
    for (const p of snapshot.players) {
      const eq = p.equipments || {};
      if (eq.weapon) this.trackPublicCard(eq.weapon);
      if (eq.horseDef) this.trackPublicCard(eq.horseDef);
      if (eq.horseOff) this.trackPublicCard(eq.horseOff);
      if (eq.barrel) this.trackPublicCard(eq.barrel);
      if (eq.extra) this.trackPublicCard(eq.extra);
      for (const c of eq.extras || []) this.trackPublicCard(c);
      for (const g of p.greenCards || []) this.trackPublicCard(g.card);
      for (const j of p.judgements || []) this.trackPublicCard(j.card);
    }
  }

  private recordCardsFromEvent(ev: DomainEvent): void {
    const p = ev.payload || {};
    if (ev.type === "DECK_RESHUFFLED") {
      this.seenCardIds.clear();
      this.seenRedCount = 0;
      this.seenBlackCount = 0;
      return;
    }
    const candidates: Array<EngineCard | undefined> = [
      p.card,
      p.sourceCard,
      p.chosenCard,
      p.destroyedCard,
    ];
    for (const c of candidates) {
      if (c && c.id && c.suit) this.trackPublicCard(c);
    }
    if (Array.isArray(p.drawnCards)) {
      for (const c of p.drawnCards) {
        if (c && c.id && c.suit) this.trackPublicCard(c);
      }
    }
  }

  private trackPublicCard(card: EngineCard): void {
    if (!card?.id || this.seenCardIds.has(card.id)) return;
    this.seenCardIds.add(card.id);
    if (card.suit === "hearts" || card.suit === "diamonds") {
      this.seenRedCount += 1;
    } else if (card.suit === "spades" || card.suit === "clubs") {
      this.seenBlackCount += 1;
    }
  }
}
