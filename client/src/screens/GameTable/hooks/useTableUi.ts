import { useCallback, useEffect, useRef, useState } from "react";
import type { Card, Player } from "../../../types/game";
import type { CardPickerConfig } from "../utils/tableSelectors";

// Manage toast notice and modal UI state
export function useTableUi() {
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [showCharSelectModal, setShowCharSelectModal] = useState(false);
  const [isCombatLogModalOpen, setIsCombatLogModalOpen] = useState(false);
  const [isDeleteMatchConfirmOpen, setIsDeleteMatchConfirmOpen] = useState(false);
  const [cardPickerConfig, setCardPickerConfig] = useState<CardPickerConfig>({
    isOpen: false,
    action: "destroy",
  });

  const errorTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (errorTimerRef.current !== null) {
        window.clearTimeout(errorTimerRef.current);
      }
    };
  }, []);

  const showError = useCallback((message: string) => {
    setErrorNotice(message);
    if (errorTimerRef.current !== null) {
      window.clearTimeout(errorTimerRef.current);
    }
    errorTimerRef.current = window.setTimeout(() => {
      setErrorNotice(null);
      errorTimerRef.current = null;
    }, 4000);
  }, []);

  const openElGringoPicker = useCallback(
    (attacker: Player, attackerId: string, stolenCard?: Card) => {
      setCardPickerConfig({
        isOpen: true,
        targetPlayer: {
          ...attacker,
          handCount: Math.max(1, attacker.handCount),
        },
        action: "steal",
        cardName: "EL GRINGO",
        allowHand: true,
        allowInPlay: false,
        stealContext: { mode: "EL_GRINGO", attackerId, stolenCard },
      });
    },
    []
  );

  const resetUi = useCallback(() => {
    setShowCharSelectModal(false);
    setIsCombatLogModalOpen(false);
    setIsDeleteMatchConfirmOpen(false);
    setCardPickerConfig({ isOpen: false, action: "destroy" });
  }, []);

  return {
    errorNotice,
    showError,
    showCharSelectModal,
    setShowCharSelectModal,
    isCombatLogModalOpen,
    setIsCombatLogModalOpen,
    isDeleteMatchConfirmOpen,
    setIsDeleteMatchConfirmOpen,
    cardPickerConfig,
    setCardPickerConfig,
    openElGringoPicker,
    resetUi,
  };
}
