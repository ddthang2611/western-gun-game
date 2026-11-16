import React from "react";
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
  if (!hasJail && !hasDynamite) return null;

  return (
    <div className="opponent-seat__judgements">
      {hasJail && (
        <DebouncedPopover
          title="JAIL"
          content="Draw Hearts to escape and play normally; otherwise skip turn."
        >
          <Badge variant="info" shape="diamond">
            J
          </Badge>
        </DebouncedPopover>
      )}
      {hasDynamite && (
        <DebouncedPopover
          title="DYNAMITE"
          content="Draw Spades 2-9 to take 3 damage; otherwise pass to the next player on the left."
        >
          <Badge variant="danger" shape="diamond">
            D
          </Badge>
        </DebouncedPopover>
      )}
    </div>
  );
};
