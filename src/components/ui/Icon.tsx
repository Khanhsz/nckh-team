import type { SVGProps } from 'react';

/** Bộ icon nét mảnh (24×24, stroke = currentColor) — thay cho emoji trong giao diện */
const PATHS = {
  menu: 'M4 7h16M4 12h16M4 17h16',
  today: 'M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Zm-1 4h16M8 3v4m8-4v4m-4 6.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z',
  calendar: 'M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Zm-1 4h16M8 3v4m8-4v4',
  plus: 'M12 5v14M5 12h14',
  chevronLeft: 'M15 6l-6 6 6 6',
  chevronRight: 'M9 6l6 6-6 6',
  chevronDown: 'M6 9l6 6 6-6',
  close: 'M6 6l12 12M18 6 6 18',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-11v6m0-9.5v.01',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 2-4-4',
  team: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-6 9c0-3.3 2.7-5 6-5s6 1.7 6 5m1-9a3 3 0 1 0 0-6m2 15c0-2.5-1.2-4-3-4.6',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8c0-3.9 3.1-6 7-6s7 2.1 7 6',
  folder: 'M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z',
  sync: 'M20 12a8 8 0 0 1-14.3 4.9M4 12a8 8 0 0 1 14.3-4.9M18 3v4.5h-4.5M6 21v-4.5h4.5',
  sparkle: 'M12 4l1.8 4.7L18.5 10.5 13.8 12.3 12 17l-1.8-4.7L5.5 10.5l4.7-1.8L12 4Z',
  chat: 'M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-7l-4 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z',
  graph: 'M6 7a2 2 0 1 0 0-.01M18 6a2 2 0 1 0 0-.01M12 18a2 2 0 1 0 0-.01M7.7 7.8l3.4 8.4M16.4 7.6l-3.5 8.6M8 6.3h8',
  compass: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm3.5-12.5-2 5-5 2 2-5 5-2Z',
  table: 'M4 5h16v14H4V5Zm0 5h16M4 14.5h16M10 5v14',
  download: 'M12 4v11m-4.5-4.5L12 15l4.5-4.5M5 19h14',
  copy: 'M9 9h10v10H9V9Zm-4 6V5h10',
  warning: 'M12 4 21 19H3L12 4Zm0 6v4m0 2.5v.01',
  block: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM5.6 5.6l12.8 12.8',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Zm9.5 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  crown: 'M4 17h16l1-9-5 3.5L12 5 8 11.5 3 8l1 9Z',
  mail: 'M4 6h16v12H4V6Zm0 0 8 7 8-7',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Zm4 4h4',
  check: 'M5 12.5 10 17 19 7',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4.5l3 2',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  logout: 'M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3M10 8l-4 4 4 4M6 12h10',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  star: 'M12 4.5l2.3 4.8 5.2.6-3.9 3.6 1 5.2L12 16.1 7.4 18.7l1-5.2L4.5 9.9l5.2-.6L12 4.5Z',
  subtask: 'M6 4v9a3 3 0 0 0 3 3h9m-3-3 3 3-3 3',
  image: 'M4 5h16v14H4V5Zm0 11 4.5-4.5 4 4 2.5-2.5L20 18M15.5 9.5a1 1 0 1 0 0-.01',
  move: 'M12 3v18m0-18-3 3m3-3 3 3m-3 15-3-3m3 3 3-3',
  upload: 'M12 16V5m-4.5 4.5L12 5l4.5 4.5M5 19h14',
  trash: 'M5 7h14M10 7V4.5h4V7m-7 0 1 13h8l1-13'
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, strokeWidth = 1.75, className, ...rest }: { name: IconName; size?: number; strokeWidth?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className ?? ''}`}
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
