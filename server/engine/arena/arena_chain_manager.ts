import {
  ArenaCardEntry,
  ArenaChainState,
  ArenaDestinationZone,
  ArenaEntryKind,
  ArenaOriginZone,
  ArenaOutcomeTag,
  ArenaVfxType,
  EnginePlayer,
  EquipmentSlotKey,
  SimulationState,
} from "../types/state";
import { EngineCard } from "../types/cards";
import { PlayerCommand } from "../types/actions";
import { getAllEquippedCards, normalizeEquipName } from "../utils/inventory";

export const ARENA_FLIGHT_MS = 420;
export const ARENA_BATCH_STAGGER_MS = 340;
export const ARENA_STEP_BUFFER_MS = 100;
export const ARENA_HOLD_SIMPLE_MS = 950;
export const ARENA_HOLD_CHAIN_MS = 1450;
export const ARENA_HOLD_NO_NEW_CARD_MS = 750;
export const ARENA_PLACEMENT_RETURN_MS = 420;

export interface ArenaEntryDraft {
  kind: ArenaEntryKind;
  card: EngineCard;
  actorPlayerId: string;
  actorPlayerName: string;
  targetPlayerId?: string;
  targetPlayerName?: string;
  originZone: ArenaOriginZone;
  originSlotKey?: EquipmentSlotKey;
  destinationZone?: ArenaDestinationZone;
  destinationPlayerId?: string;
  destinationSlotKey?: EquipmentSlotKey;
  actionLabel?: string;
  outcome?: ArenaOutcomeTag;
  vfxType?: ArenaVfxType;
  vfxTargetId?: string;
  vfxAoe?: boolean;
}

export class ArenaChainManager {
  public static createIdleChain(): ArenaChainState {
    return {
      chainId: "",
      status: "IDLE",
      entries: [],
      stepLockUntil: 0,
      settleUntil: 0,
    };
  }

  public static ensureChain(state: SimulationState): ArenaChainState {
    if (!state.arenaChain || !Array.isArray(state.arenaChain.entries)) {
      state.arenaChain = this.createIdleChain();
    }
    return state.arenaChain;
  }

  // Map a blue equipment card to its fixed 6-slot key
  public static resolveEquipmentSlotKey(card: EngineCard): EquipmentSlotKey {
    const upper = normalizeEquipName(String(card.name || "").toUpperCase());
    if (card.category === "weapon" || Boolean(card.weaponRange)) {
      return "weapon";
    }
    if (upper === "BARREL") return "barrel";
    if (upper === "MUSTANG") return "horseDef";
    if (upper === "SCOPE") return "horseOff";
    if (upper === "HIDEOUT") return "hideout";
    if (upper === "BINOCULAR") return "binocular";
    return "hideout";
  }

  // Find actual equipped Barrel card (with real artwork/suit/rank)
  public static getRealBarrelCard(player: EnginePlayer): EngineCard {
    const equipped =
      player.equipments?.barrel ||
      getAllEquippedCards(player).find(
        (c) => normalizeEquipName(String(c.name || "").toUpperCase()) === "BARREL"
      );
    if (equipped) {
      return { ...equipped };
    }
    return {
      id: `barrel_ref_${player.id}`,
      seq: 0,
      templateId: "base_barrel",
      pack: "base",
      name: "BARREL",
      border: "blue",
      category: "equipment",
      rank: "Q",
      suit: "spades",
      desc: "Draw! to dodge BANG! on Hearts.",
      image: "/assets/images/cards/card_barrel.png",
    };
  }

  // Build face-up reference card for Jourdonnais innate check
  public static buildJourdonnaisCard(player: EnginePlayer): EngineCard {
    const hero =
      player.characters.find((c) => c.name.toLowerCase() === "jourdonnais") ||
      (player.copiedCharacter?.name.toLowerCase() === "jourdonnais"
        ? player.copiedCharacter
        : undefined) ||
      player.characters[0];
    return {
      id: `jourdonnais_ref_${player.id}_${Date.now()}`,
      seq: 0,
      templateId: "jourdonnais_skill",
      pack: "base",
      name: "JOURDONNAIS",
      border: "blue",
      category: "skill",
      rank: "Q",
      suit: "hearts",
      desc: hero?.desc || "Innate Barrel: Draw! when targeted by BANG!.",
      image: hero?.image || "/assets/images/cards/card_barrel.png",
    };
  }

  // Calculate total flight time for a batch of newly appended cards
  public static calcBatchFlightMs(batchCount: number): number {
    if (batchCount <= 0) return 0;
    return (batchCount - 1) * ARENA_BATCH_STAGGER_MS + ARENA_FLIGHT_MS;
  }

  // Append one or more entries into the current resolution chain
  public static appendBatch(
    state: SimulationState,
    drafts: ArenaEntryDraft[],
    now: number = Date.now()
  ): ArenaCardEntry[] {
    if (!drafts || drafts.length === 0) return [];
    const chain = this.ensureChain(state);

    if (!chain.chainId || chain.status === "IDLE") {
      state.arenaChainCounter = (state.arenaChainCounter || 0) + 1;
      chain.chainId = `chain_${state.arenaChainCounter}`;
      chain.entries = [];
      chain.status = "ACTIVE_CHAIN";
      chain.stepLockUntil = 0;
      chain.settleUntil = 0;
    }

    const nextBatchIndex =
      chain.entries.length > 0
        ? chain.entries[chain.entries.length - 1].batchIndex + 1
        : 0;

    const added: ArenaCardEntry[] = drafts.map((draft) => {
      const stepIndex = chain.entries.length;
      const defaultLabel = draft.targetPlayerName
        ? `${draft.card.name} -> ${draft.targetPlayerName}`
        : draft.card.name;
      const entry: ArenaCardEntry = {
        id: `${chain.chainId}_s${stepIndex}`,
        stepIndex,
        batchIndex: nextBatchIndex,
        kind: draft.kind,
        card: { ...draft.card },
        actorPlayerId: draft.actorPlayerId,
        actorPlayerName: draft.actorPlayerName,
        targetPlayerId: draft.targetPlayerId,
        targetPlayerName: draft.targetPlayerName,
        originZone: draft.originZone,
        originSlotKey: draft.originSlotKey,
        destinationZone: draft.destinationZone,
        destinationPlayerId: draft.destinationPlayerId,
        destinationSlotKey: draft.destinationSlotKey,
        actionLabel: draft.actionLabel || defaultLabel,
        outcome: draft.outcome,
        vfxType: draft.vfxType,
        vfxTargetId: draft.vfxTargetId,
        vfxAoe: draft.vfxAoe,
        addedAt: now,
      };
      chain.entries.push(entry);
      return entry;
    });

    return added;
  }

  // Transition chain to ACTIVE_CHAIN or SETTLING after a command finishes
  public static finalizeAfterCommand(
    state: SimulationState,
    entriesBeforeCount: number,
    enablePacing: boolean,
    now: number = Date.now()
  ): void {
    const chain = this.ensureChain(state);
    if (chain.entries.length === 0) {
      chain.status = "IDLE";
      chain.chainId = "";
      chain.stepLockUntil = 0;
      chain.settleUntil = 0;
      return;
    }

    const addedCount = Math.max(0, chain.entries.length - entriesBeforeCount);
    const flightMs = this.calcBatchFlightMs(addedCount);

    // Stay in ACTIVE_CHAIN while any reaction remains pending (including AoE Option B & Duel)
    if (state.pendingReactions.length > 0 && !state.gameOver) {
      chain.status = "ACTIVE_CHAIN";
      chain.settleUntil = 0;
      chain.stepLockUntil =
        enablePacing && addedCount > 0
          ? now + Math.max(0, flightMs - 60)
          : 0;
      return;
    }

    // Resolution chain complete -> hold all cards in Card Arena before clearing
    chain.status = "SETTLING";
    chain.stepLockUntil = 0;

    if (!enablePacing) {
      chain.settleUntil = 0;
      return;
    }

    const isMultiOrCheck =
      chain.entries.length > 1 ||
      chain.entries.some(
        (e) => e.kind === "CHECK_RESULT" || e.kind === "DEFENSE_CARD"
      );
    const hasPlacement = chain.entries.some((e) => e.kind === "EQUIP_PLACEMENT");

    const holdMs =
      addedCount === 0
        ? ARENA_HOLD_NO_NEW_CARD_MS
        : isMultiOrCheck
        ? ARENA_HOLD_CHAIN_MS
        : ARENA_HOLD_SIMPLE_MS;

    const placementExtra = hasPlacement ? 120 : 0;
    chain.settleUntil = now + flightMs + holdMs + placementExtra;
  }

  // Clear Card Arena once settling window completes
  public static completeSettling(state: SimulationState): boolean {
    const chain = this.ensureChain(state);
    if (chain.status !== "SETTLING" && chain.entries.length === 0) {
      return false;
    }
    if (chain.status !== "SETTLING") {
      return false;
    }
    state.arenaChain = this.createIdleChain();
    return true;
  }

  // Authoritative command guard while Card Arena is resolving
  public static checkCommandAllowed(
    state: SimulationState,
    command: PlayerCommand,
    enablePacing: boolean,
    now: number = Date.now()
  ): { allowed: boolean; message?: string; autoCleared?: boolean } {
    if (command.type === "SELECT_CHARACTERS") {
      return { allowed: true };
    }

    const chain = this.ensureChain(state);

    if (chain.status === "SETTLING") {
      if (enablePacing && chain.settleUntil > 0 && now < chain.settleUntil) {
        return {
          allowed: false,
          message: "Wait for Card Arena cards to finish clearing.",
        };
      }
      // Window elapsed or pacing disabled -> clear cleanly to avoid deadlocks
      this.completeSettling(state);
      return { allowed: true, autoCleared: true };
    }

    if (chain.status === "ACTIVE_CHAIN") {
      if (state.pendingReactions.length === 0) {
        this.completeSettling(state);
        state.arenaChain = this.createIdleChain();
        return { allowed: true, autoCleared: true };
      }
      if (command.type === "RESOLVE_REACTION") {
        if (enablePacing && chain.stepLockUntil > 0 && now < chain.stepLockUntil) {
          return {
            allowed: false,
            message: "Wait for current Card Arena step to finish landing.",
          };
        }
        return { allowed: true };
      }
      // Non-reaction commands are blocked while chain is active
      return {
        allowed: false,
        message: "Wait for the current Card Arena chain to finish.",
      };
    }

    return { allowed: true };
  }
}
