import React from "react";
import type { StructuredLogEntry } from "../../../types/game";
import { useI18n } from "../../../i18n";
import { Modal } from "../../../components/ui/Modal/Modal";
import { Button } from "../../../components/ui/Button/Button";
import { formatSimpleLog } from "../../../utils/formatters";
import "./CombatLogModal.scss";

export interface CombatLogModalProps {
  isOpen: boolean;
  combatLog: string[];
  structuredCombatLog?: StructuredLogEntry[];
  onClose: () => void;
}

export const CombatLogModal: React.FC<CombatLogModalProps> = ({
  isOpen,
  combatLog,
  structuredCombatLog,
  onClose,
}) => {
  const { t, tLog } = useI18n();
  const entries =
    structuredCombatLog && structuredCombatLog.length > 0
      ? structuredCombatLog.map((e) => tLog(e))
      : combatLog.map((l) => formatSimpleLog(l));

  return (
    <Modal isOpen={isOpen} size="medium" onClose={onClose}>
      <Modal.Header title={t("modals.combatLog.title")} />
      <Modal.Body>
        <div className="combat-log-modal__list">
          {entries.length === 0 ? (
            <div className="combat-log-modal__empty">{t("modals.combatLog.empty")}</div>
          ) : (
            entries.map((logText, idx) => (
              <div key={idx} className="combat-log-modal__entry">
                {logText}
              </div>
            ))
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          {t("common.close")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
