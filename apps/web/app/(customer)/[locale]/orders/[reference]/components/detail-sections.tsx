'use client';

import { formatDeliveryDate, formatOrderDate, formatPrice } from '@/lib/storefront/format';
import type { CustomerOrderDetailLine } from '@/lib/order/customer-orders';
import type { DetailViewProps } from '../detail-types';

/**
 * Sipariş detayının blokları — masaüstü ve mobil AYNI parçaları kullanır, yalnız dizilişleri
 * farklıdır (masaüstü iki sütun, mobil tek). İçeriği ikiye kopyalasaydık para satırları bir gün
 * iki farklı hesap gösterirdi.
 */
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-[16px] border border-sand-200 bg-card p-5">
      <h2 className="font-serif text-h4 font-semibold leading-tight text-ink">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="font-sans text-note leading-relaxed text-muted">{label}</span>
      <span
        className={[
          'text-right font-sans leading-tight',
          strong ? 'text-body font-bold text-ink' : 'text-body-sm font-semibold text-ink',
        ].join(' ')}
      >
        {value}
      </span>
    </div>
  );
}

/** Teslimat — adres anlık görüntüsü + tür + (rota içiyse) gün. */
export function DeliveryCard({ t, locale, order }: Pick<DetailViewProps, 't' | 'locale' | 'order'>) {
  const address = order.address;
  return (
    <Card title={t.deliveryTitle}>
      <span className="font-sans text-body-sm font-semibold leading-relaxed text-ink">
        {order.deliveryType === 'route' ? t.deliveryRoute : t.deliveryShipping}
      </span>
      {address && (
        <span className="font-sans text-note leading-relaxed text-body">
          {[address.line1, address.line2, [address.postalCode, address.city].filter(Boolean).join(' ')]
            .filter(Boolean)
            .join(', ')}
        </span>
      )}
      {order.deliveryDate && <Row label={t.deliveryDay} value={formatDeliveryDate(order.deliveryDate, locale)} />}
      <Row label={t.orderedOn} value={formatOrderDate(order.createdAt, locale)} />
    </Card>
  );
}

/**
 * Kalemler. **Eksik karşılanan kalem farkı ve paranın nasıl çözüldüğü yazılır** (tasarım brief'i):
 * müşteri hesabın doğruluğundan şüphe etmemeli. Sebep ANLATILMAZ — durum ve para çözümü yeter.
 */
export function ItemsCard({ t, locale, order }: Pick<DetailViewProps, 't' | 'locale' | 'order'>) {
  return (
    <Card title={t.itemsTitle}>
      <div className="flex flex-col divide-y divide-sand-200">
        {order.lines.map((line) => (
          <ItemRow key={line.id} t={t} locale={locale} line={line} online={order.paymentMethod === 'online'} />
        ))}
      </div>
    </Card>
  );
}

function ItemRow({
  t,
  locale,
  line,
  online,
}: {
  t: DetailViewProps['t'];
  locale: DetailViewProps['locale'];
  line: CustomerOrderDetailLine;
  online: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-sans text-body-sm font-bold leading-tight text-ink">{line.name || '—'}</span>
        <span className="font-sans text-micro leading-relaxed text-muted">
          {/* Adet PARANIN dayandığı miktardır: hazırlık onaylanmadan önce sipariş edilen, sonra
              gerçekten gönderilen. Kapı bunu tek yerde karara bağlıyor (`billedQty`). */}
          {[line.unit, t.qty.replace('{qty}', String(line.billedQty)), formatPrice(line.unitPriceCents, locale)]
            .filter(Boolean)
            .join(' · ')}
        </span>
        {/* Paketten gelen kalem işaretlenir — müşteri neyi neden aldığını hatırlasın. */}
        {line.bundleId && <span className="font-sans text-micro font-semibold text-olive">{t.bundleGroup}</span>}
        {/* Eksik karşılama uyarısı ekranın kendi hesabı DEĞİL: "ölçüm var mı" sorusunu kapı
            cevaplıyor. İlk sürümde burada `fulfilledQty < qty` yazıyordu ve henüz hazırlanmamış
            her siparişte uyarı basıyordu. */}
        {line.shortfall && (
          <span className="mt-1 rounded-[10px] bg-honey-bg px-2.5 py-1.5 font-sans text-micro leading-relaxed text-honey">
            {t.shortfall.replace('{ordered}', String(line.qty)).replace('{fulfilled}', String(line.billedQty))} ·{' '}
            {online ? t.shortfallNoteOnline : t.shortfallNoteDoor}
          </span>
        )}
      </div>
      <span className="flex-none font-sans text-body-sm font-bold leading-tight text-ink">
        {formatPrice(line.lineTotalCents, locale)}
      </span>
    </div>
  );
}

/** Tutar özeti + ödeme. İndirim satırı SİPARİŞTEKİ adı taşır (kampanya sonradan değişmiş olabilir). */
export function SummaryCard({ t, locale, order }: Pick<DetailViewProps, 't' | 'locale' | 'order'>) {
  return (
    <Card title={t.summaryTitle}>
      <Row label={t.subtotal} value={formatPrice(order.subtotalCents, locale)} />
      {order.discountCents > 0 && (
        <Row
          label={order.discountLabel ? `${t.discount} — ${order.discountLabel}` : t.discount}
          value={`−${formatPrice(order.discountCents, locale)}`}
        />
      )}
      <Row
        label={t.shipping}
        value={order.shippingFeeCents > 0 ? formatPrice(order.shippingFeeCents, locale) : t.freeShipping}
      />
      <div className="mt-1 border-t border-sand-200 pt-3">
        <Row label={t.total} value={formatPrice(order.totalCents, locale)} strong />
      </div>
      <div className="mt-1 flex flex-col gap-1 border-t border-sand-200 pt-3">
        <Row
          label={t.paymentTitle}
          value={order.paymentMethod ? t.payment[order.paymentMethod] : t.paymentStatus[order.paymentStatus]}
        />
        <span className="text-right font-sans text-micro leading-relaxed text-muted">
          {t.paymentStatus[order.paymentStatus]}
        </span>
      </div>
    </Card>
  );
}

/**
 * "Bir sorun mu var?" — talep akışının girişi.
 *
 * BEKLEYEN(08.6): bağ VERİLMEZ, talep ekranı henüz yok ve ölü link 404'e düşerdi. Blok yerinde
 * durur çünkü tasarımın sözleşmesi bu girişin teslim sonrası da kolay bulunmasını istiyor; düğme
 * neden basılamadığını söyler. Servis tarafı hazır (`lib/ticket/read.ts`), eksik olan ekran.
 */
export function HelpCard({ t }: Pick<DetailViewProps, 't'>) {
  return (
    <Card title={t.helpTitle}>
      <span className="font-sans text-note leading-relaxed text-body">{t.helpBody}</span>
      <span className="font-sans text-note font-bold text-muted">{t.helpSoon}</span>
    </Card>
  );
}
