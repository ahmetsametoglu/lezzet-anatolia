import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { OrderService, ProductService, ProductVariantService, UserProfileService, serviceDb } from '@lezzet/database';
import { resolveLocalizedText } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { detectDevice } from '@/lib/device';
import { getSessionUser } from '@/lib/guard';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { imageOf, neighborInviteUrl, remainingNeighborInviteUses, tryOpenNeighborInvite } from '@lezzet/application';
import { recordPageView } from '@/lib/analytics/page-view';
import { orderIdOrNull } from '@/lib/order/order-id';
import { routing } from '@/i18n/routing';
import { OrderWatch } from './components/order-watch';
import { ConfirmationClient } from './confirmation-client';
import { stripePaymentGateway } from '@/lib/stripe';
import { paymentStateOf, type ConfirmationView } from './confirmation-types';
import messages from './messages.json';
// Aile kökünün sözlüğü: özetin ortak sözcükleri orada yaşıyor (`confirmation-types`).
import checkoutMessages from '../messages.json';

/**
 * Sipariş alındı sayfası; yolda sipariş kimliği taşınır, çünkü referans numarası ancak onayla doğar.
 * "Ödendi" dönüşten değil siparişin kendi durumundan okunur: onay webhook'la, dönüşten sonra gelebilir.
 */
interface ConfirmationPageProps {
  params: Promise<{ locale: string; reference: string }>;
}

export default async function ConfirmationPage({ params }: ConfirmationPageProps) {
  const { locale, reference } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  void recordPageView('/checkout/[reference]');

  const t = messages[locale];
  const [device, user] = await Promise.all([detectDevice(), getSessionUser()]);

  const db = serviceDb();
  const profile = user ? await new UserProfileService(db).findByAuthUserId(user.id) : null;
  // Biçimi geçersiz kimlik servise gitmez: UUID olmayan segment veritabanı hatası olup 500 gösterirdi.
  const orderId = orderIdOrNull(reference);
  const found = orderId ? await new OrderService(db).getWithItems(orderId) : null;
  // Başkasının siparişi GÖRÜNMEZ: kimlik yoldan geliyor, sahiplik sunucuda doğrulanır.
  if (!found || !profile || found.order.customerId !== profile.id) notFound();

  const { order, items } = found;
  /**
   * Sipariş kesinleşti mi (taslak değil, iptal değil); "ödendi" ile aynı şey değil, kapıda ödenecek
   * sipariş de kesinleşmiştir.
   */
  const placed = order.status !== 'draft' && order.status !== 'cancelled';
  const cancelled = order.status === 'cancelled';

  // Kalem künyesi: sipariş varyant satırlarından oluşuyor, müşteri ürün adını ve görselini görmeli.
  const variants = await new ProductVariantService(db).listByIds([...new Set(items.map((i) => i.variantId))]);
  const products = await new ProductService(db).listByIds([...new Set(variants.map((v) => v.productId))]);
  const lineByVariant = new Map(
    variants.map((variant) => {
      const product = products.find((p) => p.id === variant.productId);
      return [
        variant.id,
        {
          name: product ? resolveLocalizedText(product.name, locale as Locale) : '',
          unit: resolveLocalizedText(variant.label, locale as Locale),
          image: product ? imageOf(product) : null,
        },
      ];
    }),
  );

  /**
   * Komşu daveti okuması yazabilir: ekran "komşunu çağır" diyecekse paylaşılacak bağlantı var olmalı,
   * yazım idempotent. Yalnız kesinleşmiş rota siparişinde denenir; kargoda sefer, taslakta gün yok.
   */
  const invite =
    placed && order.deliveryType === 'route' ? await tryOpenNeighborInvite(db, { orderId: order.id, customerId: profile.id }) : null;

  /**
   * "Bankanızdan onay bekliyoruz" yalnız kart ödemesinde doğru; kapıda ödemede ve havalede
   * beklenen bir banka onayı yok.
   */
  const awaitingCard = !placed && !cancelled && order.paymentMethod === 'online';
  /**
   * Sağlayıcının söylediği, yalnız ödemesi beklenen kart taslağında sorulur; okuma yan etkisizdir. Hata
   * burada `null`a düşer, çünkü canlı bağın eylemi aynı soruyu saniyeler sonra sorar ve orada iz bırakır.
   */
  const payment = awaitingCard && order.paymentRef ? await stripePaymentGateway()?.read(order.paymentRef).catch(() => null) : null;

  const view: ConfirmationView = {
    orderId: order.id,
    /* Kontenjan sunucuda sayılır: ekran "kaç komşu daha" cümlesini kurabilsin ve dolan davet
       paylaşımı hiç sunmasın. */
    neighborInvite: invite
      ? {
          url: neighborInviteUrl(invite.token, locale as Locale),
          remainingUses: await remainingNeighborInviteUses(db, invite),
          maxUses: invite.maxUses,
        }
      : null,
    referenceNo: order.referenceNo,
    createdAt: order.createdAt,
    placed,
    cancelled,
    // Damga ham taşınır: "para iade edildi mi" kararını ekran tek yerden sorar (`isRefundedCancellation`).
    refundedAt: order.providerRefundedAt,
    awaitingCard,
    paymentState: payment ? paymentStateOf(payment.status) : null,
    onRoute: order.deliveryType === 'route',
    deliveryDate: order.deliveryDate,
    onAccount: order.onAccount,
    paymentMethod: order.paymentMethod,
    totalCents: order.orderedTotalCents,
    discountCents: order.discountAmountCents,
    /**
     * İndirim adı siparişteki kopyadan okunur: kampanya sonradan değişse de özet geriye dönük dil
     * değiştirmemeli. Oran yazılmaz, çünkü siparişte saklanan tutardır.
     */
    discountName: order.discountLabel ? resolveLocalizedText(order.discountLabel, locale as Locale) : '',
    shippingFeeCents: order.shippingFeeCents,
    // Yalnız İLK ad (tasarım: "Teşekkürler, Ahmet") — tam ad kutlama cümlesini resmîleştirirdi.
    customerFirstName: profile.name ? (profile.name.split(' ')[0] ?? '') : '',
    customerEmail: profile.email ?? '',
    // Adresin anlık görüntüsü jsonb; alanları isimle okunur (servis katmanı camelCase'e çevirir).
    address: order.addressSnapshot as ConfirmationView['address'],
    lines: items.map((item) => {
      const line = lineByVariant.get(item.variantId);
      return {
        id: item.id,
        name: line?.name ?? '',
        unit: line?.unit ?? '',
        image: line?.image ?? null,
        qty: item.qty,
        lineTotalCents: item.unitPriceCents * item.qty,
      };
    }),
  };

  return (
    <SiteFrame device={device} locale={locale}>
      {/* Ödeme beklerken sayfa canlıdır: webhook düşünce kendini yeniler (çizmez, yalnız dinler). */}
      {view.awaitingCard && <OrderWatch orderId={order.id} />}
      <ConfirmationClient t={t} shared={checkoutMessages[locale]} locale={locale as Locale} view={view} device={device} />
    </SiteFrame>
  );
}
