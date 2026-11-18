type P = { size?: number };
const base = (size = 22) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': 2,
  'stroke-linecap': 'round' as const,
  'stroke-linejoin': 'round' as const,
  'aria-hidden': true,
});

export const IconMemo = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M5 4h10l4 4v12H5z" />
    <path d="M9 12h6M9 16h4" />
  </svg>
);
export const IconChart = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M7 4v16M17 4v16M12 7v10" />
    <rect x="5" y="8" width="4" height="7" rx="1" fill="currentColor" stroke="none" />
    <rect x="10" y="10" width="4" height="5" rx="1" />
    <rect x="15" y="6" width="4" height="8" rx="1" fill="currentColor" stroke="none" />
  </svg>
);
export const IconCheck = ({ size }: P) => (
  <svg {...base(size)}>
    <rect x="4" y="4" width="16" height="16" rx="5" />
    <path d="m8.5 12.5 2.5 2.5 5-6" />
  </svg>
);
export const IconTick = ({ size = 16 }: P) => (
  <svg {...base(size)} stroke-width={3}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);
export const IconSpark = ({ size = 16 }: P) => (
  <svg {...base(size)} fill="currentColor" stroke="none">
    <path d="M12 2.5c.5 4.6 2.9 7 7.5 7.5-4.6.5-7 2.9-7.5 7.5-.5-4.6-2.9-7-7.5-7.5 4.6-.5 7-2.9 7.5-7.5zM19 15c.2 1.8 1.2 2.8 3 3-1.8.2-2.8 1.2-3 3-.2-1.8-1.2-2.8-3-3 1.8-.2 2.8-1.2 3-3z" />
  </svg>
);
export const IconPlus = ({ size = 18 }: P) => (
  <svg {...base(size)} stroke-width={2.4}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const IconLeft = ({ size = 20 }: P) => (
  <svg {...base(size)} stroke-width={2.4}>
    <path d="m15 5-7 7 7 7" />
  </svg>
);
export const IconRight = ({ size = 20 }: P) => (
  <svg {...base(size)} stroke-width={2.4}>
    <path d="m9 5 7 7-7 7" />
  </svg>
);
export const IconSearch = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);
export const IconTrash = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </svg>
);
export const IconExternal = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" />
  </svg>
);
export const IconFlame = ({ size = 13 }: P) => (
  <svg {...base(size)} fill="currentColor" stroke="none">
    <path d="M12 2c1 3.5 5 6 5 11a5 5 0 0 1-10 0c0-2.3 1-3.9 2-5 .2 1.8 1 2.8 2 3.2C11 8.7 10.9 5.3 12 2z" />
  </svg>
);
export const IconSnow = ({ size = 13 }: P) => (
  <svg {...base(size)} stroke-width={2.4}>
    <path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9" />
  </svg>
);
export const IconArrowRight = ({ size = 18 }: P) => (
  <svg {...base(size)} stroke-width={2.4}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
export const IconUndo = ({ size = 18 }: P) => (
  <svg {...base(size)} stroke-width={2.4}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </svg>
);
export const IconUser = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
  </svg>
);
