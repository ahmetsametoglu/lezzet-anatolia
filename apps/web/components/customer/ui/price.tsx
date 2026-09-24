import type { Locale } from '@lezzet/i18n';
import { formatPrice } from '@/lib/storefront/format';

/**
 * Müşteri yüzeyinde fiyatı gösteren tek blok: biçim (`formatPrice`) ve "eski fiyat üstü çizili" kuralı burada, çağıranlarda
 * tekrarlanmaz. `wasCents` verilince fiyat fırsat rengine döner; indirimin sebebi burada yazılmaz.
 */
/** `muted`: "bölgenizde şu an yok" kartında fiyat durur ama sessizleşir; gizlemek ürünü bilinmez, ink alınabilir gösterirdi. */
type PriceTone = 'default' | 'onDark' | 'muted';
type PriceSize = 'sm' | 'md' | 'lg' | 'xl' | 'hero';

const SIZE: Record<PriceSize, string> = {
  sm: 'text-copy',
  md: 'text-card-title-sm',
  lg: 'text-lead',
  // Tek boylu üründe fiyat SAYFANIN ÇAPASIDIR: yanında seçilecek bir şey yok, kıyas edilecek ikinci
  // kart yok. Buton etiketiyle aynı kademede kalırsa hiyerarşi kurulmuyor ve göz düğmeye kayıyor.
  xl: 'text-card-title',
  // Ürün detayın fiyat kutusu: kutunun içindeki TEK sayı ve yanındaki düğmeyle aynı ağırlıkta
  // olmamalı — tasarımın ölçüsü 29 px, merdivenin en yakın basamağı 30.
  hero: 'text-h1-sm',
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
  /** Eski fiyat alt alta: dar mobil kartta yan yana iki fiyat satırı şişirir ve eylem düğmesini kartın dışına iter. */
  stacked?: boolean;
}

export function Price({ cents, locale, wasCents, size = 'md', tone = 'default', stacked = false }: PriceProps) {
  if (cents === null) return null;
  const color = tone === 'onDark' ? 'text-cream' : tone === 'muted' ? 'text-muted' : wasCents ? 'text-terracotta' : 'text-ink';
  const text = formatPrice(cents, locale);
  return (
    <span className={stacked ? 'flex flex-col' : 'flex items-center gap-2'}>
      <span className={['font-sans font-bold', SIZE[size], color].join(' ')}>{text}</span>
      {wasCents !== undefined && (
        <span className="font-sans text-note text-sand-600 line-through">{formatPrice(wasCents, locale)}</span>
      )}
    </span>
  );
}
