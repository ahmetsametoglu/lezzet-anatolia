import type { ComponentProps, ReactNode } from 'react';
import { Link } from '@/i18n/navigation';

/**
 * §4 · Katalog süzgeç parçaları — K17 Filtre Çipi · K20 Boş Durum. (K18 Sıralama ayrı dosyada:
 * gerçek açılır menü dışarı-tıklama dinleyicisi ister, o yüzden client bileşendir.)
 *
 * Üçü de LINK tabanlıdır, client state değil: süzme sunucuda çözülüyor (`catalog.ts`), seçim URL'de
 * yaşıyor. Böylece filtreli liste paylaşılabilir, geri tuşu çalışır ve ilk boya sunucudan tam gelir.
 *
 * ÖLÇÜLER TASARIMDAN BİREBİR (`Musteri - Katalog.dc.html`) ve İKİ EKSENDE değişir:
 *   rol   → kategori çipi (büyük) · sonuç satırı düğmesi (küçük). Aynı ölçüyle bağlanınca indirim
 *           düğmesi çip kadar büyüyor ve satırın dengesi bozuluyor (yaşandı, 27.07).
 *   cihaz → masaüstü 14/700 ped 10-20 · mobil 13/700 ped 9-16 (düğmede 13.5 → 12). Mobil ölçü
 *           atlanınca çipler dar ekranda şişiyor ve şeridin yarısını üç çip yiyor (yaşandı, 28.07).
 */

type ChipHref = ComponentProps<typeof Link>['href'];

/** `chip`: kategori seçimi (büyük). `control`: sonuç satırındaki süzgeç düğmesi (küçük). */
type ChipSize = 'chip' | 'control';

const SIZE: Record<ChipSize, { wide: string; compact: string }> = {
  chip: { wide: 'px-5 py-2.5 text-chip', compact: 'px-4 py-2 text-note font-bold' },
  control: { wide: 'px-4 py-2 text-control', compact: 'px-3 py-1.5 text-micro font-bold' },
};

interface FilterChipProps {
  label: string;
  href: ChipHref;
  active?: boolean;
  /**
   * Çipin ANLAMI (rengi değil): `offer` indirim süzgeci, `place` teslimat yeri süzgeci
   * ("adresime gönderilebilir"). İkisi de nötr süzgeçlerden ayrı durur ve birbirinden de ayrılır —
   * yan yana dururken aynı renkte olsalar hangisinin ne süzdüğü ancak metin okununca anlaşılırdı.
   */
  tone?: 'neutral' | 'offer' | 'place';
  size?: ChipSize;
  /** Mobil ölçü. */
  compact?: boolean;
}

/** K17 · Filtre Çipi — kategori seçimi ve indirim süzgeci. */
export function FilterChip({ label, href, active = false, tone = 'neutral', size = 'chip', compact = false }: FilterChipProps) {
  const style =
    tone === 'offer'
      ? active
        ? 'border-terracotta bg-terracotta text-white'
        : 'border-terracotta-line bg-terracotta-bg text-terracotta hover:border-terracotta'
      : tone === 'place'
        ? active
          ? 'border-olive bg-olive text-white'
          : 'border-olive-line bg-olive-bg text-olive-dark hover:border-olive'
        : active
          ? 'border-olive bg-olive text-white'
          : 'border-sand-400 bg-card text-ink hover:border-olive';
  return (
    <Link
      href={href}
      // Süzgeç değiştirmek sayfayı BAŞA FIRLATMAZ — kullanıcı listenin ortasındaysa orada kalır.
      scroll={false}
      // `flex-none` + `nowrap`: şerit yatay kaydırmalı, çipler SIKIŞMAMALI. Sıkışınca uzun ad
      // ("Şerbetli Tatlılar") çipin içinde iki satıra bölünüyor, o çip diğerlerinden yüksek kalıyor
      // ve şeridin hizası bozuluyor (yaşandı, 28.07).
      className={[
        'flex-none cursor-pointer rounded-pill border-[1.5px] font-sans whitespace-nowrap transition-colors',
        compact ? SIZE[size].compact : SIZE[size].wide,
        style,
      ].join(' ')}
    >
      {label}
    </Link>
  );
}

interface EmptyStateProps {
  title: string;
  body: string;
  action?: { label: string; href: ChipHref };
  icon?: ReactNode;
}

/**
 * K20 · Boş Durum — sıfır-sonuç ekranı. SADE kalır: arama sorgusunun talep sinyali olarak
 * kaydedildiğinden müşteriye SÖZ EDİLMEZ, "talebini ilet" formu açılmaz (`musteri-katalog.md §6` —
 * sistemi ifşa eden mesaj yok).
 */
export function EmptyState({ title, body, action, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border-[1.5px] border-dashed border-sand-500 px-8 py-14 text-center">
      {icon && <span className="text-h2">{icon}</span>}
      <span className="font-serif text-card-title text-ink">{title}</span>
      <span className="max-w-md font-sans text-body text-muted">{body}</span>
      {action && (
        <Link
          href={action.href}
          className="mt-1 cursor-pointer rounded-pill bg-olive px-6 py-3 font-sans text-body font-bold text-white transition-colors hover:bg-olive-dark"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
