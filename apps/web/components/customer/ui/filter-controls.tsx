import type { ComponentProps, ReactNode } from 'react';
import { Link } from '@/i18n/navigation';

/**
 * §4 · Katalog süzgeç parçaları — K17 Filtre Çipi · K18 Sıralama Seçici · K20 Boş Durum.
 *
 * Üçü de LINK tabanlıdır, client state değil: süzme sunucuda çözülüyor (`catalog.ts`), seçim URL'de
 * yaşıyor. Böylece filtreli liste paylaşılabilir, geri tuşu çalışır ve ilk boya sunucudan tam gelir.
 */

type ChipHref = ComponentProps<typeof Link>['href'];

interface FilterChipProps {
  label: string;
  href: ChipHref;
  active?: boolean;
  /** Fırsat çipi ("Yalnız indirimliler") — nötr süzgeçlerden ayrı renkte durur. */
  tone?: 'neutral' | 'offer';
}

/** K17 · Filtre Çipi — kategori seçimi ve indirim süzgeci. */
export function FilterChip({ label, href, active = false, tone = 'neutral' }: FilterChipProps) {
  const style =
    tone === 'offer'
      ? active
        ? 'border-terracotta bg-terracotta text-white'
        : 'border-terracotta-line bg-terracotta-bg text-terracotta hover:border-terracotta'
      : active
        ? 'border-olive bg-olive text-white'
        : 'border-sand-400 bg-card text-ink hover:border-olive';
  return (
    <Link
      href={href}
      className={[
        'cursor-pointer rounded-pill border-[1.5px] px-5 py-2.5 font-sans text-note font-bold transition-colors',
        style,
      ].join(' ')}
    >
      {label}
    </Link>
  );
}

interface SortSelectProps {
  label: string;
  options: Array<{ label: string; href: ChipHref; active: boolean }>;
}

/**
 * K18 · Sıralama Seçici — açılır menü yerine yan yana bağlantılar. Seçenek sayısı üç olduğu için
 * menü açmak fazladan bir dokunuş olurdu; sade ve sezgisel kuralı (CLAUDE.md §3) doğrudan seçimi
 * tercih ettiriyor. Seçenek artarsa gerçek bir menüye döner.
 */
export function SortSelect({ label, options }: SortSelectProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-sans text-note text-muted">{label}</span>
      {options.map((o) => (
        <Link
          key={o.label}
          href={o.href}
          className={[
            'cursor-pointer rounded-pill border-[1.5px] px-4 py-2 font-sans text-note font-bold transition-colors',
            o.active ? 'border-ink bg-card text-ink' : 'border-sand-300 bg-card text-muted hover:border-olive hover:text-ink',
          ].join(' ')}
        >
          {o.label}
        </Link>
      ))}
    </div>
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
