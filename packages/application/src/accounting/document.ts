import { CounterpartyService, MoneyAllocationService, MoneyDocumentService, MoneyMovementService, MovementTagService } from '@lezzet/database';
import { checkDocumentFile } from '@lezzet/domain-core';
import { financeDocumentScope, privateReadUrl, privateUploadUrl, r2Keys } from '@lezzet/storage';
import type { MoneyAllocation, MoneyDocument, MoneyDocumentBalance, MoneyDocumentInsert } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { natureProblemOf } from './natures';

/*
  BELGE KAPISI (12.12 · kullanıcı kararları 13.09) — DOMAIN §9.

  Resmî muhasebe sorduğunda hareketin dayanağı: fatura, fiş, bordro, sözleşme, dekont. Belge PARA
  DEĞİLDİR — fatura geldiğinde borç doğar, ödeme sonra bir hareket olarak gelir ve bir BAĞLA belgeye
  bağlanır; açık kalan `money_document_balance` görünümünden türetilir, burada hesaplanmaz.

  ── BAĞ TUTARIYLA (13.09 · ikinci karar) ────────────────────────────────────
  Bir havale birkaç faturayı kapatabilir (tedarikçinin üç faturası tek ödemede), bir fatura birkaç
  ödemeyle kapanır (taksit). Bağın tutarı verilmezse "hareketin kalanı ile belgenin açık kalanından
  küçüğü"dür — operatör çoğu zaman tam bunu kastediyor. Bir hareketin bağları toplamı kendi tutarını
  aşamaz: kararı veritabanı verir (`check_allocation_within_movement`), burada ÖNCE sorulur ki ret
  okunur olsun.

  ── KARŞI TARAF VE TÜR (13.09 · ikinci karar) ──────────────────────────────
  Belgenin karşı tarafı bir CARİ ya da TEDARİKÇİDİR (ikisinden en çok biri), serbest metin değil; türü
  sözlükten ve yönüne uygun. Etiket serbest işarettir.

  ── DOSYA SUNUCUDAN GEÇMEZ ──────────────────────────────────────────────────
  Talep fotoğrafının deseni (`ticket/attachments.ts`): istemci doğrudan özel kovaya yükler, kapı
  yalnız yetkiyi doğrulayıp kısa ömürlü bir izin yazar ve ANAHTARI KENDİSİ KURAR. İstemciden gelen
  bir yolu doğrulamak zorunda kalsaydık, doğrulamanın unutulduğu gün private kovanın herhangi bir
  yerine yazma izni verilirdi. Dosya yüklendikten sonra `attachDocumentFile` anahtarın gerçekten
  o belgeye ait olduğunu biçimden okur (`financeDocumentScope`).
*/

export type DocumentOutcome =
  | { status: 'ok'; document: MoneyDocument }
  | {
      status: 'invalid';
      reason: 'unknown_tag' | 'unknown_nature' | 'nature_direction' | 'unknown_counterparty' | 'party_conflict' | 'vat_over_amount' | 'not_found' | 'wrong_key';
    };

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
 * Belge girişi. KDV belge toplamını aşamaz (toplam KDV dâhildir); karşı taraf cari YA DA tedarikçi;
 * tür sözlükten ve yöne uygun; etiketler sözlükten. Dosya BURADA değil: önce belge doğar, sonra
 * dosyası anahtarıyla bağlanır — anahtar belge kimliğinden kurulduğu için sıra bu.
 */
export async function createMoneyDocument(db: SupabaseClient, input: MoneyDocumentInsert): Promise<DocumentOutcome> {
  if ((input.vatAmountCents ?? 0) > input.amountCents) return { status: 'invalid', reason: 'vat_over_amount' };
  if (input.counterpartyId && input.supplierId) return { status: 'invalid', reason: 'party_conflict' };
  if (input.counterpartyId && !(await new CounterpartyService(db).getById(input.counterpartyId))?.isActive) {
    return { status: 'invalid', reason: 'unknown_counterparty' };
  }
  const natureProblem = await natureProblemOf(db, input.nature, input.direction);
  if (natureProblem) return { status: 'invalid', reason: natureProblem };
  if ((await unknownTagOf(db, input.tags ?? [])) !== null) return { status: 'invalid', reason: 'unknown_tag' };

  const document = await new MoneyDocumentService(db).insert(input);
  return { status: 'ok', document };
}

export type AllocationOutcome =
  | { status: 'ok'; allocation: MoneyAllocation }
  | { status: 'invalid'; reason: 'not_found' | 'direction_mismatch' | 'already_allocated' | 'nothing_to_allocate' | 'document_settled' | 'over_movement' };

/**
 * Hareketi belgeye BAĞLAR — tutarıyla. Tutar verilmezse hareketin bağlanmamış kalanı ile belgenin
 * açık kalanından küçüğü. Yön aynı olmalı (bizim ödeyeceğimiz belgeyi çıkan para kapatır). Aynı
 * hareket aynı belgeye iki kez bağlanmaz (tekil); kalanı olmayan hareket de, kapanmış belge de
 * bağlanmaz — ikincisi açıkça tutar verilerek yapılabilir (fazla ödeme bir olgudur).
 */
export async function allocateToDocument(
  db: SupabaseClient,
  input: { movementId: string; documentId: string; amountCents?: number },
): Promise<AllocationOutcome> {
  const documents = new MoneyDocumentService(db);
  const [movement, document] = await Promise.all([new MoneyMovementService(db).getById(input.movementId), documents.getById(input.documentId)]);
  if (!movement || !document) return { status: 'invalid', reason: 'not_found' };
  if (movement.direction !== document.direction) return { status: 'invalid', reason: 'direction_mismatch' };

  const allocations = new MoneyAllocationService(db);
  const existing = await allocations.listByMovements([movement.id]);
  if (existing.some((allocation) => allocation.documentId === document.id)) return { status: 'invalid', reason: 'already_allocated' };
  const remaining = movement.amountCents - existing.reduce((sum, allocation) => sum + allocation.amountCents, 0);
  if (remaining <= 0) return { status: 'invalid', reason: 'nothing_to_allocate' };

  let amountCents = input.amountCents;
  if (amountCents === undefined) {
    const open = (await documents.balances([document.id])).get(document.id)?.openAmountCents ?? document.amountCents;
    if (open <= 0) return { status: 'invalid', reason: 'document_settled' };
    amountCents = Math.min(remaining, open);
  }
  if (amountCents <= 0) return { status: 'invalid', reason: 'nothing_to_allocate' };
  if (amountCents > remaining) return { status: 'invalid', reason: 'over_movement' };

  const allocation = await allocations.insert({ movementId: movement.id, documentId: document.id, amountCents });
  return { status: 'ok', allocation };
}

/** Bağı kaldırır — hareket de belge de kalır, yalnız aradaki bağ gider; belgenin açık kalanı geri gelir. */
export async function removeAllocation(
  db: SupabaseClient,
  input: { movementId: string; documentId: string },
): Promise<{ status: 'ok' } | { status: 'invalid'; reason: 'not_found' }> {
  const removed = await new MoneyAllocationService(db).remove(input.movementId, input.documentId);
  return removed ? { status: 'ok' } : { status: 'invalid', reason: 'not_found' };
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
