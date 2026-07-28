'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import { formatDeliveryDate } from '@/lib/storefront/format';
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
  /** Yer bilinmediğinde gösterilecek genel vaatler (sayfanın kendi metinleri). */
  fallback: { coldChain: string; doorstep: string; shippable: string; notShippable: string };
  /** Kısıt hâlinde gösterilecek çıkışlar — ürün ve pakette farklı (benzer ürün / benzer paket). */
  blockedActions?: React.ReactNode;
  compact?: boolean;
}

export function DeliveryLine({ locale, shippable, fallback, blockedActions, compact = false }: DeliveryLineProps) {
  const t = messages[locale];
  const { place, ready } = useDeliveryPlace();
  const [open, setOpen] = useState(false);

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
          <span className="ml-auto">{change}</span>
        </div>
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
            <span className="ml-auto">{change}</span>
          </>
        ) : (
          <>
            {/* Kargo dalı METOT değil KAPSAM söyler: müşterinin bu aşamada sorduğu şey "nasıl
                gelecek" değil, "gelebilir mi". Yöntem checkout'ta zaten adresten çıkacak. */}
            <span className="font-semibold text-olive-dark">📍 {place.postalCode}</span>
            <span>{t.canShipHere}</span>
            <span className="ml-auto">{change}</span>
          </>
        )}
      </div>
      {open && <PlaceDialog locale={locale} onClose={() => setOpen(false)} />}
    </>
  );
}
