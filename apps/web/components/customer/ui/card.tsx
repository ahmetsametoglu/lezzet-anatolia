import type { ReactNode } from 'react';

/**
 * Kart kabuğu — beyaz zemin, kum-200 kenar, `radius 18` (denetim bulgusu M2, 02.08).
 *
 * Dört yerde elle kurulmuştu: checkout özeti, hesap kartları, sipariş onayı ve **onların iskeleti**.
 * Sonuncusu sorunun neden görsel bir titizlik meselesi olmadığını gösteriyor — `SkeletonCard`
 * `px-6.5` çiziyordu, yerini tuttuğu checkout özeti `px-6`; içerik gelince kart 4 px kayıyordu.
 * İskeletin künyesi zaten "aynı kabuğu paylaşması gerekiyor, yoksa sıçrıyor" diyordu; kabuk
 * paylaşılmadığı için künye kendi uyarısını tutamamıştı.
 *
 * **İki ped var ve ikisi de tasarımdan.** Yaygın değer `22×26` (`roomy`) — iki tasarım dosyasında
 * dokuz kez geçiyor. Checkout ÖZETİ ise `22×24` (`snug`) çizili ve kendi künyesi bunu "adım
 * kartlarıyla aynı aile, bir tık dar" diye anlatıyor; iki değeri tekleştirmek o kararı silmek olurdu.
 *
 * Dar cihaz pedi de İKİ değerli: `md` 16 (checkout · onay · hesap) ve `sm` 14 — sepet özeti
 * tasarımda mobilde `padding:14px` çiziliyor (`Musteri - Sepet.dc.html:399`). Hesap kartındaki
 * `py-3.5` ise arkasında tasarım notu olmayan 2 px'lik bir tekildi ve iskeletin ölçüsüyle
 * çelişiyordu; `md`ye hizalandı.
 *
 * Ped ve boşluk **arama tablosundan** seçilir, "varsayılan + ezme" ile değil: Tailwind çakışan
 * sınıfları kaynak sırasına göre çözer, sınıf dizgisindeki sıraya göre değil — `px-6.5` üstüne
 * `px-6` yazmak öngörülemez sonuç verir (birleştirme yardımcısı yok). Bu yüzden her eksen kapalı
 * bir liste; "kendi sınıfını geçir" kapısı bilerek açılmadı, o kapı sapmanın geri döndüğü kapıdır.
 */
type CardPad = 'roomy' | 'snug';
type CardCompactPad = 'md' | 'sm';
type CardGap = 'xs' | 'sm' | 'md';

const PAD: Record<CardPad, string> = {
  roomy: 'px-6.5 py-5.5',
  snug: 'px-6 py-5.5',
};
const COMPACT_PAD: Record<CardCompactPad, string> = {
  md: 'px-4 py-4',
  sm: 'p-3.5',
};
const GAP: Record<CardGap, string> = { xs: 'gap-2', sm: 'gap-2.5', md: 'gap-3' };

interface CardClassOptions {
  /** Mobil yerleşim (cihaz forku — `md:` yok). */
  compact?: boolean;
  pad?: CardPad;
  compactPad?: CardCompactPad;
  gap?: CardGap;
  className?: string;
}

/** Kabuk sınıfı — komponent kuramayan yerler için (iskelet, `<section>` dışı etiketler). */
export function cardClass({
  compact = false,
  pad = 'roomy',
  compactPad = 'md',
  gap = 'md',
  className,
}: CardClassOptions = {}): string {
  return [
    'flex flex-col rounded-card border border-sand-200 bg-card',
    GAP[gap],
    compact ? COMPACT_PAD[compactPad] : PAD[pad],
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

interface CardProps extends CardClassOptions {
  children: ReactNode;
}

export function Card({ children, ...options }: CardProps) {
  return <section className={cardClass(options)}>{children}</section>;
}
