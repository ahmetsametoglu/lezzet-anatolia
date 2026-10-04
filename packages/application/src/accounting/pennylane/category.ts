import { PennylaneDocumentService, PennylaneTransactionService, SettingsService, type Db } from '@lezzet/database';
import { PENNYLANE_CATEGORY_GROUP, PENNYLANE_CATEGORY_KEYS, pennylaneByLabel, pennylaneCategoriesWith } from '@lezzet/domain-core';
import { logger } from '@lezzet/observability';
import { BUSINESS_LABELS, type Business, type PennylaneCategory } from '@lezzet/types';
import type { PennylaneCategoryTarget, PennylanePort } from './port';

/**
 * Faturanın ve banka işleminin Pennylane'deki analitik kategorisi kaydın işinden gelir (docs/feature/iki-is.md §2): Pennylane iki işin
 * buluştuğu iç defterdir ve iki işin gideri bu kategoriyle ayrılır.
 */

/** Tur başına kategorisi yazılan banka işlemi; her işlem iki istektir ve istek sınırı turun öteki yazımlarıyla paylaşılır. */
const TRANSACTION_CATEGORY_BATCH = 50;

export type CategoryResolver = (business: Business) => Promise<PennylaneCategory | null>;

/** İşin ayardaki kategorisi; Pennylane'de yoksa grubuyla açılır. Ayar boşsa `null`, kayda kategori yazılmaz. */
export async function resolvePennylaneCategory(db: Db, pennylane: PennylanePort, business: Business): Promise<PennylaneCategory | null> {
  const label = await categoryLabel(db, business);
  if (!label) return null;
  const existing = pennylaneByLabel(await pennylane.listCategories(), label);
  if (existing) return existing;
  const group =
    pennylaneByLabel(await pennylane.listCategoryGroups(), PENNYLANE_CATEGORY_GROUP) ??
    (await pennylane.createCategoryGroup(PENNYLANE_CATEGORY_GROUP));
  logger.info({ groupId: group.id }, 'pennylane: analitik kategori açılıyor');
  return pennylane.createCategory({ label, groupId: group.id });
}

/** İş başına bir kez çözen okuyucu; turda her kayıt için Pennylane'e sormak istek sınırını yerdi. */
export function categoryResolver(db: Db, pennylane: PennylanePort): CategoryResolver {
  const resolved = new Map<Business, Promise<PennylaneCategory | null>>();
  return (business) => {
    const known = resolved.get(business) ?? resolvePennylaneCategory(db, pennylane, business);
    resolved.set(business, known);
    return known;
  };
}

/** Okunamayan ayar işin adına düşer ve bunu söyler, kayıtlar sessizce kategorisiz kalmasın. */
async function categoryLabel(db: Db, business: Business): Promise<string | null> {
  const key = PENNYLANE_CATEGORY_KEYS[business];
  const value = await new SettingsService(db).get<unknown>(key, BUSINESS_LABELS[business]);
  if (typeof value === 'string') return value.trim() || null;
  logger.warn({ setting: key }, 'pennylane: kategori ayarı okunamadı, varsayılan kullanılıyor');
  return BUSINESS_LABELS[business];
}

/** Kaydın kategorisini öteki eksenlerdeki kategorilerini koruyarak yazar; kayıt zaten öyleyse Pennylane'e yazılmaz. */
async function writeCategory(pennylane: PennylanePort, target: PennylaneCategoryTarget, category: PennylaneCategory): Promise<boolean> {
  const categories = pennylaneCategoriesWith(await pennylane.readCategories(target), category);
  if (categories) await pennylane.writeCategories(target, categories);
  return categories !== null;
}

/**
 * Faturanın kategorisini yazar; aynada aynı kategori duruyorsa Pennylane'e gidilmez, çünkü orada elle yapılan değişiklik ezilmemeli.
 * Pennylane'e yazıldıysa `true`.
 */
export async function writeInvoiceCategory(
  db: Db,
  pennylane: PennylanePort,
  input: { documentId: string; invoiceId: number; written: number | null; category: PennylaneCategory | null },
): Promise<boolean> {
  if (!input.category || input.written === input.category.id) return false;
  const written = await writeCategory(pennylane, { kind: 'invoice', id: input.invoiceId }, input.category);
  await new PennylaneDocumentService(db).setCategory(input.documentId, input.category.id);
  return written;
}

/**
 * Banka işleminin kategorisini hareketin işinden yazar ve işi aynaya işler; ayar boşsa yazılmaz ama satır bekleyen kümeden çıkar.
 * Pennylane'e yazıldıysa `true`.
 */
export async function writeTransactionCategory(
  db: Db,
  pennylane: PennylanePort,
  row: { pennylaneId: number; business: Business },
  category: CategoryResolver,
): Promise<boolean> {
  const target = await category(row.business);
  const written = target ? await writeCategory(pennylane, { kind: 'transaction', id: row.pennylaneId }, target) : false;
  await new PennylaneTransactionService(db).setCategoryBusiness(row.pennylaneId, row.business);
  return written;
}

/**
 * Kategorisi yazılmamış ya da hareketinin işi değişmiş banka işlemleri; Pennylane'de elle konan kategori, hareketin işi değişmedikçe
 * ezilmez. Düşen işlem bekleyen kümede kalır ve sonraki turda yeniden denenir.
 */
export async function syncTransactionCategories(db: Db, pennylane: PennylanePort): Promise<Record<string, number>> {
  const due = await new PennylaneTransactionService(db).listCategoryDue(TRANSACTION_CATEGORY_BATCH);
  const category = categoryResolver(db, pennylane);
  let written = 0;
  let failed = 0;
  for (const row of due) {
    try {
      if (await writeTransactionCategory(db, pennylane, row, category)) written += 1;
    } catch (err) {
      failed += 1;
      logger.warn(
        { pennylaneId: row.pennylaneId, err: err instanceof Error ? err.message : String(err) },
        'pennylane: işlem kategorisi yazılamadı',
      );
    }
  }
  return { due: due.length, written, failed };
}
