'use client';

import { RATIO_SQUARE } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { Button } from '@/components/customer/ui/button';
import { FramedImage } from '@/components/media/framed-image';
import { useCart } from '@/components/customer/cart/cart-context';
import { cartKey, type CartLine, type CartRef } from '@/lib/cart/cart-types';
import { formatPrice } from '@/lib/storefront/format';
import messages from './restriction-messages.json';

/**
 * K33 · Sonraya Kaydedildi Listesi — sepetin altında yaşayan kalıcı liste.
 *
 * Teslimat yerine gönderilemeyen kalem SİLİNMEZ, buraya taşınır: alışveriş ölmez, sepet bölünür
 * (tasarım §7). Buraya YALNIZ kısıt bloğundan girilir — sepet satırındaki serbest "sonraya kaydet"
 * kaldırıldı (bkz. `cart-line`), çünkü sebebi olmayan bir erteleme kontrolü müşteriye hiçbir şey
 * anlatmıyordu. Liste böylece kendi kendini açıklıyor: göründüğü her an bir sebebi var.
 *
 * Ziyaretçide tarayıcıda, girişli müşteride sunucuda yaşar ve girişte devralınır — sepetin
 * deseninin aynısı. "Sonraya kaydet"in önüne giriş duvarı koymak, müşterinin vazgeçmeye en yakın
 * olduğu anda ikinci bir engel çıkarmak olurdu.
 *
 * Boşken HİÇ çizilmez: boş bir "sonraya kaydedildi (0)" kutusu sepetin altında yer kaplayan bir
 * gürültüdür.
 */
export function SavedList({ locale, compact = false }: { locale: Locale; compact?: boolean }) {
  const t = messages[locale];
  const { saved, restoreToCart } = useCart();
  if (saved.lines.length === 0) return null;

  const refOf = (line: CartLine): CartRef =>
    line.kind === 'bundle' ? { kind: 'bundle', bundleId: line.bundleId } : { kind: 'variant', variantId: line.variantId, stockId: line.stockId };

  return (
    <section className="flex flex-col gap-2.5 rounded-card border border-sand-200 bg-card px-5 py-4">
      <div className="flex flex-col gap-1">
        <span className={['font-serif text-ink', compact ? 'text-card-title-sm' : 'text-h2-sm'].join(' ')}>
          {t.savedTitle.replace('{n}', String(saved.lines.length))}
        </span>
        <span className="font-sans text-note leading-relaxed text-muted">{t.savedBody}</span>
      </div>

      {saved.lines.map((line) => (
        <div key={cartKey(line)} className="flex items-center gap-3 rounded-soft bg-sand-25 px-3 py-2.5">
          <div className="w-11 flex-none">
            <FramedImage src={line.image.url} alt={line.name} ratio={RATIO_SQUARE} crop={line.image.crop} />
          </div>
          <div className="flex flex-1 flex-col gap-0.5">
            <span className="font-sans text-note font-bold text-ink">{line.name}</span>
            <span className="font-sans text-micro text-muted">
              {[line.unitLabel, line.unitPriceCents !== null ? formatPrice(line.unitPriceCents, locale) : null].filter(Boolean).join(' · ')}
            </span>
          </div>
          {/* Kısıt bloğundaki satır eylemiyle aynı dilbilgisi (hayalet buton) — iki liste yan yana
              yaşıyor, birinde link birinde buton görünmesi ikisini farklı şeyler gibi gösterirdi. */}
          <Button variant="ghost" size="sm" onClick={() => restoreToCart(refOf(line))}>
            {t.restore}
          </Button>
        </div>
      ))}
    </section>
  );
}
