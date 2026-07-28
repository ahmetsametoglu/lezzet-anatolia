import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { OrderService, ProductService, ProductVariantService, UserProfileService, serviceDb } from '@lezzet/database';
import { resolveLocalizedText } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { detectDevice } from '@/lib/device';
import { getSessionUser } from '@/lib/guard';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { buttonClass } from '@/components/customer/ui/button';
import { Link } from '@/i18n/navigation';
import { formatDeliveryDate, formatPrice, formatShortDate } from '@/lib/storefront/format';
import { routing } from '@/i18n/routing';
import messages from './messages.json';

/**
 * Sipariş alındı sayfası (08.13) — ödeme dönüşünün ve kapıda ödemenin ortak varış noktası.
 *
 * **Yolda taşınan kimlik SİPARİŞ KİMLİĞİDİR, referans numarası değil.** Numara ancak sipariş
 * onaylanınca doğuyor (07.5); kapıda ödemede ve ödeme henüz onaylanmamışken ortada numara yok.
 * Sorgu dizesi de kullanılmadı — paylaşılan bir linkte sorgu kaybolur, yol kaybolmaz.
 *
 * **Sayfa YALAN SÖYLEMEZ.** Müşteri Stripe'tan döndüğünde ödeme onayı bize webhook'la gelir ve o
 * çağrı müşterinin tarayıcısından bağımsızdır — bazen ondan saniyeler sonra. Bu yüzden "Ödendi"
 * yazısı siparişin KENDİ durumundan okunur: taslaksa "onaylanıyor" denir, onaylandıysa "ödendi".
 * Dönüşü başarı saymak, iptal olmuş bir ödemede müşteriye ödendi demek olurdu.
 */
interface ConfirmationPageProps {
  params: Promise<{ locale: string; reference: string }>;
}

export default async function ConfirmationPage({ params }: ConfirmationPageProps) {
  const { locale, reference } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const t = messages[locale];
  const [device, user] = await Promise.all([detectDevice(), getSessionUser()]);

  const db = serviceDb();
  const profile = user ? await new UserProfileService(db).findByAuthUserId(user.id) : null;
  const found = await new OrderService(db).getWithItems(reference);
  // Başkasının siparişi GÖRÜNMEZ: kimlik yoldan geliyor, sahiplik sunucuda doğrulanır.
  if (!found || !profile || found.order.customerId !== profile.id) notFound();

  const { order, items } = found;
  const paid = order.status !== 'draft' && order.status !== 'cancelled';
  const cancelled = order.status === 'cancelled';

  // Kalem adları: sipariş varyant kalemlerinden oluşuyor, müşteri ürün adını görmeli.
  const variants = await new ProductVariantService(db).listByIds([...new Set(items.map((i) => i.variantId))]);
  const products = await new ProductService(db).listByIds([...new Set(variants.map((v) => v.productId))]);
  const nameByVariant = new Map(
    variants.map((v) => {
      const product = products.find((p) => p.id === v.productId);
      return [v.id, product ? resolveLocalizedText(product.name, locale as Locale) : ''];
    }),
  );

  // Adresin anlık görüntüsü jsonb; alanları isimle okunur (servis katmanı camelCase'e çevirir).
  const snapshot = order.addressSnapshot as { label?: string; line1?: string; line2?: string; postalCode?: string; city?: string } | null;

  const compact = device === 'mobile';
  const total = formatPrice(Math.round(order.total * 100), locale as Locale);

  const day = order.deliveryDate ? formatDeliveryDate(order.deliveryDate, locale as Locale) : null;
  const placedTime = new Date(order.createdAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const steps = [
    { label: t.timeline.placed, when: t.timeline.placedAt.replace('{time}', placedTime) },
    { label: t.timeline.preparing, when: day ? t.timeline.preparingAt : null },
    { label: t.timeline.onTheWay, when: day ? t.timeline.onTheWayAt.replace('{date}', day) : null },
    { label: t.timeline.delivered, when: day ? t.timeline.deliveredAt.replace('{date}', day) : null },
  ];

  return (
    <SiteFrame device={device} locale={locale}>
      <div className={['mx-auto flex w-full max-w-[1180px] flex-col gap-5', compact ? 'px-4 py-5' : 'px-8 py-8'].join(' ')}>
        {/* Başlık siparişin GERÇEK durumunu söyler — dönüşün kendisini değil. */}
        <section
          className={[
            'flex flex-col gap-2 rounded-card px-6 py-6',
            cancelled ? 'bg-terracotta-bg' : paid ? 'bg-olive-bg' : 'bg-honey-bg',
          ].join(' ')}
        >
          <span className={['font-serif', compact ? 'text-h1-sm' : 'text-h1', cancelled ? 'text-terracotta' : 'text-ink'].join(' ')}>
            {cancelled ? t.failed : paid ? (profile.name ? t.title.replace('{name}', profile.name.split(' ')[0] ?? '') : t.titleAnon) : t.pending}
          </span>
          <p className="font-sans text-note leading-relaxed text-body">
            {cancelled ? t.failedBody : paid ? t.mailed.replace('{email}', profile.email ?? '') : t.pendingBody}
          </p>
          <span className="font-sans text-micro text-muted">
            {order.referenceNo ? `${t.orderNo.replace('{reference}', order.referenceNo)} · ` : ''}
            {formatShortDate(order.createdAt, locale as Locale)}
          </span>
        </section>

        <div className={compact ? 'flex flex-col gap-4' : 'flex items-start gap-6'}>
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <Block title={t.delivery.title} compact={compact}>
              <span className="font-sans text-note font-bold text-ink">
                {order.deliveryType === 'route' ? t.delivery.route : t.delivery.shipping}
              </span>
              {order.deliveryDate && (
                <span className="font-serif text-card-title-sm text-ink">{formatDeliveryDate(order.deliveryDate, locale as Locale)}</span>
              )}
              {/* Nereye gittiği ANLIK GÖRÜNTÜDEN okunur, adres tablosundan değil: müşteri adresini
                  sonradan düzenlerse bu sipariş nereye gittiğini unutmamalı (07). */}
              {snapshot && (
                <span className="font-sans text-note leading-relaxed text-body">
                  {snapshot.label ? `${snapshot.label} · ` : ''}
                  {snapshot.line1}
                  {snapshot.line2 ? `, ${snapshot.line2}` : ''}
                  <br />
                  {snapshot.postalCode} {snapshot.city}
                </span>
              )}
              <span className="font-sans text-note leading-relaxed text-body">
                {order.deliveryType === 'route' ? t.delivery.coldChain : t.delivery.shippingNote}
              </span>
            </Block>

            <Block title={t.payment.title} compact={compact}>
              <span className="font-sans text-note font-bold text-ink">
                {order.onAccount
                  ? t.payment.onAccount.replace('{amount}', total)
                  : order.paymentMethod === 'online'
                    ? (paid ? t.payment.paid : t.pending).replace('{amount}', total)
                    : t.payment.due.replace('{amount}', total)}
              </span>
              <span className="font-sans text-note text-muted">
                {order.onAccount ? t.payment.credit : order.paymentMethod === 'online' ? t.payment.online : t.payment.cod}
              </span>
              {/* Kart künyesi: son dört hane ödeme sağlayıcısından çekilecek (12) — bugün
                  saklamıyoruz, uydurma rakam yazmaktansa yalnız aracı söyleriz. */}
              {order.paymentMethod === 'online' && paid && <span className="font-sans text-micro text-muted">{t.payment.card}</span>}
              <span className="font-sans text-micro leading-relaxed text-muted">{t.payment.invoiceSoon}</span>
              {/* Fatura düğmesi tasarımda var; üretimi modül 12'nin işi. Düğme YERİNDE durur ve
                  neden basılamadığını söyler — silmek, tasarımın bu bloğunu kaybetmek olurdu. */}
              <span className={buttonClass({ variant: 'ghost', size: 'sm', className: 'pointer-events-none w-max opacity-50' })}>
                {t.payment.invoice} · {t.soon}
              </span>
            </Block>

            <Block title={t.timeline.title} compact={compact}>
              {/* Her adımın YANINDA ne zaman olacağı yazar (tasarım): "Sırada ne var" sorusunun
                  cevabı adımın adı değil, zamanıdır. Teslimat günü bilinmiyorsa (kargo) o satırlar
                  künyesiz kalır — tarih uydurmak taşıyıcı adına söz vermek olurdu. */}
              <ol className="flex flex-col gap-2.5">
                {steps.map((step, i) => (
                  <li key={step.label} className="flex items-start gap-2.5">
                    <span className={['mt-1.5 size-2 flex-none rounded-full', i === 0 ? 'bg-olive' : 'bg-sand-300'].join(' ')} />
                    <div className="flex flex-col">
                      <span className={['font-sans text-note', i === 0 ? 'font-bold text-ink' : 'text-muted'].join(' ')}>{step.label}</span>
                      {step.when && <span className="font-sans text-micro text-muted">{step.when}</span>}
                    </div>
                  </li>
                ))}
              </ol>
              <span className="font-sans text-micro leading-relaxed text-muted">{t.timeline.note}</span>
            </Block>
            {/* Yardım bloğu tasarımda var; WhatsApp bağlantısı modül 15'in işi. Blok yerinde
                durur ve ne yapılacağını söyler — kanal açılınca düğme canlanır. */}
            <Block title={t.help.title} compact={compact}>
              <span className="font-sans text-note leading-relaxed text-body">{t.help.body}</span>
              <span className={buttonClass({ variant: 'secondary', size: 'sm', className: 'pointer-events-none w-max opacity-50' })}>
                💬 {t.help.cta} · {t.soon}
              </span>
            </Block>
          </div>

          <div className={compact ? '' : 'w-[360px] flex-none'}>
            <Block title={t.summary.title} compact={compact}>
              <ul className="flex flex-col gap-2">
                {items.map((item) => (
                  <li key={item.id} className="flex items-baseline justify-between gap-3">
                    <span className="font-sans text-note text-body">
                      {nameByVariant.get(item.variantId)} × {item.qty}
                    </span>
                    <span className="font-sans text-note font-semibold text-ink">
                      {formatPrice(Math.round(item.unitPrice * 100) * item.qty, locale as Locale)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-col gap-1.5 border-t border-sand-100 pt-3">
                {order.discountAmount > 0 && (
                  <SummaryRow
                    // Kodun kendisi tasarımda ("İndirim — HOSGELDIN10"); sipariş yalnız `discount_id`
                    // taşıdığı için kod adı 09.6 kupon okumasıyla gelecek. Bugün yalnız etiket.
                    label={t.summary.discount}
                    value={`−${formatPrice(Math.round(order.discountAmount * 100), locale as Locale)}`}
                  />
                )}
                <SummaryRow
                  label={t.summary.delivery}
                  value={order.shippingFee > 0 ? formatPrice(Math.round(order.shippingFee * 100), locale as Locale) : t.summary.free}
                />
                <div className="flex items-baseline justify-between gap-3 border-t border-sand-100 pt-2">
                  <span className="font-sans text-body font-bold text-ink">{t.summary.total}</span>
                  <span className="font-serif text-h2-sm text-ink">{total}</span>
                </div>
                <span className="font-sans text-micro text-muted">{t.summary.vatIncluded}</span>
              </div>

              {cancelled && (
                <Link href="/cart" className={buttonClass({ size: 'sm', fullWidth: true })}>
                  {t.retry}
                </Link>
              )}
              {/* Takip sayfası (`/orders/[reference]`) henüz kodlanmadı. Bağ VERİLMEZ — ölü link
                  404'e düşer; düğme yerinde durup neden basılamadığını söyler. */}
              {!cancelled && (
                <span className={buttonClass({ size: 'sm', fullWidth: true, className: 'pointer-events-none opacity-50' })}>
                  {t.track} · {t.soon}
                </span>
              )}
              <Link href="/catalog" className={buttonClass({ variant: 'secondary', size: 'sm', fullWidth: true })}>
                {t.continue}
              </Link>
            </Block>
          </div>
        </div>
      </div>
    </SiteFrame>
  );
}

function Block({ title, compact, children }: { title: string; compact: boolean; children: React.ReactNode }) {
  return (
    <section className={['flex flex-col gap-2.5 rounded-card border border-sand-200 bg-card', compact ? 'px-4 py-4' : 'px-5 py-5'].join(' ')}>
      <span className="font-serif text-card-title-sm text-ink">{title}</span>
      {children}
    </section>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="font-sans text-note text-body">{label}</span>
      <span className="font-sans text-note font-semibold text-ink">{value}</span>
    </div>
  );
}
