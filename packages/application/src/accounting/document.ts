import {
  CounterpartyService,
  MoneyAllocationService,
  MoneyDocumentService,
  MoneyMovementService,
  MovementTagService,
  PurchaseOrderService,
  StockIntakeBalanceService,
  StockIntakeService,
} from '@lezzet/database';
import { checkDocumentFile, documentVatProblem, type DocumentVatProblem } from '@lezzet/domain-core';
import { financeDocumentScope, privateReadUrl, privateUploadUrl, r2Keys } from '@lezzet/storage';
import type { MoneyAllocation, MoneyDocument, MoneyDocumentBalance, MoneyDocumentInsert } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { natureProblemOf } from './natures';

/*
  Belge kapısı (DOMAIN §9): belge para değildir, borç doğurur; ödeme sonra hareket olarak gelir ve tutarlı bir bağla belgeye
  bağlanır, açık kalan `money_document_balance` görünümünden türer. Dosya sunucudan geçmez: istemci özel kovaya doğrudan yükler,
  anahtarı kapı kurar ki istemciden gelen yolu doğrulamayı unutmak kovanın her yerine yazma izni vermesin.
*/

export type DocumentOutcome =
  | { status: 'ok'; document: MoneyDocument }
  | {
      status: 'invalid';
      reason:
        | 'unknown_tag'
        | 'unknown_nature'
        | 'nature_direction'
        | 'unknown_counterparty'
        | 'party_conflict'
        | 'not_found'
        | 'wrong_key'
        | DocumentVatProblem
        | 'due_before_issue'
        | 'link_conflict'
        | 'link_needs_supplier'
        | 'link_not_found'
        | 'link_supplier_mismatch'
        | 'link_has_document';
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
 * Belge girişi; KDV kırılımı rejime ve oranına uyar, karşı taraf cari ya da tedarikçi, tür ve etiketler sözlükten. Dosya burada
 * bağlanmaz: anahtarı belge kimliğinden kurulduğu için önce belge doğar.
 */
export async function createMoneyDocument(db: SupabaseClient, input: MoneyDocumentInsert): Promise<DocumentOutcome> {
  // Kırılımın kuralı veri kısıtlarından önce sorulur: ret bir cümle olsun, PG hatası değil.
  const vatProblem = documentVatProblem({ ...input, vatRegime: input.vatRegime ?? 'standard', vatLines: input.vatLines ?? [] });
  if (vatProblem) return { status: 'invalid', reason: vatProblem };
  if (input.dueOn && input.dueOn < input.issuedOn) return { status: 'invalid', reason: 'due_before_issue' };
  if (input.counterpartyId && input.supplierId) return { status: 'invalid', reason: 'party_conflict' };
  const linkProblem = await supplyLinkProblemOf(db, input);
  if (linkProblem) return { status: 'invalid', reason: linkProblem };
  if (input.counterpartyId && !(await new CounterpartyService(db).getById(input.counterpartyId))?.isActive) {
    return { status: 'invalid', reason: 'unknown_counterparty' };
  }
  const natureProblem = await natureProblemOf(db, input.nature, input.direction);
  if (natureProblem) return { status: 'invalid', reason: natureProblem };
  if ((await unknownTagOf(db, input.tags ?? [])) !== null) return { status: 'invalid', reason: 'unknown_tag' };

  const document = await new MoneyDocumentService(db).insert(input);
  return { status: 'ok', document };
}

type SupplyLinkProblem = 'link_conflict' | 'link_needs_supplier' | 'link_not_found' | 'link_supplier_mismatch' | 'link_has_document';

/**
 * Fatura bir mal kabulüne ya da mal gelmeden kesildiyse bir tedarik siparişine bağlanır; tek bağ ve tedarikçi şartı veride de
 * durur, burada önce sorulur ki ret okunur olsun. Veride duramayan iki kural burada: alım aynı tedarikçinin olmalı ve faturası
 * girilmemiş olmalı, yoksa ikinci belge aynı borcu iki kez yazar.
 */
async function supplyLinkProblemOf(db: SupabaseClient, input: MoneyDocumentInsert): Promise<SupplyLinkProblem | null> {
  if (!input.stockIntakeId && !input.purchaseOrderId) return null;
  if (input.stockIntakeId && input.purchaseOrderId) return 'link_conflict';
  if (!input.supplierId) return 'link_needs_supplier';

  if (input.stockIntakeId) {
    // Görünümün `has_document`ı iki yolu da bilir: belge kabulün kendisine ya da SİPARİŞİNE bağlı olabilir.
    const intake = await new StockIntakeBalanceService(db).findByIntake(input.stockIntakeId);
    if (!intake) return 'link_not_found';
    if (intake.supplierId !== input.supplierId) return 'link_supplier_mismatch';
    return intake.hasDocument ? 'link_has_document' : null;
  }

  const orderId = input.purchaseOrderId;
  if (!orderId) return null;
  const order = await new PurchaseOrderService(db).getById(orderId);
  if (!order) return 'link_not_found';
  if (order.supplierId !== input.supplierId) return 'link_supplier_mismatch';
  const documents = new MoneyDocumentService(db);
  if ((await documents.listByPurchaseOrders([orderId])).length > 0) return 'link_has_document';
  // Siparişin kabullerinden birinin faturası KENDİ BAŞINA girilmişse sipariş faturası aynı malı ikinci kez borçlandırır.
  const intakes = await new StockIntakeService(db).listByPurchaseOrder(orderId);
  const intakeDocuments = await Promise.all(intakes.map((intake) => documents.listByIntake(intake.id)));
  return intakeDocuments.some((list) => list.length > 0) ? 'link_has_document' : null;
}

export type AllocationOutcome =
  | { status: 'ok'; allocation: MoneyAllocation }
  | { status: 'invalid'; reason: 'not_found' | 'direction_mismatch' | 'already_allocated' | 'nothing_to_allocate' | 'document_settled' };

/**
 * Hareketi belgeye bağlar; bağın tutarı hareketin bağlanmamış kalanı ile belgenin açık kalanının küçüğüdür ve elle verilmez, çünkü
 * Pennylane de hareketi faturalara bağlanma sırasıyla dağıtır. Yön aynı olmalı, aynı çift iki kez bağlanmaz; kapanmış belgeye bağ
 * kurulmaz, fazla ödeme hareketin bağlanmamış kalanında görünür.
 */
export async function allocateToDocument(
  db: SupabaseClient,
  input: { movementId: string; documentId: string },
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

  const open = (await documents.balances([document.id])).get(document.id)?.openAmountCents ?? document.amountCents;
  if (open <= 0) return { status: 'invalid', reason: 'document_settled' };

  const allocation = await allocations.insert({ movementId: movement.id, documentId: document.id, amountCents: Math.min(remaining, open) });
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
