import { formatPrice } from '@lezzet/helper';
import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type { CheckoutOrderResult } from '@lezzet/types';

import type { PaymentSheetOutcome } from '@/lib/payment/payment-sheet';
import { formatDeliveryDate } from '@/screens/orders/order-format';
// Yalnız METİN BLOĞUNUN TİPİ için: bu modül sözlüğü okumaz, çağıran geçirir (`address-card` deseni).
import type messages from './messages.json';

/*
  RETLERİN CÜMLESİ — sunucunun ADLI cevabı ekranın diline burada çevrilir.

  ── TEK "OLMADI" CÜMLESİ YOK ────────────────────────────────────────────────
  On beş ret hâlinin her biri müşteriden BAŞKA bir şey istiyor: `blocked_lines` satır çıkarmayı,
  `insufficient_here` adet düşürmeyi, `price_changed` yeni fiyatı onaylamayı, `date_unavailable`
  başka gün seçmeyi, `min_basket` sepeti büyütmeyi, `address_city_mismatch` adresi düzeltmeyi.
  Hepsini "bir şeyler ters gitti"ye indirmek, müşteriye neyi düzelteceğini söylememek olurdu —
  çoğu sepeti büsbütün terk ederdi (sözleşme künyesinin kendi gerekçesi).

  ── PARA BİÇİMLEMESİ EKRANIN İŞİ ────────────────────────────────────────────
  Sunucu YAPISAL döner (cent + ad); `{detail}` yerleri burada, seçili dille kuruluyor
  (`formatPrice`). Sunucudan biçimli metin istemek, aynı tutarı üç dilde üç kez yazdırmak olurdu.

  ── ÜRÜN ADI SUNUCUDAN İKİNCİ KEZ İSTENMEZ ──────────────────────────────────
  `insufficient_stock` yalnız `variantId` taşır ve bu bilinçli (sözleşme künyesi): ekranın elinde
  zaten çözülmüş sepet görünümü var. Adı çözen kapı çağırandan gelir (`resolveName`); ad
  bulunamazsa adsız cümle kurulur — uydurulmuş bir ad, yanlış ürünü düzelttirirdi.

  ── DERLEME KİLİDİ ──────────────────────────────────────────────────────────
  `switch` TAM: sözleşmeye yarın yeni bir ret eklenirse bu dosya DERLENMEZ (`never` ataması) ve
  fark edilir. Varsayılan bir dala düşseydi yeni hâl sessizce eski bir cümleye karışırdı.
*/

type Messages = LocalizedCopy<typeof messages>;

/** Ret hâlleri — başarı dalları dışarıda; onları ekran kendi akışında karşılar. */
type CheckoutRejection = Exclude<CheckoutOrderResult, { status: 'placed' } | { status: 'payment_required' }>;

/** Satır adını sepet görünümünden çözen kapı; bilinmiyorsa `null` (boş metin DEĞİL — CLAUDE §1). */
type ResolveVariantName = (variantId: string) => string | null;

/** "Ad (kalan adet)" — iki retin ortak biçimi; parantezdeki sayı müşterinin düzelteceği sayıdır. */
function withCount(name: string, count: number): string {
  return `${name} (${count})`;
}

export function rejectionMessage(
  result: CheckoutRejection,
  t: Messages,
  locale: Locale,
  resolveName: ResolveVariantName,
): string {
  const r = t.reject;
  switch (result.status) {
    case 'warehouse_unresolved':
      // İki sebep de (belirsiz bölge · kargo deposu yok) operatörün müdahalesini bekler ve
      // müşteriye "bölge dışısınız" DENMEZ: o başka bir gerçek (sözleşme künyesi).
      return r.warehouse_unresolved;
    case 'empty_cart':
      return r.empty_cart;
    case 'blocked_lines':
      return r.blocked_lines.replace('{detail}', result.lines.join(', '));
    case 'insufficient_here':
      return r.insufficient_here.replace(
        '{detail}',
        result.lines.map((line) => withCount(line.name, line.available)).join(', '),
      );
    case 'min_basket':
      return r.min_basket.replace('{missing}', formatPrice(result.missingCents, locale));
    case 'address_not_found':
      return r.address_not_found;
    case 'address_city_mismatch':
      return r.address_city_mismatch
        .replace('{postalCode}', result.postalCode)
        .replace('{city}', result.city)
        .replace('{places}', result.places.join(', '));
    case 'cold_chain_unshippable':
      return r.cold_chain_unshippable;
    case 'date_unavailable':
      // Yeni günler cevapta geliyor ama cümleye YAZILMIYOR: ekran anlık görüntüyü tazeliyor ve
      // güncel liste çiplerde çıkıyor — aynı bilgiyi iki yerde göstermek birinin eskimesi demek.
      return r.date_unavailable;
    case 'payment_not_allowed':
      return r.payment_not_allowed;
    case 'price_changed':
      return r.price_changed.replace(
        '{detail}',
        result.lines
          .map((line) => `${line.name}: ${formatPrice(line.fromCents, locale)} → ${formatPrice(line.toCents, locale)}`)
          .join(', '),
      );
    case 'customer_not_found':
      return r.customer_not_found;
    case 'insufficient_stock': {
      const name = resolveName(result.variantId);
      return name === null
        ? r.insufficient_stock
        : r.insufficient_stock_named.replace('{detail}', withCount(name, result.available));
    }
    case 'payment_unavailable':
      return r.payment_unavailable[result.reason];
    case 'order_not_placed':
      return r.order_not_placed;
    default: {
      const unreachable: never = result;
      return unreachable;
    }
  }
}

/**
 * Yerel ödeme kartının BAŞARISIZ sonuçları. `canceled` buraya girmez ve bu ayrım ekranın kendi
 * kararı: müşteri vazgeçmek bir hata değildir (kapının künyesi) — cümlesi de hata tonunda değil.
 */
export function paymentFailureMessage(outcome: Extract<PaymentSheetOutcome, { status: 'failed' }>, t: Messages): string {
  return t.paymentSheet[outcome.reason];
}

/**
 * Onay ekranına taşınan TESLİMAT satırı: rota-içi teslimatta seçilen GÜN, kargoda kargonun adı.
 *
 * Gün ISO'dan burada biçimleniyor (`formatDeliveryDate` — "Çarşamba, 13 Ağustos"): **saat aralığı
 * YOKTUR** ve bu bir eksiklik değil, sözleşmenin hükmü — teslimat gün düzeyinde sözleşilir
 * (`CheckoutDeliverySchema` künyesi), saat vaat etmek veride karşılığı olmayan bir söz olurdu.
 */
export function deliveryLabelOf(deliveryType: 'route' | 'shipping', date: string | null, t: Messages, locale: Locale): string {
  if (deliveryType === 'shipping') return t.confirmed.shipping;
  // Rota-içi ama gün yoksa (uygun tarih hiç dönmediyse) yolun ADI yazılır: uydurulmuş bir gün,
  // müşteriye verilmemiş bir söz olurdu.
  return date === null ? t.delivery.door : formatDeliveryDate(date, locale);
}
