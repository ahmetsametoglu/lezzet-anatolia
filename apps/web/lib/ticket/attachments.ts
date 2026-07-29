import 'server-only';
import { TicketService, serviceDb } from '@lezzet/database';
import { attachmentToken, checkAttachment } from '@lezzet/domain-core';
import { privateUploadUrl, r2Keys } from '@lezzet/storage';

/**
 * Şikâyet fotoğrafının yükleme kapısı (16.2) — **imzalı adres burada doğar.**
 *
 * Dosya sunucudan GEÇMEZ: tarayıcı doğrudan R2'ye yükler. Sunucu üzerinden geçirmek, bir fotoğrafı
 * iki kez taşımak (istemci→sunucu→R2) ve Next.js'in gövde sınırıyla boğuşmak olurdu. Sunucunun
 * yaptığı tek şey **yetkiyi doğrulayıp kısa ömürlü bir izin yazması**.
 *
 * **Anahtarı çağıran seçmez, BURASI seçer.** Seçseydi, istemciden gelen yolu doğrulamak zorunda
 * kalırdık ve o doğrulamanın unutulduğu gün private kovanın herhangi bir yerine yazma izni
 * verilirdi. Kapı anahtarı kendi kurunca istismar edilecek bir girdi kalmıyor.
 */

type UploadTicketResult =
  | { ok: true; key: string; uploadUrl: string }
  | { ok: false; reason: 'unsupported_type' | 'too_many' | 'not_found' | 'storage_unavailable' };

export async function requestTicketUploadUrl(input: {
  customerId: string;
  /**
   * Var olan bir talebe ek yükleniyorsa kimliği. **Boşsa taslak:** müşteri formu doldururken
   * fotoğrafı seçer, talep ancak "Gönder"de doğar — o yüzden dosya önce müşterinin kendi taslak
   * klasörüne yazılır (`openTicket` yalnız oradan gelen anahtarı kabul eder).
   */
  ticketId?: string | null;
  filename: string;
  /** İstemcinin bu mesaja daha önce kaç ek istediği — tavan kontrolü için. */
  alreadyRequested?: number;
}): Promise<UploadTicketResult> {
  const check = checkAttachment(input.filename, input.alreadyRequested ?? 0);
  if (!check.ok) return { ok: false, reason: check.reason };

  if (input.ticketId) {
    const ticket = await new TicketService(serviceDb()).getById(input.ticketId);
    // "Yok" ile "senin değil" aynı cevabı verir; olmayan bir talebin varlığı doğrulanmaz.
    if (!ticket || ticket.customerId !== input.customerId) return { ok: false, reason: 'not_found' };
  }

  const token = attachmentToken();
  const key = input.ticketId
    ? r2Keys.ticketAttachment(input.ticketId, token, input.filename)
    : r2Keys.ticketDraftAttachment(input.customerId, token, input.filename);

  // `jpg` uzantısının MIME karşılığı `image/jpeg`'dir; imza içerik türünü bağlar, uyuşmazsa yükleme
  // R2 tarafında reddedilir.
  const contentType = `image/${check.extension === 'jpg' ? 'jpeg' : check.extension}`;
  const uploadUrl = await privateUploadUrl(key, contentType);
  // Kova yapılandırılmamış (yerel geliştirme): sessizce "oldu" demek en kötü yalan olurdu — müşteri
  // fotoğrafını yüklediğini sanır, talep eksik açılır.
  if (!uploadUrl) return { ok: false, reason: 'storage_unavailable' };

  return { ok: true, key, uploadUrl };
}
