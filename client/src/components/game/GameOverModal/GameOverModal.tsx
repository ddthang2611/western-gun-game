import React from "react";
import type { GameOverInfo, Player, RoleType } from "../../../types/game";
import { useI18n } from "../../../i18n";
import { Modal } from "../../ui/Modal/Modal";
import { Panel } from "../../ui/Panel/Panel";
import { Button } from "../../ui/Button/Button";
import "./GameOverModal.scss";

export interface GameOverModalProps {
  gameOver: GameOverInfo;
  players: Player[];
  myRole?: RoleType;
  onReturnToLobby: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  gameOver,
  players,
  myRole,
  onReturnToLobby,
}) => {
  const { t, tRole } = useI18n();
  const headline = gameOver.winner
    ? t(`modals.gameOver.winner.${gameOver.winner}`, undefined, t("modals.gameOver.title"))
    : t("modals.gameOver.title");

  const localizedParams = gameOver.outcomeParams
    ? {
        ...gameOver.outcomeParams,
        killerRole: gameOver.outcomeParams.killerRole
          ? tRole(String(gameOver.outcomeParams.killerRole))
          : undefined,
        victimRole: gameOver.outcomeParams.victimRole
          ? tRole(String(gameOver.outcomeParams.victimRole))
          : undefined,
        survivorRole: gameOver.outcomeParams.survivorRole
          ? tRole(String(gameOver.outcomeParams.survivorRole))
          : undefined,
      }
    : undefined;

  const outcomeMessage = gameOver.outcomeCode
    ? t(`modals.gameOver.outcome.${gameOver.outcomeCode}`, localizedParams, gameOver.message)
    : gameOver.message;

  return (
    <Modal isOpen={true} size="medium">
      <Modal.Header
        title={headline}
        subtitle={t("modals.gameOver.roleSubtitle", {
          role: tRole(myRole).toUpperCase(),
        })}
      />

      <Modal.Body>
        <Panel>
          <div className="game-over-modal__outcome">{outcomeMessage}</div>
        </Panel>

        <Panel>
          <div className="game-over-modal__players">
            {players.map((p) => (
              <div key={p.id} className="game-over-modal__player-row">
                <span>
                  <strong>{p.name}</strong>{" "}
                  {p.hp <= 0 ? t("modals.gameOver.eliminated") : `(${p.hp}/${p.maxHp} HP)`}
                </span>
                <span className="game-over-modal__player-role">
                  {p.role ? tRole(p.role) : t("roles.unknown")}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </Modal.Body>

      <Modal.Footer>
        <Button variant="primary" onClick={onReturnToLobby}>
          {t("modals.gameOver.returnLobby")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
