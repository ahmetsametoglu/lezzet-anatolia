import type { ComponentProps } from 'react';
import { Link } from '@/i18n/navigation';
import { buttonClass } from './button';
import { Icon, type IconName } from './icons';

/**
 * Süzgeç parçaları bağ tabanlıdır, client state değil: süzme sunucuda çözülür ve seçim URL'de yaşar, liste paylaşılabilir ve geri tuşu
 * çalışır. Ölçü rol ve cihazla değişir; indirim düğmesi kategori çipiyle aynı ölçüde satırın dengesini bozar, telefon ölçüsü olmadan
 * çipler dar ekranda şişer.
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
  /** Etiketin önündeki simge (yer süzgeci iğne taşır). */
  icon?: IconName;
}

/**
 * Çipin rengi — ANLAMINA ve seçiliğine göre (K17). Süzgeç çipi (bağlantı, aşağıda) ile seçim çipi
 * (düğme, `ChoiceChip` — v1 adres penceresinin ülke ve "Bu adres ne?" seçimleri) aynı tabloyu okur:
 * v1'in `cip()`i ile nötr süzgeç çipi zaten aynı renkler (zeytin dolu · beyaz + kum-400 çerçeve).
 */
export function chipToneClass(tone: NonNullable<FilterChipProps['tone']>, active: boolean): string {
  if (tone === 'offer') return active ? 'border-terracotta bg-terracotta text-white' : 'border-terracotta-line bg-terracotta-bg text-terracotta hover:border-terracotta';
  if (tone === 'place') return active ? 'border-olive bg-olive text-white' : 'border-olive-line bg-olive-bg text-olive-dark hover:border-olive';
  return active ? 'border-olive bg-olive text-white' : 'border-sand-400 bg-card text-ink hover:border-olive';
}

/** K17 · Filtre Çipi — kategori seçimi ve indirim süzgeci. */
export function FilterChip({ label, href, active = false, tone = 'neutral', size = 'chip', compact = false, icon }: FilterChipProps) {
  const style = chipToneClass(tone, active);
  return (
    <Link
      href={href}
      // Süzgeç değiştirmek sayfayı BAŞA FIRLATMAZ — kullanıcı listenin ortasındaysa orada kalır.
      scroll={false}
      // `flex-none` + `nowrap`: şerit yatay kaydırmalıdır, sıkışan çipte uzun ad iki satıra bölünür ve hiza bozulur.
      className={[
        'inline-flex flex-none cursor-pointer items-center gap-1.5 rounded-pill border-[1.5px] font-sans whitespace-nowrap transition-colors',
        compact ? SIZE[size].compact : SIZE[size].wide,
        style,
      ].join(' ')}
    >
      {icon && <Icon name={icon} size={compact ? 12 : 14} />}
      {label}
    </Link>
  );
}

interface EmptyStateProps {
  title: string;
  body: string;
  action?: { label: string; href: ChipHref };
  /** Kutunun simgesi, ikon setinden. */
  icon?: IconName;
}

/**
 * K20 · Boş Durum — sıfır-sonuç ekranı. SADE kalır: arama sorgusunun talep sinyali olarak
 * kaydedildiğinden müşteriye SÖZ EDİLMEZ, "talebini ilet" formu açılmaz (`musteri-katalog.md §6` —
 * sistemi ifşa eden mesaj yok).
 */
export function EmptyState({ title, body, action, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border-[1.5px] border-dashed border-sand-500 px-8 py-14 text-center">
      {icon && <Icon name={icon} size={30} className="text-olive" />}
      <span className="font-serif text-card-title text-ink">{title}</span>
      <span className="max-w-md font-sans text-copy text-muted">{body}</span>
      {/* Düğme `buttonClass`tan gelir: elle yazılan hâl odak halkasını kaybeder ve `py-3` ile gövde metninin satır aralığını miras
          alıp uzar. */}
      {action && (
        <Link href={action.href} className={buttonClass({ className: 'mt-1' })}>
          {action.label}
        </Link>
      )}
    </div>
  );
}
