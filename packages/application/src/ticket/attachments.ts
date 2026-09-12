import { TicketService } from '@lezzet/database';
import { attachmentToken, checkAttachment } from '@lezzet/domain-core';
import { privateUploadUrl, r2Keys } from '@lezzet/storage';
import type { SupabaseClient } from '@supabase/supabase-js';

/*
  TALEP FOTOĞRAFININ YÜKLEME KAPISI — terfi 21.309. Kaynağı `apps/web/lib/ticket/attachments.ts`
  (16.2); o dosya artık bu kapının köprüsü. Native aynı kapıdan geçiyor (`POST /me/tickets/uploads`)
  ve iki kopya bir gün ayrışırdı — biri tavanı, öteki anahtar biçimini öğrenirdi.

  ── DOSYA SUNUCUDAN GEÇMEZ ──────────────────────────────────────────────────
  İstemci doğrudan R2'ye yükler. Sunucu üzerinden geçirmek bir fotoğrafı iki kez taşımak
  (istemci→sunucu→R2) olurdu; kapının tek işi yetkiyi doğrulayıp kısa ömürlü bir izin yazmak.

  ── ANAHTARI ÇAĞIRAN SEÇMEZ, BURASI SEÇER ───────────────────────────────────
  İstemciden gelen bir yolu doğrulamak zorunda kalsaydık, doğrulamanın unutulduğu gün private
  kovanın herhangi bir yerine yazma izni verilirdi. Kapı anahtarı kendi kurunca istismar edilecek
  girdi kalmıyor; açılış da yalnız bu kapının kurduğu biçimi kabul ediyor (`write.ts` →
  `attachmentsBelongTo`).

  ── İÇERİK TÜRÜ CEVAPTA ─────────────────────────────────────────────────────
  İmza içerik türünü bağlar (uyuşmayan yükleme R2'de reddedilir) ve türü dosya adının uzantısından
  BURASI türetiyor. Cevaba koymak, istemcinin aynı eşlemeyi ikinci kez yazmasını önler (CLAUDE §1):
  tarayıcı `file.type`ı biliyor, native seçicinin verdiği tür ise cihaza göre değişiyor.
*/

export type TicketUploadOutcome =
  | { ok: true; key: string; uploadUrl: string; contentType: string }
  | { ok: false; reason: 'unsupported_type' | 'too_many' | 'not_found' | 'storage_unavailable' };

export async function requestTicketUploadUrl(
  db: SupabaseClient,
  input: {
    customerId: string;
    /**
     * Var olan bir talebe ek yükleniyorsa kimliği. **Boşsa taslak:** müşteri formu doldururken
     * fotoğrafı seçer, talep ancak "Gönder"de doğar — dosya önce müşterinin kendi taslak klasörüne
     * yazılır (açılış yalnız oradan gelen anahtarı kabul eder).
     */
    ticketId?: string | null;
    filename: string;
    /** İstemcinin bu mesaj için daha önce kaç ek istediği — tavan kontrolü için. */
    alreadyRequested?: number;
  },
): Promise<TicketUploadOutcome> {
  const check = checkAttachment(input.filename, input.alreadyRequested ?? 0);
  if (!check.ok) return { ok: false, reason: check.reason };

  if (input.ticketId) {
    const ticket = await new TicketService(db).getById(input.ticketId);
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

  return { ok: true, key, uploadUrl, contentType };
}
