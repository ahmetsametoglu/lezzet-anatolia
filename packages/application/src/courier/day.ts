import {
  AddressService,
  OrderItemService,
  OrderService,
  OrderStatusLogService,
  ProductService,
  ProductVariantService,
  SettingsService,
  UserProfileService,
} from '@lezzet/database';
import { canTransition, whatsAppLink, type MessageLocale } from '@lezzet/domain-core';
import { logger } from '@lezzet/observability';
import { resolveLocalizedText } from '@lezzet/types';
import type { Order, OrderItem, OrderStatusLog } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Kuryenin gün listesi (11.1), günü başlatması (K1) ve kapıdaki iki olumsuz sonuç (11.4) —
 * **uygulama katmanı orkestrasyonu**. `design/pages/kurye-gun.md` + `kurye-teslimat.md` bağlayıcı.
 *
 * Terfi 21.10 (kaynağı `apps/web/lib/courier/day.ts`): aynı gün listesini hem operasyon web ekranı
 * hem mobil "Yol" bölümü (K1/K5) okuyacak — paketin kabul ölçütü tam olarak bu (`index.ts`). Web
 * kopyası geçiş köprüsüdür, benimsemesi ayrı talep dosyasıyla gider.
 *
 * **Kurye para GÖRÜR ama yalnız bir tanesini:** tahsil edeceği tutarı. Maliyet, kâr, marj, alış
 * fiyatı, müşterinin vade/limit/borç durumu dönen görünüm modelinde YOKTUR — depo kuyruğuyla aynı
 * yapısal sınır (tasarım §6). Ekran isteseydi bile gösteremez.
 *
 * **"Yalnız kendi teslimatları" imzada durur:** `courierId` zorunlu parametredir, süzgeç değil.
 */

/** Kapıdaki durak — sipariş künyesi + teslimat için gereken her şey; fazlası yok. */
export interface CourierStop {
  orderId: string;
  referenceNo: string | null;
  customerName: string;
  /** B2B/B2C — kapıda teslim onayı beklentisini baştan kurar. */
  channel: Order['channel'];
  /** Navigasyon bu metin üzerinden açılır; sipariş anındaki kopya (adres sonradan düzelse de sabit). */
  address: string | null;
  phone: string | null;
  /** Tek dokunuşluk "yoldayım" — müşterinin DİLİNDE. Numara yoksa null: düğme hiç gösterilmez. */
  whatsAppLink: string | null;
  /** Kapıda ödenecek mi, ödendi mi — kuryenin duraktaki en kritik bilgisi. */
  payment: {
    /** `null` = önceden ödenmiş; para konuşulmaz. Birim **cent** (02.9). */
    dueAmountCents: number | null;
    expectedMethod: Order['paymentMethod'];
  };
  /** Araçtan doğru koliyi almak için: kaç kalem, ne var. */
  itemCount: number;
  contentSummary: string;
  /**
   * Kapıdaki KALEM SATIRLARI (21.10d). `orderItemId` olmadan kısmi iade yazılamaz — kapı
   * (`confirmDoorDelivery`) `adjustments[].orderItemId` istiyor ve mobil istemcinin o kimliği
   * öğrenebileceği başka bir yol yoktu.
   *
   * **İKİNCİ OKUMA AÇILMADI:** satırlar özetin (`contentSummary`) türetildiği AYNI kalem
   * kayıtlarından ve AYNI ad haritasından çıkıyor — ekstra bir sorgu yok.
   */
  items: CourierStopItem[];
  /** Kapıdaki sonuç — sistemin iç durumu değil, kuryenin gördüğü hâl. */
  outcome: StopOutcome;
  /** Ulaşılamadıysa kaçıncı denemede olduğu; listede kaybolmaz, tekrar denenir. */
  attempts: number;
}

/** Durağın tek kalemi — kapıda işaretlenebilmesi için KİMLİĞİYLE. */
export interface CourierStopItem {
  orderItemId: string;
  /** Kuryeye görünen ad — "Ürün (boy)"; operasyon dili Türkçe (CLAUDE.md §2). */
  name: string;
  /** SİPARİŞ EDİLEN adet; kapıda eksik çıkan miktar bundan indirilerek gönderilir. */
  qty: number;
}

/**
 * Durağın sonucu. **Sistemin `status`'ü doğrudan yansıtılmaz:** "ulaşılamadı" ile "henüz sıra
 * gelmedi" ikisi de `ready`'dir (ulaşılamayan sipariş `ready`'e geri döner, mal ayrılmış kalır) —
 * ayrım geçiş geçmişinden TÜRETİLİR, ayrı bir kolon tutulmaz.
 */
export type StopOutcome = 'pending' | 'delivered' | 'unreachable' | 'refused';

/**
 * **Kuryenin günü.** Gün verilmezse bugün. Sonuçlanmış duraklar da listede kalır: gün ortasında
 * "ne yaptım" sorusunun cevabı ve ulaşılamayanların geri dönülecek listesi budur.
 *
 * @param db service-role istemci — çağıran enjekte eder (`serviceDb()`), `auth/otp` deseni.
 */
export async function listCourierDay(
  db: SupabaseClient,
  input: {
    courierId: string;
    date?: string;
    locale?: MessageLocale;
  },
): Promise<CourierStop[]> {
  const date = input.date ?? new Date().toISOString().slice(0, 10);
  const orders = await new OrderService(db).listByCourier(input.courierId, { deliveryDate: date });
  if (orders.length === 0) return [];

  const orderIds = orders.map((order) => order.id);
  const [items, logs, customers, addresses] = await Promise.all([
    new OrderItemService(db).listByOrders(orderIds),
    new OrderStatusLogService(db).listByOrders(orderIds),
    customerCards(db, orders),
    addressTexts(db, orders),
  ]);
  const names = await variantNames(db, items);

  return orders.map((order) => {
    const lines = items.filter((item) => item.orderId === order.id);
    const customer = customers.get(order.customerId);
    const attempts = failedAttempts(logs, order.id);

    return {
      orderId: order.id,
      referenceNo: order.referenceNo,
      customerName: customer?.name ?? '—',
      channel: order.channel,
      address: addresses.get(order.id) ?? null,
      phone: customer?.phone ?? null,
      whatsAppLink: whatsAppLink({
        phone: customer?.phone,
        locale: input.locale ?? 'fr',
        customerName: customer?.name,
      }),
      payment: {
        dueAmountCents: amountDueCents(order),
        expectedMethod: order.paymentMethod,
      },
      itemCount: lines.length,
      contentSummary: summarize(lines, names),
      items: lines.map((line) => ({
        orderItemId: line.id,
        name: names.get(line.variantId) ?? '—',
        qty: line.qty,
      })),
      outcome: outcomeOf(order.status, attempts),
      attempts,
    };
  });
}

/**
 * **Kapıda tahsil edilen paranın gireceği hesap** (21.10d) — `door_cash_account_id` ayarından.
 *
 * Ayrı bir kapı olmasının sebebi imza: `listCourierDay` durak DİZİSİ döndürüyor ve bu değer gün
 * başına tekildir; dizinin her elemanına kopyalamak aynı kimliği N kez taşımak ve "durakta başka
 * hesap olabilir" diye yanlış bir beklenti kurmak olurdu. Çağıran ikisini birlikte okur (mobil uç
 * `/courier/day` cevabında birleştiriyor; operasyon web ekranı aynı anahtarı kendi okumasında
 * okuyor — `deliveries/[orderId]/delivery-read.ts`).
 *
 * **Kullanılamaz ayar `null` döner, uydurma bir kimlik DÖNMEZ.** Ayar elle yazılabilir bir jsonb
 * değeridir; operatör oraya bir hesap ADI yazarsa `null` döner ve tahsilat kapısı kapalı kalır —
 * kapıda alınan paranın olmayan bir hesaba yazılmasından iyidir. Sessiz de değil: kayıt düşer
 * (anahtar yazılır, değer YAZILMAZ — teşhis için anahtar yeter, CLAUDE.md §1).
 */
/** Ayarın hesap kimliği olup olmadığının tek ölçütü — sözleşme de uuid istiyor (`doorAccountId`). */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function readDoorCashAccountId(db: SupabaseClient): Promise<string | null> {
  const raw = await new SettingsService(db).get<unknown>('door_cash_account_id', null);
  if (typeof raw !== 'string') {
    if (raw !== null && raw !== undefined) {
      logger.warn({ setting: 'door_cash_account_id' }, 'kapı kasası ayarı metin değil — tahsilat kapısı kapalı');
    }
    return null;
  }

  const value = raw.trim();
  if (value.length === 0) return null;
  if (!UUID_PATTERN.test(value)) {
    logger.warn({ setting: 'door_cash_account_id' }, 'kapı kasası ayarı hesap kimliği değil — tahsilat kapısı kapalı');
    return null;
  }
  return value;
}

/**
 * **"Yola çıktım"ın sonucu** (K1 · 21.10d) — dört liste, tek `ok` değil.
 *
 * Toplu yazımın en tehlikeli hâli "kısmen oldu"dur: üç durak yola çıkıp dördüncüsü çıkmazsa ve cevap
 * yalnız "başladı" derse, kurye o durakta teslim yazamadığında sebebini bilemez (kapı sırası: teslim
 * yalnız YOLDAKİ siparişten olur). Bu yüzden kısmi başarı GÖRÜNÜR.
 */
export interface CourierDayStart {
  date: string;
  /** `ready → out_for_delivery` yazılanlar. */
  started: string[];
  /** Zaten yoldaydı — ikinci çağrı hata değil, "yeni bir şey yok" cevabı. */
  alreadyOut: string[];
  /** Araya biri girdi: `ready` okundu, yazarken durum değişmişti. */
  stale: { orderId: string; currentStatus: Order['status'] }[];
  /** Durumu `ready` değil — henüz hazırlanmadı ya da gün içinde kapandı. */
  skipped: { orderId: string; currentStatus: Order['status'] }[];
}

/**
 * **Günü başlat** (K1) — günün HAZIR siparişlerini yola çıkarır.
 *
 * Web emsali sipariş BAŞINA çalışıyor (`deliveries/[orderId]/actions.ts` → `startDeliveryAction`):
 * kurye durağı açıp "Yola çıktım" diyor. Mobil v2 aynı işareti GÜN başına soruyor (K1'in birincil
 * düğmesi: *"Yola çıktım — günü başlat"*) çünkü sahadaki gerçek fiil budur — araca yüklenen tek bir
 * durak değil, günün kolileridir. İki yüzey aynı geçişi yazıyor, kapsamı farklı.
 *
 * **Yalnız `ready` olanlar aday.** `confirmed`/`preparing` bir sipariş motorca yola çıkarılabilir
 * (`canTransition('confirmed','out_for_delivery')` izinli — küçük sipariş hazırlığı atlayabilir) ama
 * bunu KURYENİN toplu düğmesi yapmaz: hazırlığı atlanan siparişin parti kaydı yazılmamıştır ve
 * teslimde mal hangi partiden düşecek sorusu cevapsız kalır. Atlanan durak gizlenmiyor, `skipped`
 * listesinde durumuyla dönüyor — ekran "1 durak hazırlanmayı bekliyor" diyebilir.
 *
 * **Geçişin izni motora sorulur** (`canTransition`), burada hesaplanmaz: bir gün `ready` kenarı
 * kapanırsa bu kapı yazmayı bırakır, kendi kopyasına göre yazmaya devam etmez.
 *
 * @param db service-role istemci — çağıran enjekte eder (`serviceDb()`), `auth/otp` deseni.
 */
export async function startCourierDay(
  db: SupabaseClient,
  input: { courierId: string; date?: string },
): Promise<CourierDayStart> {
  const date = input.date ?? new Date().toISOString().slice(0, 10);
  const orders = new OrderService(db);
  // Gün listesiyle AYNI okuma ("yalnız kendi teslimatları" imzada durur) — görünüm modeli
  // gerekmediği için durak kurulmuyor, ham sipariş yeterli.
  const rows = await orders.listByCourier(input.courierId, { deliveryDate: date });

  const result: CourierDayStart = { date, started: [], alreadyOut: [], stale: [], skipped: [] };

  for (const order of rows) {
    if (order.status === 'out_for_delivery') {
      result.alreadyOut.push(order.id);
      continue;
    }
    if (order.status !== 'ready' || !canTransition(order.status, 'out_for_delivery').allowed) {
      result.skipped.push({ orderId: order.id, currentStatus: order.status });
      continue;
    }

    const transitioned = await orders.transition({
      orderId: order.id,
      from: order.status,
      to: 'out_for_delivery',
      actorId: input.courierId,
    });
    if (transitioned.ok) result.started.push(order.id);
    else result.stale.push({ orderId: order.id, currentStatus: transitioned.currentStatus });
  }

  return result;
}

/**
 * Kapıda tahsil edilecek tutar. **Hesap burada yapılmaz, okunur:** sipariş toplamından tahsil
 * edilmiş net düşülür — eksik kalem işaretlendiğinde tutarı düşüren de aynı türetimdir (07.8),
 * kurye ayrıca bir hesap görmez.
 *
 * `null` = borç yok (önceden ödenmiş).
 *
 * "Kuruş altı kalıntı sıfır sayılır" kuralı KALKTI (02.9) ve kalkması gerekiyordu: hesap artık
 * tamsayı cent üstünde yapılıyor, yani 0,004 € gibi bir kalıntı ARTIK DOĞAMAZ. O eşik kayan nokta
 * çıkarmasının ürettiği çöpü süpürmek içindi; sebep ortadan kalkınca eşik de bir sayıyı sessizce
 * yutan gereksiz bir kapıya dönüşürdü.
 */
function amountDueCents(order: Order): number | null {
  const dueCents = order.totalCents - (order.amountCollectedCents - order.amountRefundedCents);
  return dueCents > 0 ? dueCents : null;
}

/**
 * Kapıdaki sonuç. `out_for_delivery` yolda demektir; `ready`'e dönmüş sipariş DENENMİŞ ve
 * ulaşılamamıştır — ayrımı deneme sayısı verir.
 */
function outcomeOf(status: Order['status'], attempts: number): StopOutcome {
  if (status === 'delivered' || status === 'completed') return 'delivered';
  if (status === 'returned') return 'refused';
  return attempts > 0 && status === 'ready' ? 'unreachable' : 'pending';
}

/** Kaç kez yola çıkılıp geri dönüldü — `out_for_delivery → ready` geçişlerinin sayısı. */
function failedAttempts(logs: readonly OrderStatusLog[], orderId: string): number {
  return logs.filter(
    (log) => log.orderId === orderId && log.fromStatus === 'out_for_delivery' && log.toStatus === 'ready',
  ).length;
}

export type UndeliveredOutcome =
  | { status: 'ok'; outcome: 'unreachable' | 'refused'; currentStatus: Order['status'] }
  /** Sipariş bu kuryenin değil — başkasının durağı bu ekrandan kapatılamaz. */
  | { status: 'forbidden'; reason: 'not_assigned' | 'same_status' | 'terminal' | 'not_allowed' }
  | { status: 'stale'; currentStatus: Order['status'] }
  | { status: 'not_found' };

/**
 * **Ulaşılamadı / reddedildi** (11.4). İki ayrı işaret, iki ayrı akıbet — tek "teslim edilemedi"
 * düğmesine sıkıştırılmaz, çünkü ayrım stok ve iade sürecinin temelidir:
 *
 * - **Ulaşılamadı** (evde yok, kapı açılmadı) → `ready`. Mal araçta, **ayrılmış kalır**; stok HİÇ
 *   değişmez (ORDER_LIFECYCLE). Sipariş yarın yeniden denenir.
 * - **Reddedildi** (müşteri kabul etmedi) → `returned`. Mal depoya döner; stoğa geri alma/imha
 *   kararı **depocunundur** (DOMAIN §8) — kurye yalnız işaret koyar, akıbeti seçmez.
 *
 * Not kısa ve serbesttir ("zil bozuk"): sebebi standartlaştırmak sahada doğru seçeneği aramaya
 * zorlar, kurye de en yakınına basar — yanlış veri, doğru görünümlü olur. **Not durum kaydına
 * yazılır** (`order_status_log.note`, düzeltme 95428fb): yazılmasaydı kuryenin kapıda girdiği tek
 * serbest bilgi hiçbir yere düşmezdi.
 */
export async function markUndelivered(
  db: SupabaseClient,
  input: {
    orderId: string;
    courierId: string;
    outcome: 'unreachable' | 'refused';
    note?: string | null;
  },
): Promise<UndeliveredOutcome> {
  const orders = new OrderService(db);
  const order = await orders.getById(input.orderId);
  if (!order) return { status: 'not_found' };
  if (order.courierId !== input.courierId) return { status: 'forbidden', reason: 'not_assigned' };

  const to = input.outcome === 'unreachable' ? 'ready' : 'returned';
  const verdict = canTransition(order.status, to);
  if (!verdict.allowed) return { status: 'forbidden', reason: verdict.reason };

  const result = await orders.transition({
    orderId: input.orderId,
    from: order.status,
    to,
    actorId: input.courierId,
    note: input.note ?? null,
  });
  if (!result.ok) return { status: 'stale', currentStatus: result.currentStatus };

  return { status: 'ok', outcome: input.outcome, currentStatus: result.currentStatus };
}

/** Koli özeti: "2 × Fıstıklı Baklava, 1 × Mantı". Uzun listede ilk üç kalem + kalanın sayısı. */
function summarize(lines: readonly OrderItem[], names: Map<string, string>): string {
  const shown = lines.slice(0, 3).map((line) => `${line.qty} × ${names.get(line.variantId) ?? '—'}`);
  const rest = lines.length - shown.length;
  return rest > 0 ? `${shown.join(', ')} +${rest}` : shown.join(', ');
}

/** Müşteri künyesi — ad ve telefon. Vade/limit/borç ve sipariş geçmişi OKUNMAZ (tasarım §6). */
async function customerCards(
  db: SupabaseClient,
  orders: readonly Order[],
): Promise<Map<string, { name: string; phone: string | null }>> {
  const profiles = new UserProfileService(db);
  const map = new Map<string, { name: string; phone: string | null }>();
  for (const customerId of new Set(orders.map((order) => order.customerId))) {
    const profile = await profiles.getById(customerId);
    if (profile) map.set(customerId, { name: profile.name, phone: profile.phone });
  }
  return map;
}

/**
 * Durak adresi. Önce siparişin **anlık kopyası** (`addressSnapshot`) okunur: adres kaydı sonradan
 * düzeltilse bile kuryenin gideceği yer siparişin verildiği andaki adrestir.
 */
async function addressTexts(db: SupabaseClient, orders: readonly Order[]): Promise<Map<string, string>> {
  const addresses = new AddressService(db);
  const map = new Map<string, string>();

  for (const order of orders) {
    const snapshot = order.addressSnapshot as Record<string, unknown> | null;
    const source = snapshot ?? (order.addressId ? await addresses.getById(order.addressId) : null);
    if (!source) continue;

    const parts = [source['line1'], source['line2'], source['postalCode'], source['city']]
      .filter((part): part is string => typeof part === 'string' && part.trim().length > 0);
    if (parts.length > 0) map.set(order.id, parts.join(', '));
  }
  return map;
}

/** Varyant → "Ürün (boy)". Operasyon yüzeyi Türkçedir (CLAUDE.md §2). */
async function variantNames(db: SupabaseClient, items: readonly OrderItem[]): Promise<Map<string, string>> {
  const variants = await new ProductVariantService(db).listByIds([...new Set(items.map((item) => item.variantId))]);
  const products = await new ProductService(db).listByIds([...new Set(variants.map((variant) => variant.productId))]);
  const productOf = new Map(products.map((product) => [product.id, product]));

  return new Map(
    variants.map((variant) => {
      const name = resolveLocalizedText(productOf.get(variant.productId)?.name ?? {}, 'tr');
      const label = resolveLocalizedText(variant.label, 'tr');
      return [variant.id, label ? `${name} (${label})` : name];
    }),
  );
}
