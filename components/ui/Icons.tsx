type P = { className?: string; size?: number };

const svg = (size: number, className?: string) => ({
  width: size,
  height: size,
  viewBox: "0 0 16 16",
  fill: "none",
  className,
  "aria-hidden": true as const,
});

export const IconClock = ({ className, size = 12 }: P) => (
  <svg {...svg(size, className)}>
    <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.2" />
    <path
      d="M8 4.6V8l2.3 1.6"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
    />
  </svg>
);

export const IconUsers = ({ className, size = 12 }: P) => (
  <svg {...svg(size, className)}>
    <circle cx="6" cy="6" r="2.4" stroke="currentColor" strokeWidth="1.2" />
    <path
      d="M1.8 13c.5-2.2 2.2-3.4 4.2-3.4S9.7 10.8 10.2 13"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
    />
    <path
      d="M11 4.2a2.2 2.2 0 010 4M12.4 9.9c1.2.5 2 1.6 2.3 3.1"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
    />
  </svg>
);

export const IconUser = ({ className, size = 12 }: P) => (
  <svg {...svg(size, className)}>
    <circle cx="8" cy="5.6" r="2.6" stroke="currentColor" strokeWidth="1.2" />
    <path
      d="M3 13.2c.7-2.4 2.6-3.7 5-3.7s4.3 1.3 5 3.7"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
    />
  </svg>
);

export const IconPercent = ({ className, size = 12 }: P) => (
  <svg {...svg(size, className)}>
    <path d="M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    <circle cx="5" cy="5" r="1.8" stroke="currentColor" strokeWidth="1.2" />
    <circle cx="11" cy="11" r="1.8" stroke="currentColor" strokeWidth="1.2" />
  </svg>
);

export const IconLock = ({ className, size = 12 }: P) => (
  <svg {...svg(size, className)}>
    <rect x="3.4" y="7" width="9.2" height="6.4" rx="1.6" stroke="currentColor" strokeWidth="1.2" />
    <path d="M5.6 7V5.4a2.4 2.4 0 014.8 0V7" stroke="currentColor" strokeWidth="1.2" />
  </svg>
);

export const IconArrow = ({ className, size = 12 }: P) => (
  <svg {...svg(size, className)}>
    <path
      d="M3.5 8h9m0 0L9 4.5M12.5 8L9 11.5"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const IconExternal = ({ className, size = 11 }: P) => (
  <svg {...svg(size, className)}>
    <path
      d="M6.5 3.5H3.4v9h9V9.4M9.6 3.4h3v3M12.4 3.6L7.2 8.8"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const IconCheck = ({ className, size = 12 }: P) => (
  <svg {...svg(size, className)}>
    <path
      d="M3 8.4l3.2 3L13 4.8"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const IconChevron = ({ className, size = 12 }: P) => (
  <svg {...svg(size, className)}>
    <path
      d="M4.5 6.5L8 10l3.5-3.5"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const IconSpinner = ({ className, size = 12 }: P) => (
  <svg {...svg(size, className)} className={`animate-spin ${className ?? ""}`}>
    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.6" />
    <path d="M14 8a6 6 0 00-6-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

export const SolanaMark = ({ className, size = 14 }: P) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    className={className}
    aria-hidden
  >
    <defs>
      <linearGradient id="sol-g" x1="2" y1="20" x2="22" y2="4">
        <stop offset="0%" stopColor="#9945FF" />
        <stop offset="100%" stopColor="#14F195" />
      </linearGradient>
    </defs>
    <path
      d="M5.4 16.3c.2-.2.5-.3.8-.3h14c.5 0 .7.6.4.9l-2.9 2.8c-.2.2-.5.3-.8.3h-14c-.5 0-.7-.6-.4-.9l2.9-2.8z"
      fill="url(#sol-g)"
    />
    <path
      d="M5.4 4.3c.2-.2.5-.3.8-.3h14c.5 0 .7.6.4.9l-2.9 2.8c-.2.2-.5.3-.8.3h-14c-.5 0-.7-.6-.4-.9l2.9-2.8z"
      fill="url(#sol-g)"
    />
    <path
      d="M18.6 10.3c-.2-.2-.5-.3-.8-.3h-14c-.5 0-.7.6-.4.9l2.9 2.8c.2.2.5.3.8.3h14c.5 0 .7-.6.4-.9l-2.9-2.8z"
      fill="url(#sol-g)"
    />
  </svg>
);
