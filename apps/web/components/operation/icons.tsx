import type { ReactNode } from 'react';

/**
 * Operasyon ikon seti — çizgi SVG (currentColor), dekoratif değil. Nav ikonları + aksiyon ikonları.
 * Kaynak: design/project/AdminSidebar.dc.html. Müşteri evreninden ayrı (o kendi ikonlarını taşır).
 */
function Svg({ children, size = 16, strokeWidth = 1.9 }: { children: ReactNode; size?: number; strokeWidth?: number }) {
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
      className="flex-none"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export type NavIconName =
  | 'panel'
  | 'siparisler'
  | 'rotalar'
  | 'urunler'
  | 'fiyatlar'
  | 'stok'
  | 'satinalma'
  | 'para'
  | 'raporlar'
  | 'analitik'
  | 'musteriler'
  | 'b2b'
  | 'talepler'
  | 'geribildirim'
  | 'whatsapp'
  | 'ayarlar';

const NAV_PATHS: Record<NavIconName, ReactNode> = {
  panel: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  siparisler: (
    <>
      <path d="M21 8v8a2 2 0 0 1-1 1.73l-7 4a2 2 0 0 1-2 0l-7-4A2 2 0 0 1 3 16V8" />
      <path d="M3.3 7 12 12l8.7-5" />
      <path d="M12 22V12" />
    </>
  ),
  rotalar: (
    <>
      <circle cx="6" cy="19" r="2.4" />
      <circle cx="18" cy="5" r="2.4" />
      <path d="M8 19h6a4 4 0 0 0 0-8H9a4 4 0 0 1 0-8h1" />
    </>
  ),
  urunler: (
    <>
      <path d="M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L2 12V2h10z" />
      <circle cx="7" cy="7" r="1.3" />
    </>
  ),
  fiyatlar: (
    <>
      <path d="M19 5 5 19" />
      <circle cx="6.5" cy="6.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
    </>
  ),
  stok: (
    <>
      <path d="m12 2 9 5-9 5-9-5z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 17 9 5 9-5" />
    </>
  ),
  satinalma: (
    <>
      <circle cx="9" cy="20" r="1" />
      <circle cx="18" cy="20" r="1" />
      <path d="M1 2h3l2.4 12.2a2 2 0 0 0 2 1.6h8.7a2 2 0 0 0 2-1.6L23 5H5" />
    </>
  ),
  para: (
    <>
      <path d="M18 7a6 6 0 1 0 0 10" />
      <path d="M4 11h9" />
      <path d="M4 15h7" />
    </>
  ),
  raporlar: (
    <>
      <path d="M3 3v18h18" />
      <path d="M8 17v-5" />
      <path d="M13 17V8" />
      <path d="M18 17v-9" />
    </>
  ),
  analitik: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  musteriler: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a6 6 0 0 1 12 0v1" />
    </>
  ),
  b2b: (
    <>
      <rect x="4" y="2" width="16" height="20" rx="1.5" />
      <path d="M9 22v-4h6v4" />
      <path d="M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01" />
    </>
  ),
  talepler: <path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" />,
  geribildirim: <path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z" />,
  whatsapp: <path d="M21 11.5a8.38 8.38 0 0 1-11.6 7.7L3 21l1.9-6.4A8.5 8.5 0 1 1 21 11.5z" />,
  ayarlar: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </>
  ),
};

/** Sidebar navigasyon ikonu (16px). */
export function NavIcon({ name }: { name: NavIconName }) {
  return <Svg>{NAV_PATHS[name]}</Svg>;
}

/** Arama ikonu (büyüteç). */
export function SearchIcon({ size = 14 }: { size?: number }) {
  return (
    <Svg size={size} strokeWidth={2}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </Svg>
  );
}

/** Ekle ikonu (+). */
export function PlusIcon({ size = 14 }: { size?: number }) {
  return (
    <Svg size={size} strokeWidth={2}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

/** Paket/kutu ikonu — boş durum ve ürün yer tutucu. */
export function PackageIcon({ size = 26 }: { size?: number }) {
  return (
    <Svg size={size} strokeWidth={1.6}>
      <path d="M21 8v8a2 2 0 0 1-1 1.73l-7 4a2 2 0 0 1-2 0l-7-4A2 2 0 0 1 3 16V8" />
      <path d="M3.3 7 12 12l8.7-5" />
      <path d="M12 22V12" />
    </Svg>
  );
}
