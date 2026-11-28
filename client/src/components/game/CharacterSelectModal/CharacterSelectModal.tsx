import React, { useState, useEffect, useRef, useMemo } from "react";
import type { Character } from "../../../types/game";
import { useI18n } from "../../../i18n";
import { BulletMeter } from "../BulletMeter/BulletMeter";
import { Modal } from "../../ui/Modal/Modal";
import { Button } from "../../ui/Button/Button";
import { CharacterCandidateCard } from "./CharacterCandidateCard";
import "./CharacterSelectModal.scss";

export type HpRuleType = "strict" | "balanced" | "juggernaut";

export interface CharacterSelectModalProps {
  candidates: Character[];
  dualMode?: boolean;
  hpRule?: HpRuleType;
  isSheriff?: boolean;
  onConfirm: (selected: Character[]) => void;
  onCancel?: () => void;
}

export const CharacterSelectModal: React.FC<CharacterSelectModalProps> = ({
  candidates,
  dualMode = false,
  hpRule = "strict",
  isSheriff = false,
  onConfirm,
  onCancel,
}) => {
  const { t } = useI18n();
  const targetCount = dualMode ? 2 : 1;
  const candidatesKey = candidates.map((c) => c.id).join(",");
  const modalKey = `${candidatesKey}:${targetCount}`;

  const [selectionState, setSelectionState] = useState<{ key: string; ids: string[] }>({
    key: candidatesKey,
    ids: [],
  });
  const [timerState, setTimerState] = useState<{ key: string; seconds: number }>({
    key: modalKey,
    seconds: 30,
  });

  const validIdSet = useMemo(() => new Set(candidates.map((c) => c.id)), [candidates]);
  const selectedIds = useMemo(() => {
    const base = selectionState.key === candidatesKey ? selectionState.ids : [];
    return base.filter((id) => validIdSet.has(id)).slice(0, targetCount);
  }, [selectionState, candidatesKey, validIdSet, targetCount]);

  const timeLeft = timerState.key === modalKey ? timerState.seconds : 30;

  const onConfirmRef = useRef(onConfirm);
  const candidatesRef = useRef(candidates);
  const selectedIdsRef = useRef<string[]>([]);
  const submittedRef = useRef(false);

  useEffect(() => {
    onConfirmRef.current = onConfirm;
    candidatesRef.current = candidates;
    selectedIdsRef.current = selectedIds;
  }, [onConfirm, candidates, selectedIds]);

  useEffect(() => {
    submittedRef.current = false;

    const timer = window.setInterval(() => {
      setTimerState((prev) => {
        const current = prev.key === modalKey ? prev.seconds : 30;
        return { key: modalKey, seconds: current <= 1 ? 0 : current - 1 };
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [modalKey]);

  useEffect(() => {
    if (timeLeft <= 0 && !submittedRef.current) {
      submittedRef.current = true;

      // Preserve picked chars, fill remaining
      const validPicked = selectedIdsRef.current
        .map((id) => candidatesRef.current.find((c) => c.id === id))
        .filter((c): c is Character => Boolean(c))
        .slice(0, targetCount);
      const pickedIds = new Set(validPicked.map((c) => c.id));
      const remaining = Math.max(0, targetCount - validPicked.length);
      const fill = candidatesRef.current
        .filter((c) => !pickedIds.has(c.id))
        .slice(0, remaining);
      onConfirmRef.current([...validPicked, ...fill]);
    }
  }, [timeLeft, modalKey, targetCount]);

  const toggleSelect = (char: Character) => {
    if (submittedRef.current) return;
    setSelectionState((prev) => {
      const current = prev.key === candidatesKey ? prev.ids : [];
      let next: string[];
      if (current.includes(char.id)) {
        next = current.filter((id) => id !== char.id);
      } else if (current.length < targetCount) {
        next = [...current, char.id];
      } else {
        next = [...current.slice(1), char.id];
      }
      selectedIdsRef.current = next;
      return { key: candidatesKey, ids: next };
    });
  };

  const selectedChars = candidates.filter((c) => selectedIds.includes(c.id));

  let calculatedHp = 4;
  if (selectedChars.length === 1) {
    calculatedHp = selectedChars[0].baseHp;
  } else if (selectedChars.length === 2) {
    const hp1 = selectedChars[0].baseHp;
    const hp2 = selectedChars[1].baseHp;
    if (hpRule === "strict") {
      calculatedHp = Math.min(hp1, hp2);
    } else if (hpRule === "balanced") {
      calculatedHp = Math.min(hp1, hp2) + 1;
    } else {
      calculatedHp = hp1 + hp2 - 2;
    }
  }
  if (isSheriff) calculatedHp += 1;

  const isComplete = selectedIds.length === targetCount;

  const handleConfirm = () => {
    if (!isComplete || submittedRef.current) return;
    submittedRef.current = true;
    onConfirmRef.current(selectedChars);
  };

  return (
    <Modal isOpen={true} size="large" onClose={onCancel}>
      <Modal.Header
        title={t("modals.charSelect.title", {
          selected: selectedIds.length,
          target: targetCount,
        })}
        extra={
          <div
            className={`char-select__timer ${
              timeLeft <= 5 ? "char-select__timer--urgent" : ""
            }`.trim()}
          >
            {timeLeft}s
          </div>
        }
      />

      <Modal.Body>
        <div className="char-select__grid">
          {candidates.map((char) => (
            <CharacterCandidateCard
              key={char.id}
              character={char}
              isSelected={selectedIds.includes(char.id)}
              onToggle={toggleSelect}
            />
          ))}
        </div>
      </Modal.Body>

      <Modal.Footer
        hint={
          <div className="char-select__preview-hp">
            <span className="char-select__preview-hp-label">
              {t("modals.charSelect.maxHp", {
                bonus: isSheriff
                  ? t("modals.charSelect.sheriffBonus")
                  : t("modals.charSelect.baseBonus"),
              })}
            </span>
            <BulletMeter
              currentHp={calculatedHp}
              maxHp={calculatedHp}
              size="medium"
            />
          </div>
        }
      >
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            {t("common.close")}
          </Button>
        )}
        <Button
          variant="primary"
          size="large"
          disabled={!isComplete}
          onClick={handleConfirm}
        >
          {t("modals.charSelect.lockIn", {
            selected: selectedIds.length,
            target: targetCount,
          })}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
