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
 * işareti.
 *
 * ── ŞEHİR ADI ARTIK HER KODDA YAZILIR (19.8) ─────────────────────────────────
 * Buradaki eski künye "rota dışında şehir adı yazılmaz, çünkü 75011'in Paris olduğunu bilmek için
 * bir posta kodu veritabanı gerekirdi ve elimizde yok" diyordu. **Artık var**: `postal_code_place`
 * (16.878 satır, FR+DE) ve çözüm `placeName`i her hâlde dolduruyor. Uydurma ad yasağı yerinde —
 * ad tablodan geliyor, tahminden değil; kodun birden çok yerleşimi varsa bir üst idari birim
 * yazılıyor, rastgele bir köy değil.
 *
 * **Yazılan ad BÖLGEMİZİN adı değil, YERİN adı** (`placeName`, `zoneName` değil): müşterinin zihninde
 * "Strasbourg" var, "Strasbourg Merkez" bizim rota bölgemizin iç adı. Rota içi olup olmadığını zaten
 * hapın rengi söylüyor.
 *
 * **Ülke eki bugün YOK ve bilinçli:** tek ülkeye hizmet verirken "Strasbourg · FR" gürültüdür — ülke
 * seçicisinde verilen kararın aynısı (`design/BACKLOG §3`): ülke bir alan değil, ancak GERÇEKTEN
 * belirsizken görünen bir bilgidir. Hizmet verilen ülke kümesi birden çoğa çıktığında ek de belirir;
 * o türetme belirsizlik seçicisiyle aynı veriye dayanıyor ve onunla birlikte gelecek.
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

  // `placeName` → `zoneName` → yalnız kod. İkinci basamak bir emniyet ağı: referansta olmayan ama
  // kendi bölgemizde duran bir kodda (bkz. `19.16`) hap yine bir ad gösterebilsin.
  const placeLabel = place?.placeName ?? place?.zoneName ?? null;
  const label = place ? (placeLabel ? `${place.postalCode} ${placeLabel}` : place.postalCode) : t.empty;

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
