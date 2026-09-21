import type { Locale } from '@lezzet/i18n';
import { resolveLocalizedText, type CheckoutSummary } from '@lezzet/types';
import type { CartDiscount } from './cart-types';

/**
 * İndirim satırının etiketi, sepet ve ödeme aynı cümleyi kursun diye burada; karar motorun ve sunucunun, burada yalnız
 * sebep sayfanın sözlüğüyle buluşur.
 */

/**
 * Sayfanın sözlüğünden gereken parçalar; dışa açılmaz, yapısal uyum yeter.
 */
interface DiscountLabelCopy {
  /** Satırın adı: "İndirim". */
  discount: string;
  /** Oranı bütün sepete inmeyen kampanya: "kampanya". */
  discountCampaign: string;
  /** Oranı bütün sepete inen kampanya: "kampanya %{percent}". */
  discountCampaignPercent: string;
}

/**
 * `locale` verilirse kampanyanın müşteriye görünen adı (varsa) o dilde yazılır. Verilmezse ad
 * ATLANIR ve bugünkü tür-temelli cümle kurulur — dilsiz bir çağıran, adı yanlış dilde basmaktansa
 * hiç basmasın.
 */
export function discountLabel(discount: CartDiscount, t: DiscountLabelCopy, locale?: Locale): string {
  /**
   * **Reddedilen kupon, sepetteki indirimin adını DÜŞÜRMEZ.** Kupon uygulanmadı ama sepete inen
   * indirim yerinde duruyor; satır hâlâ onu anlatmalı. Bu dal olmadan müşteri bir kupon denediği
   * an "İndirim — Baklava haftası" satırının "İndirim"e düştüğünü görüyordu: aynı para, iki ad.
   */
  const source =
    discount.status === 'rejected' && discount.appliedInstead
      ? discount.appliedInstead
      : discount.status === 'applied' || discount.status === 'automatic'
        ? discount
        : null;
  if (!source) return t.discount;

  // Kampanyanın kendi adı varsa hiçbir tahmine gerek yok: operatör müşteriye ne diyeceğini yazmış.
  // Kuponda bile ada öncelik verilir — "Hoş geldin indirimi", "HOSGELDIN10"dan daha çok şey söyler.
  const named = locale && source.label ? resolveLocalizedText(source.label, locale) : '';
  if (named) return `${t.discount} — ${named}`;

  // Kupon: ad yoksa sebep kodun kendisidir ve tasarımda birebir böyle yazılı.
  if (!('reason' in source)) return `${t.discount} — ${source.code}`;

  const { reason } = source;
  // Oran bilinmiyorsa sebep söylenir, sayı UYDURULMAZ (bkz. `DiscountReason`).
  return `${t.discount} — ${reason.percent == null ? t.discountCampaign : percent(t.discountCampaignPercent, reason.percent)}`;
}

/**
 * Yüzde metni sözlükten gelir, burada kurulmaz: Türkçe "%15" yazar, Fransızca "15 %" — işareti
 * koda gömmek dillerden birini yanlış yazmak olurdu.
 */
function percent(template: string, value: number): string {
  return template.replace('{percent}', String(value));
}

/**
 * Sipariş özetinin indirimi → aynı künye; özet çözülmüş sonucu taşır, sebep cümleleri sepetle paylaşılır.
 */
export function orderDiscountLabel(discount: CheckoutSummary['discount'], t: DiscountLabelCopy): string {
  if (!discount) return t.discount;
  if (discount.label) return `${t.discount} — ${discount.label}`;
  const reason = discount.reason;
  if (!reason) return t.discount;
  return `${t.discount} — ${reason.percent == null ? t.discountCampaign : percent(t.discountCampaignPercent, reason.percent)}`;
}
