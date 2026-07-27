import type { Locale } from '@lezzet/i18n';
import { formatPrice } from '@/lib/storefront/format';

/**
 * K6 · Fiyat Bloğu — müşteri yüzeyinde fiyat gösteren TEK yer. Kart, liste satırı, ürün detay ve
 * sepet aynı bloğu kullanır; biçimlendirme (`formatPrice`) ve "eski fiyat üstü çizili" kuralı
 * burada yaşar, çağıran yerlerde tekrarlanmaz.
 *
 * `was` verildiğinde fiyat fırsat rengine (terracotta) döner — indirimin GÖRSEL dili tek karardır,
 * her kartta yeniden verilmez. İndirimin SEBEBİ hiçbir zaman burada değildir (musteri-anasayfa §6).
 */
type PriceTone = 'default' | 'onDark';
type PriceSize = 'sm' | 'md' | 'lg';

const SIZE: Record<PriceSize, string> = {
  sm: 'text-body',
  md: 'text-card-title-sm',
  lg: 'text-lead',
};

interface PriceProps {
  /** null → fiyat yok (satışa kapalı); blok hiç render edilmez. */
  cents: number | null;
  locale: Locale;
  /** İndirim öncesi fiyat — verilirse üstü çizili gösterilir ve ana fiyat fırsat rengine döner. */
  wasCents?: number;
  size?: PriceSize;
  /** Koyu blok üstünde (paket kartı) fiyat krem renktedir. */
  tone?: PriceTone;
}

export function Price({ cents, locale, wasCents, size = 'md', tone = 'default' }: PriceProps) {
  if (cents === null) return null;
  const color = tone === 'onDark' ? 'text-cream' : wasCents ? 'text-terracotta' : 'text-ink';
  return (
    <span className="flex items-center gap-2">
      <span className={['font-sans font-bold', SIZE[size], color].join(' ')}>{formatPrice(cents, locale)}</span>
      {wasCents !== undefined && (
        <span className="font-sans text-note text-sand-600 line-through">{formatPrice(wasCents, locale)}</span>
      )}
    </span>
  );
}
