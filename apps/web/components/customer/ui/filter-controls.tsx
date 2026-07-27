import type { ComponentProps, ReactNode } from 'react';
import { Link } from '@/i18n/navigation';

/**
 * §4 · Katalog süzgeç parçaları — K17 Filtre Çipi · K18 Sıralama Seçici · K20 Boş Durum.
 *
 * Üçü de LINK tabanlıdır, client state değil: süzme sunucuda çözülüyor (`catalog.ts`), seçim URL'de
 * yaşıyor. Böylece filtreli liste paylaşılabilir, geri tuşu çalışır ve ilk boya sunucudan tam gelir.
 *
 * ÖLÇÜLER TASARIMDAN BİREBİR (`Musteri - Katalog.dc.html`): kategori çipi 14/700 ped 10-20; süzgeç
 * ve sıralama düğmesi 13.5/700 ped 8-16. İkisi AYNI DEĞİL — aynı komponente aynı ölçüyle bağlanınca
 * indirim düğmesi çip kadar büyüyor ve satırın dengesi bozuluyor (yaşandı, 27.07).
 */

type ChipHref = ComponentProps<typeof Link>['href'];

/** `chip`: kategori seçimi (büyük). `control`: sonuç satırındaki süzgeç düğmesi (küçük). */
type ChipSize = 'chip' | 'control';

const SIZE: Record<ChipSize, string> = {
  chip: 'px-5 py-2.5 text-chip',
  control: 'px-4 py-2 text-control',
};

interface FilterChipProps {
  label: string;
  href: ChipHref;
  active?: boolean;
  /** Fırsat çipi ("Yalnız indirimliler") — nötr süzgeçlerden ayrı renkte durur. */
  tone?: 'neutral' | 'offer';
  size?: ChipSize;
}

/** K17 · Filtre Çipi — kategori seçimi ve indirim süzgeci. */
export function FilterChip({ label, href, active = false, tone = 'neutral', size = 'chip' }: FilterChipProps) {
  const style =
    tone === 'offer'
      ? active
        ? 'border-terracotta bg-terracotta text-white'
        : 'border-terracotta-line bg-terracotta-bg text-terracotta hover:border-terracotta'
      : active
        ? 'border-olive bg-olive text-white'
        : 'border-sand-400 bg-card text-ink hover:border-olive';
  return (
    <Link href={href} className={['cursor-pointer rounded-pill border-[1.5px] font-sans transition-colors', SIZE[size], style].join(' ')}>
      {label}
    </Link>
  );
}

interface SortSelectProps {
  /** "Sırala:" — düğme metninin sabit ön eki. */
  label: string;
  /** Seçili seçeneğin adı — düğmenin üstünde görünen değer. */
  currentLabel: string;
  options: Array<{ label: string; href: ChipHref; active: boolean }>;
}

/**
 * K18 · Sıralama Seçici — tasarımdaki gibi TEK açılır düğme ("Sırala: Öne çıkanlar ▾").
 *
 * `details/summary` ile kurulur: açılma yerel bir tarayıcı davranışıdır, client state ve JS
 * gerekmez — sayfa sunucu bileşeni kalır. Menü İÇERİĞİNİN görünümü tasarımda çizilmemiş (yalnız
 * kapalı hâli var); liste token'lara sadık, en sade biçimde kuruldu.
 */
export function SortSelect({ label, currentLabel, options }: SortSelectProps) {
  return (
    <details className="relative">
      <summary className="flex cursor-pointer list-none items-center gap-1 rounded-pill border-[1.5px] border-sand-400 bg-card px-4 py-2 font-sans text-control text-ink transition-colors hover:border-olive">
        {label} {currentLabel} <span aria-hidden>▾</span>
      </summary>
      <div className="absolute right-0 z-10 mt-2 flex min-w-52 flex-col overflow-hidden rounded-soft border border-sand-200 bg-card">
        {options.map((o) => (
          <Link
            key={o.label}
            href={o.href}
            className={[
              'cursor-pointer px-4 py-2.5 font-sans text-control transition-colors hover:bg-hover-bg',
              o.active ? 'text-olive' : 'text-ink',
            ].join(' ')}
          >
            {o.label}
          </Link>
        ))}
      </div>
    </details>
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
