import React from "react";
import type { Player } from "../../../types/game";
import { getFixedEquipmentSlots } from "../../../utils/equipments";
import { BulletMeter } from "../BulletMeter/BulletMeter";
import { CharacterPortrait } from "../CharacterPortrait/CharacterPortrait";
import { DebouncedPopover } from "../../ui/DebouncedPopover/DebouncedPopover";
import { Badge } from "../../ui/Badge/Badge";
import { OpponentJudgementBadges } from "./OpponentJudgementBadges";
import "./OpponentSeat.scss";

export interface OpponentSeatProps {
  player: Player;
  isCurrentTurn?: boolean;
  isTargetSelected?: boolean;
  isTargetable?: boolean;
  isInRange?: boolean;
  distance?: number;
  concealedInPlayCardIds?: string[];
  onSelectTarget?: () => void;
}

export const OpponentSeat: React.FC<OpponentSeatProps> = ({
  player,
  isCurrentTurn = false,
  isTargetSelected = false,
  isTargetable = false,
  isInRange = true,
  distance,
  concealedInPlayCardIds,
  onSelectTarget,
}) => {
  const concealedSet = concealedInPlayCardIds?.length
    ? new Set(concealedInPlayCardIds)
    : undefined;
  const visibleHasJail = concealedSet
    ? (player.judgements || []).some(
        (j) =>
          j.type === "JAIL" &&
          !concealedSet.has(j.id) &&
          !(j.card && concealedSet.has(j.card.id))
      )
    : player.hasJail;
  const visibleHasDynamite = concealedSet
    ? (player.judgements || []).some(
        (j) =>
          j.type === "DYNAMITE" &&
          !concealedSet.has(j.id) &&
          !(j.card && concealedSet.has(j.card.id))
      )
    : player.hasDynamite;
  const isDead = player.hp <= 0;
  const canSelect = !isDead && isTargetable && isInRange;
  const isDimmed = !isDead && isTargetable && !isInRange;

  const seatClasses = [
    "opponent-seat",
    isCurrentTurn && !isDead ? "opponent-seat--active-turn" : "",
    isTargetSelected ? "opponent-seat--selected" : "",
    canSelect ? "opponent-seat--targetable" : "",
    isDead ? "opponent-seat--dead" : isDimmed ? "opponent-seat--out-of-range" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      id={`seat-${player.id}`}
      role={canSelect ? "button" : undefined}
      tabIndex={canSelect ? 0 : undefined}
      aria-pressed={canSelect ? isTargetSelected : undefined}
      aria-label={canSelect ? `Target ${player.name}` : undefined}
      onClick={canSelect ? onSelectTarget : undefined}
      onKeyDown={
        canSelect
          ? (e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSelectTarget?.();
              } else if (e.key === " ") {
                e.preventDefault();
              }
            }
          : undefined
      }
      onKeyUp={
        canSelect
          ? (e) => {
              if (e.key === " ") {
                onSelectTarget?.();
              }
            }
          : undefined
      }
      className={seatClasses}
    >
      <OpponentJudgementBadges
        hasJail={visibleHasJail}
        hasDynamite={visibleHasDynamite}
      />

      <div className="opponent-seat__main-pane">
        <div
          className="opponent-seat__hand-count"
          aria-label={`${player.handCount} cards in hand`}
          title={`${player.handCount} card(s) in hand`}
        >
          <span className="opponent-seat__hand-fan" aria-hidden="true">
            <span className="opponent-seat__mini-card opponent-seat__mini-card--left" />
            <span className="opponent-seat__mini-card opponent-seat__mini-card--center" />
            <span className="opponent-seat__mini-card opponent-seat__mini-card--right" />
          </span>
          <span className="opponent-seat__hand-num">{player.handCount}</span>
        </div>

        {/* Header: sheriff badge and player name */}
        <div className="opponent-seat__header">
          <div className="opponent-seat__player-meta">
            {player.isSheriff && (
              <Badge variant="warning" shape="tag">
                SHERIFF
              </Badge>
            )}
            <span className="opponent-seat__player-name">{player.name}</span>
          </div>
        </div>

        {/* Hero portraits, names, and vertical HP */}
        <div className="opponent-seat__body">
          <div className="opponent-seat__hero-columns">
            {player.characters.slice(0, 2).map((hero) => (
              <DebouncedPopover key={hero.id} title={hero.name} content={hero.desc}>
                <div className="opponent-seat__hero-slot">
                  <CharacterPortrait character={hero} size="seat" />
                </div>
              </DebouncedPopover>
            ))}
          </div>

          <div className="opponent-seat__side-meta">
            <BulletMeter
              currentHp={player.hp}
              maxHp={player.maxHp}
              size="small"
              orientation="vertical"
              showText={false}
            />
            {distance !== undefined && (
              <span
                className={`opponent-seat__distance ${
                  isInRange
                    ? "opponent-seat__distance--in-range"
                    : "opponent-seat__distance--out-of-range"
                }`}
                title={`Distance: ${distance}`}
              >
                D{distance}
              </span>
            )}
          </div>
        </div>

        {/* Fixed 2x3 equipment grid: 1 Weapon, 2 Barrel, 3 Mustang, 4 Scope, 5 Hideout, 6 Binocular */}
        {(() => {
          const equipSlots = getFixedEquipmentSlots(player.equipments, concealedSet);

          return (
            <div
              className="opponent-seat__equip-rows"
              data-flight-anchor={`opp-equip-${player.id}`}
            >
              {equipSlots.map((slot) => {
                const anchor = `opp-equip-${player.id}-${slot.slotKey}`;
                if (!slot.card) {
                  return (
                    <div
                      key={slot.slotKey}
                      data-flight-anchor={anchor}
                      className="opponent-seat__equip-row"
                      aria-hidden="true"
                    />
                  );
                }

                const title = slot.card.range
                  ? `${slot.card.name} (Range ${slot.card.range})`
                  : slot.card.name;
                return (
                  <DebouncedPopover
                    key={slot.slotKey}
                    title={title}
                    content={slot.card.desc || slot.card.name}
                    delayMs={250}
                  >
                    <div
                      data-flight-anchor={anchor}
                      className="opponent-seat__equip-row opponent-seat__equip-row--occupied"
                    >
                      <span className="opponent-seat__equip-name">{slot.card.name}</span>
                    </div>
                  </DebouncedPopover>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* Right pane: Scrollable Green Cards */}
      {(() => {
        const greens = concealedSet
          ? (player.greenCards || []).filter(
              (g) => !concealedSet.has(g.card.id) && !concealedSet.has(g.id)
            )
          : player.greenCards || [];
        const greenSlots = Array.from({ length: Math.max(6, greens.length) }).map(
          (_, idx) => greens[idx]
        );

        return (
          <div
            className="opponent-seat__green-pane"
            data-flight-anchor={`opp-green-${player.id}`}
            aria-label="Green cards in play"
          >
            <div className="opponent-seat__green-list">
              {greenSlots.map((gCard, idx) => {
                if (!gCard) {
                  return (
                    <div
                      key={`grn_empty_${idx}`}
                      className="opponent-seat__equip-row"
                      aria-hidden="true"
                    />
                  );
                }

                return (
                  <DebouncedPopover
                    key={gCard.id || `grn_${idx}`}
                    title={gCard.card.name}
                    content={gCard.card.desc || gCard.card.name}
                    delayMs={250}
                  >
                    <div
                      className={`opponent-seat__equip-row ${
                        gCard.isDelay
                          ? "opponent-seat__equip-row--green-delay"
                          : "opponent-seat__equip-row--green-ready"
                      }`}
                    >
                      <span className="opponent-seat__equip-name">{gCard.card.name}</span>
                    </div>
                  </DebouncedPopover>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
};
