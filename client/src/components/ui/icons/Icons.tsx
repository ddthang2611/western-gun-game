import React from "react";

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  className?: string;
}

export const SheriffBadgeIcon: React.FC<IconProps> = ({ size = 20, className = "", ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={`western-icon western-icon--sheriff ${className}`}
    {...props}
  >
    <polygon
      points="12,2 14.5,7 20,5 18,10.5 23,13.5 17.5,16 17.5,22 12,18.5 6.5,22 6.5,16 1,13.5 6,10.5 4,5 9.5,7"
      fill="#d4a34b"
      stroke="#5d4037"
      strokeWidth="1"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="12.5" r="3" fill="#3e2723" />
  </svg>
);

export const DeputyBadgeIcon: React.FC<IconProps> = ({ size = 20, className = "", ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={`western-icon western-icon--deputy ${className}`}
    {...props}
  >
    <polygon
      points="12,2 15,9 22,9 16.5,14 18.5,21 12,17 5.5,21 7.5,14 2,9 9,9"
      fill="#cfd8dc"
      stroke="#37474f"
      strokeWidth="1"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="12" r="2.5" fill="#263238" />
  </svg>
);

export const OutlawSkullIcon: React.FC<IconProps> = ({ size = 20, className = "", ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={`western-icon western-icon--outlaw ${className}`}
    {...props}
  >
    <path
      d="M12 2C7.5 2 4 5.5 4 10C4 12.8 5.4 15.2 7.6 16.6L7 20H17L16.4 16.6C18.6 15.2 20 12.8 20 10C20 5.5 16.5 2 12 2Z"
      fill="#b71c1c"
      stroke="#3e2723"
      strokeWidth="1"
    />
    <circle cx="9" cy="10" r="2" fill="#212121" />
    <circle cx="15" cy="10" r="2" fill="#212121" />
    <path d="M10 14L12 12L14 14" stroke="#212121" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M8 20L16 20" stroke="#f5f5f5" strokeWidth="2" strokeDasharray="2 1" />
  </svg>
);

export const RenegadeDaggerIcon: React.FC<IconProps> = ({ size = 20, className = "", ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={`western-icon western-icon--renegade ${className}`}
    {...props}
  >
    <path
      d="M19 2L15 6L14 5L13 6L15 8L6 17L4 21L8 19L17 10L19 12L20 11L19 10L23 6L19 2Z"
      fill="#7e57c2"
      stroke="#311b92"
      strokeWidth="1"
      strokeLinejoin="round"
    />
  </svg>
);

export const BulletIcon: React.FC<IconProps & { lost?: boolean }> = ({
  size = 20,
  lost = false,
  className = "",
  ...props
}) => (
  <svg
    width={size}
    height={size * 2}
    viewBox="0 0 12 24"
    fill="currentColor"
    className={`western-icon western-icon--bullet ${lost ? "western-icon--bullet-lost" : ""} ${className}`}
    {...props}
  >
    <path
      d="M6 1C4 3 2 7 2 12V22C2 22.5 2.5 23 3 23H9C9.5 23 10 22.5 10 22V12C10 7 8 3 6 1Z"
      fill={lost ? "#424242" : "#f59e0b"}
      stroke="#1f2937"
      strokeWidth="1"
    />
    <line x1="2" y1="18" x2="10" y2="18" stroke="#78350f" strokeWidth="1" />
  </svg>
);

export const RevolverIcon: React.FC<IconProps> = ({ size = 20, className = "", ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={`western-icon western-icon--revolver ${className}`}
    {...props}
  >
    <path
      d="M2 13H5V11H19V8H22V11H20V13H17V15H14V13H8V17H4L2 19V13Z"
      fill="#b0bec5"
      stroke="#263238"
      strokeWidth="1"
      strokeLinejoin="round"
    />
  </svg>
);

export const CrosshairIcon: React.FC<IconProps> = ({ size = 20, className = "", ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`western-icon western-icon--crosshair ${className}`}
    {...props}
  >
    <circle cx="12" cy="12" r="8" stroke="#ef4444" />
    <line x1="12" y1="2" x2="12" y2="6" stroke="#ef4444" />
    <line x1="12" y1="18" x2="12" y2="22" stroke="#ef4444" />
    <line x1="2" y1="12" x2="6" y2="12" stroke="#ef4444" />
    <line x1="18" y1="12" x2="22" y2="12" stroke="#ef4444" />
  </svg>
);

export const LockIcon: React.FC<IconProps> = ({ size = 20, className = "", ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={`western-icon western-icon--lock ${className}`}
    {...props}
  >
    <rect x="5" y="11" width="14" height="10" rx="2" fill="#d4a34b" stroke="#5d4037" strokeWidth="1" />
    <path d="M8 11V7C8 4.8 9.8 3 12 3C14.2 3 16 4.8 16 7V11" fill="none" stroke="#d4a34b" strokeWidth="2.5" />
    <circle cx="12" cy="16" r="1.5" fill="#3e2723" />
  </svg>
);

export const WifiSignalIcon: React.FC<IconProps & { connected?: boolean }> = ({
  size = 20,
  connected = true,
  className = "",
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={connected ? "#10b981" : "#ef4444"}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`western-icon western-icon--signal ${className}`}
    {...props}
  >
    <path d="M5 12.55a11 11 0 0 1 14.08 0" />
    <path d="M1.42 9a16 16 0 0 1 21.16 0" />
    <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
    <line x1="12" y1="20" x2="12.01" y2="20" strokeWidth="3" />
  </svg>
);
