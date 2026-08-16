import { resolveLocalizedText, type StockAdjustmentDetail } from '@lezzet/types';
import type { UserProfileService } from '@lezzet/database';
import { titleOf } from '@/lib/catalog/title';
import { type LossRow } from './stock-types';

// DB satırı → view-model indirgemesi. RSC ve server action'lar bunu PAYLAŞIR: ilk sayfa ile sonraki
// sayfalar (ve lot sorgusunun sonucu) aynı şekli üretsin diye tek yerde durur.
//
// `toLevelRows` LIB'E TAŞINDI (16.08 — `lib/stock/level-rows`): seviye satırını artık ürünler
// önizlemesinin stok bakışı da kuruyor, kurulum tek sayfanın malı değil. Buradaki re-export bu
// klasördeki çağıranların (page · actions) yolunu korur.

export { toLevelRows } from '@/lib/stock/level-rows';

export async function readActorNames(db: UserProfileService, rows: StockAdjustmentDetail[]): Promise<Map<string, string>> {
  // `created_by` FK taşımıyor (0010), gömülü select ile gelemez → sayfadaki KİMLİKLER tek turda
  // çözülür. Satır başına sorgu (N+1) bir geçmiş listesinde en pahalı hatadır.
  const ids = [...new Set(rows.flatMap((r) => (r.createdBy ? [r.createdBy] : [])))];
  if (ids.length === 0) return new Map();
  const people = await db.listByIds(ids);
  return new Map(people.map((p) => [p.id, p.name]));
}

/** İmha/fire kayıtlarını ekran satırına indirger — maliyet cent'e, adlar çözülmüş. */
export function toLossRows(rows: StockAdjustmentDetail[], actorNames: Map<string, string> = new Map()): LossRow[] {
  return rows.map((row) => {
    const productName = resolveLocalizedText(row.stock.variant.product.name);
    const variantLabel = resolveLocalizedText(row.stock.variant.label);
    return {
      ...row,
      title: titleOf(productName, variantLabel),
      // İşaret KORUNUR: geri ekleme (negatif) maliyeti de negatif çıkar, net kayıp doğru toplanır.
      costCents: row.unitCostCents === null ? null : row.unitCostCents * row.qty,
      actorName: (row.createdBy && actorNames.get(row.createdBy)) || null,
    };
  });
}
