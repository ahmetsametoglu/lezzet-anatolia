import { OrderBoxService, WebhookEventService, serviceDb } from '@lezzet/database';
import { notifyOrderStatus, sendcloudProvider, syncShipmentStatus } from '@lezzet/application';
import { logger } from '@lezzet/observability';
import { parseWebhookIdentity, verifyWebhookSignature } from '@lezzet/sendcloud';
import type { OrderEffects, ShippingRateProvider } from '@lezzet/application';
import type { Context } from 'hono';
import type { AppEnv } from '../context';

/**
 * Taşıyıcı webhook'u, ince kabuk: imza, idempotens ve eşleşme burada, durumun kendisi `syncShipmentStatus`ta okunur ve yazılır.
 * Cevap kodları sözleşmedir, çünkü Sendcloud başarısız çağrıyı artan gecikmeyle on kez yeniden gönderir: ilgilendirmeyen olaya
 * 200, imza sorununa 400/401, eşleşmeyen koliye bilerek 500 (duyuru yazımıyla yarış yeniden deneme penceresinde çözülür).
 */

/**
 * İmza anahtarı: API Shop entegrasyonu gizli anahtarla imzalar; ayrı env önce okunur ki panelde ayrı bir imza anahtarı
 * tanımlandığında kod değişmesin.
 */
const webhookSecret = (): string | undefined => process.env.SENDCLOUD_WEBHOOK_SECRET || process.env.SENDCLOUD_SECRET_KEY || undefined;

/**
 * Müşteri haberi — port her yüzeyde ayrı bağlanır (`application/order/effects.ts` künyesi:
 * *"port kayıt yeri değil KARAR yeridir"*). Kargo kulvarında haberi tetikleyen tek yer burasıdır:
 * "yola çıktı" ve "teslim edildi" mesajlarını taşıyıcının olayı doğuruyor.
 */
const effects: OrderEffects = { notifyStatus: (orderId, status) => notifyOrderStatus(serviceDb(), orderId, status) };

/**
 * Rotaya bağlanan hâl. Sağlayıcı **her istekte** kuruluyor, mount anında değil: env sonradan
 * düzeltilirse süreç yeniden başlatılmadan devreye girsin.
 */
export const sendcloudWebhook = (c: Context<AppEnv>): Promise<Response> => handleSendcloudWebhook(c, sendcloudProvider());

/**
 * Gövde — **sağlayıcı ENJEKTE EDİLİR ve tek sebebi testin ağa çıkmaması** (`announce.ts`taki
 * `LabelUploader`ın aynı gerekçesi: dış dünyaya çıkan her kapı testte kapatılabilmeli).
 */
export async function handleSendcloudWebhook(c: Context<AppEnv>, provider: ShippingRateProvider): Promise<Response> {
  const secret = webhookSecret();
  if (!secret) return c.json({ error: 'sendcloud not configured' }, 503);

  const raw = await c.req.text();
  const signature = c.req.header('sendcloud-signature');
  if (!signature) {
    // `logger.warn`, `captureError` DEĞİL: bu kapının beklenen reddi, uygulama arızası değil —
    // sistem ekranındaki hata sayacını şişirseydi gerçek arızayı gizlerdi (Stripe kapısının aynı
    // gerekçesi). Gövde LOGLANMAZ: doğrulanmamış içeriktir.
    logger.warn({ reason: 'missing' }, 'sendcloud webhook imzasız istek reddedildi');
    return c.json({ error: 'missing signature' }, 400);
  }
  if (!verifyWebhookSignature(secret, raw, signature)) {
    logger.warn({ reason: 'invalid' }, 'sendcloud webhook imza doğrulaması başarısız');
    return c.json({ error: 'invalid signature' }, 401);
  }

  const identity = parseWebhookIdentity(raw);
  if (!identity) {
    /*
      Entegrasyon olayları (bağlandı, silindi) koli kimliği taşımaz, arıza değildir; kabul edilir ve işlenmez. Gövdenin şekli
      yazılır, içeriği yazılmaz: yük alıcının kişisel verisini taşıyabilir, anahtar adları ise taşımaz ve dokümanda şeması
      olmayan zarfı ancak buradan öğrenebiliriz.
    */
    let sekil: string[] = [];
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        sekil = Object.entries(parsed as Record<string, unknown>).map(([k, v]) =>
          v && typeof v === 'object' && !Array.isArray(v) ? `${k}{${Object.keys(v as object).join(',')}}` : k,
        );
      }
    } catch {
      sekil = ['<json değil>'];
    }
    logger.warn({ context: 'webhook/sendcloud', shape: sekil, bytes: raw.length }, 'koli kimliği ÇIKARILAMADI — olay işlenmedi');
    return c.json({ ignored: true }, 200);
  }

  const events = new WebhookEventService(serviceDb());
  const claim = await events.claim({
    provider: 'sendcloud',
    eventId: identity.eventId,
    type: identity.action ?? 'parcel_status_changed',
    // Gövde SAKLANMIYOR: taşıyıcı yükü alıcı adı/adresi/telefonu taşıyabilir (CLAUDE §1 kırmızı
    // çizgi) ve Option B'de o gövdeden hiçbir karar çıkmıyor. Kimlik + sağlayıcının söylediği kod
    // yeter; gerçek durum zaten REST'ten okunuyor.
    payload: { parcelId: identity.parcelId, reportedCode: identity.reportedCode },
  });

  /*
    Tekrar gelen olay damgalıysa işlenmiştir ve 200 döner; damgasızsa önceki tur düşmüştür ve yeniden işlenir, çünkü en olası
    düşüş geçicidir ve koşulsuz 200 yeniden deneme penceresini boşa harcardı.
  */
  if (!claim.fresh && claim.event.processedAt) return c.json({ duplicate: true }, 200);

  const box = await new OrderBoxService(serviceDb()).getByParcelRef(identity.parcelId);
  if (!box?.shipmentId) {
    const message = 'koli bizde bulunamadı (öksüz koli olabilir)';
    await events.markFailed(claim.event.id, message);
    logger.warn({ context: 'webhook/sendcloud', parcelId: identity.parcelId }, message);
    return c.json({ error: 'unmatched parcel' }, 500);
  }

  const outcome = await syncShipmentStatus(serviceDb(), provider, { shipmentId: box.shipmentId, effects });
  if (outcome.status === 'provider_error') {
    await events.markFailed(claim.event.id, `${outcome.code}: ${outcome.message}`);
    // Sağlayıcıya ulaşamadık; olay damgasız kalıyor ve tekrar denendiğinde işlenecek.
    return c.json({ error: 'provider unreachable' }, 500);
  }

  await events.markProcessed(claim.event.id);
  logger.info({ context: 'webhook/sendcloud', shipmentId: box.shipmentId, outcome: outcome.status }, 'taşıyıcı olayı işlendi');
  return c.json({ ok: true, outcome }, 200);
}
