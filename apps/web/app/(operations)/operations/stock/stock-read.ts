import { resolveLocalizedText, type StockMovementDetail } from '@lezzet/types';
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

export async function readActorNames(db: UserProfileService, rows: StockMovementDetail[]): Promise<Map<string, string>> {
  // `actor_id` FK taşımıyor (personel kimliği auth şemasında), gömülü select ile gelemez →
  // sayfadaki KİMLİKLER tek turda çözülür. Satır başına sorgu (N+1) bir geçmiş listesinde en pahalı
  // hatadır.
  const ids = [...new Set(rows.flatMap((r) => (r.actorId ? [r.actorId] : [])))];
  if (ids.length === 0) return new Map();
  const people = await db.listByIds(ids);
  return new Map(people.map((p) => [p.id, p.name]));
}

/** Defter kayıtlarını ekran satırına indirger — maliyet cent'e, adlar çözülmüş. */
export function toLossRows(
  rows: StockMovementDetail[],
  actorNames: Map<string, string> = new Map(),
  warehouseNames: Map<string, { code: string; name: string }> = new Map(),
): LossRow[] {
  return rows.map((row) => {
    const productName = resolveLocalizedText(row.stock.variant.product.name);
    const variantLabel = resolveLocalizedText(row.stock.variant.label);
    return {
      ...row,
      title: titleOf(productName, variantLabel),
      // Maliyet POZİTİF — `qty` de öyle. Yön `direction`da duruyor ve ekran onu YÖNLE söylüyor;
      // eskiden işaret buraya gömülüydü ve "−14,45 €" gibi satırlar doğuruyordu.
      costCents: row.unitCostCents === null ? null : row.unitCostCents * row.qty,
      actorName: (row.actorId && actorNames.get(row.actorId)) || null,
      // Ad çözülemezse `null` — kimlik satırda duruyor, uydurulmuş bir ad göstermekten iyidir.
      //
      // **KOD da taşınıyor** ve ekran onu gösteriyor: tam ad ("Strasbourg — ana depo") dar bir
      // sütuna sığmıyor ve ölçüldüğünde komşu sütunun üstüne biniyordu. Kod zaten operasyonun
      // dili — belge numaraları da onunla ayrışıyor (`TRF-STR-26-0006`), yani satırdaki iki alan
      // aynı şeyi söylüyor. Tam ad `title`da duruyor, kaybolmuyor.
      warehouseCode: warehouseNames.get(row.warehouseId)?.code ?? null,
      warehouseName: warehouseNames.get(row.warehouseId)?.name ?? null,
    };
  });
}
