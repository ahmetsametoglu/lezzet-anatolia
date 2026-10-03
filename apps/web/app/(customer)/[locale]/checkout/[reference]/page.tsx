import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import {
  OrderService,
  ProductService,
  ProductVariantService,
  UserProfileService,
  WarehouseService,
  serviceDb,
  type Db,
} from '@lezzet/database';
import { brand } from '@lezzet/brand';
import { resolveLocalizedText, type OrderItem } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { detectDevice } from '@/lib/device';
import { getSessionUser } from '@/lib/guard';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { imageOf, neighborInviteUrl, paymentDeadlineOf, tryOpenNeighborInvite, warehouseAddressLine } from '@lezzet/application';
import { recordPageView } from '@/lib/analytics/page-view';
import { orderIdOrNull } from '@/lib/order/order-id';
import { routing } from '@/i18n/routing';
import { OrderWatch } from './components/order-watch';
import { ConfirmationClient } from './confirmation-client';
import { stripePaymentGateway } from '@/lib/stripe';
import { orderOutcomeOf, paymentStateOf } from '@lezzet/domain-core';
import type { ConfirmationView } from './confirmation-types';
import type { BillingDetails } from '../components/payment-element';
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
  // Biçimi geçersiz kimlik servise gitmez: UUID olmayan segment veritabanı hatası olup 500 gösterirdi.
  const orderId = orderIdOrNull(reference);
  // Profil ve sipariş birbirini beklemez; sahiplik ikisi gelince sorulur.
  const [profile, found] = await Promise.all([
    user ? new UserProfileService(db).findByAuthUserId(user.id) : null,
    orderId ? new OrderService(db).getWithItems(orderId) : null,
  ]);
  // Başkasının siparişi GÖRÜNMEZ: kimlik yoldan geliyor, sahiplik sunucuda doğrulanır.
  if (!found || !profile || found.order.customerId !== profile.id) notFound();

  const { order, items } = found;
  /**
   * Sipariş kesinleşti mi (taslak değil, iptal değil); "ödendi" ile aynı şey değil, kapıda ödenecek
   * sipariş de kesinleşmiştir.
   */
  const { placed, cancelled, awaitingCard } = orderOutcomeOf(order);

  // Aşağıdaki okumalar birbirini beklemez; her biri sunucuda ayrı bir gidiş-dönüş zinciri, sırayla gitselerdi müşteri sipariş verdikten
  // sonra toplamlarını beklerdi.
  const [lineByVariant, pickupWarehouse, invite, payment, payBy] = await Promise.all([
    lineCatalogOf(db, items, locale as Locale),
    // Gel-al'da onay kartı DEPONUN adresini ve randevu numarasını yazar — müşteri oraya gidecek.
    order.deliveryType === 'pickup' ? new WarehouseService(db).getById(order.warehouseId) : null,
    /* Komşu daveti okuması yazabilir: ekran "komşunu çağır" diyecekse paylaşılacak bağlantı var olmalı, yazım idempotent. Yalnız
       kesinleşmiş rota siparişinde denenir; kargoda sefer, taslakta gün yok. */
    placed && order.deliveryType === 'route' ? tryOpenNeighborInvite(db, { orderId: order.id, customerId: profile.id, order }) : null,
    /* Sağlayıcının söylediği, yalnız ödemesi beklenen kart taslağında sorulur; okuma yan etkisizdir. Hata burada `null`a düşer, çünkü
       canlı bağın eylemi aynı soruyu saniyeler sonra sorar ve orada iz bırakır. */
    awaitingCard && order.paymentRef
      ? (stripePaymentGateway()
          ?.read(order.paymentRef)
          .catch(() => null) ?? null)
      : null,
    awaitingCard ? paymentDeadlineOf(db, order.id) : null,
  ]);

  const view: ConfirmationView = {
    orderId: order.id,
    /* Kontenjan sunucuda sayılır: ekran "kaç komşu daha" cümlesini kurabilsin ve dolan davet
       paylaşımı hiç sunmasın. */
    neighborInvite: invite
      ? {
          url: neighborInviteUrl(invite.invite.token, locale as Locale),
          remainingUses: invite.remainingUses,
          maxUses: invite.invite.maxUses,
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
    payBy,
    billing: awaitingCard ? billingOf(profile, order.addressSnapshot) : null,
    onRoute: order.deliveryType === 'route',
    pickup: pickupWarehouse
      ? { warehouseName: pickupWarehouse.name, addressLine: warehouseAddressLine(pickupWarehouse), phoneDisplay: brand.contact.phoneDisplay }
      : null,
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
    <SiteFrame device={device} locale={locale} footer="slim">
      {/* Ödeme beklerken sayfa canlıdır: webhook düşünce kendini yeniler (çizmez, yalnız dinler). */}
      {view.awaitingCard && <OrderWatch orderId={order.id} />}
      <ConfirmationClient t={t} shared={checkoutMessages[locale]} locale={locale as Locale} view={view} device={device} />
    </SiteFrame>
  );
}

/** Kalem künyesi: sipariş varyant satırlarından oluşuyor, müşteri ürün adını ve görselini görmeli; ürünler boyların ardından okunur. */
async function lineCatalogOf(db: Db, items: readonly OrderItem[], locale: Locale) {
  const variants = await new ProductVariantService(db).listByIds([...new Set(items.map((i) => i.variantId))]);
  const products = await new ProductService(db).listByIds([...new Set(variants.map((v) => v.productId))]);
  return new Map(
    variants.map((variant) => {
      const product = products.find((p) => p.id === variant.productId);
      return [
        variant.id,
        {
          name: product ? resolveLocalizedText(product.name, locale) : '',
          unit: resolveLocalizedText(variant.label, locale),
          image: product ? imageOf(product) : null,
        },
      ];
    }),
  );
}

/** Fatura bilgisi profilden ve siparişin adres görüntüsünden; ülke yoksa kart formu açılmaz, uydurulmaz. */
function billingOf(
  profile: { name: string | null; email: string | null; phone: string | null },
  snapshot: Record<string, unknown> | null,
): BillingDetails | null {
  const text = (key: string) => (typeof snapshot?.[key] === 'string' ? (snapshot[key] as string) : null);
  const country = text('country');
  if (!country) return null;
  return {
    name: profile.name ?? '',
    email: profile.email ?? '',
    phone: profile.phone,
    line1: text('line1') ?? '',
    line2: text('line2'),
    postalCode: text('postalCode') ?? '',
    city: text('city') ?? '',
    country,
  };
}
