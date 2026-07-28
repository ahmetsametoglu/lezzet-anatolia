'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import { useDeliveryPlace } from './place-context';
import { PlaceDialog } from './place-dialog';
import messages from './place-messages.json';

/**
 * K30 · Teslimat Yeri Göstergesi — başlıkta duran kalıcı hap.
 *
 * **Hap YALNIZ YERİ söyler:** posta kodu ve — biliniyorsa — yerin adı. Başka hiçbir metin taşımaz.
 *
 * Önce burada teslimat yöntemi ("kapıya teslim" / "kargo"), sonra kapsam ("her ürün gidebilir")
 * yazıyordu; ikisi de kaldırıldı (28.07 · kullanıcı geri bildirimi). Sebep: başlıkta duran kalıcı
 * bir öğe, her sayfada okunan bir cümleye dönüşüyor ve asıl kararın verildiği yerden — sepetten —
 * dikkati alıyordu. **Neyin nasıl gideceği artık SEPET SATIRINDA, kalem kalem yazılı** (`cart-line`):
 * karar orada veriliyor, bilgi de orada duruyor.
 *
 * Rota içi/dışı ayrımı yalnız RENKTE kalır (yeşil / nötr kum) — metin değil, sessiz bir durum
 * işareti. Yer adı bugün yalnız kendi bölgelerimizde biliniyor; ileride harita servisinden gelirse
 * her kodda görünecek, hap değişmeyecek.
 *
 * Rota DIŞINDA şehir adı yazılmaz (`place-types`): 75011'in "Paris" olduğunu bilmek için bir posta
 * kodu veritabanı gerekirdi, elimizde yok — uydurulmuş bir şehir adı yanlış olduğunda güveni
 * doğrudan zedeler. Rota içinde bölgenin kendi adı yazılır.
 *
 * Hap **yalan söylememelidir**: checkout'ta seçilen adres buradaki yeri tazeler; başlık hiçbir zaman
 * siparişten farklı bir yer göstermez.
 */
interface PlaceChipProps {
  locale: Locale;
  /** Mobil başlıkta yer dar — hap yalnız kodu ve teslimat şeklinin işaretini taşır. */
  compact?: boolean;
}

export function PlaceChip({ locale, compact = false }: PlaceChipProps) {
  const t = messages[locale];
  const { place, ready } = useDeliveryPlace();
  const [open, setOpen] = useState(false);

  // İlk okuma bitene kadar çizilmez: bir an "yerinizi seçin" gösterip sonra koda dönmek, müşteriye
  // kaydettiği bilginin kaybolduğunu düşündürür.
  if (!ready) return null;

  const label = place ? (place.zoneName ? `${place.postalCode} ${place.zoneName}` : place.postalCode) : t.empty;

  const tone = !place
    ? 'border-[1.5px] border-dashed border-sand-400 bg-card text-muted'
    : place.inRoute
      ? 'border border-olive-line bg-olive-bg text-olive-dark'
      : 'border border-sand-300 bg-sand-100 text-body';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={[
          'flex max-w-full cursor-pointer items-center gap-2 rounded-pill font-sans font-bold transition-colors hover:border-olive',
          compact ? 'px-2.5 py-1 text-micro' : 'px-3.5 py-1.5 text-note',
          tone,
        ].join(' ')}
      >
        <span className="truncate">📍 {label}</span>
        {place && !compact && <span className="font-semibold text-olive underline">{t.change}</span>}
      </button>

      {open && <PlaceDialog locale={locale} onClose={() => setOpen(false)} />}
    </>
  );
}
