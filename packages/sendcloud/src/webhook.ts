import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

/**
 * SENDCLOUD WEBHOOK — imza doğrulama + KİMLİK ayıklama.
 *
 * ── BU MODÜL DURUM OKUMAZ ───────────────────────────────────────────────────
 * Gelen gövdeden yalnız **hangi koli** ve **hangi olay** sorularının cevabı çıkarılır; durumun
 * kendisi REST'ten sorulur ("Option B", tasarım kaydı §6.1). Karar bir tasarım tercihinden değil
 * ölçülemezlikten doğuyor: v3 dokümanı webhook gövdesinin şemasını **vermiyor** — yalnızca
 * *"aldığınız veri, bir koliyi sorguladığınızda dönen yükün aynısıdır"* diyor (28.08 taraması).
 * Şemasını bilmediğimiz bir gövdeden durum okumak, biçim bir gün oynadığında siparişi sessizce
 * yanlış yere taşırdı. Kimlik ayıklamak ise ucuz ve dayanıklı: birkaç olası yerin hangisinde
 * duruyorsa oradan alınır, bulunamazsa olay **reddedilir** — tahmin edilmez.
 *
 * ── İMZA ────────────────────────────────────────────────────────────────────
 * `Sendcloud-Signature` başlığı: HAM gövde üzerinden HMAC-SHA256, **hex** (doküman + PHP/Python
 * örnekleri). Anahtar entegrasyon tipine göre `Secret Key` ya da `Webhook Signature Key`.
 * Karşılaştırma `timingSafeEqual` ile: sabit zamanlı olmayan karşılaştırma imzayı bayt bayt
 * tahmin etmeye açık kapı bırakır.
 */

/** Ham gövde üzerinden beklenen imza (hex). Gövde `req.text()` ile alınmalı — `json()` normalleştirir. */
export function signWebhookBody(secret: string, rawBody: string): string {
  return createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
}

/**
 * İmza tutuyor mu. Anahtar ya da başlık yoksa **`false`** — "doğrulayamadım" ile "doğru" aynı şey
 * değildir (`CLAUDE §1`). Anahtarsız ortamda uç nokta açık kalmaz.
 */
export function verifyWebhookSignature(secret: string | undefined | null, rawBody: string, header: string | null | undefined): boolean {
  if (!secret || !header) return false;
  const expected = Buffer.from(signWebhookBody(secret, rawBody), 'utf8');
  const got = Buffer.from(header.trim().toLowerCase(), 'utf8');
  // Uzunluk farkı `timingSafeEqual`ı FIRLATIR; önce eşitlenir, sonra karşılaştırılır.
  if (expected.length !== got.length) return false;
  return timingSafeEqual(expected, got);
}

/**
 * Kimliğin durabileceği yerler — üçü de tolere ediliyor çünkü şema belgeli değil:
 * klasik zarf (`{action, timestamp, parcel}`), v3 zarfı (`{data}`) ve çıplak koli nesnesi.
 */
const IdSchema = z.union([z.string(), z.number()]).nullish();
const ParcelLikeSchema = z.object({
  id: IdSchema,
  tracking_number: z.string().nullish(),
  status: z.object({ code: z.string().nullish(), message: z.string().nullish() }).nullish(),
});
const EnvelopeSchema = z.object({
  action: z.string().nullish(),
  timestamp: z.union([z.string(), z.number()]).nullish(),
  parcel: ParcelLikeSchema.nullish(),
  data: ParcelLikeSchema.nullish(),
  id: IdSchema,
  tracking_number: z.string().nullish(),
  status: z.object({ code: z.string().nullish(), message: z.string().nullish() }).nullish(),
});

export interface WebhookIdentity {
  /** Sağlayıcının KOLİ kimliği — `order_box.provider_parcel_ref` ile eşleşir. */
  parcelId: string;
  /** İkincil eşleşme yolu; bazı taşıyıcılarda geç atanır, tek başına güvenilmez. */
  trackingNumber: string | null;
  /** Olay adı (`parcel_status_changed` …) — yalnız kayıt için. */
  action: string | null;
  /**
   * İDEMPOTENS ANAHTARI. Sendcloud olay kimliği GÖNDERMİYOR; doküman yalnız her webhook'ta bir
   * `timestamp` olduğunu söylüyor. Anahtar bu yüzden **koli + damga**dan kuruluyor: aynı olayın
   * tekrarı aynı anahtarı üretir, farklı bir durum değişimi farklı damga taşır. Damga yoksa ham
   * gövdenin özeti kullanılır — tahmin değil, ölçülebilir bir kimlik.
   */
  eventId: string;
  /** Sağlayıcının söylediği durum — **KULLANILMAZ**, yalnız deftere not düşülür (Option B). */
  reportedCode: string | null;
}

/**
 * Gövdeden kimliği çıkar. Koli kimliği bulunamazsa `null` döner ve çağıran olayı REDDEDER:
 * eşleştiremediğimiz bir olayı "işlendi" saymak, kaçan bir durum değişimini sessizleştirirdi.
 */
export function parseWebhookIdentity(rawBody: string): WebhookIdentity | null {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return null;
  }
  const parsed = EnvelopeSchema.safeParse(json);
  if (!parsed.success) return null;
  const e = parsed.data;
  const parcel = e.parcel ?? e.data ?? { id: e.id, tracking_number: e.tracking_number, status: e.status };

  const parcelId = parcel.id == null ? null : String(parcel.id).trim();
  if (!parcelId) return null;

  const stamp = e.timestamp == null ? createHmac('sha256', 'sendcloud-event').update(rawBody, 'utf8').digest('hex').slice(0, 32) : String(e.timestamp);

  return {
    parcelId,
    trackingNumber: parcel.tracking_number?.trim() || null,
    action: e.action?.trim() || null,
    eventId: `${parcelId}:${stamp}`,
    reportedCode: parcel.status?.code?.trim() || null,
  };
}
