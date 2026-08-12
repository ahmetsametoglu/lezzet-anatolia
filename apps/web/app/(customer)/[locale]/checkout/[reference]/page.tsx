import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { OrderService, ProductService, ProductVariantService, UserProfileService, serviceDb } from '@lezzet/database';
import { resolveLocalizedText } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { detectDevice } from '@/lib/device';
import { getSessionUser } from '@/lib/guard';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { imageOf, neighborInviteUrl, tryOpenNeighborInvite } from '@lezzet/application';
import { recordPageView } from '@/lib/analytics/page-view';
import { orderIdOrNull } from '@/lib/order/order-id';
import { routing } from '@/i18n/routing';
import { OrderWatch } from './components/order-watch';
import { ConfirmationClient } from './confirmation-client';
import type { ConfirmationView } from './confirmation-types';
import messages from './messages.json';
// Aile kökünün sözlüğü: özetin ortak sözcükleri orada yaşıyor (`confirmation-types`, 08.20).
import checkoutMessages from '../messages.json';

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
 * Dönüşü başarı saymak, iptal olmuş bir ödemede müşteriye ödendi demek olurdu. Beklerken ekran
 * asılı da kalmaz: `OrderWatch` zili duyunca sayfayı sunucudan yeniden ister.
 *
 * **Bu dosya artık yalnız VERİYİ çözüyor** (03.08): yerleşim `page → *-client (useDevice) →
 * *.desktop/*.mobile` zincirinde (CLAUDE.md §2). Yüzeydeki tek istisna burasıydı — tek dosya içinde
 * `compact` bayrağıyla dallanıyordu, yani cihaz kararı sunucunun UA tahminine mahkûmdu ve tahmin
 * yanılırsa ödeme dönüşünün indiği ekran yanlış düzende kalıyordu. Emsal yanı başında:
 * `orders/[reference]`.
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
  // Biçimi geçersiz kimlik servise HİÇ gitmez: UUID olmayan segment veritabanı hatasına düşüp
  // müşteriye 500 gösteriyordu (09.08'de sipariş detayında ölçüldü, aynı açık burada da vardı).
  const orderId = orderIdOrNull(reference);
  const found = orderId ? await new OrderService(db).getWithItems(orderId) : null;
  // Başkasının siparişi GÖRÜNMEZ: kimlik yoldan geliyor, sahiplik sunucuda doğrulanır.
  if (!found || !profile || found.order.customerId !== profile.id) notFound();

  const { order, items } = found;
  /**
   * Sipariş KESİNLEŞTİ mi (taslak değil, iptal değil). "Ödendi" ile aynı şey DEĞİL: ödeme ayrı bir
   * eksendir (DOMAIN §7) — kapıda ödenecek bir sipariş de kesinleşmiştir.
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
   * Komşu daveti (17.10) — **okuma YAZABİLİR ve bu bilinçli**, puan kartındaki (`readCustomerPoints`)
   * aynı karar ve aynı gerekçe: ekran "komşunu çağır" diyecekse paylaşılacak bir bağlantı VAR olmalı;
   * müşteri düğmeye dokunduğunda hiçbir şey olmaması daha kötüdür. Yazım idempotent — sipariş başına
   * tek davet (veride unique) ve ikinci render aynı satırı döndürür.
   *
   * Yalnız KESİNLEŞMİŞ ROTA siparişinde denenir: kargoda sefer yok, taslakta çağrılacak bir gün yok.
   * Kapı ayrıca seferin kesim saatine de bakıyor ve kapanmışsa davet açmıyor (`openNeighborInvite`).
   */
  const invite =
    placed && order.deliveryType === 'route' ? await tryOpenNeighborInvite(db, { orderId: order.id, customerId: profile.id }) : null;

  const view: ConfirmationView = {
    orderId: order.id,
    neighborInviteUrl: invite ? neighborInviteUrl(invite.token, locale as Locale) : null,
    referenceNo: order.referenceNo,
    createdAt: order.createdAt,
    placed,
    cancelled,
    // Damga HAM taşınır; "para iade edildi mi" kararını ekran tek bir yerden sorar
    // (`isRefundedCancellation`) — kuralı burada da kurmak aynı kararın ikinci kopyası olurdu.
    refundedAt: order.providerRefundedAt,
    /**
     * "Ödemeniz onaylanıyor · bankanızdan onay bekliyoruz" YALNIZ kart ödemesinde doğru. Kapıda
     * ödemede beklenen bir banka yok; havalede de öyle — orada beklenen müşterinin transferi.
     */
    awaitingCard: !placed && !cancelled && order.paymentMethod === 'online',
    onRoute: order.deliveryType === 'route',
    deliveryDate: order.deliveryDate,
    onAccount: order.onAccount,
    paymentMethod: order.paymentMethod,
    totalCents: order.totalCents,
    discountCents: order.discountAmountCents,
    /**
     * İndirim satırının adı. Kaynak SİPARİŞTEKİ KOPYADIR (`discount_label`), tanım değil: kampanya
     * o günden sonra yeniden adlandırılmış, süresi dolmuş ya da silinmiş olabilir — sipariş özeti
     * geriye dönük dil değiştirmemeli. Bu yüzden tanımı okumak için ayrıca DB'ye de gidilmez.
     *
     * **Oran YAZILMAZ** ve bu bir eksik değil: siparişte saklanan şey inen TUTARDIR, oran değil.
     * Sepette oran gösterilir çünkü orada karar ANLIK; siparişte karar geçmiştir.
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
