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
  | 'tarifler'
  | 'stock'
  | 'satinalma'
  | 'depolar'
  | 'para'
  | 'raporlar'
  | 'analitik'
  | 'musteriler'
  | 'talepler'
  | 'geribildirim'
  | 'whatsapp'
  | 'ayarlar'
  | 'sistem';

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
  // Tarif = AÇIK DEFTER. Şef külahı da adaydı ama o "mutfak" der, oysa buradaki nesne yazılan
  // metnin kendisi; ürün etiketiyle (`urunler`) karışmaması da önemli, ikisi yan yana duruyor.
  tarifler: (
    <>
      <path d="M12 6.5C10.5 5 8.5 4.5 4 4.5v13c4.5 0 6.5.5 8 2 1.5-1.5 3.5-2 8-2v-13c-4.5 0-6.5.5-8 2z" />
      <path d="M12 6.5v13" />
    </>
  ),
  fiyatlar: (
    <>
      <path d="M19 5 5 19" />
      <circle cx="6.5" cy="6.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
    </>
  ),
  stock: (
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
  // Depolar (tesis) — WarehouseIcon ile aynı bina biçimi: bağlam seçicisi, satır işareti ve nav
  // girişi aynı kavramı aynı şekille söyler.
  depolar: (
    <>
      <path d="M3 21V9l9-5 9 5v12" />
      <path d="M3 21h18" />
      <path d="M9 21v-6h6v6" />
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
  talepler: <path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" />,
  geribildirim: <path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z" />,
  whatsapp: <path d="M21 11.5a8.38 8.38 0 0 1-11.6 7.7L3 21l1.9-6.4A8.5 8.5 0 1 1 21 11.5z" />,
  ayarlar: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </>
  ),
  // Çerçeve içinde NABIZ (tasarım): sistem ekranı bir monitör değil, sağlık göstergesi. Dişli
  // (Ayarlar) ile aynı bölümde durduğu için biçimi belirgin ayrışmalı.
  sistem: (
    <>
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M6 10.5h3l1.6-3.2 2.2 6.4 1.4-3.2H18" />
      <path d="M8 21h8M12 17v4" />
    </>
  ),
};

/** Sidebar navigasyon ikonu (16px). */
export function NavIcon({ name }: { name: NavIconName }) {
  return <Svg>{NAV_PATHS[name]}</Svg>;
}

/** Depo (tesis) — bağlam seçicisinde ve satırdaki depo işaretinde. */
export function WarehouseIcon({ size = 14 }: { size?: number }) {
  return (
    <Svg size={size} strokeWidth={1.8}>
      <path d="M3 21V9l9-5 9 5v12" />
      <path d="M3 21h18" />
      <path d="M9 21v-6h6v6" />
    </Svg>
  );
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

/** Yıldız — "bunu kapak yap" (galeri karesi). Dolu değil çizgi: henüz kapak DEĞİL demek. */
export function StarIcon({ size = 14 }: { size?: number }) {
  return (
    <Svg size={size} strokeWidth={1.8}>
      <path d="m12 3.5 2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8-4.2-4.1 5.9-.9z" />
    </Svg>
  );
}

/** Çöp kutusu — silme (galeri karesi). */
export function TrashIcon({ size = 14 }: { size?: number }) {
  return (
    <Svg size={size} strokeWidth={1.8}>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6.5 7l.8 12a1 1 0 0 0 1 1h7.4a1 1 0 0 0 1-1l.8-12" />
    </Svg>
  );
}

/**
 * Kıvılcım — AI önerisi. Metinde `✦` glifi kullanılıyordu; ikon-only düğmede glif satır yüksekliğine
 * göre kayıyor ve boyutu denetlenemiyordu. Büyük kıvılcım + küçük eşlikçi: "öneri" fikri tek şekilden
 * daha okunur çıkıyor.
 */
export function SparkleIcon({ size = 14 }: { size?: number }) {
  return (
    <Svg size={size} strokeWidth={1.6}>
      <path d="M13 3.5l1.5 4L18.5 9l-4 1.5L13 14.5l-1.5-4L7.5 9l4-1.5z" />
      <path d="M6.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8L4 18l1.8-.7z" />
    </Svg>
  );
}

/** Görsel yer tutucu ikonu — ürün görseli yokken (liste + önizleme). */
export function ImageIcon({ size = 24 }: { size?: number }) {
  return (
    <Svg size={size} strokeWidth={1.8}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.6" />
      <path d="m21 15-5-5L5 21" />
    </Svg>
  );
}

/** Onay ikonu — "tam/yolunda" durum kutusu. */
export function CheckIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg size={size} strokeWidth={2.4}>
      <path d="M20 6 9 17l-5-5" />
    </Svg>
  );
}

/** Uyarı üçgeni — "beyan eksik / dikkat" durum kutusu. */
export function AlertIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg size={size} strokeWidth={2}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4M12 17h.01" />
    </Svg>
  );
}

/** Bilgi çemberi — "aday ürün" durum kutusu. */
export function InfoIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg size={size} strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </Svg>
  );
}

/** Kamera ikonu — mobilde "kameradan görsel çek". */
export function CameraIcon({ size = 17 }: { size?: number }) {
  return (
    <Svg size={size} strokeWidth={2}>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </Svg>
  );
}

/** Aramada-bulunamadı ikonu — 404 ekranı ("bu adreste bir şey yok"). */
export function SearchOffIcon({ size = 21 }: { size?: number }) {
  return (
    <Svg size={size} strokeWidth={2}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
      <path d="M8.7 8.7l4.6 4.6m0-4.6-4.6 4.6" />
    </Svg>
  );
}

/** Güneş — tema anahtarı "açık". */
export function SunIcon({ size = 14 }: { size?: number }) {
  return (
    <Svg size={size}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Svg>
  );
}

/** Ay — tema anahtarı "koyu". */
export function MoonIcon({ size = 14 }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </Svg>
  );
}

/** Ekran — tema anahtarı "sistem" (işletim sistemini izle). */
export function MonitorIcon({ size = 14 }: { size?: number }) {
  return (
    <Svg size={size}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </Svg>
  );
}

/** Aşağı ok — açılır blok (`<details>`) başlığında; açıkken çağıran taraf döndürür. */
export function ChevronDownIcon({ size = 12 }: { size?: number }) {
  return (
    <Svg size={size} strokeWidth={2}>
      <path d="m6 9 6 6 6-6" />
    </Svg>
  );
}

/** Kopyala ikonu — referans kodunu / hata mesajını panoya al (500 ekranı). */
export function CopyIcon({ size = 12 }: { size?: number }) {
  return (
    <Svg size={size} strokeWidth={2}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h8" />
    </Svg>
  );
}

/** Takvim — tarih ve tarih aralığı seçicilerinin tetikleyicisi (envanter O8). */
export function CalendarIcon({ size = 15 }: { size?: number }) {
  return (
    <Svg size={size}>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M8 2v4M16 2v4" />
    </Svg>
  );
}

/**
 * WhatsApp — müşteriye ulaşma düğmesi (sipariş detayı). Tek marka ikonu olduğu için gövde rengini
 * MİRAS ALMAZ: WhatsApp'ın kendi yeşili tanınırlığın parçasıdır ve `currentColor`'a çevrilirse
 * düğme sıradan bir ikonla aynılaşır.
 *
 * Renk yine de HAM HEX DEĞİL, kendi token'ından gelir (`--color-brand-whatsapp`): ham hex yasağının
 * gerekçesi rengin tek yerde durması: marka rengi tema ile dönmez ama yine de tek kaynaktan okunur.
 */
export function WhatsAppIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="stroke-brand-whatsapp" strokeWidth={2} aria-hidden>
      <path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.4L3 21l2.2-5.5A8.4 8.4 0 1 1 21 11.5Z" />
    </svg>
  );
}
