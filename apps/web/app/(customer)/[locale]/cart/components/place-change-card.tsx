'use client';

import type { Locale } from '@lezzet/i18n';
import { Button } from '@/components/customer/ui/button';
import { useCart } from '@/components/customer/cart/cart-context';
import { formatPrice } from '@/lib/storefront/format';
import type { CartLineChange } from '@/lib/cart/place-change';
import type { Messages } from '../cart-types';

/**
 * "Yer değişti — sepet yeniden değerlendirildi" kartı (tasarım `Musteri - Sepet.dc.html`).
 *
 * **Sessiz daralma yok.** Yer değişince her kalem hâline yeniden oturuyor ve bunun görünmesi
 * tasarımın açık kuralı: *"hiçbir kalem silinmez, her değişiklik tek tek söylenir"*. Fark tek
 * satırda özetlenmez ("bazı kalemler değişti") — müşteri HANGİ kalemi sorar ve cevabı listeyi
 * gezerek aramak zorunda kalır.
 *
 * ── TASARIMDAN SAPMA (kayıt: `design/BACKLOG §3`) ────────────────────────────
 * Tasarımın kartında iki eylem var: "Anladım, sepeti göster" ve "Fiyat değişimini gözden geçir".
 * İkisi de kartın zaten içinde olduğu ekrana götürüyor — kart sepette çiziliyor ve fiyat farkı
 * satırın kendisinde yazılı. Bir tek "Anladım" bırakıldı; ikinci düğme müşteriyi bulunduğu yere
 * göndermiş olurdu.
 *
 * "Sonraya kaydedildi" satırı da yok ve bu bilinçli: kalemi otomatik taşımıyoruz. Taşıma kısıt
 * bloğunun (K32) işi ve orada asgari sepet ile ücretsiz kargo sonuçları da söyleniyor; buradan
 * sessizce taşımak müşteriyi o uyarılardan mahrum bırakırdı. Kart durumu bildirir, bloğu değil.
 */
interface PlaceChangeCardProps {
  t: Messages;
  locale: Locale;
  compact?: boolean;
}

function lineText(change: CartLineChange, t: Messages, locale: Locale): string {
  const c = t.placeChange;
  switch (change.kind) {
    case 'to_shipping':
      return c.toShipping.replace('{name}', change.name);
    case 'to_route':
      return c.toRoute.replace('{name}', change.name);
    case 'unavailable':
      return c.unavailable.replace('{name}', change.name);
    case 'reduced':
      return c.reduced
        .replace('{name}', change.name)
        .replace('{qty}', String(change.qty))
        .replace('{max}', String(change.availableHere));
    case 'price':
      return c.price
        .replace('{name}', change.name)
        .replace('{from}', formatPrice(change.fromCents, locale))
        .replace('{to}', formatPrice(change.toCents, locale));
  }
}

export function PlaceChangeCard({ t, locale, compact = false }: PlaceChangeCardProps) {
  const { placeChange, dismissPlaceChange } = useCart();
  if (!placeChange || placeChange.length === 0) return null;

  return (
    <div
      className={[
        'flex flex-col rounded-card border border-sand-300 bg-card',
        compact ? 'gap-2 px-3.5 py-3' : 'gap-2.5 px-5 py-4.5',
      ].join(' ')}
    >
      <span className={['font-serif text-ink', compact ? 'text-card-title-sm' : 'text-h2-sm'].join(' ')}>
        {t.placeChange.title.replace('{n}', String(placeChange.length))}
      </span>

      <ul className="flex flex-col gap-1.5">
        {placeChange.map((change, index) => (
          // Anahtar sırayla kurulur: aynı ürün adı iki kez geçebilir (aynı varyantın iki partisi)
          // ve liste zaten tek seferlik bir anlık görüntü — yeniden sıralanmıyor.
          <li key={`${change.kind}:${index}`} className="font-sans text-note leading-relaxed text-body">
            {lineText(change, t, locale)}
          </li>
        ))}
      </ul>

      <span className="font-sans text-micro leading-relaxed text-muted">{t.placeChange.note}</span>

      <Button size="sm" fullWidth onClick={dismissPlaceChange}>
        {t.placeChange.dismiss}
      </Button>
    </div>
  );
}
