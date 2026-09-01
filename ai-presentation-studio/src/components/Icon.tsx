import type { CSSProperties } from 'react';

/** 極簡的內嵌 SVG 圖示集合，避免引入任何圖示套件或遠端資源。 */

const PATHS: Record<string, string> = {
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  left: 'M15 6l-6 6 6 6',
  right: 'M9 6l6 6-6 6',
  text: 'M5 6h14M12 6v12M9 18h6',
  square: 'M4 4h16v16H4z',
  circle: 'M12 3a9 9 0 100 18 9 9 0 000-18z',
  line: 'M4 18L20 6',
  image: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6',
  sparkles: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM18 15l.9 2.3 2.3.9-2.3.9L18 21l-.9-2.3-2.3-.9 2.3-.9z',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  flow: 'M6 4h5v5H6zM13 15h5v5h-5zM8.5 9v4a2 2 0 002 2h2.5',
  clock: 'M12 7v5l3 2M12 3a9 9 0 100 18 9 9 0 000-18z',
  table: 'M3 5h18v14H3zM3 10h18M9 10v9M15 10v9',
  infographic: 'M12 3v9l7 3M12 3a9 9 0 109 9',
  lock: 'M7 11V8a5 5 0 0110 0v3M5 11h14v9H5z',
  unlock: 'M7 11V8a5 5 0 019-3M5 11h14v9H5z',
  eye: 'M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12zM12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z',
  'eye-off': 'M4 4l16 16M9.9 5.2A9.6 9.6 0 0112 5c6.4 0 10 6 10 6a17 17 0 01-3.3 3.8M6.3 7.8A16.6 16.6 0 002 11s3.6 6 10 6a10 10 0 003.4-.6',
  undo: 'M9 14L4 9l5-5M4 9h9a6 6 0 010 12H8',
  redo: 'M15 14l5-5-5-5M20 9h-9a6 6 0 000 12h5',
  play: 'M7 4l13 8-13 8z',
  download: 'M12 3v12M7 11l5 5 5-5M4 20h16',
  upload: 'M12 21V9M7 13l5-5 5 5M4 4h16',
  check: 'M4 12l5 5L20 6',
  alert: 'M12 4l9 16H3zM12 10v4M12 17h.01',
  close: 'M6 6l12 12M18 6L6 18',
  save: 'M5 4h11l3 3v13H5zM8 4v6h7V4M8 20v-6h8v6',
  file: 'M6 3h8l4 4v14H6zM14 3v5h4',
  grid: 'M4 4h16v16H4zM4 10h16M4 16h16M10 4v16M16 4v16',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  settings: 'M12 9a3 3 0 100 6 3 3 0 000-6zM19 12l2-1-2-4-2 .6a7 7 0 00-2-1.2L14.5 4h-5L9 5.4a7 7 0 00-2 1.2L5 6 3 10l2 1v2l-2 1 2 4 2-.6a7 7 0 002 1.2l.5 2.4h5l.5-2.4a7 7 0 002-1.2l2 .6 2-4-2-1z',
  'zoom-in': 'M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-3.5-3.5M11 8v6M8 11h6',
  'zoom-out': 'M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-3.5-3.5M8 11h6',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  'align-left': 'M4 4v16M8 8h10M8 14h6',
  'align-center-x': 'M12 3v18M7 8h10M9 14h6',
  'align-right': 'M20 4v16M6 8h10M10 14h6',
  'align-top': 'M4 4h16M8 8v10M14 8v6',
  'align-center-y': 'M3 12h18M8 7v10M14 9v6',
  'align-bottom': 'M4 20h16M8 6v10M14 10v6',
  front: 'M4 8l8-4 8 4-8 4zM4 14l8 4 8-4',
  back: 'M4 16l8 4 8-4M4 10l8-4 8 4-8 4z',
  refresh: 'M20 11a8 8 0 10-1.6 5.4M20 5v6h-6',
  help: 'M9.5 9a2.5 2.5 0 113.5 2.3c-.8.4-1 1-1 1.7v.5M12 17h.01M12 3a9 9 0 100 18 9 9 0 000-18z',
  package: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
  clipboard: 'M9 4h6v3H9zM7 5H5v16h14V5h-2',
  slides: 'M3 5h18v11H3zM8 20h8',
};

export interface IconProps {
  name: keyof typeof PATHS | string;
  size?: number;
  className?: string;
  strokeWidth?: number;
  style?: CSSProperties;
  filled?: boolean;
}

export function Icon({
  name,
  size = 16,
  className,
  strokeWidth = 1.7,
  style,
  filled = false,
}: IconProps) {
  const d = PATHS[name] ?? PATHS.square;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

export const AI_KIND_ICON: Record<string, string> = {
  text: 'text',
  image: 'image',
  chart: 'chart',
  diagram: 'flow',
  timeline: 'clock',
  table: 'table',
  infographic: 'infographic',
  custom: 'sparkles',
};
