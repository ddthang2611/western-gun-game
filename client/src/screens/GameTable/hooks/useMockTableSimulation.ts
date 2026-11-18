import { useCallback, useState } from "react";
import type {
  Card,
  Character,
  EquipmentSlot,
  GeneralStoreInfo,
  GreenCard,
  InFlightCard,
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
import { TARGETED_SINGLE_CARDS } from "../utils/cardRules";
import type { SkillModeType } from "../utils/tableSelectors";
import type { VfxBeam } from "./useTableAnimations";

export interface MockAnimationCallbacks {
  scheduleTimeout: (fn: () => void, ms: number) => void;
  enqueueFlight: (
    fromSelector: string,
    toSelector: string,
    options?: {
      cardImage?: string;
      faceDown?: boolean;
      label?: string;
      durationMs?: number;
    }
  ) => void;
  triggerVfx: (type: VfxBeam["type"], targetId?: string, aoeHeal?: boolean) => void;
  addEphemeralCards: (entries: InFlightCard[]) => void;
  removeEphemeralCards: (ids: Set<string>) => void;
}

export interface UseMockTableSimulationParams {
  externalHeroes?: Character[];
  animations: MockAnimationCallbacks;
  showError: (message: string) => void;
}

// Isolate offline /dev-test mock simulation
export function useMockTableSimulation({
  externalHeroes,
  animations,
  showError,
}: UseMockTableSimulationParams) {
  const [state, setState] = useState<TableState>(initialMockState);
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

  const {
    scheduleTimeout,
    enqueueFlight,
    triggerVfx,
    addEphemeralCards,
    removeEphemeralCards,
  } = animations;

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
      applyMockManipulation(targetId, chosen, isSteal, cardName);
      if (selectedCardId) {
        const removed = new Set([selectedCardId, ...discardCostIds]);
        setMyHand((prev) => prev.filter((c) => !removed.has(c.id)));
      }
      if (sourceGreenCardId) {
        setMyGreenCards((prev) => prev.filter((g) => g.id !== sourceGreenCardId));
      }
    },
    [applyMockManipulation]
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
        triggerVfx("draw");
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
        triggerVfx("draw");
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
        setMyHand((prev) => prev.filter((c) => !chosenIds.includes(c.id)));
        setMyHp((prev) => Math.min(prev + 1, myMaxHp));
        triggerVfx("heal", state.myPlayerId);
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
        setMyHand((prev) => prev.filter((c) => !skillDiscardIds.includes(c.id)));
        triggerVfx("bullet", selectedTargetId);
        setState((prev) => ({
          ...prev,
          combatLog: ["Doc Holyday: BANG!", ...prev.combatLog],
        }));
        return true;
      }

      return false;
    },
    [myHand, myHp, myMaxHp, showError, state.myPlayerId, triggerVfx]
  );

  const playMockGreenCard = useCallback(
    (selectedGreenCard: GreenCard, selectedTargetId: string | null) => {
      const gName = selectedGreenCard.card.name;
      if (TARGETED_SINGLE_CARDS.has(gName) && selectedTargetId) {
        triggerVfx("bullet", selectedTargetId);
      } else if (gName === "CANTEEN") {
        setMyHp((prev) => Math.min(prev + 1, myMaxHp));
        triggerVfx("heal", state.myPlayerId);
      } else if (gName === "PONY EXPRESS") {
        triggerVfx("draw");
      } else {
        triggerVfx("bullet");
      }

      setMyGreenCards((prev) => prev.filter((g) => g.id !== selectedGreenCard.id));
      setState((prev) => ({
        ...prev,
        combatLog: [`You: ${gName}`, ...prev.combatLog],
      }));
    },
    [myMaxHp, state.myPlayerId, triggerVfx]
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
        setState((prev) => ({
          ...prev,
          combatLog: [`Set: ${selectedCard.name}`, ...prev.combatLog],
        }));
        return true;
      }

      const removedIds = new Set([selectedCard.id, ...discardCostIds]);

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
        triggerVfx("heal", healTarget, false);
        setState((prev) => ({
          ...prev,
          combatLog: [`You: ${selectedCard.name} (+${healAmt} HP)`, ...prev.combatLog],
        }));
        return true;
      }

      if (selectedCard.name === "SALOON") {
        setMyHp((prev) => Math.min(prev + 1, myMaxHp));
        setMyHand((prev) => prev.filter((c) => !removedIds.has(c.id)));
        triggerVfx("heal", undefined, true);
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
        triggerVfx("bullet");
        setState((prev) => ({
          ...prev,
          combatLog: [`You: ${selectedCard.name}`, ...prev.combatLog],
        }));
        return true;
      }

      if (selectedCard.border === "blue" && selectedCard.range) {
        setMyEquipments((prev) => ({ ...prev, weapon: selectedCard }));
        setMyHand((prev) => prev.filter((c) => !removedIds.has(c.id)));
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

        triggerVfx("bullet", target.id);
        const newInFlight: Card = selectedCard;
        setState((prev) => ({
          ...prev,
          inFlightCards: [
            ...prev.inFlightCards,
            {
              id: `inf_${Date.now()}`,
              card: newInFlight,
              sourcePlayerName: "You",
              targetPlayerName: target.name,
              actionText: "Awaiting reaction with Missed!.",
            },
          ],
          combatLog: [`You -> ${target.name}: ${selectedCard.name}`, ...prev.combatLog],
        }));

        scheduleTimeout(() => {
          setState((prev) => ({
            ...prev,
            inFlightCards: prev.inFlightCards.filter((c) => c.card.id !== newInFlight.id),
            discardCount: prev.discardCount + 1,
            topDiscard: newInFlight,
          }));
        }, 2800);

        setMyHand((prev) => prev.filter((c) => !removedIds.has(c.id)));
        return true;
      }

      setMyHand((prev) => prev.filter((c) => !removedIds.has(c.id)));
      setState((prev) => ({
        ...prev,
        combatLog: [`You: ${selectedCard.name}`, ...prev.combatLog],
      }));
      return true;
    },
    [
      myGreenCards.length,
      myMaxHp,
      scheduleTimeout,
      showError,
      state.myPlayerId,
      state.players,
      triggerVfx,
    ]
  );

  const endMockTurn = useCallback(() => {
    setState((prev) => ({
      ...prev,
      inFlightCards: [],
      currentPhase: 1,
      combatLog: ["End Turn", ...prev.combatLog],
    }));

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
      const dynFlipCard: Card = {
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
      const srcEntry: InFlightCard = {
        id: `inf_dynsrc_${Date.now()}`,
        card: dynSrcCard,
        sourcePlayerName: "You",
        actionText: "DYNAMITE Judgement",
      };
      const dynEntry: InFlightCard = {
        id: `inf_dyn_${Date.now()}`,
        card: dynFlipCard,
        sourcePlayerName: "You (Flipped)",
        actionText: isExploded ? "Spades 4 (EXPLODED! -3 HP)" : "Hearts 10 (PASSED)",
        isFlipReveal: true,
      };
      const ids = new Set([srcEntry.id, dynEntry.id]);
      enqueueFlight('[data-flight-anchor="my-heroes"]', ".inflight-chain", {
        faceDown: false,
        cardImage: dynSrcCard.image,
        label: "DYNAMITE",
        durationMs: 1100,
      });
      addEphemeralCards([srcEntry]);
      scheduleTimeout(() => addEphemeralCards([dynEntry]), 1100);
      if (isExploded) {
        triggerVfx("dynamite", state.myPlayerId);
        setMyHp((h) => Math.max(0, h - 3));
        setMyJudgements((j) => ({ ...j, hasDynamite: false }));
      }
      scheduleTimeout(() => removeEphemeralCards(ids), 5000);
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
      const jailFlipCard: Card = {
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
      const srcEntry: InFlightCard = {
        id: `inf_jailsrc_${Date.now()}`,
        card: jailSrcCard,
        sourcePlayerName: "You",
        actionText: "JAIL Judgement",
      };
      const jailEntry: InFlightCard = {
        id: `inf_jail_${Date.now()}`,
        card: jailFlipCard,
        sourcePlayerName: "You (Flipped)",
        actionText: isEscaped ? "Hearts J (ESCAPED!)" : "Clubs 7 (LOCKED!)",
        isFlipReveal: true,
      };
      const ids = new Set([srcEntry.id, jailEntry.id]);
      enqueueFlight('[data-flight-anchor="my-heroes"]', ".inflight-chain", {
        faceDown: false,
        cardImage: jailSrcCard.image,
        label: "JAIL",
        durationMs: 1100,
      });
      addEphemeralCards([srcEntry]);
      scheduleTimeout(() => addEphemeralCards([jailEntry]), 1100);
      setMyJudgements((j) => ({ ...j, hasJail: false }));
      scheduleTimeout(() => removeEphemeralCards(ids), 5000);
    }

    triggerVfx("draw");
    setMyGreenCards((prev) => prev.map((g) => ({ ...g, isDelay: false })));
  }, [
    addEphemeralCards,
    enqueueFlight,
    myJudgements.hasDynamite,
    myJudgements.hasJail,
    removeEphemeralCards,
    scheduleTimeout,
    state.myPlayerId,
    triggerVfx,
  ]);

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
      if (source === "JOURDONNAIS") {
        const checkCard: Card = {
          id: `chk_jour_${Date.now()}`,
          name: "JOURDONNAIS CHECK",
          suit: isSuccess ? "hearts" : "clubs",
          rank: isSuccess ? "Q" : "8",
          border: "blue",
          image: "/assets/images/cards/card_barrel.png",
          desc: isSuccess
            ? "Heart drawn: Attack dodged."
            : "Not a Heart: Check failed.",
        };
        const checkEntry: InFlightCard = {
          id: `inf_jour_${Date.now()}`,
          card: checkCard,
          sourcePlayerName: "You (Jourdonnais)",
          actionText: isSuccess ? "Hearts Q (DODGED!)" : "Clubs 8 (FAILED!)",
          isFlipReveal: true,
        };
        const ids = new Set([checkEntry.id]);
        addEphemeralCards([checkEntry]);
        setState((prev) => ({
          ...prev,
          combatLog: [
            `[${new Date().toLocaleTimeString()}] Jourdonnais Check: ${checkCard.rank} of ${checkCard.suit} -> ${
              isSuccess ? "DODGED" : "FAILED"
            }.`,
            ...prev.combatLog,
          ],
        }));
        scheduleTimeout(() => {
          removeEphemeralCards(ids);
          setState((prev) => ({
            ...prev,
            discardCount: prev.discardCount + 1,
            topDiscard: checkCard,
          }));
        }, 3000);
        return;
      }

      const barrelSrcCard: Card = {
        id: `src_bar_${Date.now()}`,
        name: "BARREL",
        suit: "spades",
        rank: "Q",
        border: "blue",
        image: "/assets/images/cards/card_barrel.png",
        desc: "Draw check for Barrel.",
      };
      const checkCard: Card = {
        id: `chk_bar_${Date.now()}`,
        name: isSuccess ? "BEER" : "BANG!",
        suit: isSuccess ? "hearts" : "spades",
        rank: isSuccess ? "K" : "4",
        border: "brown",
        image: isSuccess
          ? "/assets/images/cards/card_beer.png"
          : "/assets/images/cards/card_bang.png",
        desc: isSuccess ? "Heart drawn: Attack dodged." : "Not a Heart: Check failed.",
      };
      const srcEntry: InFlightCard = {
        id: `inf_barsrc_${Date.now()}`,
        card: barrelSrcCard,
        sourcePlayerName: "You",
        actionText: "BARREL Check",
      };
      const checkEntry: InFlightCard = {
        id: `inf_bar_${Date.now()}`,
        card: checkCard,
        sourcePlayerName: "You (Flipped)",
        actionText: isSuccess ? "Hearts K (DODGED!)" : "Spades 4 (FAILED!)",
        isFlipReveal: true,
      };
      const ids = new Set([srcEntry.id, checkEntry.id]);
      addEphemeralCards([srcEntry, checkEntry]);
      setState((prev) => ({
        ...prev,
        combatLog: [
          `[${new Date().toLocaleTimeString()}] Barrel Check: ${checkCard.rank} of ${checkCard.suit} -> ${
            isSuccess ? "DODGED" : "FAILED"
          }.`,
          ...prev.combatLog,
        ],
      }));
      scheduleTimeout(() => {
        removeEphemeralCards(ids);
        setState((prev) => ({
          ...prev,
          discardCount: prev.discardCount + 1,
          topDiscard: checkCard,
        }));
      }, 3000);
    },
    [addEphemeralCards, removeEphemeralCards, scheduleTimeout]
  );

  const resolveMockDefensePlayCard = useCallback((cardId: string) => {
    setMyHand((prev) => prev.filter((c) => c.id !== cardId));
    setState((prev) => ({
      ...prev,
      combatLog: [
        `[${new Date().toLocaleTimeString()}] [Mock] Defended using hand card.`,
        ...prev.combatLog,
      ],
    }));
  }, []);

  const resolveMockDefenseGreen = useCallback((greenId: string) => {
    setMyGreenCards((prev) => prev.filter((g) => g.id !== greenId));
    setState((prev) => ({
      ...prev,
      combatLog: [
        `[${new Date().toLocaleTimeString()}] [Mock] Defended using ready green card.`,
        ...prev.combatLog,
      ],
    }));
  }, []);

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
