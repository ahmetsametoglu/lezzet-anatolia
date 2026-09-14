import type { ReactNode } from 'react';

/**
 * Müşteri ikon seti — v1 tasarımının çizgi ikonları (`design/project/Musteri Web v1.dc.html`, 13.09).
 *
 * Müşteri yüzeyi uzun süre emoji konuştu (📍 🧺 ❄ 🚚 📦) — eski çizimlerin dili buydu. v1 dili
 * değiştirdi: 24'lük ızgarada 1,9 çizgi, `currentColor`; renk ikonu kullanan yerden gelir.
 * Operasyonun seti ayrı (`operation/ui/icons.tsx`): iki evren ayrı çizimler taşıyor.
 *
 * Tek bileşen + ad: dışa tek `Icon` açılır, henüz kullanılmayan çizim `knip`e ölü ihraç olarak
 * düşmez. `bell` tasarımda YOK — bildirim zili v1'de çizilmemiş; aynı çizgi diliyle eklendi ki
 * yüzeyde tek emoji kalmasın.
 *
 * Mobil v1'in (`Musteri Mobil v1.dc.html`) sekme çubuğu çizimleri de burada: `home` · `grid` ·
 * `basketPlain` · `user`. `basketPlain` ayrı bir çizim — mobilin sepeti iç çizgisiz, web v1'inki
 * (`basket`) iki dikey çizgili.
 */
export type IconName =
  | 'pin'
  | 'basket'
  | 'snowflake'
  | 'truck'
  | 'box'
  | 'sparkle'
  | 'close'
  | 'search'
  | 'percent'
  | 'share'
  | 'star'
  | 'check'
  | 'timer'
  | 'serving'
  | 'thumbUp'
  | 'thumbDown'
  | 'undo'
  | 'trash'
  | 'refresh'
  | 'document'
  | 'chat'
  | 'building'
  | 'mail'
  | 'camera'
  | 'bolt'
  | 'warning'
  | 'lock'
  | 'bell'
  | 'home'
  | 'grid'
  | 'user'
  | 'basketPlain';

const PATHS: Record<IconName, ReactNode> = {
  pin: (
    <>
      <path d="M12 21.5s7-6.6 7-11.4A7 7 0 1 0 5 10.1c0 4.8 7 11.4 7 11.4z" />
      <circle cx="12" cy="10" r="2.4" />
    </>
  ),
  basket: (
    <>
      <path d="M4.5 9.5h15l-1.3 9.2a2 2 0 0 1-2 1.8H7.8a2 2 0 0 1-2-1.8L4.5 9.5z" />
      <path d="M9 9.5 10.6 4M15 9.5 13.4 4" />
      <path d="M9.8 13v4M14.2 13v4" />
    </>
  ),
  snowflake: (
    <>
      <path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5 4.2 16.5" />
      <path d="M12 6.8 9.9 5.1M12 6.8l2.1-1.7M12 17.2l-2.1 1.7M12 17.2l2.1 1.7" />
    </>
  ),
  truck: (
    <>
      <path d="M2.5 6.5h11v9h-11z" />
      <path d="M13.5 9.5h4l3 3v3h-7" />
      <circle cx="6.6" cy="18" r="1.8" />
      <circle cx="17" cy="18" r="1.8" />
    </>
  ),
  box: (
    <>
      <path d="M3.5 8 12 4l8.5 4v8L12 20l-8.5-4V8z" />
      <path d="M3.5 8 12 12l8.5-4M12 12v8" />
    </>
  ),
  sparkle: <path d="M12 3.5l1.9 5.4 5.6 2-5.6 2-1.9 5.4-1.9-5.4-5.6-2 5.6-2z" />,
  close: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20.5 20.5-4.2-4.2" />
    </>
  ),
  percent: (
    <>
      <circle cx="8" cy="8" r="2.4" />
      <circle cx="16" cy="16" r="2.4" />
      <path d="M18.5 5.5 5.5 18.5" />
    </>
  ),
  share: <path d="M8 16 16.5 7.5M10 7.5h6.5V14" />,
  star: <path d="M12 3.4l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.9-5.2 2.9 1-5.9L3.5 9.6l5.9-.8z" />,
  check: <path d="M5 12.8 9.2 17 19 6.5" />,
  timer: (
    <>
      <circle cx="12" cy="13.2" r="7.3" />
      <path d="M12 9.8v3.4l2.4 1.7M9.6 3.5h4.8" />
    </>
  ),
  serving: (
    <>
      <path d="M8 3.5v7a2 2 0 0 0 4 0v-7M10 12.5v8" />
      <path d="M16.4 3.5c1.8 1.9 1.8 5.6 0 7.4v9.6" />
    </>
  ),
  thumbUp: (
    <>
      <path d="M7.5 20.5V10l4-6.5c1.5 0 2.3 1 2.1 2.3L13 9.5h4.6a2 2 0 0 1 2 2.3l-1.2 6.5a2 2 0 0 1-2 2.2H7.5z" />
      <path d="M7.5 10.5H4.5v10h3" />
    </>
  ),
  thumbDown: (
    <>
      <path d="M16.5 3.5V14l-4 6.5c-1.5 0-2.3-1-2.1-2.3L11 14.5H6.4a2 2 0 0 1-2-2.3l1.2-6.5a2 2 0 0 1 2-2.2h8.9z" />
      <path d="M16.5 13.5h3v-10h-3" />
    </>
  ),
  undo: (
    <>
      <path d="M9.5 14.5 4.5 9.5l5-5" />
      <path d="M4.5 9.5h10a5 5 0 0 1 0 10h-3" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 7h15M10 7V4.8h4V7" />
      <path d="M6.5 7l1 13h9l1-13" />
      <path d="M10.5 11v5.5M13.5 11v5.5" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 4v4.5h-4.5" />
    </>
  ),
  document: (
    <>
      <path d="M7 3.5h7l4 4v13H7z" />
      <path d="M14 3.5v4h4M10 13h6M10 16.5h4" />
    </>
  ),
  chat: (
    <path d="M20.5 12.3c0 3.5-3.8 6.4-8.5 6.4-1 0-2-.1-2.9-.4L4 20.5l1.3-3.4c-1.1-1.2-1.8-2.9-1.8-4.8 0-3.5 3.8-6.4 8.5-6.4s8.5 2.9 8.5 6.4z" />
  ),
  building: (
    <>
      <path d="M4.5 20.5V7.5L11 4l6.5 3.5v13" />
      <path d="M3 20.5h18M8 11h1.5M8 14.5h1.5M13 11h1.5M13 14.5h1.5M11 20.5v-3.2" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="M4 7.8l8 5.4 8-5.4" />
    </>
  ),
  camera: (
    <>
      <path d="M3.5 8.5h3.2L8.2 6h7.6l1.5 2.5h3.2v10h-17z" />
      <circle cx="12" cy="13.5" r="3.2" />
    </>
  ),
  bolt: <path d="M13.5 3 6 13.5h5l-1 7.5 7.5-11h-5z" />,
  warning: (
    <>
      <path d="M12 4.5 21 19.5H3z" />
      <path d="M12 10v4M12 16.8h.01" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </>
  ),
  home: (
    <>
      <path d="M4 11 12 4l8 7" />
      <path d="M6.5 9.5V20h11V9.5M10 20v-5.5h4V20" />
    </>
  ),
  grid: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.8" />
      <path d="M4.5 20.5c1.4-3.6 4.1-5.4 7.5-5.4s6.1 1.8 7.5 5.4" />
    </>
  ),
  basketPlain: (
    <>
      <path d="M4.5 9.5h15l-1.3 9.2a2 2 0 0 1-2 1.8H7.8a2 2 0 0 1-2-1.8L4.5 9.5z" />
      <path d="M9 9.5 10.6 4M15 9.5 13.4 4" />
    </>
  ),
};

/** Yüzey olarak çizilen ikonlar — çizgi değil dolgu (puan yıldızı). */
const FILLED: ReadonlySet<IconName> = new Set<IconName>(['star']);

interface IconProps {
  name: IconName;
  /** Kenar (px). Tasarım ikonu yanındaki yazının bir tık üstünde çizer: 13'lük yazıya 15-16. */
  size?: number;
  /** Arama büyüteci tasarımda bir tık kalın (2,1); öteki her şey 1,9. */
  strokeWidth?: number;
  className?: string;
}

export function Icon({ name, size = 16, strokeWidth = 1.9, className }: IconProps) {
  const filled = FILLED.has(name);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={filled ? undefined : strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={['flex-none', className].filter(Boolean).join(' ')}
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  );
}
