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
  const { locale, t, tCard } = useI18n();
  if (!hasJail && !hasDynamite) return null;

  const jailLoc = tCard({ name: "JAIL" });
  const dynamiteLoc = tCard({ name: "DYNAMITE" });

  return (
    <div className="opponent-seat__judgements">
      {hasJail && (
        <DebouncedPopover
          title={
            locale === "vi" && jailLoc.primary.subtitleVi
              ? `${jailLoc.primary.name} (${jailLoc.primary.subtitleVi})`
              : jailLoc.primary.name
          }
          content={
            <CardTooltipContent
              typeLabel={t("popover.type.blue")}
              primaryDesc={jailLoc.primary.desc}
              actionSummary={jailLoc.primary.actionSummary}
              secondaryTitle={jailLoc.secondary?.name}
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
          title={
            locale === "vi" && dynamiteLoc.primary.subtitleVi
              ? `${dynamiteLoc.primary.name} (${dynamiteLoc.primary.subtitleVi})`
              : dynamiteLoc.primary.name
          }
          content={
            <CardTooltipContent
              typeLabel={t("popover.type.blue")}
              primaryDesc={dynamiteLoc.primary.desc}
              actionSummary={dynamiteLoc.primary.actionSummary}
              secondaryTitle={dynamiteLoc.secondary?.name}
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
