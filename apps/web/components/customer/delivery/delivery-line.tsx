'use client';

import type { Locale } from '@lezzet/i18n';
import { formatDeliveryDate } from '@/lib/storefront/format';
import { elsewhereReasonOf } from '@/lib/delivery/place-types';
import type { StockStatus } from '@lezzet/types';
import { useDeliveryPlace } from './place-context';
import { Icon } from '@/components/customer/ui/icons';
import messages from './place-messages.json';

/**
 * Ürün ve paket detayındaki teslimat satırı: yer biliniyorsa somut, bilinmiyorsa genel konuşur; stok hâli verilirse rota tahmininin
 * yerine geçer, çünkü stoğun kendisine bakar. Gün bir söz değil bilgidir ("en erken"), çünkü sepette stok ayrılmaz; istemcide hesaplanır
 * ki kesim saati geçince önbellekteki sayfa yanlış gün göstermesin.
 */
interface DeliveryLineProps {
  locale: Locale;
  /** Ürün/paket kargoya verilebiliyor mu — `Product.shippable` ya da paketin `!inRouteOnly` hâli. */
  shippable: boolean;
  /**
   * Seçili varyantın yere göre stok hâli; verilirse `shipping`/`elsewhere` blokları rota tahmininin yerine geçer. `out_of_stock` burada
   * blok basmaz: tükendi yere bağlı değildir, onu sayfanın kendi rozeti söyler.
   */
  status?: StockStatus;
  /** Yer bilinmediğinde gösterilecek genel vaatler (sayfanın kendi metinleri); soğuk zincir ifadesi burada değil ürünün rozetindedir. */
  fallback: { doorstep: string; shippable: string; notShippable: string };
  /** Kısıt hâlinde gösterilecek çıkışlar — ürün ve pakette farklı (benzer ürün / benzer paket). */
  blockedActions?: React.ReactNode;
  compact?: boolean;
  /**
   * Kutu biçimi — masaüstü ürün detayının karar rafı: renkli kutu, kalın başlık satırı ("Kapıya gelir · 67100") ve altında tek cümle.
   * Aynı hâlleri aynı ölçütlerle çizer, yalnız görünüm değişir; bileşen kopyalanmadı, çünkü kopyalanan şey karar olurdu.
   */
  box?: boolean;
}

export function DeliveryLine({ locale, shippable, status, fallback, blockedActions, compact = false, box = false }: DeliveryLineProps) {
  const t = messages[locale];
  const { place, ready, setPanelOpen } = useDeliveryPlace();

  /**
   * "Teslimat yerini değiştir" başlıktaki yer sorusunu açar, çünkü yer tek yerden sorulur: girişli müşteriye adresleri, ziyaretçiye ülke
   * ve posta kodu. Bağlantı metnin akışında durur ki sarsa bile ait olduğu cümlenin hemen ardında kalsın.
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

  // Satır biçiminin ortak kutusu (`box` prop'u ayrı bir biçimdir, bu onun sınıf listesi değil).
  const rowBox = ['flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-soft font-sans text-body', compact ? 'px-3.5 py-2.5 text-micro' : 'px-4.5 py-3.5 text-note'];

  // Yer sorulmamış (ya da henüz okunmadı): tasarımın özgün genel vaatleri. Kısıt "muhtemel"
  // tonundadır — kime gönderileceğini bilmeden "gönderemiyoruz" demek yanlış olurdu.
  if (!ready || !place) {
    return (
      <>
        <div className={[...rowBox, 'bg-sand-100'].join(' ')}>
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

  /**
   * Kutu biçimi — hâller yukarıdakiyle AYNI ölçütlerden çıkar, yalnız başlık + cümle olarak yazılır.
   * Cümlelerin kendi biçimi var (büyük harfle başlar, noktayla biter): satır biçiminde bunlar bir
   * cümlenin parçasıydı ("67100 — en erken 22 Eylül kapınızda"), burada kendi başına duruyorlar.
   */
  if (box && ready && place) {
    const shipping = status === 'shipping';
    const awayStock = status === 'elsewhere' && elsewhereReasonOf(place) === 'stock';
    const blockedHere = status === 'elsewhere' ? elsewhereReasonOf(place) === 'out_of_route' : !place.inRoute && !shippable;
    const door = !shipping && !awayStock && !blockedHere && place.inRoute;

    const tone = awayStock || blockedHere ? 'border-honey-line bg-honey-bg' : door ? 'border-olive-line bg-olive-bg' : 'border-sand-300 bg-sand-100';
    const dot = awayStock || blockedHere ? 'bg-terracotta' : door ? 'bg-olive' : 'bg-muted';
    const markTone = awayStock || blockedHere ? 'text-honey' : door ? 'text-olive-dark' : 'text-body';

    const mark = shipping ? t.shipMark : awayStock ? t.awayMark : blockedHere ? t.lineBlocked : door ? t.doorMark : t.lineShipping;
    const body = shipping
      ? t.shipBody.replace('{code}', place.postalCode)
      : awayStock
        ? t.awayBody.replace('{code}', place.postalCode)
        : blockedHere
          ? t.blockedHere.replace('{code}', place.postalCode)
          : door
            ? place.nextDate
              ? t.doorBody.replace('{date}', formatDeliveryDate(place.nextDate, locale))
              : t.doorBodyPlain
            : t.canShipHere;

    return (
      <div className={`flex items-start gap-2.5 rounded-soft border px-4 py-3 ${tone}`}>
        <span aria-hidden className={`mt-1.75 size-2 flex-none rounded-full ${dot}`} />
        <span className="flex flex-col gap-1">
          <span className="flex flex-wrap items-baseline gap-2.5">
            <span className={`font-sans text-control ${markTone}`}>
              {mark} · {place.postalCode}
            </span>
            <span className="font-sans text-field-label">{change}</span>
          </span>
          <span className="font-sans text-field-label font-normal leading-relaxed text-body">
            {body}
            {/* Kargolanamayan ürünün kısıtı rota İÇİNDE de söylenir: müşteri bu adrese aldırabiliyor
                ama başka bir adrese gönderemez ve bunu sepete atmadan bilmeli. */}
            {door && !shippable && ` ${t.routeOnlyLine}.`}
          </span>
          {/* Çıkışlar YALNIZ engelli hâllerde: rota içindeki üründe çözülecek bir şey yok, oraya
              "kargolanabilir benzerleri gör" koymak olmayan bir sorunu varmış gibi gösterirdi. */}
          {(awayStock || blockedHere) && blockedActions}
        </span>
      </div>
    );
  }

  // Stok hâli biliniyorsa iki blok tasarımın §3 diliyle konuşur ve rota tahminini ezer. `elsewhere` yalnız rota içinde bu bloğa girer:
  // rota dışında sebep kalıcıdır ve "gelince haber verelim" demek, ürün gelse bile ona gidemeyecek müşteriyi beklemeye çağırırdı.
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
          {/* Kutu rozetin söylediğini tekrar etmez: rozet adı söyler, kutu bu adrese dair sonucu. Liste ve sepet satırında (`compact`)
              rozet olmadığı için başlık orada durur. */}
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
        {/* Ayırt edici cümle kutunun dışında ve soluk durur, çünkü içeride uyarıyla aynı ağırlıkta okunup mesajı uzatır; bu bir dipnottur. */}
        <span className="font-sans text-micro leading-relaxed text-muted">{away ? t.awayNote : t.shipNote}</span>      </>
    );
  }

  // Kısıt: yer rota dışında ve ürün kargolanamıyor — tek gerçek çıkmaz, amber, kırmızı değil. Stok hâli varsa ona güvenilir, çünkü
  // `elsewhere` stoğa bakar, `shippable` ise yalnız ürünün özelliğidir.
  const blocked = status === 'elsewhere' ? elsewhereReasonOf(place) === 'out_of_route' : !place.inRoute && !shippable;

  return (
    <>
      <div
        className={[
          ...rowBox,
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
