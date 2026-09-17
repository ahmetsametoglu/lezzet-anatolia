'use client';

import type { Locale } from '@lezzet/i18n';
import { formatDeliveryDate } from '@/lib/storefront/format';
import { elsewhereReasonOf } from '@/lib/delivery/place-types';
import type { StockStatus } from '@lezzet/types';
import { useDeliveryPlace } from './place-context';
import { Icon } from '@/components/customer/ui/icons';
import messages from './place-messages.json';

/**
 * Ürün ve paket detayındaki teslimat satırı — **yer biliniyorsa somut, bilinmiyorsa genel** konuşur.
 *
 * Dört hâli vardır:
 *   yer yok           → genel vaatler ("soğuk zincirle gelir · bölge içi teslim · kargoya uygun")
 *   yer var, rota içi → "67000 — en erken 24 Temmuz Perşembe kapınızda"
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
 * **Gün bir VAAT değil BİLGİdir.** Sepette stok ayrılmadığı için (DOMAIN §4) "Perşembe kapınızda" tutulamayacak bir
 * söz olurdu; cümle "en erken" der.
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
  /**
   * Yer bilinmediğinde gösterilecek genel vaatler (sayfanın kendi metinleri).
   *
   * **`coldChain` ÇIKARILDI (16.08):** ifade ürünün künyesine taşındı (stok rozetinin yanı,
   * `ColdChainMark`) ve burada kalması onu iki yerde yazmak olurdu. Üstelik burada YANLIŞ
   * yazılıyordu: kargolanabilir ürün için de basılıyordu ve aynı satırda *"❄ Soğuk zincirle gelir"*
   * ile *"📦 Kargoya uygun"* yan yana duruyordu — sitenin kendi üst şeridi ise tam tersini söylüyor
   * (*"Fransa geneline kargo — soğuk zincir hariç"*).
   */
  fallback: { doorstep: string; shippable: string; notShippable: string };
  /** Kısıt hâlinde gösterilecek çıkışlar — ürün ve pakette farklı (benzer ürün / benzer paket). */
  blockedActions?: React.ReactNode;
  compact?: boolean;
}

export function DeliveryLine({ locale, shippable, status, fallback, blockedActions, compact = false }: DeliveryLineProps) {
  const t = messages[locale];
  const { place, ready, setPanelOpen } = useDeliveryPlace();

  /**
   * "Teslimat yerini değiştir" bağlantısı BAŞLIKTAKİ yer sorusunu açar (masaüstünde panel, mobil
   * webde çekmece): yer TEK yerden sorulur (kullanıcı kararı 14.09) — girişli müşteriye adresleri,
   * ziyaretçiye ülke ve posta kodu. Önce kendi posta kodu penceresini açıyordu ve girişli müşteriye
   * de kod soruyordu; yazılan kod yeri değiştirmiyordu, çünkü girişli müşterinin yeri adresidir.
   *
   * Bağlantı METNİN AKIŞINDA durur, sağ kenara itilmez.
   *
   * Önce `ml-auto` ile sağa yaslanıyordu; şerit sarınca bağlantı tek başına ikinci satıra düşüyor ve
   * orada da sağa yapışıyordu — hangi cümleye ait olduğu belirsiz, boşlukta duran bir bağ (29.07
   * kullanıcı geri bildirimi). Akışta kaldığında sarsa bile söylediği şeyin hemen ardında kalır.
   */
  const change = (
    <button
      type="button"
      onClick={() => setPanelOpen(true)}
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
              <span className="inline-flex items-center gap-1.5">
                <Icon name="truck" size={compact ? 13 : 15} />
                {fallback.doorstep}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Icon name="box" size={compact ? 13 : 15} />
                {fallback.shippable}
              </span>
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Icon name="truck" size={compact ? 13 : 15} />
              {fallback.notShippable}
            </span>
          )}
          <span>{change}</span>
        </div>      </>
    );
  }

  // Stok hâli biliniyorsa iki blok tasarımın §3 diliyle konuşur ve rota tahminini ezer.
  //
  // `elsewhere` YALNIZ ROTA İÇİNDE bu bloğa girer (09.08): rota dışında sebep geçici değil kalıcı
  // ve cümle de öyle olmalı — aşağıdaki kısıt dalı ("{code} adresine gönderemiyoruz") o hâlin
  // zaten var olan doğru dilidir. "Şu an elimizde yok · gelince haber verelim" demek, ürün gelse
  // bile ona gidemeyecek bir müşteriyi beklemeye çağırırdı.
  if (status === 'shipping' || (status === 'elsewhere' && elsewhereReasonOf(place) === 'stock')) {
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
          {/* ── BAŞLIK SATIRI KALKTI (kullanıcı bildirimi 19.08) ──────────────────────────────
              `t.shipMark` bu kutunun başlığıydı ve **aynı metin** ürün detayında stok rozeti olarak
              da basılıyordu (`StockMark` → `band('ship', t.shipMark)`): ekranda kelimesi kelimesine
              iki kez "📦 Kargoyla gönderilir". Kural artık şu — **rozet ADI söyler, kutu bu ADRESE
              dair SONUCU.** Kutu rozetin söylediğini tekrar etmez.

              `compact` hâlde (liste/sepet satırı) rozet YOKTUR, o yüzden başlık orada duruyor:
              tekrar eden şey başlığın kendisi değil, ikisinin yan yana gelmesiydi. */}
          {compact && (
            <span className="inline-flex items-center gap-1.5 font-bold">
              {!away && <Icon name="box" size={13} />}
              {away ? t.awayMark : t.shipMark}
            </span>
          )}
          <span className="leading-relaxed">{(away ? t.awayBody : t.shipBody).replace('{code}', place.postalCode)}</span>
          {blockedActions}
          {/* Yer değiştirme çıkışı YALNIZ engelli hâlde: kargoyla gelen üründe engellenmiş bir şey
              yok, oraya çıkış koymak olmayan bir sorunu varmış gibi gösterirdi. */}
          {away && <span className="font-normal">{change}</span>}
        </div>
        {/* Ayırt edici cümle KUTUNUN DIŞINDA ve soluk: kutunun içinde dururken uyarının kendisiyle
            aynı ağırlıkta okunuyor ve "bölgenizde yok" mesajını uzatıyordu. Burası bir dipnot —
            "tükendi değil" ile "kargo grubu ayrı ödenir" ikisi de okunması iyi ama şart olmayan şeyler. */}
        <span className="font-sans text-micro leading-relaxed text-muted">{away ? t.awayNote : t.shipNote}</span>      </>
    );
  }

  // Kısıt: yer rota dışında VE ürün kargolanamıyor. Tek gerçek çıkmaz bu — amber, kırmızı değil.
  //
  // Stok hâli varsa o daha KESİN konuşur: `elsewhere` zaten "kargoya verilemiyor" demektir, oysa
  // `shippable` ürünün kendi özelliğidir ve stoğa bakmaz. İkisi ayrışırsa stoğa güvenilir.
  const blocked = status === 'elsewhere' ? elsewhereReasonOf(place) === 'out_of_route' : !place.inRoute && !shippable;

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
          /**
           * "67100 — en erken 18 Eylül Cuma kapınızda": kod ve gün tasarımın dilinde, "en erken" ile bir söz değil bilgi
           * (sepette stok ayrılmaz). Yerin adı yazılmaz, başlıktaki yer hapı söylüyor; soğuk zincir ürünün rozetinde.
           */
          <>
            <span className="inline-flex items-center gap-1.5 font-semibold text-olive-dark">
              <Icon name="truck" size={compact ? 13 : 15} />
              {place.postalCode} — {place.nextDate ? t.atDoorBy.replace('{date}', formatDeliveryDate(place.nextDate, locale)) : t.atDoor}
            </span>
            {!shippable && <span>{t.routeOnlyLine}</span>}
            <span>{change}</span>
          </>
        ) : (
          <>
            {/* Kargo dalı METOT değil KAPSAM söyler: müşterinin bu aşamada sorduğu şey "nasıl
                gelecek" değil, "gelebilir mi". Yöntem checkout'ta zaten adresten çıkacak. */}
            <span className="inline-flex items-center gap-1.5 font-semibold text-olive-dark">
              <Icon name="pin" size={compact ? 13 : 15} />
              {place.postalCode}
            </span>
            <span>{t.canShipHere}</span>
            <span>{change}</span>
          </>
        )}
      </div>    </>
  );
}
