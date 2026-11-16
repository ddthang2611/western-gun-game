import React, { createContext, useContext, useEffect, useId, useRef } from "react";
import "./Modal.scss";

export type ModalSize = "medium" | "large";

const ModalTitleContext = createContext<string | undefined>(undefined);

export interface ModalProps {
  isOpen?: boolean;
  size?: ModalSize;
  onClose?: () => void;
  children: React.ReactNode;
}

export interface ModalHeaderProps {
  title: string;
  subtitle?: string;
  extra?: React.ReactNode;
}

export interface ModalBodyProps {
  className?: string;
  children: React.ReactNode;
}

export interface ModalFooterProps {
  hint?: React.ReactNode;
  children: React.ReactNode;
}

export const ModalHeader: React.FC<ModalHeaderProps> = ({ title, subtitle, extra }) => {
  const titleId = useContext(ModalTitleContext);

  return (
    <div className="ui-modal__header">
      <div>
        <h3 id={titleId} className="ui-modal__title">{title}</h3>
        {subtitle && <div className="ui-modal__subtitle">{subtitle}</div>}
      </div>
      {extra && <div>{extra}</div>}
    </div>
  );
};

export const ModalBody: React.FC<ModalBodyProps> = ({ className = "", children }) => (
  <div className={`ui-modal__body ${className}`.trim()}>{children}</div>
);

export const ModalFooter: React.FC<ModalFooterProps> = ({ hint, children }) => (
  <div className="ui-modal__footer">
    {hint && <div className="ui-modal__hint">{hint}</div>}
    <div className="ui-modal__actions">{children}</div>
  </div>
);

type ModalComponent = React.FC<ModalProps> & {
  Header: React.FC<ModalHeaderProps>;
  Body: React.FC<ModalBodyProps>;
  Footer: React.FC<ModalFooterProps>;
};

export const Modal: ModalComponent = ({ isOpen = true, size = "medium", onClose, children }) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <ModalTitleContext.Provider value={titleId}>
      <dialog
        ref={dialogRef}
        className="ui-modal"
        aria-labelledby={titleId}
        onCancel={(e) => {
          e.preventDefault();
          onClose?.();
        }}
        onClick={(e) => {
          if (onClose && e.target === dialogRef.current) {
            onClose();
          }
        }}
      >
        <div className={`ui-modal__dialog ui-modal__dialog--${size}`}>{children}</div>
      </dialog>
    </ModalTitleContext.Provider>
  );
};

Modal.Header = ModalHeader;
Modal.Body = ModalBody;
Modal.Footer = ModalFooter;
