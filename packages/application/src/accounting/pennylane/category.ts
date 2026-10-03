import { PennylaneDocumentService, SettingsService, type Db } from '@lezzet/database';
import {
  PENNYLANE_CATEGORY_DEFAULT,
  PENNYLANE_CATEGORY_GROUP,
  PENNYLANE_CATEGORY_KEY,
  pennylaneByLabel,
  pennylaneInvoiceCategories,
} from '@lezzet/domain-core';
import { logger } from '@lezzet/observability';
import type { PennylaneCategory } from '@lezzet/types';
import type { PennylanePort } from './port';

/**
 * Lezzet'in faturasının Pennylane'deki analitik kategorisi (docs/feature/kasa-muhasebe.md §2, karar 16). Pennylane şirketi toptan
 * operasyonuyla ortak olduğu için iki işin gideri bu kategoriyle ayrılır.
 */

/** Ayardaki kategori; Pennylane'de yoksa grubuyla açılır. Ayar boşsa `null`, faturaya kategori yazılmaz. */
export async function resolvePennylaneCategory(db: Db, pennylane: PennylanePort): Promise<PennylaneCategory | null> {
  const label = await categoryLabel(db);
  if (!label) return null;
  const existing = pennylaneByLabel(await pennylane.listCategories(), label);
  if (existing) return existing;
  const group =
    pennylaneByLabel(await pennylane.listCategoryGroups(), PENNYLANE_CATEGORY_GROUP) ??
    (await pennylane.createCategoryGroup(PENNYLANE_CATEGORY_GROUP));
  logger.info({ groupId: group.id }, 'pennylane: analitik kategori açılıyor');
  return pennylane.createCategory({ label, groupId: group.id });
}

/** Okunamayan ayar varsayılana düşer ve bunu söyler, faturalar sessizce kategorisiz kalmasın. */
async function categoryLabel(db: Db): Promise<string | null> {
  const value = await new SettingsService(db).get<unknown>(PENNYLANE_CATEGORY_KEY, PENNYLANE_CATEGORY_DEFAULT);
  if (typeof value === 'string') return value.trim() || null;
  logger.warn({ setting: PENNYLANE_CATEGORY_KEY }, 'pennylane: kategori ayarı okunamadı, varsayılan kullanılıyor');
  return PENNYLANE_CATEGORY_DEFAULT;
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
