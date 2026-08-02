import {
  FeedbackRequestService,
  OrderItemService,
  OrderService,
  OrderStatusLogService,
  ProductVariantService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import { localizedUrl } from '@lezzet/i18n';
import { defaultNotifier, formatMessageDate, type NotifyChannel, type NotifyRecipient, type NotifyResult } from '@lezzet/notify';
import { captureError, logger, SOURCES } from '@lezzet/observability';
import type { FeedbackChannel, FeedbackInviteNotification, FeedbackRequest, PreferredLanguage } from '@lezzet/types';

export const SEND_FEEDBACK_INVITES = 'send_feedback_invites';

/**
 * Değerlendirme davetlerinin GÖNDERİMİ (17.2) — DOMAIN §14.
 *
 * **Oluşturma ile gönderim neden iki ayrı iş:** e-posta sağlayıcısı düştüğünde davet kaybolmaz,
 * `sent_at` boş olarak kuyrukta kalır ve bir sonraki tur onu bulur. Tek adım olsaydı sağlayıcı
 * hatası daveti hiç var olmamış yapardı — üstelik sessizce, çünkü tarama "0 oluşturuldu" değil
 * "1 oluşturuldu" yazardı.
 *
 * Bu iş kuyruğu BOŞALTIR: "bugün oluşturulanlar"a değil, gönderilmemiş TÜM davetlere bakar. Kaçan
 * bir tur ertesi turda telafi olur ve ikinci tur no-op'tur (damga atılmışları görmez).
 *
 * **Kanal kararı burada verilmez.** İş "müşteriye daveti gönder" der; e-postası olana mail,
 * olmayana WhatsApp bağlantısı düşer (`@lezzet/notify` sürücü sırası). Zamanlı iş kendi kanal
 * mantığını kursaydı, aynı müşteri sipariş mailini bir kanaldan, davetini başkasından alırdı.
 */

/** Bir turun özeti — ize yazılır ve testin okuduğu şey de budur. */
interface InviteSendSummary {
  /** Kuyrukta bulunan davet sayısı. */
  pending: number;
  /** Gerçekten giden (damgalanan) davet sayısı. */
  sent: number;
  /**
   * Gönderilemeyen — kuyrukta KALIR. Sağlayıcı anahtarı yokken (yerel geliştirme) burası dolar ve
   * bu bir arıza değildir; sayının kendisi de bilgi taşır, o yüzden ayrı tutulur.
   */
  skipped: number;
  /** Verisi kurulamayan davet (sipariş ya da müşteri kaydı yok) — izlenmeli. */
  unbuildable: number;
}

/**
 * Kuyruğu boşaltır. `limit` bir turda kaç davetin denendiğidir; kalanı sonraki tura kalır.
 *
 * **Sıralı gönderilir, paralel değil.** Kuyruk normalde küçük (günlük tarama kadar) ve sağlayıcıya
 * aynı anda yüz istek atmak hız kazandırmaz, hız sınırına takılma riski getirir. Bir davetin
 * düşmesi diğerlerini durdurmaz: her biri kendi damgasını taşır.
 */
export async function sendPendingFeedbackInvites(opts: { limit?: number } = {}): Promise<InviteSendSummary> {
  const db = serviceDb();
  const requests = new FeedbackRequestService(db);
  const pending = await requests.listUnsent(opts.limit ?? 100);
  const summary: InviteSendSummary = { pending: pending.length, sent: 0, skipped: 0, unbuildable: 0 };
  if (pending.length === 0) return summary;

  const bundles = await buildInvites(db, pending);
  const notifier = defaultNotifier();

  for (const request of pending) {
    const bundle = bundles.get(request.id);
    if (!bundle) {
      summary.unbuildable += 1;
      continue;
    }

    let results: NotifyResult[];
    try {
      results = await notifier.send('feedback_invite', bundle.recipient, bundle.data);
    } catch (error) {
      // Gönderim hatası daveti YAKMAZ: damga atılmadığı için kuyrukta kalır ve sonraki tur dener.
      // `warning` — davet sağlam, eksik olan bir gönderim denemesi.
      void captureError(error, {
        source: SOURCES.backendCron,
        level: 'warning',
        context: { job: SEND_FEEDBACK_INVITES, feedbackRequestId: request.id },
      });
      summary.skipped += 1;
      continue;
    }

    const delivered = results.find((result) => result.status === 'sent');
    if (!delivered) {
      summary.skipped += 1;
      continue;
    }

    // Damga GİDENİN kanalıyla atılır — niyetle değil (bkz. `markSent`).
    await requests.markSent(request.id, feedbackChannelOf(delivered.channel));
    summary.sent += 1;
  }
  return summary;
}

/** Cron kabuğunun (`runJob`) çağırdığı sarmalayıcı — ize yazılacak özeti döner. */
export async function sendFeedbackInvitesJob(): Promise<Record<string, unknown>> {
  const summary = await sendPendingFeedbackInvites();
  // Kurulamayan davet sessiz kalmasın: sayı ize giriyor ama tek başına kimseyi uyandırmaz.
  // Kimlik yazılır, içerik yazılmaz (CLAUDE.md §1).
  if (summary.unbuildable > 0) {
    logger.warn({ job: SEND_FEEDBACK_INVITES, unbuildable: summary.unbuildable }, 'davet verisi kurulamadı');
  }
  return { ...summary };
}

/** Giden kanal → davet kaydının kanalı. İki wa sürücüsü de müşteri için "WhatsApp"tır. */
function feedbackChannelOf(channel: NotifyChannel): FeedbackChannel {
  return channel === 'email' ? 'email' : 'whatsapp';
}

interface InviteBundle {
  recipient: NotifyRecipient;
  data: FeedbackInviteNotification;
}

/**
 * Kuyruğun TAMAMININ verisini toplu okur — davet başına ayrı sorgu (N+1) yerine beş toplu okuma.
 *
 * Kuyruk yüz davet taşıdığında satır başına okuma beş yüz gidiş-dönüş demekti; iş yine biterdi ve
 * yavaşlığı hiçbir yerde görünmezdi (cron'un acelesi yok). Yavaşlık görünmediği için de asla
 * düzeltilmezdi — toplu okumak baştan yazmaktan ucuz.
 */
async function buildInvites(
  db: ReturnType<typeof serviceDb>,
  pending: readonly FeedbackRequest[],
): Promise<Map<string, InviteBundle>> {
  const orderIds = [...new Set(pending.map((request) => request.orderId))];
  const customerIds = [...new Set(pending.map((request) => request.customerId))];

  const [orders, profiles, items, logs] = await Promise.all([
    new OrderService(db).listByIds(orderIds),
    new UserProfileService(db).listByIds(customerIds),
    new OrderItemService(db).listByOrders(orderIds),
    new OrderStatusLogService(db).listByOrders(orderIds),
  ]);

  // Ürün sayısı VARYANTTAN türer: aynı ürünün iki boyu tek karttır ve akış da öyle sayar
  // (`openFeedbackInvite`). Kalem sayısını yazsaydık mail "5 ürün" der, ekran 3 kart gösterirdi.
  const variants = await new ProductVariantService(db).listByIds([...new Set(items.map((item) => item.variantId))]);
  const productOfVariant = new Map(variants.map((variant) => [variant.id, variant.productId]));

  const orderById = new Map(orders.map((order) => [order.id, order]));
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));

  const productCount = new Map<string, number>();
  for (const orderId of orderIds) {
    const products = new Set(
      items.filter((item) => item.orderId === orderId).map((item) => productOfVariant.get(item.variantId)).filter(Boolean),
    );
    productCount.set(orderId, products.size);
  }

  // Teslim anı `order_status_log`'dan TÜRETİLİR — siparişte `delivered_at` kolonu yok ve olmamalı
  // (DATA_MODEL türetme ilkesi). İlk geçiş alınır: kapıdan dönüp yeniden teslim edilen siparişte
  // müşterinin hatırladığı gün ilkidir.
  const deliveredAt = new Map<string, string>();
  for (const entry of logs) {
    if (entry.toStatus !== 'delivered') continue;
    const current = deliveredAt.get(entry.orderId);
    if (!current || entry.createdAt < current) deliveredAt.set(entry.orderId, entry.createdAt);
  }

  const bundles = new Map<string, InviteBundle>();
  for (const request of pending) {
    const order = orderById.get(request.orderId);
    const profile = profileById.get(request.customerId);
    if (!order || !profile) continue;

    // **Dil ÖNCE siparişten** (sipariş mailleriyle aynı kural): müşteri o siparişi hangi dilde
    // verdiyse davetini de o dilde okur. Web dışı kayıtta sipariş dilsizdir; orada profil doğrudur.
    const locale: PreferredLanguage = order.locale ?? profile.preferredLanguage ?? 'fr';

    bundles.set(request.id, {
      recipient: { name: profile.name ?? null, email: profile.email ?? null, phone: profile.phone ?? null, locale },
      data: {
        customerName: profile.name ?? null,
        locale,
        // Referans yoksa çizgi — sipariş maillerindeki kuralın aynısı (`notification-data.ts`).
        // Numarasızlığı gönderim ENGELİ saymak, teslim edilmiş bir siparişin davetini sessizce
        // yutardı; oysa davetin işi numara göstermek değil, kapıyı açmak. Numarasız satır zaten
        // bir veri arızasıdır ve kendi yerinde aranır.
        orderReferenceNo: order.referenceNo ?? '—',
        // Teslim anı bulunamazsa siparişin kendi günü — davet zaten teslim edilmiş siparişe
        // gidiyor, tarihsiz bir künye kartı çizmektense en yakın doğru günü yazmak yeğdir.
        deliveredOn: formatMessageDate(deliveredAt.get(order.id) ?? order.createdAt, locale),
        productCount: productCount.get(order.id) ?? 0,
        feedbackUrl: localizedUrl('/feedback/[token]', locale, { token: request.token }),
        notificationPreferencesUrl: localizedUrl('/account/notifications', locale),
      },
    });
  }
  return bundles;
}
