import React from "react";
import type { GameOverInfo, Player, RoleType } from "../../../types/game";
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

const WINNER_LABELS: Record<string, string> = {
  SHERIFF_AND_DEPUTIES: "Law & Order Prevails (Sheriff & Deputies Win)",
  OUTLAWS: "Outlaws Take the Town (Outlaws Win)",
  RENEGADE: "Last Gunfighter Standing (Renegade Wins)",
};

export const GameOverModal: React.FC<GameOverModalProps> = ({
  gameOver,
  players,
  myRole,
  onReturnToLobby,
}) => {
  const headline = (gameOver.winner && WINNER_LABELS[gameOver.winner]) || "Match Completed";

  return (
    <Modal isOpen={true} size="medium">
      <Modal.Header
        title={headline}
        subtitle={`Role: ${(myRole || "Hidden").toUpperCase()}`}
      />

      <Modal.Body>
        <Panel>
          <div className="game-over-modal__outcome">{gameOver.message}</div>
        </Panel>

        <Panel>
          <div className="game-over-modal__players">
            {players.map((p) => (
              <div key={p.id} className="game-over-modal__player-row">
                <span>
                  <strong>{p.name}</strong> {p.hp <= 0 ? "(Eliminated)" : `(${p.hp}/${p.maxHp} HP)`}
                </span>
                <span className="game-over-modal__player-role">
                  {p.role || "Hidden"}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </Modal.Body>

      <Modal.Footer>
        <Button variant="primary" onClick={onReturnToLobby}>
          Return to Lobby
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
