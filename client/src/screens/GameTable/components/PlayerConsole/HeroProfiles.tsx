import React from "react";
import type { Character } from "../../../../types/game";
import { CardTooltipContent, useI18n } from "../../../../i18n";
import { BulletMeter, CharacterPortrait } from "../../../../components/game";
import { DebouncedPopover } from "../../../../components/ui";

export interface HeroProfilesProps {
  heroes: Character[];
  myHp?: number;
  myMaxHp?: number;
}

export const HeroProfiles: React.FC<HeroProfilesProps> = ({
  heroes,
  myHp,
  myMaxHp,
}) => {
  const { t, tChar } = useI18n();
  const displayHeroes = heroes.slice(0, 2);

  return (
    <div className="game-table__console-heroes" data-flight-anchor="my-heroes">
      <div className="game-table__hero-columns-player" data-target-origin="player">
        {displayHeroes.map((hero) => {
          const charLoc = tChar(hero);
          return (
            <div key={hero.id} className="game-table__hero-card">
              <DebouncedPopover
                title={`${charLoc.primary.name} (${hero.baseHp} HP)`}
                content={
                  <CardTooltipContent
                    typeLabel={t("popover.type.character")}
                    primaryDesc={charLoc.primary.desc}
                    secondaryTitle={charLoc.secondary?.name}
                    secondaryDesc={charLoc.secondary?.desc}
                  />
                }
                delayMs={250}
              >
              <div className="game-table__hero-portrait-wrap">
                <CharacterPortrait
                  character={hero}
                  size="console"
                  showActiveBadge={false}
                />
              </div>
              </DebouncedPopover>
            </div>
          );
        })}
      </div>

      {myHp !== undefined && myMaxHp !== undefined && (
        <div className="game-table__hero-hp-col">
          <BulletMeter
            currentHp={myHp}
            maxHp={myMaxHp}
            size="medium"
            orientation="vertical"
            showText={false}
          />
        </div>
      )}
    </div>
  );
};
