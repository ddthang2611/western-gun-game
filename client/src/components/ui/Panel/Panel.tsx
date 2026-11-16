import React from "react";
import "./Panel.scss";

export interface PanelProps {
  title?: string;
  headerExtra?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}

export const Panel: React.FC<PanelProps> = ({
  title,
  headerExtra,
  className = "",
  bodyClassName = "",
  children,
}) => {
  return (
    <div className={`ui-panel ${className}`.trim()}>
      {(title || headerExtra) && (
        <div className="ui-panel__header">
          {title && <span className="ui-panel__title">{title}</span>}
          {headerExtra && <div>{headerExtra}</div>}
        </div>
      )}
      <div className={`ui-panel__body ${bodyClassName}`.trim()}>{children}</div>
    </div>
  );
};
