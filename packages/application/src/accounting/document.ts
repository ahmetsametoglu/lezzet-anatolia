import { MoneyDocumentService, MovementTagService } from '@lezzet/database';
import { checkDocumentFile } from '@lezzet/domain-core';
import { financeDocumentScope, privateReadUrl, privateUploadUrl, r2Keys } from '@lezzet/storage';
import type { MoneyDocument, MoneyDocumentBalance, MoneyDocumentInsert } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';

/*
  BELGE KAPISI (12.12 · kullanıcı kararları 13.09) — DOMAIN §9.

  Resmî muhasebe sorduğunda hareketin dayanağı: fatura, fiş, bordro, sözleşme, dekont. Belge PARA
  DEĞİLDİR — fatura geldiğinde borç doğar, ödeme sonra bir hareket olarak gelir ve `documentId`
  ile bağlanır; açık kalan `money_document_balance` görünümünden türetilir, burada hesaplanmaz.

  ── DOSYA SUNUCUDAN GEÇMEZ ──────────────────────────────────────────────────
  Talep fotoğrafının deseni (`ticket/attachments.ts`): istemci doğrudan özel kovaya yükler, kapı
  yalnız yetkiyi doğrulayıp kısa ömürlü bir izin yazar ve ANAHTARI KENDİSİ KURAR. İstemciden gelen
  bir yolu doğrulamak zorunda kalsaydık, doğrulamanın unutulduğu gün private kovanın herhangi bir
  yerine yazma izni verilirdi. Dosya yüklendikten sonra `attachDocumentFile` anahtarın gerçekten
  o belgeye ait olduğunu biçimden okur (`financeDocumentScope`).

  ── ETİKET SÖZLÜKTEN ────────────────────────────────────────────────────────
  Veritabanı tanımadığı etiketi zaten reddediyor (`check_tags_known`); burada ÖNCE sorulması
  okunur bir ret içindir — kısıt hatası bir constraint adıdır, operatöre söylenecek cümle değil.
*/

export type DocumentOutcome =
  | { status: 'ok'; document: MoneyDocument }
  | { status: 'invalid'; reason: 'unknown_tag' | 'vat_over_amount' | 'not_found' | 'wrong_key' };

export type DocumentUploadOutcome =
  | { ok: true; key: string; uploadUrl: string; contentType: string }
  | { ok: false; reason: 'unsupported_type' | 'not_found' | 'storage_unavailable' };

/** Sözlükte olmayan ilk etiket — yoksa `null`. Pasif etiket de "yok" sayılır: yeni kayda verilmez. */
export async function unknownTagOf(db: SupabaseClient, tags: readonly string[]): Promise<string | null> {
  if (tags.length === 0) return null;
  const known = new Set((await new MovementTagService(db).list({ activeOnly: true })).map((tag) => tag.slug));
  return tags.find((tag) => !known.has(tag)) ?? null;
}

/**
 * Belge girişi. KDV belge toplamını aşamaz (toplam KDV dâhildir); etiketler sözlükten.
 * Dosya BURADA değil: önce belge doğar, sonra dosyası anahtarıyla bağlanır — anahtar belge
 * kimliğinden kurulduğu için sıra bu.
 */
export async function createMoneyDocument(db: SupabaseClient, input: MoneyDocumentInsert): Promise<DocumentOutcome> {
  if ((input.vatAmountCents ?? 0) > input.amountCents) return { status: 'invalid', reason: 'vat_over_amount' };
  if ((await unknownTagOf(db, input.tags ?? [])) !== null) return { status: 'invalid', reason: 'unknown_tag' };

  const document = await new MoneyDocumentService(db).insert(input);
  return { status: 'ok', document };
}

/**
 * Belge dosyası için kısa ömürlü yükleme izni. Tür motordan (`checkDocumentFile`), anahtar
 * belgeden — istemci ikisini de seçmez.
 */
export async function requestDocumentUploadUrl(
  db: SupabaseClient,
  input: { documentId: string; filename: string },
): Promise<DocumentUploadOutcome> {
  const check = checkDocumentFile(input.filename);
  if (!check.ok) return { ok: false, reason: check.reason };

  const document = await new MoneyDocumentService(db).getById(input.documentId);
  if (!document) return { ok: false, reason: 'not_found' };

  const key = r2Keys.financeDocument(document.id, input.filename);
  const uploadUrl = await privateUploadUrl(key, check.contentType);
  // Kova yapılandırılmamış (yerel geliştirme): sessizce "oldu" demek en kötü yalan — operatör
  // dosyayı yüklediğini sanır, belge dosyasız kalır.
  if (!uploadUrl) return { ok: false, reason: 'storage_unavailable' };

  return { ok: true, key, uploadUrl, contentType: check.contentType };
}

/**
 * Yüklenen dosyayı belgeye bağlar. Anahtar BİÇİMDEN doğrulanır: başka bir belgenin (ya da kovanın
 * başka bir köşesinin) anahtarı bu belgeye yazılamaz — imzalı okuma adresi sonra bu anahtardan
 * üretiliyor ve yanlış anahtar başkasının belgesini okuturdu.
 */
export async function attachDocumentFile(db: SupabaseClient, input: { documentId: string; key: string }): Promise<DocumentOutcome> {
  if (financeDocumentScope(input.key) !== input.documentId) return { status: 'invalid', reason: 'wrong_key' };

  const service = new MoneyDocumentService(db);
  if (!(await service.getById(input.documentId))) return { status: 'invalid', reason: 'not_found' };

  const document = await service.update({ id: input.documentId, fileKey: input.key });
  return { status: 'ok', document };
}

/** Belge dosyasının kısa ömürlü okuma adresi; dosyası yoksa ya da kova yoksa `null`. */
export async function documentFileUrl(db: SupabaseClient, documentId: string): Promise<string | null> {
  const document = await new MoneyDocumentService(db).getById(documentId);
  return privateReadUrl(document?.fileKey);
}

/** Açık belgeler — ödenmemiş faturalar ve alacaklar; açık kalanıyla birlikte. */
export function listOpenDocuments(db: SupabaseClient): Promise<Array<MoneyDocument & { balance: MoneyDocumentBalance }>> {
  return new MoneyDocumentService(db).listOpen();
}
