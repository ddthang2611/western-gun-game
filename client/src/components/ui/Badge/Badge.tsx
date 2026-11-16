import React from "react";
import "./Badge.scss";

export type BadgeVariant = "warning" | "info" | "danger" | "success" | "neutral";
export type BadgeShape = "tag" | "diamond" | "pill";

export interface BadgeProps {
  variant?: BadgeVariant;
  shape?: BadgeShape;
  isMuted?: boolean;
  className?: string;
  children: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = "neutral",
  shape = "tag",
  isMuted = false,
  className = "",
  children,
}) => {
  const classes = [
    "ui-badge",
    `ui-badge--${shape}`,
    `ui-badge--${variant}`,
    isMuted ? "ui-badge--muted" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (shape === "diamond") {
    return (
      <div className={classes}>
        <span className="ui-badge__content">{children}</span>
      </div>
    );
  }

  return <span className={classes}>{children}</span>;
};
