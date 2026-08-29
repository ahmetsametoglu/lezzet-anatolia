import { OrderBoxService, WebhookEventService, serviceDb } from '@lezzet/database';
import { notifyOrderStatus, sendcloudProvider, syncShipmentStatus } from '@lezzet/application';
import { logger } from '@lezzet/observability';
import { parseWebhookIdentity, verifyWebhookSignature } from '@lezzet/sendcloud';
import type { OrderEffects, ShippingRateProvider } from '@lezzet/application';
import type { Context } from 'hono';
import type { AppEnv } from '../http/request-log';

/**
 * TAŞIYICI WEBHOOK'U (07.12) — **ince kabuk**: imza + idempotens + eşleşme. Durumun kendisi
 * `syncShipmentStatus`ta okunur ve yazılır; bu dosya karar vermez.
 *
 * ── NEDEN BACKEND'DE (Stripe web'deyken) ────────────────────────────────────
 * `STACK §7` webhook'ları zaten backend'e koyuyor; Stripe'ınki sapmaydı ve künyesinde gerekçesi
 * yazılı (ödeme kapıları web'de). Burada sapmaya gerek yok, üstelik ters yönde bir bağ var:
 * **aynı uzlaştırmayı nöbet cron'u da çağırıyor** ve o zaten bu süreçte koşuyor. Webhook'u web'e
 * koymak, tek bir işi iki sürece bölmek olurdu.
 *
 * ── ÜÇ KAPI, ÜÇÜ DE AYRI SORU ───────────────────────────────────────────────
 * 1. **İmza** — `Sendcloud-Signature`, HAM gövde üzerinden HMAC-SHA256 (hex). Gövde
 *    `c.req.text()` ile okunur: `json()` normalleştirir ve imzayı geçersiz kılar (ölçüldü —
 *    tek bir boşluk farkı özeti değiştiriyor). Anahtarsız ortamda uç nokta AÇIK KALMAZ.
 * 2. **İdempotens** — `webhook_event`, `(provider, event_id)` benzersiz. Sendcloud olay kimliği
 *    GÖNDERMİYOR; anahtar koli + damgadan kuruluyor (`parseWebhookIdentity`).
 * 3. **Eşleşme** — koli kimliği → `order_box.provider_parcel_ref` → gönderi.
 *
 * ── CEVAP KODLARI BİR SÖZLEŞMEDİR ───────────────────────────────────────────
 * Sendcloud başarısız çağrıyı **10 kez, 5 dk → 1 saat** artan gecikmeyle yeniden gönderiyor
 * (doküman). Kod seçimi bu yüzden davranış seçimidir:
 * - **200** — işlendi, ya da bizi ilgilendirmiyor (koli kimliği taşımayan entegrasyon olayları).
 *   İlgilendirmeyen olaya 4xx dönmek sağlayıcıyı 10 tur boşuna koştururdu.
 * - **400/401** — imza yok/tutmuyor. Tekrar denemesi anlamsız.
 * - **500** — bizde bir şey eksik ya da düştü. **Eşleşmeyen koli de buraya düşer** ve bu bilinçli:
 *   duyuru yazımıyla webhook yarışabilir (koli açıldı, satırımız henüz yazılmadı). Yeniden deneme
 *   penceresi o yarışı kendiliğinden çözer. Gerçekten öksüz bir koliyse 10 uyarı bırakır — o da
 *   susturulması gereken bir gürültü değil, aradığımız alarmın ta kendisidir.
 */

/**
 * İmza anahtarı. Doküman: *"`Secret Key` ya da `Webhook Signature Key`, entegrasyon tipine göre"* —
 * API Shop entegrasyonu gizli anahtarla imzalıyor. Ayrı env ÖNCE okunuyor ki panelde ayrı bir
 * imza anahtarı tanımlandığında kod değişmesin.
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
      Entegrasyon olayları (bağlandı/silindi) aynı adrese düşüyor ve koli kimliği taşımıyorlar.
      Bunlar bir arıza değil; kabul edilir ve işlenmez.

      **GÖVDENİN ŞEKLİ YAZILIR, İÇERİĞİ YAZILMAZ** — ve bu ayrım burada hem kural hem ihtiyaç.
      Kural: taşıyıcı yükü alıcı adı/adresi/telefonu taşıyabilir (`CLAUDE §1` kırmızı çizgi).
      İhtiyaç: v3 dokümanı webhook gövdesinin şemasını VERMİYOR, yani tanımadığımız bir zarf
      geldiğinde onu ancak buradan öğrenebiliriz. Anahtar adları içerik değildir — `parcel`,
      `action`, `timestamp` bir kimlik ya da adres taşımaz, yalnız zarfın biçimini söyler.

      Ölçülerek gerekti (29.08): sağlayıcı beş olay gönderdi, imza TUTTU, ama ayrıştırıcı hiçbirinde
      koli kimliği bulamadı ve hepsi sessizce "ignored" oldu. Şekli görmeden hangi alanın nerede
      olduğunu tahmin etmek gerekirdi.
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
    TEKRAR GELEN OLAY: damgalıysa gerçekten işlenmiş demektir → 200. Damgasızsa önceki tur
    DÜŞMÜŞTÜR ve bu yeniden denemedir → işlenir. Stripe kapısı burada koşulsuz `duplicate` diyor;
    ayrım bu kulvarda gerekli çünkü en olası düşüş sebebi GEÇİCİ: duyuru yazımıyla yarış, ya da
    sağlayıcıya çıkan REST çağrısının o an düşmesi. Koşulsuz 200 dönseydik, 10 turluk yeniden
    deneme penceresinin tamamı ilk tur bir kez düştüğü için boşa giderdi.
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
