'use client';

import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import ordersMessages from '@lezzet/i18n/customer/orders';
import { CirclePhoto } from '@/components/customer/phone-kit/circle-photo';
import { DashedInvite } from '@/components/customer/phone-kit/dashed-invite';
import { PhoneDeliveryMap } from './components/phone-delivery-map';
import { Note } from '@/components/customer/phone-kit/note';
import { PrimaryButton } from '@/components/customer/phone-kit/primary-button';
import { PhoneOrderTimeline } from './components/phone-order-timeline';
import { SummaryPanel, type SummaryRow } from '@/components/customer/phone-kit/summary-panel';
import { TextAction } from '@/components/customer/phone-kit/text-action';
import { addressLine } from '@lezzet/address';
import type { CustomerOrderDetailLine } from '@/lib/order/customer-orders';
import { formatDeliveryDate, formatPrice } from '@/lib/storefront/format';
import { carrierLabel, formatStamp, paymentKeyOf } from './components/detail-sections';
import { PhoneReorderButton } from './components/phone-reorder-button';
import type { DetailViewProps } from './detail-types';

type OrdersCopy = LocalizedCopy<typeof ordersMessages>;

/**
 * Sipariş detayının telefon görünümü, native sipariş detayının ikizi; tekrar sipariş ve eksik karşılamanın iade notu web'e
 * özgü. Gel-al siparişinde teslim türü yazılmaz, çünkü iki sözlükte de karşılığı yok ve "kargoyla" demek yanlış olur.
 */
export function DetailMobile({ t, locale, order, feedbackInvite }: DetailViewProps) {
  const copy = ordersMessages[locale];
  const d = copy.detail;

  // Teslim türü + (varsa) gün. Gün yoksa tür yalnız başına: kargoda teslim günü taşıyıcının işidir (native'in kararı).
  const kind =
    order.deliveryType === 'route' ? d.deliveryRoute : order.deliveryType === 'shipping' ? d.deliveryShipping : order.pickup ? d.deliveryPickup : null;
  const delivery = [kind, order.deliveryDate === null ? null : formatDeliveryDate(order.deliveryDate, locale)].filter(Boolean).join(' — ');
  // Gel-al'da adres satırı DEPONUN adresidir (müşteri oraya gider) ve yanına randevu numarası yazılır; fatura adresi çizilmez.
  const address = order.pickup
    ? `${order.pickup.warehouseName}, ${order.pickup.addressLine} · ${d.pickupPhone.replace('{phone}', order.pickup.phoneDisplay)}`
    : order.address === null
      ? ''
      : addressLine(order.address);
  const carrier = order.shipment === null ? '' : carrierLabel(t, order.shipment.carrierName);

  // Para satırları toplamı açıkladığı için önce gelir ve sıfır indirim indirim olmadığı için çizilmez. Koli sırası yalnız birden
  // çok kolide yazılır.
  const rows: SummaryRow[] = [
    { key: 'subtotal', label: d.subtotal, value: formatPrice(order.subtotalCents, locale) },
    ...(order.discountCents > 0
      ? [
          {
            key: 'discount',
            label: order.discountLabel ? `${d.discount} — ${order.discountLabel}` : d.discount,
            value: `−${formatPrice(order.discountCents, locale)}`,
            tone: 'olive' as const,
          },
        ]
      : []),
    { key: 'shipping', label: d.shipping, value: order.shippingFeeCents > 0 ? formatPrice(order.shippingFeeCents, locale) : d.shippingFree },
    ...(delivery === '' ? [] : [{ key: 'delivery', label: d.delivery, value: delivery }]),
    ...(address === '' ? [] : [{ key: 'address', label: d.address, value: address }]),
    { key: 'payment', label: d.payment, value: d.pay[paymentKeyOf(order)] },
    ...(carrier === '' ? [] : [{ key: 'carrier', label: d.carrierLabel, value: carrier }]),
    ...(order.shipment?.parcels ?? []).map((parcel) => ({
      key: `tracking-${parcel.trackingNumber}`,
      label: parcel.ordinal === null ? d.trackingNumber : `${d.trackingNumber} ${parcel.ordinal}`,
      value: parcel.trackingNumber,
    })),
  ];

  // Eksik karşılamanın para çözümü — yalnız çevrim içi ödenmişte iade söz konusu (kapıda ödemede fark hiç tahsil edilmez).
  const shortfallTotal = order.lines.reduce((sum, line) => sum + line.shortfallCents, 0);
  const refundNote =
    shortfallTotal > 0 && order.paymentMethod === 'online' ? t.refundNote.replace('{amount}', formatPrice(shortfallTotal, locale)) : undefined;

  // Adresi olan her koli bir takip bağı açar; adresi olmayanın numarası özette yine yazılı.
  const trackable = (order.shipment?.parcels ?? []).filter(
    (parcel): parcel is typeof parcel & { trackingUrl: string } => parcel.trackingUrl !== null,
  );

  return (
    <div className="flex flex-col gap-4 px-4.5 pt-4.5 pb-7.5">
      {/* Harita YALNIZ kurye yoldayken: durmuş bir siparişin üstünde hareketli bir takip görüntüsü, olmayan bir şeyi
          oluyormuş gibi gösterirdi. */}
      {order.status === 'on_the_way' && <PhoneDeliveryMap trackingLabel={d.tracking} liveLabel={d.trackingLive} />}

      {/* Çizgi mi tek blok mu — kararı MOTOR veriyor (`timeline === null` ⇒ iptal/iade). */}
      {order.timeline === null ? (
        <Note tone={order.status === 'cancelled' ? 'error' : 'terracotta'} description={order.status === 'cancelled' ? d.cancelled : d.returning} />
      ) : (
        <PhoneOrderTimeline steps={order.timeline} labels={d.milestone} notes={d.note} formatAt={(iso) => formatStamp(iso, locale)} />
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-sans text-eyebrow-xs text-terracotta uppercase">{d.itemsEyebrow}</h2>
        <ul className="flex flex-col">
          {order.lines.map((line) => (
            <ItemRow key={line.id} copy={copy} locale={locale} line={line} />
          ))}
        </ul>
      </section>

      <SummaryPanel rows={rows} totalLabel={d.total} totalValue={formatPrice(order.totalCents, locale)} totalTone="terracotta" note={refundNote} />

      <PhoneReorderButton locale={locale} orderId={order.id} />

      {/* Yorum daveti YALNIZ açık davet varken (`readOrderFeedbackInvite` üç hâlde de `null`); puan sunucudan. */}
      {feedbackInvite && (
        <DashedInvite
          tone="olive"
          title={d.feedback.title}
          description={d.feedback.body.replace('{points}', String(feedbackInvite.completionPoints))}
          action={
            <PrimaryButton
              shape="pill"
              label={d.feedback.cta}
              href={{ pathname: '/feedback/[token]', params: { token: feedbackInvite.token } }}
            />
          }
        />
      )}

      {trackable.map((parcel) => (
        <div key={parcel.trackingNumber} className="flex justify-center">
          <TextAction
            externalHref={parcel.trackingUrl}
            label={parcel.ordinal === null ? d.trackingCta : d.trackingCtaBox.replace('{ordinal}', parcel.ordinal)}
          />
        </div>
      ))}

      <div className="flex justify-center">
        <TextAction tone="terracotta" label={d.support} href={{ pathname: '/support/new', query: { order: order.id } }} />
      </div>
    </div>
  );
}

interface ItemRowProps {
  copy: OrdersCopy;
  locale: Locale;
  line: CustomerOrderDetailLine;
}

/**
 * Kalem satırı (native `itemRow`) — 46'lık küçük resim · "2× ad" · ikinci ses (paket içeriği ya da boy + eksik) · tutar.
 * Eksik varsa tutar sütunu iki sayı: üstte sipariş edilenin tutarı ÜSTÜ ÇİZİLİ, altında ödenecek — para çözümü cümleye
 * gerek kalmadan okunur; sipariş edilenin tutarı sözleşmeden türer (`lineTotalCents + shortfallCents`).
 */
function ItemRow({ copy, locale, line }: ItemRowProps) {
  const d = copy.detail;
  return (
    <li className="flex items-center gap-3 border-b-[1.5px] border-dashed border-sand-400 py-2.5">
      <CirclePhoto image={line.image} initial={line.name.slice(0, 1)} size={46} initialClassName="text-card-title-sm text-muted" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-sans text-note font-bold text-ink">{d.line.replace('{quantity}', String(line.qty)).replace('{name}', line.name)}</span>
        {line.bundle ? (
          <span className="font-sans text-body-sm leading-[1.6] text-muted">
            {[d.bundlePill.replace('{count}', String(line.bundle.itemCount)), ...line.bundle.contents].join(' · ')}
          </span>
        ) : line.unit.length > 0 || line.shortfall ? (
          <span className="font-sans text-body-sm leading-[1.6] text-muted">
            {line.unit}
            {/* Eksik ayrı kutu değil, gramajın yanında: satır düzeyindeki bilgi satırın ikinci sesidir. */}
            {line.shortfall && (
              <span className="font-bold text-honey">
                {`${line.unit.length === 0 ? '' : ' · '}${d.shortfallLine.replace('{missing}', String(line.qty - line.billedQty))}`}
              </span>
            )}
          </span>
        ) : null}
      </div>
      {line.shortfall ? (
        <span className="flex flex-none flex-col items-end gap-0.5">
          <span className="font-sans text-micro text-muted line-through">{formatPrice(line.lineTotalCents + line.shortfallCents, locale)}</span>
          <span className="font-sans text-note font-bold text-ink">{formatPrice(line.lineTotalCents, locale)}</span>
        </span>
      ) : (
        <span className="flex-none font-sans text-note font-bold text-ink">{formatPrice(line.lineTotalCents, locale)}</span>
      )}
    </li>
  );
}
