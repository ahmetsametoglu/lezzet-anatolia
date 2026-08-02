'use client';

import type { OrderTimelineStep } from '@lezzet/domain-core';
import { formatDeliveryDate, formatOrderDate, formatPrice, formatShortDate, formatTime } from '@/lib/storefront/format';
import { buttonClass } from '@/components/customer/ui/button';
import { Link } from '@/i18n/navigation';
import type { CustomerOrderDetail, CustomerOrderDetailLine } from '@/lib/order/customer-orders';
import type { DetailViewProps } from '../detail-types';

/**
 * Sipariş detayının blokları (tasarım: `Musteri - Siparis Detay.dc.html`).
 *
 * Masaüstü ve mobil AYNI parçaları kullanır ama **aynı düzeni kullanmaz**: tasarımda mobil, dar
 * masaüstü değil — üstte zeytin zeminli durum kartı, yatay mini çizgi, toplam kalemler kartının
 * içinde. Bu yüzden parça bazında ortak, diziliş bazında ayrı.
 */

/** Beyaz kart — tasarımın standart bloğu (1px sand kenar, 18px köşe). */
function Panel({ title, children, className = '' }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={['flex flex-col rounded-[18px] border border-sand-200 bg-card px-6 py-5', className].join(' ')}>
      {/* Kart başlığı tasarımda 18px Lora 600 → `text-lead` (18px). Ağırlık ve satır yüksekliği
          jetonun içinde; ayrıca yazmak jetonu ezer. */}
      {title && <h2 className="mb-2.5 font-serif text-lead font-semibold leading-tight text-ink">{title}</h2>}
      {children}
    </section>
  );
}

/* ————————————————————————————— Zaman çizgisi ————————————————————————————— */

/**
 * Dört sabit adım, dikey çizgiyle (tasarım). Halka üç hâlli: geçilmiş ✓ dolu, şu an ● dolu ve
 * etiketi zeytin, bekleyen boş halka + soluk etiket.
 *
 * **Saat yalnız kaydı olan adımda yazılır** — motor `at: null` döndürdüğünde ekran boş bırakır.
 * Geçilmiş sayılan ama damgası olmayan adım olabilir (atlanan geçiş); orada tarih uydurmak, kaydı
 * olmayan bir olaya saat yazmak olurdu.
 */
export function TimelineCard({ t, locale, order }: Pick<DetailViewProps, 't' | 'locale' | 'order'>) {
  if (!order.timeline) return <ClosedStateCard t={t} order={order} />;

  return (
    <Panel>
      {order.timeline.map((step, i) => (
        <div key={step.milestone} className="flex items-start gap-3.5">
          <div className="flex flex-none flex-col items-center">
            <Bead state={step.state} />
            {/* Son adımdan sonra bağlantı çizilmez; çizgi adımları BAĞLAR, kuyruk bırakmaz. */}
            {i < order.timeline!.length - 1 && (
              /* Rengi SONRAKİ adım belirler: "Yolda" geçilmiş olsa da ondan sonrası henüz
                 yaşanmadıysa çizgi kum rengidir (tasarım). Kendi hâline bakmak, gelecekteki bir
                 adıma giden yolu yaşanmış gibi boyardı. */
              <span
                className={[
                  'h-7 w-0.5',
                  order.timeline![i + 1]?.state === 'pending' ? 'bg-sand-300' : 'bg-olive',
                ].join(' ')}
              />
            )}
          </div>
          <div className="flex flex-col pb-1">
            <span
              className={[
                'font-sans text-body-sm font-bold leading-tight',
                step.state === 'current' ? 'text-olive' : step.state === 'pending' ? 'text-sand-600' : 'text-ink',
              ].join(' ')}
            >
              {t.milestone[step.milestone]}
            </span>
            {step.at && (
              <span className="font-sans text-note leading-relaxed text-muted">{formatStamp(step.at, locale)}</span>
            )}
          </div>
        </div>
      ))}
    </Panel>
  );
}

function Bead({ state }: { state: OrderTimelineStep['state'] }) {
  if (state === 'pending') return <span className="size-[22px] flex-none rounded-full border-2 border-sand-300" />;
  return (
    <span className="grid size-[22px] flex-none place-items-center rounded-full bg-olive font-sans text-micro font-bold text-card">
      {state === 'done' ? '✓' : '●'}
    </span>
  );
}

/**
 * İptal/iade — tasarım burada çizgi YERİNE tek durum bloğu istiyor ("iptal/iade durumunda çizgi
 * yerine tek durum bloğu gösterilir"). Doğru karar: iptal bir yolculuk adımı değil, yolculuğun
 * sonlanması; dört adımlı çizgide onu göstermenin yeri yok.
 */
function ClosedStateCard({ t, order }: Pick<DetailViewProps, 't' | 'order'>) {
  const cancelled = order.status === 'cancelled';
  return (
    <section
      className={[
        'rounded-[18px] border px-6 py-5',
        cancelled ? 'border-terracotta-line bg-terracotta-bg' : 'border-honey-line bg-honey-bg',
      ].join(' ')}
    >
      <span
        className={['font-serif text-lead font-semibold leading-tight', cancelled ? 'text-terracotta-bright' : 'text-honey'].join(' ')}
      >
        {cancelled ? t.cancelledTitle : t.returningTitle}
      </span>
    </section>
  );
}

/**
 * Kısa damga — "22 Tem, 09:14" (tasarım). Gün+kısa ay + saat; yıl yok, çizgi tek siparişin içinde.
 *
 * Parçalar ORTAK biçimlendiriciden gelir (denetim bulgusu M5, 02.08): burada `Intl` iki kez elle
 * kuruluyordu ve yanında `INTL_LOCALE`in birebir kopyası olan yerel bir harita duruyordu. Kopya
 * bugün aynı değeri üretiyordu, ama biçim kararı (ör. `fr-FR` yerine `fr-BE`) tek yerde
 * değiştirilebilmeli — iki harita, birinin öğrenip ötekinin öğrenmediği bir karar demek.
 */
function formatStamp(iso: string, locale: DetailViewProps['locale']): string {
  return `${formatShortDate(iso, locale)}, ${formatTime(iso, locale)}`;
}

/* ————————————————————————————— Kalemler ————————————————————————————— */

/**
 * Kalemler. Satır biçimi tasarımın kendisi: solda ad (+ boy), sağda **`2 × 16,90 € = 33,80 €`** —
 * yani hesabın kendisi görünür. Müşteri "neden bu tutar" sorusunu satırın içinde cevaplıyor.
 */
export function ItemsCard({ t, locale, order, title }: Pick<DetailViewProps, 't' | 'locale' | 'order'> & { title: string }) {
  return (
    <Panel title={title}>
      <div className="flex flex-col">
        {order.lines.map((line) => (
          <ItemRow key={line.id} t={t} locale={locale} line={line} order={order} />
        ))}
      </div>
    </Panel>
  );
}

function ItemRow({
  t,
  locale,
  line,
  order,
}: {
  t: DetailViewProps['t'];
  locale: DetailViewProps['locale'];
  line: CustomerOrderDetailLine;
  order: CustomerOrderDetail;
}) {
  return (
    <div className="flex flex-col gap-1.5 border-b border-sand-100 py-2.5 last:border-0 last:pb-0 first:pt-0">
      <div className="flex items-baseline justify-between gap-4 font-sans text-body-sm">
        <span className="flex min-w-0 flex-wrap items-center gap-1.5 font-bold leading-tight text-ink">
          {line.name || '—'}
          {line.unit && <span className="font-normal text-muted">· {line.unit}</span>}
          {/* Paket hapı KOYU zeminli (tasarım): ürün adları arasında paket olduğu bir bakışta ayrılsın. */}
          {line.bundle && (
            <span className="flex-none rounded-pill bg-ink px-2 py-0.5 font-sans text-micro font-bold leading-tight text-olive-light">
              {t.bundlePill.replace('{count}', String(line.bundle.itemCount))}
            </span>
          )}
        </span>
        <span className="flex-none whitespace-nowrap leading-tight text-body">
          {t.lineFormula.replace('{qty}', String(line.billedQty)).replace('{unit}', formatPrice(line.unitPriceCents, locale))}
          <strong className="text-ink">{formatPrice(line.lineTotalCents, locale)}</strong>
        </span>
      </div>

      {/* Paket içeriği satırın altında — müşteri "Bayram Sofrası"nın ne olduğunu hatırlamak zorunda
          kalmasın (DOMAIN §13: fiyat kırılımı GÖSTERİLMEZ, içerik gösterilir). */}
      {line.bundle && line.bundle.contents.length > 0 && (
        <span className="font-sans text-micro leading-relaxed text-muted">{line.bundle.contents.join(' · ')}</span>
      )}

      {/* Eksik karşılama: miktar + PARA ÇÖZÜMÜ. Sebep anlatılmaz (tasarımın sözleşmesi) — müşterinin
          sorusu "hesabım doğru mu", "neden eksik" değil. */}
      {line.shortfall && (
        <span className="rounded-[10px] border border-honey-line bg-honey-bg px-3 py-2 font-sans text-micro font-semibold leading-relaxed text-honey">
          {(order.paymentMethod === 'online' ? t.shortfallRefund : t.shortfallDoor)
            .replace('{ordered}', String(line.qty))
            .replace('{fulfilled}', String(line.billedQty))
            .replace('{amount}', formatPrice(line.shortfallCents, locale))}
        </span>
      )}
    </div>
  );
}

/* ————————————————————————————— Teslimat / Tutar / Yardım ————————————————————————————— */

/** Teslimat — tasarımda etiket/değer tablosu DEĞİL, akıcı tek metin (emoji + kalın gün + adres). */
export function DeliveryCard({ t, locale, order, title }: Pick<DetailViewProps, 't' | 'locale' | 'order'> & { title: string }) {
  const day = order.deliveryDate ? formatDeliveryDate(order.deliveryDate, locale) : null;
  const address = order.address
    ? [order.address.line1, order.address.line2, [order.address.postalCode, order.address.city].filter(Boolean).join(' ')]
        .filter(Boolean)
        .join(', ')
    : null;

  return (
    <Panel title={title}>
      <span className="font-sans text-body-sm leading-relaxed text-body">
        {order.deliveryType === 'route' ? t.routeLine : t.shippingLine}
        {day && (
          <>
            {' — '}
            <strong className="text-ink">{day}</strong>
          </>
        )}
        {address && (
          <>
            <br />
            {address}
          </>
        )}
      </span>
    </Panel>
  );
}

/**
 * Tutar + ödeme. Ödeme bir SATIR değil **hap** (tasarım) ve emojiyle geliyor; hâller kapalı liste.
 * Eksik kalem varsa altında iade notu — para nerede kaldı sorusunu ekran cevaplıyor.
 */
export function SummaryCard({ t, locale, order, title }: Pick<DetailViewProps, 't' | 'locale' | 'order'> & { title: string }) {
  const shortfallTotal = order.lines.reduce((sum, l) => sum + l.shortfallCents, 0);

  return (
    <Panel title={title}>
      <Row label={t.subtotal} value={formatPrice(order.subtotalCents, locale)} />
      {order.discountCents > 0 && (
        <Row
          label={order.discountLabel ? `${t.discount} — ${order.discountLabel}` : t.discount}
          value={`−${formatPrice(order.discountCents, locale)}`}
          tone="olive"
        />
      )}
      <Row
        label={t.shipping}
        value={order.shippingFeeCents > 0 ? formatPrice(order.shippingFeeCents, locale) : t.freeShipping}
        tone={order.shippingFeeCents > 0 ? undefined : 'olive'}
      />
      <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-sand-200 pt-2.5 font-sans text-body font-bold text-ink">
        <span>{t.grandTotal}</span>
        <span>{formatPrice(order.totalCents, locale)}</span>
      </div>

      <PaymentPill t={t} order={order} />

      {shortfallTotal > 0 && order.paymentMethod === 'online' && (
        <span className="font-sans text-micro leading-relaxed text-muted">
          {t.refundNote.replace('{amount}', formatPrice(shortfallTotal, locale))}
        </span>
      )}
    </Panel>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'olive' }) {
  return (
    <div className={['flex items-baseline justify-between gap-4 font-sans text-body-sm', tone === 'olive' ? 'text-olive' : 'text-body'].join(' ')}>
      <span>{label}</span>
      <span className={['font-bold', tone === 'olive' ? '' : 'text-ink'].join(' ')}>{value}</span>
    </div>
  );
}

/**
 * Ödeme hâli — tasarımın beş hapı. Sıra ANLAMLI: iade her şeyi ezer (para geri döndüyse "kapıda
 * ödenecek" demek yanlış olur), vade yöntemden önce gelir (vadeli sipariş de kapıda kapanabilir).
 */
function PaymentPill({ t, order }: Pick<DetailViewProps, 't' | 'order'>) {
  const key = order.paymentStatus === 'refunded'
    ? 'refunded'
    : order.onAccount
      ? 'credit'
      : order.paymentMethod === 'online'
        ? order.paymentStatus === 'paid' ? 'online' : 'transfer'
        : order.paymentMethod === 'bank_transfer'
          ? 'transfer'
          : 'door';

  const tone: Record<typeof key, string> = {
    online: 'bg-olive-bg text-olive',
    door: 'bg-closed-bg text-body',
    transfer: 'bg-honey-bg text-honey',
    credit: 'bg-closed-bg text-body',
    refunded: 'bg-cream-deep text-ink',
  };

  return (
    <span className={['w-max rounded-pill px-3 py-1.5 font-sans text-note font-bold leading-tight', tone[key]].join(' ')}>
      {t.pay[key]}
    </span>
  );
}

/**
 * "Bir sorun mu var?" — tasarımda beyaz kart DEĞİL, **cream-deep zeminli** blok ve içinde gerçek
 * bir birincil düğme. Ton farkı bilinçli: bu bir bilgi kartı değil, bir davet.
 *
 * Düğme talep formuna **siparişin kimliğiyle** gider (08.6): form o siparişin kalemlerini hazır
 * listeler ve müşteri hangi ürünlerden şikâyetçi olduğunu işaretler. Kimlik sorgu dizesinde taşınır,
 * yolda değil — talep açma tek bir sayfadır ve siparişli/siparişsiz iki ayrı rota kurmak aynı formu
 * ikiye bölerdi.
 */
export function HelpCard({ t, order }: Pick<DetailViewProps, 't' | 'order'>) {
  return (
    <section className="flex flex-col gap-2 rounded-[16px] bg-cream-deep px-5.5 py-4.5">
      {/* Tasarımda 16px Lora 600 → `text-body` (15px); `text-lead` 18px olurdu ve blok kart gibi okunurdu. */}
      <span className="font-serif text-body font-semibold leading-tight text-ink">{t.helpTitle}</span>
      <span className="font-sans text-note leading-relaxed text-body">{t.helpBodyLong}</span>
      <Link href={{ pathname: '/support/new', query: { order: order.id } }} className={buttonClass({ fullWidth: true })}>
        {t.reportIssue}
      </Link>
    </section>
  );
}

/**
 * Mobilin zaman çizgisi — tasarımda **yatay** dört adım, tek satırda (dikey çizginin dar ekrandaki
 * karşılığı değil, ayrı bir çizim). Damga yazılmaz: dört etiket bir satıra ancak böyle sığıyor ve
 * bildirimden gelen müşterinin sorusu "neredeyim", "ne zaman"dan önce geliyor.
 */
export function TimelineStrip({ t, order }: Pick<DetailViewProps, 't' | 'order'>) {
  if (!order.timeline) return <ClosedStateCard t={t} order={order} />;

  return (
    <div className="flex justify-between rounded-[16px] border border-sand-200 bg-card p-3.5">
      {order.timeline.map((step) => (
        <span
          key={step.milestone}
          className={[
            'flex flex-col items-center gap-1 font-sans text-micro leading-tight',
            step.state === 'pending' ? 'text-sand-600' : 'text-olive',
            step.state === 'current' ? 'font-bold' : '',
          ].join(' ')}
        >
          <span aria-hidden="true">{step.state === 'done' ? '✓' : step.state === 'current' ? '●' : '○'}</span>
          {t.milestone[step.milestone]}
        </span>
      ))}
    </div>
  );
}

/**
 * Mobilin durum kahramanı — zeytin zeminli kart (tasarım): solda durum, sağda tarih, altında
 * "bugün kapınıza geliyor — adres". Bildirimden gelen müşteri ilk bakışta *nerede olduğunu* görür;
 * masaüstünde bu bilgi çizgide ve teslimat kartında dağınık durur, dar ekranda tek yere toplanıyor.
 */
export function StatusHero({ listT, locale, order }: Pick<DetailViewProps, 'listT' | 'locale' | 'order'>) {
  const day = order.deliveryDate ? formatDeliveryDate(order.deliveryDate, locale) : null;
  const city = order.address ? [order.address.line1, order.address.city].filter(Boolean).join(', ') : null;

  return (
    <div className="flex flex-col gap-1 rounded-[16px] bg-olive-bg px-4 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <span className="font-sans text-body-sm font-bold leading-tight text-olive">{listT.status[order.status]}</span>
        <span className="font-sans text-micro leading-tight text-body">{formatOrderDate(order.createdAt, locale, true)}</span>
      </div>
      {(day || city) && (
        <span className="font-sans text-note leading-relaxed text-ink">{[day, city].filter(Boolean).join(' — ')}</span>
      )}
    </div>
  );
}
