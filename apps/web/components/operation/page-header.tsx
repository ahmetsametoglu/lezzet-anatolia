import type { ReactNode } from 'react';

/**
 * Operasyon sayfa başlık barı — tüm admin ekranlarının ortak üst bandı (Ürünler/Fiyatlar/Müşteriler/
 * Siparişler/Para/Stok… hepsinde birebir aynı desen): sol tarafta ekran adı (Space Grotesk 22px) +
 * alt bilgi satırı (sayaç/özet), sağ tarafta ekran aksiyonları (arama, +yeni, süzgeç…). Aksiyonlar
 * `children` slot'undan gelir — bar yalnız düzeni ve tipografiyi sabitler, içerik her ekrana özgü.
 */
interface PageHeaderProps {
  title: string;
  /** Başlık altındaki özet/sayaç satırı (ör. "86 ürün · 3 aday"). */
  subtitle?: ReactNode;
  /** Sağ blok — arama, +yeni, süzgeç gibi ekran aksiyonları. */
  children?: ReactNode;
}

export function PageHeader({ title, subtitle, children }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-center gap-3.5 border-b border-ops-line px-6 py-4">
      <div className="mr-auto flex flex-col gap-px">
        <h1 className="font-ops-display text-[22px] font-semibold text-ops-ink">{title}</h1>
        {subtitle ? <span className="font-ops-body text-xs text-ops-muted">{subtitle}</span> : null}
      </div>
      {children}
    </header>
  );
}
