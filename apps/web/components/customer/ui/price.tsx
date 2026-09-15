import type { Locale } from '@lezzet/i18n';
import { formatPrice } from '@/lib/storefront/format';

/**
 * Müşteri yüzeyinde fiyatı gösteren tek blok: biçim (`formatPrice`) ve "eski fiyat üstü çizili" kuralı burada, çağıranlarda
 * tekrarlanmaz. `wasCents` verilince fiyat fırsat rengine döner; indirimin sebebi burada yazılmaz.
 */
/** `muted`: "bölgenizde şu an yok" kartında fiyat durur ama sessizleşir; gizlemek ürünü bilinmez, ink alınabilir gösterirdi. */
type PriceTone = 'default' | 'onDark' | 'muted';
type PriceSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE: Record<PriceSize, string> = {
  sm: 'text-body',
  md: 'text-card-title-sm',
  lg: 'text-lead',
  // Tek boylu üründe fiyat SAYFANIN ÇAPASIDIR: yanında seçilecek bir şey yok, kıyas edilecek ikinci
  // kart yok. Buton etiketiyle aynı kademede kalırsa hiyerarşi kurulmuyor ve göz düğmeye kayıyor.
  xl: 'text-card-title',
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
  /**
   * "…'dan başlayan" ŞABLONU — çok boylu üründe fiyatın bir VAAT değil bir ALT SINIR olduğunu
   * söyler (denetim talebi 09.08). `{price}` yer tutucusu biçimlenmiş tutarla değişir.
   *
   * **Şablon, ek değil:** Türkçede ek sona gelir (`12,90 €'dan`), Fransızca ve Almancada başa
   * (`dès 12,90 €` · `ab 12,90 €`). Bileşene sabit bir sonek verilseydi iki dilde cümle ters
   * kurulurdu. Metnin kendisi çağıranın sözlüğünde — primitifin sözlüğü yok.
   *
   * Verilmezse fiyat bugünkü gibi çıplak yazılır: tek boylu üründe "…'dan" demek, olmayan bir
   * seçenek ima etmektir.
   */
  fromTemplate?: string;
}

export function Price({ cents, locale, wasCents, size = 'md', tone = 'default', stacked = false, fromTemplate }: PriceProps) {
  if (cents === null) return null;
  const color = tone === 'onDark' ? 'text-cream' : tone === 'muted' ? 'text-muted' : wasCents ? 'text-terracotta' : 'text-ink';
  const text = formatPrice(cents, locale);
  return (
    <span className={stacked ? 'flex flex-col' : 'flex items-center gap-2'}>
      <span className={['font-sans font-bold', SIZE[size], color].join(' ')}>
        {fromTemplate ? fromTemplate.replace('{price}', text) : text}
      </span>
      {wasCents !== undefined && (
        <span className="font-sans text-note text-sand-600 line-through">{formatPrice(wasCents, locale)}</span>
      )}
    </span>
  );
}
