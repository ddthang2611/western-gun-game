import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ArenaCardEntry,
  ArenaChainState,
  Card,
  Character,
  EquipmentSlot,
  GeneralStoreInfo,
  GreenCard,
  TableState,
} from "../../../types/game";
import type { SelectedTargetCard } from "../../../components/game";
import {
  initialMockState,
  initialMyEquipments,
  initialMyGreenCards,
  initialMyHand,
  initialMyHeroes,
} from "@data/mock/mockGameTable";
import { resolveEquipmentSlotKey } from "../../../utils/equipments";
import { TARGETED_SINGLE_CARDS } from "../utils/cardRules";
import type { SkillModeType } from "../utils/tableSelectors";

export interface UseMockTableSimulationParams {
  externalHeroes?: Character[];
  showError: (message: string) => void;
}

const IDLE_ARENA: ArenaChainState = {
  chainId: "",
  status: "IDLE",
  entries: [],
};

// Isolate offline /dev-test mock simulation using the same ArenaChain pipeline as live server
export function useMockTableSimulation({
  externalHeroes,
  showError,
}: UseMockTableSimulationParams) {
  const [state, setState] = useState<TableState>(() => ({
    ...initialMockState,
    arenaChain: IDLE_ARENA,
  }));
  const [myHand, setMyHand] = useState<Card[]>(initialMyHand);
  const [myHeroes, setMyHeroes] = useState<Character[]>(
    () => externalHeroes || initialMyHeroes
  );
  const [myHp, setMyHp] = useState(() =>
    externalHeroes && externalHeroes.length > 0
      ? Math.min(...externalHeroes.map((h) => h.baseHp))
      : 4
  );
  const [myMaxHp, setMyMaxHp] = useState(() =>
    externalHeroes && externalHeroes.length > 0
      ? Math.min(...externalHeroes.map((h) => h.baseHp))
      : 4
  );
  const [myEquipments, setMyEquipments] = useState<EquipmentSlot>(initialMyEquipments);
  const [myGreenCards, setMyGreenCards] = useState<GreenCard[]>(initialMyGreenCards);
  const [myJudgements, setMyJudgements] = useState({
    hasJail: false,
    hasDynamite: false,
  });

  const chainSeqRef = useRef(0);
  const settleTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
      }
    };
  }, []);

  const showMockArenaChain = useCallback(
    (
      drafts: Array<
        Omit<ArenaCardEntry, "id" | "stepIndex" | "batchIndex" | "addedAt">
      >,
      holdMs = 1350,
      onCleared?: () => void
    ) => {
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
      chainSeqRef.current += 1;
      const chainId = `mock_chain_${chainSeqRef.current}`;
      const now = Date.now();
      const entries: ArenaCardEntry[] = drafts.map((d, idx) => ({
        ...d,
        id: `${chainId}_s${idx}`,
        stepIndex: idx,
        batchIndex: 0,
        addedAt: now,
      }));
      setState((prev) => ({
        ...prev,
        arenaChain: {
          chainId,
          status: "SETTLING",
          entries,
          settleRemainingMs: holdMs,
        },
      }));
      settleTimerRef.current = window.setTimeout(() => {
        settleTimerRef.current = null;
        setState((prev) => ({
          ...prev,
          arenaChain: IDLE_ARENA,
        }));
        onCleared?.();
      }, holdMs);
    },
    []
  );

  const applyMockManipulation = useCallback(
    (
      targetPlayerId: string,
      chosen: Pick<SelectedTargetCard, "region" | "cardId" | "label">,
      isSteal: boolean,
      actionName: string
    ) => {
      setState((prev) => ({
        ...prev,
        players: prev.players.map((p) => {
          if (p.id !== targetPlayerId) return p;
          const nextEquip = { ...p.equipments };
          let nextHandCount = p.handCount;
          let nextGreen = p.greenCards;
          let nextHasJail = p.hasJail;
          let nextHasDyn = p.hasDynamite;
          let nextJudgements = p.judgements;

          if (chosen.region === "hand" && nextHandCount > 0) {
            nextHandCount -= 1;
          } else if (chosen.region === "equipment" && chosen.cardId) {
            if (nextEquip.weapon?.id === chosen.cardId) delete nextEquip.weapon;
            else if (nextEquip.horseDef?.id === chosen.cardId) delete nextEquip.horseDef;
            else if (nextEquip.horseOff?.id === chosen.cardId) delete nextEquip.horseOff;
            else if (nextEquip.barrel?.id === chosen.cardId) delete nextEquip.barrel;
            else if (nextEquip.extra?.id === chosen.cardId) delete nextEquip.extra;
          } else if (chosen.region === "green" && chosen.cardId) {
            nextGreen = nextGreen.filter((g) => g.id !== chosen.cardId);
          } else if (chosen.region === "judgement" && chosen.cardId) {
            if (chosen.cardId === "jail") nextHasJail = false;
            if (chosen.cardId === "dynamite") nextHasDyn = false;
            if (nextJudgements) {
              nextJudgements = nextJudgements.filter((j) => j.id !== chosen.cardId);
            }
          }
          return {
            ...p,
            handCount: nextHandCount,
            equipments: nextEquip,
            greenCards: nextGreen,
            hasJail: nextHasJail,
            hasDynamite: nextHasDyn,
            judgements: nextJudgements,
          };
        }),
        combatLog: [
          `${actionName}: ${isSteal ? "Steal" : "Discard"} ${chosen.label}`,
          ...prev.combatLog,
        ],
      }));
    },
    []
  );

  const confirmMockManipulationPicker = useCallback(
    (
      targetId: string,
      chosen: SelectedTargetCard,
      isSteal: boolean,
      cardName: string,
      selectedCardId?: string,
      discardCostIds: string[] = [],
      sourceGreenCardId?: string
    ) => {
      const playedCard = selectedCardId
        ? myHand.find((c) => c.id === selectedCardId)
        : myGreenCards.find((g) => g.id === sourceGreenCardId)?.card;
      const targetPlayer = state.players.find((p) => p.id === targetId);

      applyMockManipulation(targetId, chosen, isSteal, cardName);
      if (selectedCardId) {
        const removed = new Set([selectedCardId, ...discardCostIds]);
        setMyHand((prev) => prev.filter((c) => !removed.has(c.id)));
      }
      if (sourceGreenCardId) {
        setMyGreenCards((prev) => prev.filter((g) => g.id !== sourceGreenCardId));
      }
      if (playedCard) {
        showMockArenaChain(
          [
            {
              kind: "PLAYED_CARD",
              card: playedCard,
              actorPlayerId: state.myPlayerId,
              actorPlayerName: "You",
              targetPlayerId: targetId,
              targetPlayerName: targetPlayer?.name,
              originZone: sourceGreenCardId ? "GREEN" : "HAND",
              destinationZone: "DISCARD",
              actionLabel: `${cardName} -> ${targetPlayer?.name || "Target"}`,
            },
          ],
          1400
        );
      }
    },
    [
      applyMockManipulation,
      myGreenCards,
      myHand,
      showMockArenaChain,
      state.myPlayerId,
      state.players,
    ]
  );

  const confirmMockSkill = useCallback(
    (
      skillMode: SkillModeType,
      skillDiscardIds: string[],
      selectedTargetId: string | null
    ): boolean => {
      if (skillMode === "CHUCK_WENGAM_SACRIFICE") {
        if (myHp <= 1) {
          showError("Cannot sacrifice your last HP.");
          return false;
        }
        setMyHp((prev) => prev - 1);
        setState((prev) => ({
          ...prev,
          combatLog: ["Chuck Wengam: -1 HP, Draw 2", ...prev.combatLog],
        }));
        return true;
      }

      if (skillMode === "JOSE_DELGADO_DRAW") {
        const chosenCard = myHand.find((c) => c.id === skillDiscardIds[0]);
        if (!chosenCard || chosenCard.border !== "blue") {
          showError("Select a blue card for Jose Delgado.");
          return false;
        }
        setMyHand((prev) => prev.filter((c) => c.id !== chosenCard.id));
        showMockArenaChain(
          [
            {
              kind: "EXTRA_COST",
              card: chosenCard,
              actorPlayerId: state.myPlayerId,
              actorPlayerName: "You",
              originZone: "HAND",
              destinationZone: "DISCARD",
              actionLabel: "Jose Delgado (+2)",
              vfxType: "draw",
            },
          ],
          1350
        );
        setState((prev) => ({
          ...prev,
          combatLog: [`Jose Delgado: -${chosenCard.name}, Draw 2`, ...prev.combatLog],
        }));
        return true;
      }

      if (skillMode === "SID_KETCHUM_HEAL") {
        if (skillDiscardIds.length !== 2) {
          showError("Select 2 cards from your hand for Sid Ketchum.");
          return false;
        }
        const chosenIds = skillDiscardIds.slice(0, 2);
        const discarded = myHand.filter((c) => chosenIds.includes(c.id));
        setMyHand((prev) => prev.filter((c) => !chosenIds.includes(c.id)));
        setMyHp((prev) => Math.min(prev + 1, myMaxHp));
        showMockArenaChain(
          discarded.map((c, idx) => ({
            kind: "EXTRA_COST",
            card: c,
            actorPlayerId: state.myPlayerId,
            actorPlayerName: "You",
            originZone: "HAND",
            destinationZone: "DISCARD",
            actionLabel: "Sid Ketchum (+1 HP)",
            vfxType: idx === 0 ? "heal" : undefined,
            vfxTargetId: idx === 0 ? state.myPlayerId : undefined,
          })),
          1700
        );
        setState((prev) => ({
          ...prev,
          combatLog: ["Sid Ketchum: +1 HP", ...prev.combatLog],
        }));
        return true;
      }

      if (skillMode === "DOC_HOLYDAY_BANG") {
        if (skillDiscardIds.length < 2) {
          showError("Select 2 cards from your hand to discard for Doc Holyday.");
          return false;
        }
        if (!selectedTargetId) {
          showError("Select a target opponent to shoot.");
          return false;
        }
        const discarded = myHand.filter((c) => skillDiscardIds.includes(c.id)).slice(0, 2);
        const target = state.players.find((p) => p.id === selectedTargetId);
        setMyHand((prev) => prev.filter((c) => !skillDiscardIds.includes(c.id)));
        showMockArenaChain(
          discarded.map((c, idx) => ({
            kind: idx === 0 ? "PLAYED_CARD" : "EXTRA_COST",
            card: c,
            actorPlayerId: state.myPlayerId,
            actorPlayerName: "You",
            targetPlayerId: selectedTargetId,
            targetPlayerName: target?.name,
            originZone: "HAND",
            destinationZone: "DISCARD",
            actionLabel: "Doc Holyday BANG!",
            vfxType: idx === 0 ? "bullet" : undefined,
            vfxTargetId: idx === 0 ? selectedTargetId : undefined,
          })),
          1750
        );
        setState((prev) => ({
          ...prev,
          combatLog: ["Doc Holyday: BANG!", ...prev.combatLog],
        }));
        return true;
      }

      return false;
    },
    [myHand, myHp, myMaxHp, showError, showMockArenaChain, state.myPlayerId, state.players]
  );

  const playMockGreenCard = useCallback(
    (selectedGreenCard: GreenCard, selectedTargetId: string | null) => {
      const gName = selectedGreenCard.card.name;
      const target = selectedTargetId
        ? state.players.find((p) => p.id === selectedTargetId)
        : undefined;
      let vfxType: ArenaCardEntry["vfxType"] = "bullet";
      let vfxTargetId: string | undefined = selectedTargetId || undefined;
      let vfxAoe = false;

      if (TARGETED_SINGLE_CARDS.has(gName) && selectedTargetId) {
        vfxType = "bullet";
      } else if (gName === "CANTEEN") {
        setMyHp((prev) => Math.min(prev + 1, myMaxHp));
        vfxType = "heal";
        vfxTargetId = state.myPlayerId;
      } else if (gName === "PONY EXPRESS") {
        vfxType = "draw";
        vfxTargetId = undefined;
      } else {
        vfxType = "bullet";
        vfxAoe = true;
      }

      setMyGreenCards((prev) => prev.filter((g) => g.id !== selectedGreenCard.id));
      showMockArenaChain(
        [
          {
            kind: "PLAYED_CARD",
            card: selectedGreenCard.card,
            actorPlayerId: state.myPlayerId,
            actorPlayerName: "You",
            targetPlayerId: target?.id,
            targetPlayerName: target?.name,
            originZone: "GREEN",
            destinationZone: "DISCARD",
            actionLabel: target ? `${gName} -> ${target.name}` : gName,
            vfxType,
            vfxTargetId,
            vfxAoe,
          },
        ],
        1450
      );
      setState((prev) => ({
        ...prev,
        combatLog: [`You: ${gName}`, ...prev.combatLog],
      }));
    },
    [myMaxHp, showMockArenaChain, state.myPlayerId, state.players]
  );

  const playMockHandCard = useCallback(
    (
      selectedCard: Card,
      discardCostIds: string[],
      selectedTargetId: string | null
    ): boolean => {
      if (selectedCard.border === "green") {
        if (myGreenCards.length >= 10) {
          showError("Green-Delay Grid is full (max 10 cards).");
          return false;
        }
        setMyGreenCards((prev) => [
          ...prev,
          { id: `g_${Date.now()}`, card: selectedCard, isDelay: true },
        ]);
        setMyHand((prev) => prev.filter((c) => c.id !== selectedCard.id));
        showMockArenaChain(
          [
            {
              kind: "EQUIP_PLACEMENT",
              card: selectedCard,
              actorPlayerId: state.myPlayerId,
              actorPlayerName: "You",
              originZone: "HAND",
              destinationZone: "GREEN",
              destinationPlayerId: state.myPlayerId,
              actionLabel: `Place ${selectedCard.name}`,
            },
          ],
          1450
        );
        setState((prev) => ({
          ...prev,
          combatLog: [`Set: ${selectedCard.name}`, ...prev.combatLog],
        }));
        return true;
      }

      const removedIds = new Set([selectedCard.id, ...discardCostIds]);
      const extraCards = myHand.filter((c) => discardCostIds.includes(c.id));

      if (
        selectedCard.name === "BEER" ||
        selectedCard.name === "WHISKY" ||
        selectedCard.name === "TEQUILA"
      ) {
        const healAmt = selectedCard.name === "WHISKY" ? 2 : 1;
        const healTarget =
          selectedCard.name === "TEQUILA" && selectedTargetId
            ? selectedTargetId
            : state.myPlayerId;
        if (healTarget === state.myPlayerId) {
          setMyHp((prev) => Math.min(prev + healAmt, myMaxHp));
        }
        setMyHand((prev) => prev.filter((c) => !removedIds.has(c.id)));
        showMockArenaChain(
          [
            {
              kind: "PLAYED_CARD",
              card: selectedCard,
              actorPlayerId: state.myPlayerId,
              actorPlayerName: "You",
              originZone: "HAND",
              destinationZone: "DISCARD",
              actionLabel: `${selectedCard.name} (+${healAmt} HP)`,
              vfxType: "heal",
              vfxTargetId: healTarget,
            },
            ...extraCards.map((c) => ({
              kind: "EXTRA_COST" as const,
              card: c,
              actorPlayerId: state.myPlayerId,
              actorPlayerName: "You",
              originZone: "HAND" as const,
              destinationZone: "DISCARD" as const,
              actionLabel: `Cost (${c.name})`,
            })),
          ],
          1450
        );
        setState((prev) => ({
          ...prev,
          combatLog: [`You: ${selectedCard.name} (+${healAmt} HP)`, ...prev.combatLog],
        }));
        return true;
      }

      if (selectedCard.name === "SALOON") {
        setMyHp((prev) => Math.min(prev + 1, myMaxHp));
        setMyHand((prev) => prev.filter((c) => !removedIds.has(c.id)));
        showMockArenaChain(
          [
            {
              kind: "PLAYED_CARD",
              card: selectedCard,
              actorPlayerId: state.myPlayerId,
              actorPlayerName: "You",
              originZone: "HAND",
              destinationZone: "DISCARD",
              actionLabel: "SALOON (+1 HP All)",
              vfxType: "heal",
              vfxAoe: true,
            },
          ],
          1450
        );
        setState((prev) => ({
          ...prev,
          combatLog: ["You: SALOON (+1 HP all)", ...prev.combatLog],
        }));
        return true;
      }

      if (
        selectedCard.name === "GATLING" ||
        selectedCard.name === "INDIANS!" ||
        selectedCard.name === "BRAWL"
      ) {
        setMyHand((prev) => prev.filter((c) => !removedIds.has(c.id)));
        showMockArenaChain(
          [
            {
              kind: "PLAYED_CARD",
              card: selectedCard,
              actorPlayerId: state.myPlayerId,
              actorPlayerName: "You",
              originZone: "HAND",
              destinationZone: "DISCARD",
              actionLabel: selectedCard.name,
              vfxType: "bullet",
              vfxAoe: true,
            },
            ...extraCards.map((c) => ({
              kind: "EXTRA_COST" as const,
              card: c,
              actorPlayerId: state.myPlayerId,
              actorPlayerName: "You",
              originZone: "HAND" as const,
              destinationZone: "DISCARD" as const,
              actionLabel: `Cost (${c.name})`,
            })),
          ],
          1550
        );
        setState((prev) => ({
          ...prev,
          combatLog: [`You: ${selectedCard.name}`, ...prev.combatLog],
        }));
        return true;
      }

      if (selectedCard.border === "blue") {
        const slotKey = resolveEquipmentSlotKey(selectedCard);
        setMyEquipments((prev) => {
          if (slotKey === "weapon") return { ...prev, weapon: selectedCard };
          if (slotKey === "barrel") return { ...prev, barrel: selectedCard };
          if (slotKey === "horseDef") return { ...prev, horseDef: selectedCard };
          if (slotKey === "horseOff") return { ...prev, horseOff: selectedCard };
          const extras = [...(prev.extras || []), selectedCard];
          return { ...prev, extra: extras[0], extras };
        });
        setMyHand((prev) => prev.filter((c) => !removedIds.has(c.id)));
        showMockArenaChain(
          [
            {
              kind: "EQUIP_PLACEMENT",
              card: selectedCard,
              actorPlayerId: state.myPlayerId,
              actorPlayerName: "You",
              originZone: "HAND",
              destinationZone: "EQUIPMENT",
              destinationPlayerId: state.myPlayerId,
              destinationSlotKey: slotKey,
              actionLabel: `Equip ${selectedCard.name}`,
            },
          ],
          1450
        );
        setState((prev) => ({
          ...prev,
          combatLog: [`Equip: ${selectedCard.name}`, ...prev.combatLog],
        }));
        return true;
      }

      if (
        selectedCard.name === "BANG!" ||
        selectedCard.name === "SPRINGFIELD" ||
        selectedCard.name === "PUNCH"
      ) {
        if (!selectedTargetId) {
          showError(`Select a target opponent for ${selectedCard.name}.`);
          return false;
        }
        const target = state.players.find((p) => p.id === selectedTargetId);
        if (!target) return false;

        setMyHand((prev) => prev.filter((c) => !removedIds.has(c.id)));
        showMockArenaChain(
          [
            {
              kind: "PLAYED_CARD",
              card: selectedCard,
              actorPlayerId: state.myPlayerId,
              actorPlayerName: "You",
              targetPlayerId: target.id,
              targetPlayerName: target.name,
              originZone: "HAND",
              destinationZone: "DISCARD",
              actionLabel: `${selectedCard.name} -> ${target.name}`,
              vfxType: "bullet",
              vfxTargetId: target.id,
            },
            ...extraCards.map((c) => ({
              kind: "EXTRA_COST" as const,
              card: c,
              actorPlayerId: state.myPlayerId,
              actorPlayerName: "You",
              originZone: "HAND" as const,
              destinationZone: "DISCARD" as const,
              actionLabel: `Cost (${c.name})`,
            })),
          ],
          1850,
          () => {
            setState((prev) => ({
              ...prev,
              discardCount: prev.discardCount + 1,
              topDiscard: selectedCard,
            }));
          }
        );
        setState((prev) => ({
          ...prev,
          combatLog: [`You -> ${target.name}: ${selectedCard.name}`, ...prev.combatLog],
        }));
        return true;
      }

      setMyHand((prev) => prev.filter((c) => !removedIds.has(c.id)));
      showMockArenaChain(
        [
          {
            kind: "PLAYED_CARD",
            card: selectedCard,
            actorPlayerId: state.myPlayerId,
            actorPlayerName: "You",
            originZone: "HAND",
            destinationZone: "DISCARD",
            actionLabel: selectedCard.name,
          },
        ],
        1400
      );
      setState((prev) => ({
        ...prev,
        combatLog: [`You: ${selectedCard.name}`, ...prev.combatLog],
      }));
      return true;
    },
    [
      myGreenCards.length,
      myHand,
      myMaxHp,
      showError,
      showMockArenaChain,
      state.myPlayerId,
      state.players,
    ]
  );

  const endMockTurn = useCallback(() => {
    const judgeDrafts: Array<
      Omit<ArenaCardEntry, "id" | "stepIndex" | "batchIndex" | "addedAt">
    > = [];

    if (myJudgements.hasDynamite) {
      const isExploded = Math.random() < 0.25;
      const dynSrcCard: Card = {
        id: `dyn_src_${Date.now()}`,
        name: "DYNAMITE",
        suit: "hearts",
        rank: "2",
        border: "blue",
        image: "/assets/images/cards/card_dynamite.png",
        desc: "Dynamite judgement.",
      };
      const dynCheckCard: Card = {
        id: `dyn_chk_${Date.now()}`,
        name: isExploded ? "BANG!" : "MISSED!",
        suit: isExploded ? "spades" : "hearts",
        rank: isExploded ? "4" : "10",
        border: "brown",
        image: isExploded
          ? "/assets/images/cards/card_bang.png"
          : "/assets/images/cards/card_missed.png",
        desc: isExploded ? "Spades 2-9: Exploded for 3 damage!" : "Check passed.",
      };
      judgeDrafts.push(
        {
          kind: "CHECK_SOURCE",
          card: dynSrcCard,
          actorPlayerId: state.myPlayerId,
          actorPlayerName: "You",
          originZone: "JUDGEMENT",
          destinationZone: "DISCARD",
          actionLabel: "DYNAMITE Judgement",
        },
        {
          kind: "CHECK_RESULT",
          card: dynCheckCard,
          actorPlayerId: state.myPlayerId,
          actorPlayerName: "You",
          originZone: "DECK",
          destinationZone: "DISCARD",
          actionLabel: isExploded ? "Spades 4 (EXPLODED)" : "Hearts 10 (PASSED)",
          outcome: isExploded ? "EXPLODED" : "PASSED",
          vfxType: isExploded ? "dynamite" : undefined,
          vfxTargetId: isExploded ? state.myPlayerId : undefined,
        }
      );
      if (isExploded) {
        setMyHp((h) => Math.max(0, h - 3));
        setMyJudgements((j) => ({ ...j, hasDynamite: false }));
      }
    }

    if (myJudgements.hasJail) {
      const isEscaped = Math.random() < 0.25;
      const jailSrcCard: Card = {
        id: `jail_src_${Date.now()}`,
        name: "JAIL",
        suit: "spades",
        rank: "J",
        border: "blue",
        image: "/assets/images/cards/card_jail.png",
        desc: "Jail judgement.",
      };
      const jailCheckCard: Card = {
        id: `jail_chk_${Date.now()}`,
        name: isEscaped ? "BEER" : "PANIC!",
        suit: isEscaped ? "hearts" : "clubs",
        rank: isEscaped ? "J" : "7",
        border: "brown",
        image: isEscaped
          ? "/assets/images/cards/card_beer.png"
          : "/assets/images/cards/card_panic.png",
        desc: isEscaped ? "Heart: Escaped jail!" : "Check failed: Lost turn.",
      };
      judgeDrafts.push(
        {
          kind: "CHECK_SOURCE",
          card: jailSrcCard,
          actorPlayerId: state.myPlayerId,
          actorPlayerName: "You",
          originZone: "JUDGEMENT",
          destinationZone: "DISCARD",
          actionLabel: "JAIL Judgement",
        },
        {
          kind: "CHECK_RESULT",
          card: jailCheckCard,
          actorPlayerId: state.myPlayerId,
          actorPlayerName: "You",
          originZone: "DECK",
          destinationZone: "DISCARD",
          actionLabel: isEscaped ? "Hearts J (ESCAPED)" : "Clubs 7 (LOCKED)",
          outcome: isEscaped ? "ESCAPED" : "LOCKED",
        }
      );
      setMyJudgements((j) => ({ ...j, hasJail: false }));
    }

    setState((prev) => ({
      ...prev,
      currentPhase: 2,
      combatLog: ["End Turn", ...prev.combatLog],
    }));

    if (judgeDrafts.length > 0) {
      showMockArenaChain(judgeDrafts, 2200);
    }

    setMyGreenCards((prev) => prev.map((g) => ({ ...g, isDelay: false })));
  }, [myJudgements.hasDynamite, myJudgements.hasJail, showMockArenaChain, state.myPlayerId]);

  const resetMockWithHeroes = useCallback((selectedHeroes: Character[]) => {
    if (selectedHeroes.length === 0) return;
    setMyHeroes(selectedHeroes);
    const minBaseHp = Math.min(...selectedHeroes.map((h) => h.baseHp));
    setMyHp(minBaseHp);
    setMyMaxHp(minBaseHp);
    setMyHand(initialMyHand);
    setMyEquipments(initialMyEquipments);
    setMyGreenCards(initialMyGreenCards);
    setState((prev) => ({
      ...prev,
      inFlightCards: [],
      arenaChain: IDLE_ARENA,
      combatLog: [
        `[${new Date().toLocaleTimeString()}] Reset mock data with heroes: ${selectedHeroes
          .map((h) => h.name)
          .join(" & ")}.`,
        ...prev.combatLog,
      ],
    }));
  }, []);

  const resolveMockDrawCheck = useCallback(
    (source: "BARREL" | "JOURDONNAIS") => {
      const isSuccess = Math.random() < 0.4;
      const srcCard: Card =
        source === "BARREL" && myEquipments.barrel
          ? myEquipments.barrel
          : {
              id: `src_${source.toLowerCase()}_${Date.now()}`,
              name: source,
              suit: "spades",
              rank: "Q",
              border: "blue",
              image: "/assets/images/cards/card_barrel.png",
              desc: `Draw check for ${source}.`,
            };
      const checkCard: Card = {
        id: `chk_${source.toLowerCase()}_${Date.now()}`,
        name: isSuccess ? "BEER" : "BANG!",
        suit: isSuccess ? "hearts" : "spades",
        rank: isSuccess ? "K" : "4",
        border: "brown",
        image: isSuccess
          ? "/assets/images/cards/card_beer.png"
          : "/assets/images/cards/card_bang.png",
        desc: isSuccess ? "Heart drawn: Attack dodged." : "Not a Heart: Check failed.",
      };
      showMockArenaChain(
        [
          {
            kind: "CHECK_SOURCE",
            card: srcCard,
            actorPlayerId: state.myPlayerId,
            actorPlayerName: "You",
            originZone: source === "BARREL" ? "EQUIPMENT" : "HERO",
            originSlotKey: source === "BARREL" ? "barrel" : undefined,
            actionLabel: `${source} Check`,
          },
          {
            kind: "CHECK_RESULT",
            card: checkCard,
            actorPlayerId: state.myPlayerId,
            actorPlayerName: "You",
            originZone: "DECK",
            destinationZone: "DISCARD",
            actionLabel: `${checkCard.rank} ${checkCard.suit} (${isSuccess ? "PASSED" : "FAILED"})`,
            outcome: isSuccess ? "PASSED" : "FAILED",
          },
        ],
        2100,
        () => {
          setState((prev) => ({
            ...prev,
            discardCount: prev.discardCount + 1,
            topDiscard: checkCard,
          }));
        }
      );
      setState((prev) => ({
        ...prev,
        combatLog: [
          `[${new Date().toLocaleTimeString()}] ${source} Check: ${checkCard.rank} of ${checkCard.suit} -> ${
            isSuccess ? "DODGED" : "FAILED"
          }.`,
          ...prev.combatLog,
        ],
      }));
    },
    [myEquipments.barrel, showMockArenaChain, state.myPlayerId]
  );

  const resolveMockDefensePlayCard = useCallback(
    (cardId: string) => {
      const card = myHand.find((c) => c.id === cardId);
      setMyHand((prev) => prev.filter((c) => c.id !== cardId));
      if (card) {
        showMockArenaChain(
          [
            {
              kind: "DEFENSE_CARD",
              card,
              actorPlayerId: state.myPlayerId,
              actorPlayerName: "You",
              originZone: "HAND",
              destinationZone: "DISCARD",
              actionLabel: card.name,
            },
          ],
          1500
        );
      }
      setState((prev) => ({
        ...prev,
        combatLog: [
          `[${new Date().toLocaleTimeString()}] [Mock] Defended using hand card.`,
          ...prev.combatLog,
        ],
      }));
    },
    [myHand, showMockArenaChain, state.myPlayerId]
  );

  const resolveMockDefenseGreen = useCallback(
    (greenId: string) => {
      const entry = myGreenCards.find((g) => g.id === greenId);
      setMyGreenCards((prev) => prev.filter((g) => g.id !== greenId));
      if (entry) {
        showMockArenaChain(
          [
            {
              kind: "DEFENSE_CARD",
              card: entry.card,
              actorPlayerId: state.myPlayerId,
              actorPlayerName: "You",
              originZone: "GREEN",
              destinationZone: "DISCARD",
              actionLabel: `${entry.card.name} (Missed!)`,
            },
          ],
          1500
        );
      }
      setState((prev) => ({
        ...prev,
        combatLog: [
          `[${new Date().toLocaleTimeString()}] [Mock] Defended using ready green card.`,
          ...prev.combatLog,
        ],
      }));
    },
    [myGreenCards, showMockArenaChain, state.myPlayerId]
  );

  const resolveMockDefenseTakeDamage = useCallback(() => {
    setMyHp((prev) => Math.max(0, prev - 1));
    setState((prev) => ({
      ...prev,
      combatLog: [
        `[${new Date().toLocaleTimeString()}] [Mock] Took 1 damage from reaction.`,
        ...prev.combatLog,
      ],
    }));
  }, []);

  const pickMockGeneralStoreCard = useCallback(
    (cardId: string, store: GeneralStoreInfo) => {
      const picked = store.pool.find((c) => c.id === cardId);
      if (picked) {
        setMyHand((prev) => [...prev, picked]);
      }
    },
    []
  );

  return {
    state,
    myHand,
    myHeroes,
    myHp,
    myMaxHp,
    myEquipments,
    myGreenCards,
    myJudgements,
    confirmMockManipulationPicker,
    confirmMockSkill,
    playMockGreenCard,
    playMockHandCard,
    endMockTurn,
    resetMockWithHeroes,
    resolveMockDrawCheck,
    resolveMockDefensePlayCard,
    resolveMockDefenseGreen,
    resolveMockDefenseTakeDamage,
    pickMockGeneralStoreCard,
  };
}
