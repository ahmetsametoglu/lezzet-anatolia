import { randomUUID } from 'node:crypto';
import { captureError, logger, SOURCES } from '@lezzet/observability';
import { getR2Private, r2Keys } from '@lezzet/storage';

/**
 * Sohbetten gelen medyayı Meta'dan indirip PRIVATE kovaya yazar (15.x).
 *
 * ── NEDEN İNDİRİYORUZ, ADRESİ SAKLAMIYORUZ ──────────────────────────────────
 * Meta gövdede dosyayı vermiyor, bir MEDYA KİMLİĞİ veriyor. O kimlikten üretilen indirme adresi
 * dakikalar içinde ölüyor ve medyanın kendisi de sağlayıcıda ~30 gün sonra siliniyor. Adresi
 * saklasaydık ekran ertesi gün boş açılırdı; hiç saklamasaydık ezik ürün fotoğrafı — yani
 * şikâyetin tek kanıtı — talep sonuçlanmadan yok olurdu. Kanıtın ömrü sağlayıcının saklama
 * süresine bağlanamaz.
 *
 * ── İKİ ADIM, ÇÜNKÜ META ÖYLE VERİYOR ───────────────────────────────────────
 * 1. `GET /{media-id}` → `{ url, mime_type, file_size }` (jetonla)
 * 2. o `url`'i **Authorization başlığıyla** indir — adres imzalı değil, jeton isteyen bir uçtur.
 *    Başlıksız çağrı 401 döner; bu tuzağa düşmemek için indirme buraya kapatıldı.
 *
 * ── DÜŞERSE MESAJ YİNE YAZILIR ──────────────────────────────────────────────
 * Bu modülün her hata yolu `null` döner, hiçbiri FIRLATMAZ. Çağıran (webhook) `null` görünce medya
 * anahtarsız satırı yine yazar. Defterin ilk kuralı mesajın kaybolmamasıdır — medya ikinci
 * sıradadır; sağlayıcıdaki geçici bir arıza müşterinin mesajını yok edemez.
 */

const GRAPH = 'https://graph.facebook.com/v21.0';

/**
 * Kabul edilen en büyük dosya. Meta'nın kendi tavanı türe göre 16–100 MB; buradaki sınır bizim
 * belleğimizi koruyor — indirme belleğe alınıp kovaya yazılıyor ve sınırsız bir gövde, webhook
 * işleyicisini tek mesajla düşürebilirdi. Aşan dosya kaydedilmez ama MESAJ YİNE YAZILIR.
 */
const MAX_BYTES = 25 * 1024 * 1024;

/** Kovaya yazılan dosyanın uzantısı MIME'dan türer — sağlayıcı dosya adı vermiyor. */
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'video/mp4': 'mp4',
  'application/pdf': 'pdf',
};

/** `audio/ogg; codecs=opus` gibi parametreli değerlerden türü ayıklar. */
function baseMime(value: string): string {
  return value.split(';')[0]!.trim().toLowerCase();
}

function extensionFor(mime: string): string {
  return EXT_BY_MIME[baseMime(mime)] ?? 'bin';
}

export interface StoredMedia {
  /** `r2Keys.conversationMedia` anahtarı — satıra bu yazılır. */
  key: string;
  /** Ekran fotoğraf mı ses mi çizeceğini bundan bilir. */
  mime: string;
}

interface MediaDescriptor {
  url?: string;
  mime_type?: string;
  file_size?: number;
  error?: { message?: string; code?: number };
}

/**
 * Medya kimliğinden dosyayı indirip kovaya yazar. Başarısızlığın HER türü `null`'dır: jeton yok,
 * kova ayarlı değil, sağlayıcı reddetti, dosya çok büyük, ağ düştü. Çağıran ayrım yapmaz — yapacak
 * bir şeyi yok, mesajı zaten yazacak.
 */
export async function storeConversationMedia(
  conversationId: string,
  mediaId: string,
  token: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<StoredMedia | null> {
  if (!token) return null;

  const r2 = getR2Private();
  // Yerelde R2'siz çalışmak MÜMKÜN olmalı: kova yoksa medya saklanmaz, sohbet çalışmaya devam
  // eder (`privateReadUrl`ın aynı nezaketi).
  if (!r2) return null;

  try {
    const tanim = await fetchImpl(`${GRAPH}/${encodeURIComponent(mediaId)}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const descriptor = (await tanim.json()) as MediaDescriptor;
    if (!tanim.ok || descriptor.error || !descriptor.url) {
      // Sağlayıcının bilinen sınırı (süresi geçmiş kimlik, silinmiş medya) — arıza değil.
      // İçerik loglanmaz, kimlik loglanır (CLAUDE §1).
      logger.info(
        { context: 'messaging/meta-media', conversationId, mediaId, code: descriptor.error?.code ?? tanim.status },
        'medya tanımı alınamadı — mesaj medyasız yazılır',
      );
      return null;
    }

    if (typeof descriptor.file_size === 'number' && descriptor.file_size > MAX_BYTES) {
      logger.warn(
        { context: 'messaging/meta-media', conversationId, mediaId, bytes: descriptor.file_size },
        'medya sınırı aştı — mesaj medyasız yazılır',
      );
      return null;
    }

    // Adres imzalı DEĞİL: jeton başlıkta gitmezse 401 döner.
    const indirilen = await fetchBytes(descriptor.url, { authorization: `Bearer ${token}` }, { conversationId, ref: mediaId }, fetchImpl);
    if (!indirilen) return null;

    const mime = baseMime(descriptor.mime_type ?? indirilen.contentType ?? 'application/octet-stream');
    return await putMedia(r2, conversationId, indirilen.bytes, mime);
  } catch (err) {
    // Beklenmedik olan burası (ağ, kova, ayrıştırma) — bilinen retlerin aksine iz bırakır.
    captureError(err, { source: SOURCES.webhook, context: { step: 'meta-media', conversationId, mediaId } });
    return null;
  }
}

/** Messenger/Instagram ekinin türü — webhook'un `attachments[].type` alanı. `fallback` (bağlantı önizlemesi) ve `template` dosya değildir, indirilmez. */
export type MessengerAttachmentType = 'audio' | 'image' | 'video' | 'file';

/**
 * CDN türü söylemezse (octet-stream) ek türünden makul varsayılan. Boş bırakılamaz: ses çözümü
 * `audio/*` görmeden koşmaz ve tür bilgisi elimizde varken dosyayı "bilinmeyen" yazmak kör nokta olurdu.
 */
const GENERIC_MIME_BY_TYPE: Record<MessengerAttachmentType, string> = {
  audio: 'audio/mp4',
  image: 'image/jpeg',
  video: 'video/mp4',
  file: 'application/octet-stream',
};

/**
 * **MESSENGER / INSTAGRAM EKİ — ADRESTEN İNDİR** (08.09, canlıda ölçüldü).
 *
 * Bu kanallar medya KİMLİĞİ değil doğrudan CDN ADRESİ verir (`attachments[].payload.url`,
 * `cdn.fbsbx.com`): adres imzalıdır, jeton istemez ve kısa ömürlüdür. İlk canlı sesli mesaj bunu
 * gösterdi — ek `{type:'audio', payload:{url}}` geldi, indirilmediği için ajan "açamadığım bir dosya"
 * görüp devretti; WhatsApp'ta çözülen ses Messenger'da kör noktaydı. İndirme aynı kovaya, aynı
 * anahtar düzeniyle; ses çözümü ve ekran yolu ortak (15.25 · 15.26). Adres log'a yazılmaz (imzalı).
 */
export async function storeConversationMediaFromUrl(
  conversationId: string,
  attachment: { type: MessengerAttachmentType; url: string },
  fetchImpl: typeof fetch = fetch,
): Promise<StoredMedia | null> {
  const r2 = getR2Private();
  if (!r2) return null;

  try {
    const indirilen = await fetchBytes(attachment.url, {}, { conversationId, ref: attachment.type }, fetchImpl);
    if (!indirilen) return null;

    const bildirilen = indirilen.contentType ? baseMime(indirilen.contentType) : '';
    const mime = bildirilen && bildirilen !== 'application/octet-stream' ? bildirilen : GENERIC_MIME_BY_TYPE[attachment.type];
    return await putMedia(r2, conversationId, indirilen.bytes, mime);
  } catch (err) {
    captureError(err, { source: SOURCES.webhook, context: { step: 'meta-media-url', conversationId, type: attachment.type } });
    return null;
  }
}

/**
 * Gövdeyi indirir ve boyut sınırını ölçer — iki kaynağın (Meta medya kimliği · Messenger CDN adresi)
 * ortak yarısı. Başarısızlık `null`, gerekçesi log'da; `ref` teşhis için kimlik/tür, adres değil.
 */
async function fetchBytes(
  url: string,
  headers: Record<string, string>,
  log: { conversationId: string; ref: string },
  fetchImpl: typeof fetch,
): Promise<{ bytes: Uint8Array; contentType: string | null } | null> {
  const dosya = await fetchImpl(url, { headers });
  if (!dosya.ok) {
    logger.info({ context: 'messaging/meta-media', ...log, status: dosya.status }, 'medya indirilemedi — mesaj medyasız yazılır');
    return null;
  }
  const bytes = new Uint8Array(await dosya.arrayBuffer());
  // Beyan edilen boyut yalan olabilir; gerçek gövde de ölçülür.
  if (bytes.byteLength > MAX_BYTES) {
    logger.warn({ context: 'messaging/meta-media', ...log, bytes: bytes.byteLength }, 'indirilen medya sınırı aştı — mesaj medyasız yazılır');
    return null;
  }
  return { bytes, contentType: dosya.headers.get('content-type') };
}

/**
 * Kovaya yazar. Anahtar SAĞLAYICININ kimliğinden türemez: kanal değiştiğinde biçimi değişir ve depo
 * düzenimiz Meta'nın adlandırmasına bağlanırdı. Kendi tek kullanımlık kimliğimiz.
 */
async function putMedia(
  r2: NonNullable<ReturnType<typeof getR2Private>>,
  conversationId: string,
  bytes: Uint8Array,
  mime: string,
): Promise<StoredMedia> {
  const key = r2Keys.conversationMedia(conversationId, randomUUID(), `medya.${extensionFor(mime)}`);
  await r2.uploadFile(key, bytes, mime);
  return { key, mime };
}
