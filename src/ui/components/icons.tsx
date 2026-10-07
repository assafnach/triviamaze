/** Small inline SVG icon set (no icon fonts, no external assets). */
type P = { size?: number; className?: string };

const svg = (path: React.ReactNode, { size = 22, className }: P, viewBox = '0 0 24 24'): React.JSX.Element => (
  <svg width={size} height={size} viewBox={viewBox} className={className} aria-hidden="true" focusable="false">
    {path}
  </svg>
);

export const IconHeart = (p: P & { filled?: boolean }): React.JSX.Element =>
  svg(
    <path
      d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.4 4.5 7 4.5c2 0 3.6 1.1 5 2.9 1.4-1.8 3-2.9 5-2.9 3.6 0 5.6 3.5 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"
      fill={p.filled === false ? 'none' : 'currentColor'}
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />,
    p,
  );

export const IconHourglass = (p: P): React.JSX.Element =>
  svg(
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h12M6 21h12" />
      <path d="M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9" />
      <path d="M9.5 18.5h5" />
    </g>,
    p,
  );

export const IconGem = (p: P): React.JSX.Element =>
  svg(
    <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
      <path d="M6 4h12l4 5-10 11L2 9z" />
      <path d="M2 9h20M9 4l3 16M15 4l-3 16" opacity=".6" />
    </g>,
    p,
  );

export const IconMap = (p: P): React.JSX.Element =>
  svg(
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" />
      <path d="M9 4v14M15 6v14" />
    </g>,
    p,
  );

export const IconPause = (p: P): React.JSX.Element =>
  svg(
    <g fill="currentColor">
      <rect x="6" y="4.5" width="4" height="15" rx="1.2" />
      <rect x="14" y="4.5" width="4" height="15" rx="1.2" />
    </g>,
    p,
  );

export const IconStar = (p: P): React.JSX.Element =>
  svg(<path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.3L12 17.1 6.3 20.2l1.2-6.3L2.8 9.5l6.4-.8z" fill="currentColor" />, p);

export const IconCheck = (p: P): React.JSX.Element =>
  svg(<path d="M4 12.5l5 5L20 6.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />, p);

export const IconCross = (p: P): React.JSX.Element =>
  svg(<path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />, p);

export const IconSound = (p: P & { muted?: boolean }): React.JSX.Element =>
  svg(
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
      {p.muted ? <path d="M17 9l5 6M22 9l-5 6" /> : <path d="M17 8.5a5 5 0 010 7M19.5 6a8.5 8.5 0 010 12" />}
    </g>,
    p,
  );

export const IconTrophy = (p: P): React.JSX.Element =>
  svg(
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M7 4h10v5a5 5 0 01-10 0z" />
      <path d="M7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3M12 14v4M8 20h8" />
    </g>,
    p,
  );

export const IconGear = (p: P): React.JSX.Element =>
  svg(
    <g fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" strokeLinecap="round" />
    </g>,
    p,
  );

export const IconBook = (p: P): React.JSX.Element =>
  svg(
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M12 6c-2-1.5-5-2-8-1.5V19c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V4.5C17 4 14 4.5 12 6z" />
      <path d="M12 6v14.5" />
    </g>,
    p,
  );

export const IconPlay = (p: P): React.JSX.Element => svg(<path d="M17 5v14L6 12z" fill="currentColor" />, p);

/** Decorative labyrinth emblem for the title. */
export const Emblem = ({ size = 86 }: { size?: number }): React.JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" className="emblem">
    <defs>
      <radialGradient id="eg" cx="50%" cy="45%" r="60%">
        <stop offset="0" stopColor="#fff1c4" />
        <stop offset="1" stopColor="#c08a2c" />
      </radialGradient>
    </defs>
    <circle cx="50" cy="50" r="46" fill="none" stroke="url(#eg)" strokeWidth="1.5" opacity=".7" />
    <circle cx="50" cy="50" r="40" fill="none" stroke="url(#eg)" strokeWidth="0.8" strokeDasharray="2 4" opacity=".6" />
    <path
      d="M50 16 A34 34 0 1 1 22 34 M50 26 A24 24 0 1 0 72 40 M50 36 A14 14 0 1 1 38 44"
      fill="none"
      stroke="url(#eg)"
      strokeWidth="3.2"
      strokeLinecap="round"
    />
    <circle cx="50" cy="50" r="4" fill="#fff1c4" />
  </svg>
);
