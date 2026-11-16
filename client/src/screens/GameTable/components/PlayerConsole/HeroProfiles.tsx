import React from "react";
import type { Character } from "../../../../types/game";
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
  const displayHeroes = heroes.slice(0, 2);

  return (
    <div className="game-table__console-heroes">
      <div className="game-table__hero-columns-player">
        {displayHeroes.map((hero) => (
          <div key={hero.id} className="game-table__hero-card">
            <DebouncedPopover
              title={`${hero.name} (Base HP: ${hero.baseHp})`}
              content={hero.desc}
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
        ))}
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
