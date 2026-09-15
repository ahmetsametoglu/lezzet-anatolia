import { randomUUID } from 'node:crypto';
import { captureError, logger, SOURCES } from '@lezzet/observability';
import { getR2Private, r2Keys } from '@lezzet/storage';

// Medya indirilip kendi kovamıza yazılır: Meta'nın adresi dakikalarda ölür, medya ~30 günde silinir ve şikâyetin tek kanıtı talep
// sonuçlanmadan yok olurdu.

// Her hata yolu `null` döner, hiçbiri fırlatmaz: çağıran medyasız satırı yine yazar, sağlayıcıdaki geçici arıza müşterinin
// mesajını yok edemez.

const GRAPH = 'https://graph.facebook.com/v21.0';

/** Bizim belleğimizi korur: indirme belleğe alınır ve sınırsız gövde webhook işleyicisini tek mesajla düşürebilirdi. */
const MAX_BYTES = 25 * 1024 * 1024;

/** Sağlayıcı dosya adı vermez, uzantı MIME'dan türer. */
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

function baseMime(value: string): string {
  return value.split(';')[0]!.trim().toLowerCase();
}

function extensionFor(mime: string): string {
  return EXT_BY_MIME[baseMime(mime)] ?? 'bin';
}

export interface StoredMedia {
  key: string;
  mime: string;
}

interface MediaDescriptor {
  url?: string;
  mime_type?: string;
  file_size?: number;
  error?: { message?: string; code?: number };
}

/** Başarısızlığın her türü `null`'dır: çağıranın yapacağı bir ayrım yok, mesajı zaten yazacak. */
export async function storeConversationMedia(
  conversationId: string,
  mediaId: string,
  token: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<StoredMedia | null> {
  if (!token) return null;

  const r2 = getR2Private();
  // Yerelde R2'siz çalışmak mümkün olmalı: kova yoksa medya saklanmaz, sohbet sürer.
  if (!r2) return null;

  try {
    const tanim = await fetchImpl(`${GRAPH}/${encodeURIComponent(mediaId)}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const descriptor = (await tanim.json()) as MediaDescriptor;
    if (!tanim.ok || descriptor.error || !descriptor.url) {
      // Sağlayıcının bilinen sınırı (süresi geçmiş kimlik, silinmiş medya) arıza değildir; log'a kimlik yazılır.
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

    // Adres imzalı değil: jeton başlıkta gitmezse 401 döner.
    const indirilen = await fetchBytes(descriptor.url, { authorization: `Bearer ${token}` }, { conversationId, ref: mediaId }, fetchImpl);
    if (!indirilen) return null;

    const mime = baseMime(descriptor.mime_type ?? indirilen.contentType ?? 'application/octet-stream');
    return await putMedia(r2, conversationId, indirilen.bytes, mime);
  } catch (err) {
    // Beklenmedik olan burası (ağ, kova, ayrıştırma); bilinen retlerin aksine iz bırakır.
    captureError(err, { source: SOURCES.webhook, context: { step: 'meta-media', conversationId, mediaId } });
    return null;
  }
}

/** `fallback` (bağlantı önizlemesi) ve `template` dosya değildir, indirilmez. */
export type MessengerAttachmentType = 'audio' | 'image' | 'video' | 'file';

/** Boş bırakılamaz: ses çözümü `audio/*` görmeden koşmaz. */
const GENERIC_MIME_BY_TYPE: Record<MessengerAttachmentType, string> = {
  audio: 'audio/mp4',
  image: 'image/jpeg',
  video: 'video/mp4',
  file: 'application/octet-stream',
};

/**
 * Bu kanallar medya kimliği değil imzalı, jetonsuz ve kısa ömürlü bir CDN adresi verir; indirilmezse ses çözülemez ve ajan dosyayı
 * açamayıp devrederdi. Adres log'a yazılmaz, imzalıdır.
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

/** `ref` teşhis içindir: kimlik ya da tür, imzalı adres değil. */
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

/** Anahtar sağlayıcının kimliğinden türemez: depo düzenimiz Meta'nın adlandırmasına bağlanırdı. */
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
