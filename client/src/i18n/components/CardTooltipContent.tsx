import React from "react";
import { useI18n } from "../useI18n";
import "./CardTooltipContent.scss";

interface CardTooltipContentProps {
  typeLabel?: string;
  primaryDesc: string;
  secondaryTitle?: string;
  secondaryDesc?: string;
  actionSummary?: string;
  range?: number;
  suit?: string;
  rank?: string;
}

export const CardTooltipContent: React.FC<CardTooltipContentProps> = ({
  typeLabel,
  primaryDesc,
  secondaryTitle,
  secondaryDesc,
  actionSummary,
  range,
  suit,
  rank,
}) => {
  const { bilingualCards, locale, t, tSuitSymbol, tSuitName } = useI18n();
  const suitSym = tSuitSymbol(suit);
  const suitName = tSuitName(suit);

  return (
    <div className="wg-card-tooltip">
      {(typeLabel || range !== undefined || (rank && suitSym)) && (
        <div className="wg-card-tooltip__badges">
          {typeLabel && <span className="wg-card-tooltip__badge">{typeLabel}</span>}
          {range !== undefined && (
            <span className="wg-card-tooltip__badge wg-card-tooltip__badge--range">
              {t("common.range", { range })}
            </span>
          )}
          {rank && suitSym && (
            <span
              className={`wg-card-tooltip__badge wg-card-tooltip__badge--suit ${
                suit === "hearts" || suit === "diamonds" ? "is-red" : "is-black"
              }`}
            >
              {rank}
              {suitSym} ({suitName})
            </span>
          )}
        </div>
      )}

      {actionSummary && <div className="wg-card-tooltip__summary">{actionSummary}</div>}

      <p className="wg-card-tooltip__desc">{primaryDesc}</p>

      {bilingualCards && (secondaryTitle || secondaryDesc) && (
        <div className="wg-card-tooltip__secondary">
          <span className="wg-card-tooltip__secondary-tag">
            {locale === "vi" ? "EN" : "VI"}
          </span>
          <div className="wg-card-tooltip__secondary-body">
            {secondaryTitle && (
              <div className="wg-card-tooltip__secondary-title">{secondaryTitle}</div>
            )}
            {secondaryDesc && (
              <div className="wg-card-tooltip__secondary-desc">{secondaryDesc}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
