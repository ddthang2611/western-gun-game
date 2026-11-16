import React from "react";
import { Modal } from "../../../components/ui/Modal/Modal";
import { Button } from "../../../components/ui/Button/Button";
import "./CombatLogModal.scss";

export interface CombatLogModalProps {
  isOpen: boolean;
  combatLog: string[];
  onClose: () => void;
}

const formatSimpleLog = (line: string): string =>
  line
    .replace(/^\[[^\]]+\]\s*/g, "")
    .replace(/^\[Mock\]\s*/i, "")
    .trim();

export const CombatLogModal: React.FC<CombatLogModalProps> = ({
  isOpen,
  combatLog,
  onClose,
}) => {
  return (
    <Modal isOpen={isOpen} size="medium" onClose={onClose}>
      <Modal.Header title="Log" />
      <Modal.Body>
        <div className="combat-log-modal__list">
          {combatLog.length === 0 ? (
            <div className="combat-log-modal__empty">—</div>
          ) : (
            combatLog.map((log, idx) => (
              <div key={idx} className="combat-log-modal__entry">
                {formatSimpleLog(log)}
              </div>
            ))
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
