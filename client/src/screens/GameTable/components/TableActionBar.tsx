import React from "react";
import type { Card, Character, GreenCard } from "../../../types/game";

export interface TableActionBarProps {
  myJudgements: { hasJail: boolean; hasDynamite: boolean };
  heroes?: Character[];
  myHp?: number;
  myMaxHp?: number;
  selectedCard?: Card;
  selectedGreenCard?: GreenCard;
  selectedTargetId: string | null;
  isMock?: boolean;
  currentPhase?: number;
  isMyTurn?: boolean;
  isLocked?: boolean;
  excessCardsCount?: number;
  activeSkillHint?: string | null;
  canConfirmSelection?: boolean;
  isSkillMode?: boolean;
  canConfirmSkill?: boolean;
  canRicochetEquip?: boolean;
  onPlayCard: () => void;
  onRicochetEquip?: () => void;
  onConfirmSkill?: () => void;
  onCancel: () => void;
  onEndTurn: () => void;
  onTriggerSkill?: (heroId: string) => void;
}

export const TableActionBar: React.FC<TableActionBarProps> = ({
  myJudgements,
  heroes = [],
  selectedCard,
  selectedGreenCard,
  selectedTargetId,
  isMock = true,
  currentPhase = 2,
  isMyTurn = true,
  isLocked = false,
  excessCardsCount = 0,
  activeSkillHint,
  canConfirmSelection,
  isSkillMode = false,
  canConfirmSkill = false,
  canRicochetEquip = false,
  onPlayCard,
  onRicochetEquip,
  onConfirmSkill,
  onCancel,
  onEndTurn,
  onTriggerSkill,
}) => {
  const isPhase3Discard = !isMock && isMyTurn && currentPhase === 3;
  const isActionPhase = isMock || currentPhase === 2 || isPhase3Discard;
  const canActInTurn = !isLocked && isMyTurn && isActionPhase;
  const canUseSkill = !isLocked && isMyTurn && (isMock || currentPhase === 2);
  const primaryLabel = isPhase3Discard ? "Discard" : "Play";
  const hasSelection = Boolean(selectedCard || selectedGreenCard);
  const canPlayNow =
    canActInTurn &&
    (canConfirmSelection !== undefined ? canConfirmSelection : hasSelection);
  const activeSkillHeroes = heroes.filter((hero) => hero.isActiveSkill);

  return (
    <section
      className={`game-table__action-bar${isLocked ? " game-table__action-bar--locked" : ""}`}
    >
      <div className="game-table__action-left">
        {myJudgements.hasJail && (
          <span className="game-table__judgement-tag game-table__judgement-tag--jail">
            JAIL
          </span>
        )}
        {myJudgements.hasDynamite && (
          <span className="game-table__judgement-tag game-table__judgement-tag--dynamite">
            DYNAMITE
          </span>
        )}
      </div>

      <div className="game-table__action-center">
        <div className="game-table__hint-slot">
          {isLocked ? (
            <span className="game-table__hint game-table__hint--warning">
              Match paused or reconnecting - actions locked
            </span>
          ) : activeSkillHint ? (
            <span className="game-table__hint game-table__hint--skill">
              {activeSkillHint}
            </span>
          ) : isPhase3Discard && excessCardsCount > 0 ? (
            <span className="game-table__hint game-table__hint--warning">
              Discard {excessCardsCount} excess card(s) to end turn
            </span>
          ) : null}
        </div>

        <div className="game-table__action-buttons">
          {onTriggerSkill &&
            activeSkillHeroes.map((hero) => (
              <button
                key={hero.id}
                type="button"
                onClick={() => onTriggerSkill(hero.id)}
                disabled={!canUseSkill}
                className={`game-table__btn game-table__btn--skill${
                  isSkillMode ? " game-table__btn--skill-active" : ""
                }`}
              >
                Skill: {hero.name}
              </button>
            ))}

          {isSkillMode ? (
            <button
              type="button"
              onClick={onConfirmSkill}
              disabled={!canUseSkill || !canConfirmSkill}
              className="game-table__btn game-table__btn--skill-confirm"
            >
              Confirm Skill
            </button>
          ) : (
            <button
              type="button"
              onClick={onPlayCard}
              disabled={!canPlayNow}
              className="game-table__btn game-table__btn--primary"
            >
              {primaryLabel}
            </button>
          )}
          {!isSkillMode && canRicochetEquip && onRicochetEquip && (
            <button
              type="button"
              onClick={onRicochetEquip}
              disabled={!canActInTurn}
              className="game-table__btn game-table__btn--skill"
            >
              Ricochet Equip
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            disabled={
              !canActInTurn ||
              (!isSkillMode && !selectedCard && !selectedGreenCard && !selectedTargetId && !activeSkillHint)
            }
            className="game-table__btn game-table__btn--secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onEndTurn}
            disabled={!canActInTurn || (isPhase3Discard && excessCardsCount > 0)}
            className="game-table__btn game-table__btn--danger"
          >
            End Turn
          </button>
        </div>
      </div>
    </section>
  );
};
