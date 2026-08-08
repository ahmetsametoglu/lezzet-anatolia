'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import { formatDeliveryDate } from '@/lib/storefront/format';
import type { StockStatus } from '@lezzet/types';
import { useDeliveryPlace } from './place-context';
import { PlaceDialog } from './place-dialog';
import messages from './place-messages.json';

/**
 * Ürün ve paket detayındaki teslimat satırı — **yer biliniyorsa somut, bilinmiyorsa genel** konuşur.
 *
 * Dört hâli vardır:
 *   yer yok           → genel vaatler ("soğuk zincirle gelir · bölge içi teslim · kargoya uygun")
 *   yer var, rota içi → "67000 Strasbourg — en yakın teslimat: Perşembe, 24 Temmuz"
 *   yer var, rota dışı, ürün gidebiliyor → "Bu ürünü buraya gönderebiliriz"
 *   yer var, rota dışı, ürün gidemiyor   → kısıt uyarısı (amber) + çıkışlar
 *
 * ── STOK HÂLİ VERİLİRSE O KAZANIR (19.7) ─────────────────────────────────────
 * Yukarıdaki dört hâl yalnız ROTAYA bakar ve "bu ürün senin deponda var mı" sorusunu soramaz —
 * çok depodan önce sorulacak bir soru değildi. `status` geçilirse (`stockStatus`, 19.10) blok
 * tasarımın §3 diliyle konuşur: **kargoyla gönderilir** (kum kutu) ya da **bölgenizde şu an yok**
 * (amber kutu + "gelince haber ver"). İkisi de rota+kargolanabilirlik tahmininden DAHA KESİNDİR:
 * stoğun kendisine bakarlar.
 *
 * `status` isteğe bağlı çünkü PAKET detayında yoktur — paketin stok hâli kalemlerinden doğar ve o
 * indirgeme (`inRouteOnly`) bugün yalnız "hepsi rota içi mi" sorusunu cevaplıyor. Paket geçmediği
 * sürece eski rota tahmini yürürlükte kalır; iki yol aynı cümleyi iki kez KURMAZ — biri ötekinin
 * yerine geçer.
 *
 * **Cümleler METOT değil KAPSAM söyler.** Bu aşamada müşterinin sorusu "nasıl gelecek" değil,
 * "gelebilir mi": teslimat yöntemi checkout'ta gerçek adresten zaten çıkacak, burada söylenmesi
 * hem erken hem de verilmemiş bir karar gibi okunuyor (28.07 · kullanıcı geri bildirimi).
 *
 * **Gün bir VAAT değil BİLGİdir.** Tasarımın taslağı "Perşembe kapınızda" diyordu; sepette stok
 * ayrılmadığı için (DOMAIN §4) o cümle tutulamayacak bir söz veriyordu. "En yakın teslimat"
 * dendiğinde aynı bilgi veriliyor ama bir rezervasyon ima edilmiyor.
 *
 * Gün SUNUCUDA sayfaya gömülmez, buradan (istemciden) gelir: kesim saati 16:00'da geçtiğinde "en
 * yakın gün" kayar ve önbelleklenmiş bir sayfa saatlerce yanlış tarihi gösterirdi.
 */
interface DeliveryLineProps {
  locale: Locale;
  /** Ürün/paket kargoya verilebiliyor mu — `Product.shippable` ya da paketin `!inRouteOnly` hâli. */
  shippable: boolean;
  /**
   * Seçili varyantın yere göre stok hâli (19.10). Verilirse `shipping`/`elsewhere` blokları rota
   * tahminin YERİNE geçer. `out_of_stock` burada hiçbir blok basmaz: tükendi yere bağlı değildir,
   * onu sayfanın kendi rozeti ve pasif düğmesi söyler — yer kutusunda tekrarlamak, evrensel bir
   * hâli yerel bir sorun gibi okuturdu.
   */
  status?: StockStatus;
  /** Yer bilinmediğinde gösterilecek genel vaatler (sayfanın kendi metinleri). */
  fallback: { coldChain: string; doorstep: string; shippable: string; notShippable: string };
  /** Kısıt hâlinde gösterilecek çıkışlar — ürün ve pakette farklı (benzer ürün / benzer paket). */
  blockedActions?: React.ReactNode;
  compact?: boolean;
}

export function DeliveryLine({ locale, shippable, status, fallback, blockedActions, compact = false }: DeliveryLineProps) {
  const t = messages[locale];
  const { place, ready } = useDeliveryPlace();
  const [open, setOpen] = useState(false);

  /**
   * "Teslimat yerini değiştir" bağlantısı METNİN AKIŞINDA durur, sağ kenara itilmez.
   *
   * Önce `ml-auto` ile sağa yaslanıyordu; şerit sarınca bağlantı tek başına ikinci satıra düşüyor ve
   * orada da sağa yapışıyordu — hangi cümleye ait olduğu belirsiz, boşlukta duran bir bağ (29.07
   * kullanıcı geri bildirimi). Akışta kaldığında sarsa bile söylediği şeyin hemen ardında kalır.
   */
  const change = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="cursor-pointer font-sans font-semibold text-olive underline hover:text-olive-dark"
    >
      {place ? t.changePlace : t.setPlace}
    </button>
  );

  const box = ['flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-soft font-sans text-body', compact ? 'px-3.5 py-2.5 text-micro' : 'px-4.5 py-3.5 text-note'];

  // Yer sorulmamış (ya da henüz okunmadı): tasarımın özgün genel vaatleri. Kısıt "muhtemel"
  // tonundadır — kime gönderileceğini bilmeden "gönderemiyoruz" demek yanlış olurdu.
  if (!ready || !place) {
    return (
      <>
        <div className={[...box, 'bg-sand-100'].join(' ')}>
          {shippable ? (
            <>
              <span>{fallback.coldChain}</span>
              <span>{fallback.doorstep}</span>
              <span>{fallback.shippable}</span>
            </>
          ) : (
            <span>{fallback.notShippable}</span>
          )}
          <span>{change}</span>
        </div>
        {open && <PlaceDialog locale={locale} onClose={() => setOpen(false)} />}
      </>
    );
  }

  // Stok hâli biliniyorsa iki blok tasarımın §3 diliyle konuşur ve rota tahminini ezer.
  if (status === 'shipping' || status === 'elsewhere') {
    const away = status === 'elsewhere';
    return (
      <>
        <div
          className={[
            'flex flex-col gap-1.5 rounded-soft font-sans',
            compact ? 'px-3.5 py-2.5 text-micro' : 'px-4.5 py-3.5 text-note',
            away ? 'border border-honey-line bg-honey-bg text-honey' : 'border border-sand-300 bg-sand-100 text-body',
          ].join(' ')}
        >
          <span className="font-bold">{away ? t.awayMark : t.shipMark}</span>
          <span className="leading-relaxed">{(away ? t.awayBody : t.shipBody).replace('{code}', place.postalCode)}</span>
          {blockedActions}
          {/* Yer değiştirme çıkışı YALNIZ engelli hâlde: kargoyla gelen üründe engellenmiş bir şey
              yok, oraya çıkış koymak olmayan bir sorunu varmış gibi gösterirdi. */}
          {away && <span className="font-normal">{change}</span>}
        </div>
        {/* Ayırt edici cümle KUTUNUN DIŞINDA ve soluk: kutunun içinde dururken uyarının kendisiyle
            aynı ağırlıkta okunuyor ve "bölgenizde yok" mesajını uzatıyordu. Burası bir dipnot —
            "tükendi değil" ile "kargo grubu ayrı ödenir" ikisi de okunması iyi ama şart olmayan şeyler. */}
        <span className="font-sans text-micro leading-relaxed text-muted">{away ? t.awayNote : t.shipNote}</span>
        {open && <PlaceDialog locale={locale} onClose={() => setOpen(false)} />}
      </>
    );
  }

  // Kısıt: yer rota dışında VE ürün kargolanamıyor. Tek gerçek çıkmaz bu — amber, kırmızı değil.
  const blocked = !place.inRoute && !shippable;

  return (
    <>
      <div
        className={[
          ...box,
          blocked ? 'flex-col !items-start border border-honey-line bg-honey-bg font-semibold text-honey' : 'bg-sand-100',
        ].join(' ')}
      >
        {blocked ? (
          <>
            <span className="leading-relaxed">{t.blockedHere.replace('{code}', place.postalCode)}</span>
            {blockedActions}
            <span className="font-normal">{change}</span>
          </>
        ) : place.inRoute ? (
          <>
            <span className="font-semibold text-olive-dark">
              📍 {place.zoneName ? `${place.postalCode} ${place.zoneName}` : place.postalCode}
              {place.nextDate && ` — ${t.nextDate.replace('{date}', formatDeliveryDate(place.nextDate, locale))}`}
            </span>
            <span>{fallback.coldChain}</span>
            <span>{change}</span>
          </>
        ) : (
          <>
            {/* Kargo dalı METOT değil KAPSAM söyler: müşterinin bu aşamada sorduğu şey "nasıl
                gelecek" değil, "gelebilir mi". Yöntem checkout'ta zaten adresten çıkacak. */}
            <span className="font-semibold text-olive-dark">📍 {place.postalCode}</span>
            <span>{t.canShipHere}</span>
            <span>{change}</span>
          </>
        )}
      </div>
      {open && <PlaceDialog locale={locale} onClose={() => setOpen(false)} />}
    </>
  );
}
