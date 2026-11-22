import React from "react";
import type { Card, Character, GreenCard } from "../../../types/game";
import { useI18n } from "../../../i18n";
import "./TableActionBar.scss";

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
  isArenaLocked?: boolean;
  excessCardsCount?: number;
  phase3DiscardCount?: number;
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
  isArenaLocked = false,
  excessCardsCount = 0,
  phase3DiscardCount = 0,
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
  const { t } = useI18n();
  const isInteractionBlocked = isLocked || isArenaLocked;
  const isPhase3Discard = !isMock && isMyTurn && currentPhase === 3;
  const isActionPhase = isMock || currentPhase === 2 || isPhase3Discard;
  const canActInTurn = !isInteractionBlocked && isMyTurn && isActionPhase;
  const canUseSkill = !isInteractionBlocked && isMyTurn && (isMock || currentPhase === 2);
  const primaryLabel = isPhase3Discard
    ? phase3DiscardCount > 0
      ? t("table.discardSelected", { count: phase3DiscardCount })
      : t("table.discardBtn")
    : selectedGreenCard
    ? t("table.activateGreen")
    : t("table.playBtn");
  const hasSelection = Boolean(selectedCard || selectedGreenCard);
  const canPlayNow =
    canActInTurn &&
    (canConfirmSelection !== undefined ? canConfirmSelection : hasSelection);
  const activeSkillHeroes = heroes.filter((hero) => hero.isActiveSkill);

  return (
    <section
      className={`game-table__action-bar${isInteractionBlocked ? " game-table__action-bar--locked" : ""}`}
    >
      <div className="game-table__action-left" data-flight-anchor="my-judgements">
        {myJudgements.hasJail && (
          <span className="game-table__judgement-tag game-table__judgement-tag--jail">
            {t("table.jailTag")}
          </span>
        )}
        {myJudgements.hasDynamite && (
          <span className="game-table__judgement-tag game-table__judgement-tag--dynamite">
            {t("table.dynamiteTag")}
          </span>
        )}
      </div>

      <div className="game-table__action-center">
        <div className="game-table__hint-slot">
          {isLocked ? (
            <span className="game-table__hint game-table__hint--warning">
              {t("table.matchPausedLock")}
            </span>
          ) : isArenaLocked ? (
            <span className="game-table__hint game-table__hint--skill">
              {t("table.resolvingArena")}
            </span>
          ) : activeSkillHint ? (
            <span className="game-table__hint game-table__hint--skill">
              {activeSkillHint}
            </span>
          ) : isPhase3Discard && excessCardsCount > 0 ? (
            <span className="game-table__hint game-table__hint--warning">
              {t("table.excessDiscardHint", { count: excessCardsCount })}
            </span>
          ) : null}
        </div>

        <div className="game-table__action-buttons">
          {onTriggerSkill &&
            activeSkillHeroes.map((hero) => (
              <button
                key={hero.id}
                type="button"
                data-target-origin="skill"
                onClick={() => onTriggerSkill(hero.id)}
                disabled={!canUseSkill}
                className={`game-table__btn game-table__btn--skill${
                  isSkillMode ? " game-table__btn--skill-active" : ""
                }`}
              >
                {t("table.skillLabel", { name: hero.name })}
              </button>
            ))}

          {isSkillMode ? (
            <button
              type="button"
              data-target-origin="skill-confirm"
              onClick={onConfirmSkill}
              disabled={!canUseSkill || !canConfirmSkill}
              className="game-table__btn game-table__btn--skill-confirm"
            >
              {t("table.confirmSkill")}
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
              {t("table.ricochetEquip")}
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            disabled={
              !canActInTurn ||
              (!isSkillMode &&
                !selectedCard &&
                !selectedGreenCard &&
                !selectedTargetId &&
                !activeSkillHint &&
                phase3DiscardCount === 0)
            }
            className="game-table__btn game-table__btn--secondary"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={onEndTurn}
            disabled={!canActInTurn || (isPhase3Discard && excessCardsCount > 0)}
            className="game-table__btn game-table__btn--danger"
          >
            {t("table.endTurn")}
          </button>
        </div>
      </div>
    </section>
  );
};
