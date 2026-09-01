import { OrderService, UserProfileService, serviceDb } from '@lezzet/database';
import type { Consent } from '@lezzet/types';

/**
 * **Müşteri BAĞLAMI** — "bu kişi kim, ne aldı, neye izin verdi" (15.5 + 16.3 ortak okuması).
 *
 * Ayrı bir okuma olmasının sebebi tek: aynı soruyu iki ekran soruyor. WhatsApp sohbetinin sağ
 * panosu ile talep detayı aynı üç şeyi istiyor — kimlik, son siparişler, pazarlama izni — ve ikisi
 * ayrı ayrı okusaydı biri gün gelip taslak bayrağını ya da izin ayrımını unuturdu.
 *
 * **Müşteri panelinin okuması bunun yerine GEÇMEZ ve geçmemeli:** orası bir yönetim ekranıdır
 * (vade, limit, karne, kupon, adres); burası bir yan panodur. Geniş okumayı yan panoya bağlamak,
 * her sohbet açılışında ödeme karnesi hesaplatmak olurdu.
 */
export interface CustomerContextData {
  customerId: string;
  name: string;
  phone: string | null;
  email: string | null;
  /** WhatsApp'tan otomatik açılmış, doğrulanmış girişten geçmemiş kayıt. */
  isDraft: boolean;
  isCompany: boolean;
  /** `null` = hiç sorulmamış; "reddetti" ile aynı şey DEĞİL ve ekranlar ikisini ayırır. */
  whatsappConsent: Consent | null;
  emailConsent: Consent | null;
  orders: ContextOrderRow[];
  /** Sınıra dayanıldı mı — ekran bunu YAZAR, sessizce kesmez. */
  ordersTruncated: boolean;
}

export interface ContextOrderRow {
  id: string;
  /** Referans numarası; henüz üretilmemişse (taslak sipariş) kimliğin başı tanıtır. */
  label: string;
  totalCents: number;
  href: string;
}

/**
 * Yan panoda gösterilen sipariş sayısı — PARAMETRİK ve tek yerde.
 *
 * Beş, çünkü pano bir sipariş listesi değil bir hatırlatma: "bu müşteri bizden alışveriş yapıyor mu,
 * ne büyüklükte". Onuncu sipariş kararı değiştirmiyor, sütunu uzatıyor.
 */
const CONTEXT_ORDER_LIMIT = 5;

/**
 * Siparişin operasyon yolu. Elle kurulmuyor ama `orders-url`'den de alınamıyor: burası `lib/`ve
 * sayfa sözleşmelerine bakmaz (STACK §4, bağımlılık tek yönlü). Yol tek bir yerde, burada.
 */
const ORDER_PATH = '/operations/orders';

export async function readCustomerContext(customerId: string, limit = CONTEXT_ORDER_LIMIT): Promise<CustomerContextData | null> {
  const db = serviceDb();
  const [profile, page] = await Promise.all([
    new UserProfileService(db).getById(customerId),
    // Sınırın BİR FAZLASI çekilir: "tam beş sipariş var" ile "beşten fazla var" farkı ancak böyle
    // bilinir ve ekran doğru cümleyi kurar. Fazladan satır listeye girmez.
    new OrderService(db).listByCustomer(customerId, { limit: limit + 1 }),
  ]);
  if (!profile) return null;

  return {
    customerId: profile.id,
    name: profile.name,
    phone: profile.phone,
    email: profile.email,
    isDraft: profile.isDraft,
    isCompany: profile.type === 'company',
    whatsappConsent: profile.marketingConsent.whatsapp ?? null,
    emailConsent: profile.marketingConsent.email ?? null,
    orders: page.rows.slice(0, limit).map((o) => ({
      id: o.id,
      label: o.referenceNo ?? `#${o.id.slice(0, 8)}`,
      totalCents: o.orderedTotalCents,
      href: `${ORDER_PATH}/${o.id}`,
    })),
    ordersTruncated: page.rows.length > limit,
  };
}
