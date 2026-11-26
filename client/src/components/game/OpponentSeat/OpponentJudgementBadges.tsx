import React from "react";
import { CardTooltipContent, useI18n } from "../../../i18n";
import { Badge } from "../../ui/Badge/Badge";
import { DebouncedPopover } from "../../ui/DebouncedPopover/DebouncedPopover";

export interface OpponentJudgementBadgesProps {
  hasJail: boolean;
  hasDynamite: boolean;
}

export const OpponentJudgementBadges: React.FC<OpponentJudgementBadgesProps> = ({
  hasJail,
  hasDynamite,
}) => {
  const { tCard } = useI18n();
  if (!hasJail && !hasDynamite) return null;

  const jailLoc = tCard({ name: "JAIL" });
  const dynamiteLoc = tCard({ name: "DYNAMITE" });

  return (
    <div className="opponent-seat__judgements">
      {hasJail && (
        <DebouncedPopover
          content={
            <CardTooltipContent
              primaryDesc={jailLoc.primary.desc}
              secondaryDesc={jailLoc.secondary?.desc}
            />
          }
        >
          <Badge variant="info" shape="diamond">
            J
          </Badge>
        </DebouncedPopover>
      )}
      {hasDynamite && (
        <DebouncedPopover
          content={
            <CardTooltipContent
              primaryDesc={dynamiteLoc.primary.desc}
              secondaryDesc={dynamiteLoc.secondary?.desc}
            />
          }
        >
          <Badge variant="danger" shape="diamond">
            D
          </Badge>
        </DebouncedPopover>
      )}
    </div>
  );
};
