import { PennylaneDocumentService, SettingsService, type Db } from '@lezzet/database';
import { PENNYLANE_CATEGORY_GROUP, PENNYLANE_CATEGORY_KEYS, pennylaneByLabel, pennylaneInvoiceCategories } from '@lezzet/domain-core';
import { logger } from '@lezzet/observability';
import { BUSINESS_LABELS, type Business, type PennylaneCategory } from '@lezzet/types';
import type { PennylanePort } from './port';

/**
 * Faturanın Pennylane'deki analitik kategorisi belgenin işinden gelir (docs/feature/iki-is.md §2): Pennylane iki işin buluştuğu iç
 * defterdir ve iki işin gideri bu kategoriyle ayrılır.
 */

/** İşin ayardaki kategorisi; Pennylane'de yoksa grubuyla açılır. Ayar boşsa `null`, faturaya kategori yazılmaz. */
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

/** Okunamayan ayar işin adına düşer ve bunu söyler, faturalar sessizce kategorisiz kalmasın. */
async function categoryLabel(db: Db, business: Business): Promise<string | null> {
  const key = PENNYLANE_CATEGORY_KEYS[business];
  const value = await new SettingsService(db).get<unknown>(key, BUSINESS_LABELS[business]);
  if (typeof value === 'string') return value.trim() || null;
  logger.warn({ setting: key }, 'pennylane: kategori ayarı okunamadı, varsayılan kullanılıyor');
  return BUSINESS_LABELS[business];
}

/**
 * Faturanın kategorisini yazar, öteki eksenlerdeki kategorisini koruyarak; aynada aynı kategori duruyorsa Pennylane'e gidilmez, çünkü
 * orada elle yapılan değişiklik ezilmemeli. Pennylane'e yazıldıysa `true`.
 */
export async function writeInvoiceCategory(
  db: Db,
  pennylane: PennylanePort,
  input: { documentId: string; invoiceId: number; written: number | null; category: PennylaneCategory | null },
): Promise<boolean> {
  if (!input.category || input.written === input.category.id) return false;
  const categories = pennylaneInvoiceCategories(await pennylane.invoiceCategories(input.invoiceId), input.category);
  if (categories) await pennylane.setInvoiceCategories(input.invoiceId, categories);
  await new PennylaneDocumentService(db).setCategory(input.documentId, input.category.id);
  return categories !== null;
}
