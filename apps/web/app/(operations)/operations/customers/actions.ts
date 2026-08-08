'use server';

import { revalidatePath } from 'next/cache';
import {
  AddressService,
  DiscountCodeService,
  DiscountService,
  OrderService,
  PointsBalanceService,
  TicketService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import { isPointsEligible } from '@lezzet/domain-core';
import { DEFAULT_PAGE_SIZE, type Discount, type DiscountCode, type KeysetCursor } from '@lezzet/types';
import { requireAdmin } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { readOrderSummary, type OrderSummaryView } from '@/lib/order/summary';
import { readB2bCheck } from '@/lib/customer/b2b-check';
import { notifyB2bDecision } from '@/lib/b2b/application';
import { readCustomerScorecard, readOverdueCustomerIds, SCORECARD_WINDOW } from '@/lib/customer/scorecard';
import {
  acquisitionLabel,
  toConsentView,
  toCustomerAddressRows,
  toCustomerOrderRows,
  toCustomerRows,
  toPersonalCouponRows,
} from './customers-read';
import { CUSTOMERS_PATH, parseCustomersUrl, toCustomerFilters } from './customers-url';
import type { B2bCheckView, CreditFormInput, CustomerDetail, CustomerEditInput, CustomerRow } from './customers-types';

// Müşteri ekranı server action'ları — 'use server' + requireAdmin ilk + servise devret +
// `{ data, error }` DÖNER (throw yok) + revalidatePath.
//
// Guard `requireAdmin` HER action'da: vade/limit yazmak ve ödeme geçmişini görmek yönetici işidir
// (tasarım §6). Ekranın düğmeyi göstermemesi bir güvence değildir — action kendi kapısını kendi tutar.

/** Önizlemede gösterilen sipariş sayısı — geçmişin TAMAMI değil, "son ne aldı" sorusunun cevabı. */
const LAST_ORDERS_LIMIT = 5;

/**
 * Listenin SONRAKİ sayfası. Süzgeçler adresten okunur (`search`), böylece devam eden sayfa ilk
 * sayfayla aynı ölçüte uyar — client'ın süzgeci ayrıca taşımasına gerek kalmaz.
 */
export async function loadMoreCustomersAction(
  search: string,
  cursor: KeysetCursor,
): Promise<ActionResult<{ rows: CustomerRow[]; nextCursor: KeysetCursor | null }>> {
  try {
    await requireAdmin();
    const urlState = parseCustomersUrl(Object.fromEntries(new URLSearchParams(search)));

    const db = serviceDb();
    // Gecikme kümesi sonraki sayfada da GEREKLİ: rozet yalnız ilk sayfada görünürse operatör
    // "ikinci sayfada gecikme yok" sanır. Küme açık borçtur, tek tur ve küçük.
    const [page, overdueIds] = await Promise.all([
      new UserProfileService(db).list({ ...toCustomerFilters(urlState), cursor, limit: DEFAULT_PAGE_SIZE }),
      readOverdueCustomerIds(db),
    ]);
    return { data: { rows: toCustomerRows(page.rows, overdueIds), nextCursor: page.nextCursor }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Seçili müşterinin TÜRETİLMİŞ bilgisinin tamamı — karne, vade pozisyonu, adresler, izinler,
 * kuponlar, puan, edinim, talepler ve son siparişler.
 *
 * Seçimle okunur, listeyle değil: liste 30 satır getirirken satır başına bu turu atmak N+1'in en
 * pahalı hâli olurdu. Tasarım da bu bilgileri satırda değil panelde gösteriyor.
 *
 * **Hiçbir kural burada yazılmaz.** Ciro/sayı `order_counts()` agregasından, açık bakiye ve gecikme
 * `creditPosition`'dan, ödeme günü ölçümü `readCustomerScorecard`'tan, puan hakkı `isPointsEligible`'dan
 * gelir. Bu fonksiyonun işi tek turda toplamak.
 */
export async function readCustomerDetailAction(customerId: string): Promise<ActionResult<CustomerDetail>> {
  try {
    await requireAdmin();
    const db = serviceDb();
    const profiles = new UserProfileService(db);

    const profile = await profiles.getById(customerId);
    if (!profile) throw new Error('Müşteri bulunamadı.');

    const orders = new OrderService(db);
    const discounts = new DiscountService(db);

    const [totals, recent, scorecard, addresses, coupons, points, ticketCount, openTicketCount, referrer] = await Promise.all([
      // `counts({ customerIds })` DEĞİL: orada müşteri süzgeci arama grubunun içinde durur ve terim
      // olmadan hiç uygulanmaz — her müşteri kartı işletmenin TAMAMININ cirosunu gösteriyordu
      // (ölçüldü 30.07: 28 sipariş / 1777 €, gerçek 10 / 990 €). Bu RPC dar ve doğru soruyu sorar,
      // iptal edilen siparişi de ciroya katmaz.
      orders.customerTotals(customerId),
      orders.listByCustomer(customerId, { limit: LAST_ORDERS_LIMIT }),
      readCustomerScorecard(db, customerId, profile.paymentTermDays),
      new AddressService(db).listByCustomer(customerId),
      discounts.listByCustomer(customerId),
      // Puan YALNIZ B2C'de anlamlı (DOMAIN §14): şirket müşterisinde defter hiç okunmaz, çünkü
      // ekranda "0 puan" göstermek "kazanabilir ama kazanmamış" demektir — oysa kazanamaz.
      isPointsEligible(profile.type) ? new PointsBalanceService(db).getByCustomer(customerId) : Promise.resolve(null),
      new TicketService(db).countByCustomer(customerId),
      // SAYIM, sayfa uzunluğu değil: 50'lik bir sayfayı çekip satır saymak, tam da sayının anlam
      // kazandığı yerde (çok talep açmış müşteride) tavana takılıp yalan söylerdi.
      new TicketService(db).countOpenByCustomer(customerId),
      profile.referredBy ? profiles.getById(profile.referredBy) : Promise.resolve(null),
    ]);

    // Kupon kodları ve kullanım sayıları kupon VARSA okunur — kuponsuz müşteride iki boş tur atmanın
    // gerekçesi yok.
    const ruleIds = coupons.map((c: Discount) => c.id);
    const [codes, usage] = ruleIds.length
      ? await Promise.all([new DiscountCodeService(db).listByDiscounts(ruleIds), discounts.usageCounts(ruleIds)])
      : [new Map<string, DiscountCode[]>(), new Map<string, { total: number }>()];

    return {
      data: {
        customerId,
        revenueCents: totals.revenueCents,
        orderCount: totals.orderCount,
        avgPaymentDays: scorecard.avgPaymentDays,
        paidOrderCount: scorecard.paidOrderCount,
        latePaymentCount: scorecard.latePaymentCount,
        scorecardWindow: SCORECARD_WINDOW,
        openBalanceCents: scorecard.openBalanceCents,
        overdueCount: scorecard.overdueCount,
        termDays: scorecard.termDays,
        defaultTermDays: scorecard.defaultTermDays,
        customTermDays: profile.paymentTermDays,
        creditEnabled: profile.creditEnabled,
        creditLimitCents: profile.creditLimitCents,
        codAllowed: profile.codAllowed,
        discountPercent: profile.discountPercent,
        addresses: toCustomerAddressRows(addresses),
        consent: {
          email: toConsentView(profile.marketingConsent.email),
          whatsapp: toConsentView(profile.marketingConsent.whatsapp),
        },
        pointsBalance: points?.balance ?? null,
        personalCoupons: toPersonalCouponRows(coupons, codes, usage),
        acquisitionSource: acquisitionLabel(profile.acquisitionSource),
        referredByName: referrer?.name ?? null,
        openTicketCount,
        ticketCount,
        lastOrders: toCustomerOrderRows(recent.rows),
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Sipariş ÖZETİ — sipariş kartına tıklanınca açılan diyaloğun verisi.
 *
 * Okuma `lib/order/summary`'de ve orada olması şart: müşteri ekranına özel bir okuma olsaydı ödeme
 * durumunun türetilmesi iki yerde yaşardı. Diyalog bir GÖZ ATMADIR — eylemler (durum geçişi,
 * tahsilat, iade) sipariş detay sayfasında kalır ve diyalog oraya köprü verir.
 */
export async function readOrderSummaryAction(orderId: string): Promise<ActionResult<OrderSummaryView>> {
  try {
    await requireAdmin();
    const summary = await readOrderSummary(serviceDb(), orderId);
    if (!summary) throw new Error('Sipariş bulunamadı.');
    return { data: summary, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * B2B başvurusunun kontrol kartı — diyalog açılınca okunur, seçimle DEĞİL.
 *
 * Dört okuma (profil · adres · teslim bölgeleri · mükerrer adayları) yalnız profesyonel müşteride ve
 * yalnız diyalog açıldığında anlamlı. `CustomerDetail`e katılsaydı her seçimde, her müşteride, hiç
 * açılmayacak bir kart için atılırdı.
 */
export async function readB2bCheckAction(customerId: string): Promise<ActionResult<B2bCheckView>> {
  try {
    await requireAdmin();
    const check = await readB2bCheck(serviceDb(), customerId);
    if (!check) throw new Error('Müşteri bulunamadı.');
    return { data: check, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * B2B başvurusunu onaylar / reddeder.
 *
 * **Onay YALNIZ toptan fiyatı açar** (tasarımın altına yazdığı kural): vade/limit ayrı bir karardır ve
 * ayrı diyalogda verilir. Burada `creditEnabled`e dokunulmaması bilinçli — onayla birlikte vade açmak,
 * hiç değerlendirilmemiş bir müşteriye limitsiz vade vermek olurdu.
 *
 * **Ret SİLMEZ**: kayıt B2C olarak kalır, müşteri perakende fiyatla alışverişe devam eder.
 * Reddedilen bir başvuruyu silmek, aynı kişinin yarın yeniden başvurmasında geçmişi bilmemek demekti.
 *
 * ── RET ARTIK DAMGALANIYOR (04.08, arka uç bildirimi) ────────────────────────
 * Bir tur ret `setB2bApproval(id, false)` ile yazılıyordu ve o çağrı yalnız `b2bApproved`'ı `false`
 * yapıyordu — yani **ret fiilen kaydedilmiyordu**: aynı değeri hiç karar verilmemiş başvuru da
 * taşıdığı için reddettiğimiz kayıt listede "Onay bekliyor" olarak durmaya devam ediyordu.
 * `rejectB2b` kim/ne zaman/neden damgasını basıyor; gerekçenin zorunluluğunu da tip değil VERİ
 * zorluyor (`user_profiles_b2b_reject_stamp`).
 *
 * **Kararı veren KİŞİ yazılır** (`actorId`): "bu başvuruyu kim reddetti" sorusunun cevabı, ret
 * müşteriye e-postayla gittiği için gerekli — cevabı olmayan bir karar savunulamaz.
 */
export async function setB2bApprovalAction(customerId: string, approved: boolean, reason = ''): Promise<ActionResult> {
  try {
    const actor = await requireAdmin();
    const profiles = new UserProfileService(serviceDb());
    if (approved) await profiles.approveB2b(customerId);
    else await profiles.rejectB2b(customerId, { actorId: actor.profileId, reason });
    // Sonuç başvurana bildirilir (14.10 · arka uç şeridi). Bu satır YAZILANA KADAR gerekçe veride
    // zorunluydu, üç dile çevriliyordu ve hiçbir okuyucuya ulaşmıyordu — yukarıdaki künyenin
    // "müşteriye e-postayla gidiyor" sözü karşılıksızdı.
    //
    // Beklenmiyor (`void`): mail gitmedi diye kararı geri almak yanlış olurdu; karar zaten yazıldı.
    void notifyB2bDecision(customerId, approved);
    revalidatePath(CUSTOMERS_PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Vade yetkisi + limit + vade süresi. ÜÇÜ TEK action'da çünkü tek karardır: vade açmak, "ne kadara
 * kadar ve kaç güne" sorusunu da yanıtlamak demektir.
 *
 * **Limit boş bırakılabilir ama "sınırsız" DEMEK DEĞİL.** Motor (`resolveCheckoutPayment`) tanımsız
 * limiti "önceden onaylanmış tutar yok" sayar: her vadeli sipariş `creditRequiresApproval` ile admin
 * onayına düşer, otomatik geçmez. Ekran bunu böyle yazar — bir tur "sınırsız vade" yazıyordu ve o
 * cümle operatöre çalışmayan bir yetki açtırırdı. Vade KAPALIYSA limit de temizlenir: kapalı bir
 * yetkinin altında duran sayı, bir gün yetki açıldığında kimsenin hatırlamadığı bir limit olurdu.
 *
 * Açık bakiye ve gecikme YAZILMAZ, türetilir (tasarım §6): burada yazılan yalnız üç niyet alanı.
 */
export async function setCustomerCreditAction(customerId: string, input: CreditFormInput): Promise<ActionResult> {
  try {
    await requireAdmin();
    if (input.creditLimitCents !== null && (!Number.isFinite(input.creditLimitCents) || input.creditLimitCents < 0)) {
      throw new Error('Limit negatif olamaz.');
    }
    if (input.paymentTermDays !== null && (!Number.isInteger(input.paymentTermDays) || input.paymentTermDays < 1)) {
      throw new Error('Vade süresi en az 1 gün olmalı.');
    }

    await new UserProfileService(serviceDb()).update({
      id: customerId,
      creditEnabled: input.creditEnabled,
      creditLimitCents: input.creditEnabled && input.creditLimitCents !== null ? Math.round(input.creditLimitCents) : null,
      paymentTermDays: input.creditEnabled ? input.paymentTermDays : null,
    });
    revalidatePath(CUSTOMERS_PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Müşteri kimlik/iletişim bilgisi + iki ticari ayar (kapıda ödeme izni, genel indirim oranı).
 *
 * **Kapıda ödeme ve indirim oranı bir tur AYRI action'lardaydı** (`setCodAllowedAction`,
 * `setDiscountPercentAction`) çünkü panelde ayrı ayrı yazılıyorlardı. İkisi de `Düzenle` formuna
 * taşınınca (kullanıcı kararı 30.07) ayrı kalmalarının bir gerekçesi kalmadı: aynı formun üç yazma turu
 * atması, ikincisi düşerse yarısı kaydedilmiş bir form demekti. Tek `update` = tek satır, tek sonuç.
 *
 * Telefon ve e-posta KİMLİK anahtarlarıdır ve tekildir — çakışma DB kısıtından döner ve okunur bir
 * hataya çevrilir (kuralı burada tekrar yazmak, iki yerde yaşayan bir tekillik ölçütü demekti).
 * Boş bırakılan telefon/e-posta `null` yazılır: boş dize bir kimlik anahtarı değildir ve tekillik
 * indeksinde ikinci bir boş dizeyle çakışırdı.
 *
 * İndirimde sıfır ile `null` AYNI ŞEY DEĞİL: `0` "oranı var ama sıfır" der ve müşteri fiyat ekranındaki
 * "indirim oranı tanımlı müşteriler" listesinde görünmeye devam eder; `null` o listeden düşer. Bu yüzden
 * sıfır girilirse oran KALDIRILIR — operatörün "indirimi kaldır" niyeti tam olarak bu.
 */
export async function updateCustomerAction(customerId: string, input: CustomerEditInput): Promise<ActionResult> {
  try {
    await requireAdmin();
    const name = input.name.trim();
    if (!name) throw new Error('Ad girilmeli.');
    const oran = input.discountPercent;
    if (oran !== null && (!Number.isFinite(oran) || oran < 0 || oran > 100)) {
      throw new Error('İndirim oranı %0 ile %100 arasında olmalı.');
    }

    await new UserProfileService(serviceDb()).update({
      id: customerId,
      name,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      preferredLanguage: input.preferredLanguage,
      country: input.country,
      type: input.type,
      vatNumber: input.vatNumber?.trim() || null,
      codAllowed: input.codAllowed,
      discountPercent: oran === null || oran === 0 ? null : oran,
    });
    revalidatePath(CUSTOMERS_PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * **GDPR silme** (09.10) — kişisel veriyi boşaltır, kaydı bırakır.
 *
 * Kapı tek çağrı (`anonymize`) ve kuralın tamamı onun içinde; buradaki iş yetkiyi sormak ve hatayı
 * Türkçeye çevirmek. **Fırlatırsa iş YAPILMAMIŞTIR** — o yüzden hata yutulmuyor, ekranda görünüyor.
 *
 * **Satır silinmez, kimliği boşalır:** `order` profile `restrict` ile bağlı, silme zaten
 * veritabanınca reddedilirdi. Fatura kayıtları ve üstündeki ad-adres KALIR (Fransız hukuku faturanın
 * bunları içermesini zorunlu kılıyor). Giden şey adres defteri, talep yazışmaları, bildirim
 * istekleri, puan geçmişi, kişisel fiyat/kupon ve yorum METİNLERİ; ürün PUANI kimliksiz kalır —
 * silinseydi bir müşterinin ayrılması, başkalarının gördüğü ürün skorunu geriye dönük değiştirirdi.
 *
 * **İdempotent ama telafisiz:** ikinci çağrı sessizce çıkar ve damga ilk silmenin tarihinde kalır.
 * Yani "iki kez bastım" zararsız, "yanlış müşteriye bastım" geri alınamaz — onay diyaloğunun
 * ciddiyeti buradan geliyor, ekranın kendi tercihinden değil.
 */
export async function anonymizeCustomerAction(customerId: string): Promise<ActionResult> {
  try {
    await requireAdmin();
    await new UserProfileService(serviceDb()).anonymize(customerId);
    revalidatePath(CUSTOMERS_PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
