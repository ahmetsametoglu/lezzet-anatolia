import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DiscountCodeInsertSchema,
  DiscountCodeSchema,
  DiscountCodeUpdateSchema,
  type DiscountCode,
  type DiscountCodeInsert,
  type DiscountCodeUpdate,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * Kupon KODLARI (0031) — bir kuralın birden çok kapısı; hepsi aynı kotayı açar.
 *
 * Kendi servisi var çünkü kendi tekilliği var: kod TÜM kurallar arasında harf-ayrımsız tekildir ve
 * o tekilliğin sahibi bu tablodur. Kural servisine iliştirilseydi "hangi kural" sorusuyla "hangi
 * kod" sorusu aynı yerde karışırdı.
 *
 * Liste SAYFALANMAZ: kod kümesi veriyle değil operatörün eliyle büyür (CLAUDE.md §1).
 */
export class DiscountCodeService extends BaseDbService<DiscountCode, DiscountCodeInsert, DiscountCodeUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'discount_code', DiscountCodeSchema, DiscountCodeInsertSchema, DiscountCodeUpdateSchema);
  }

  /** Bir kuralın kodları — yazılış sırasıyla (önce açılan önce). */
  listByDiscount(discountId: string): Promise<DiscountCode[]> {
    return this.getAll({ discountId }, { orderBy: 'createdAt', orderDirection: 'asc' });
  }

  /** Birden çok kuralın kodları — tek turda; kural başına sorgu N+1 olurdu. */
  async listByDiscounts(discountIds: readonly string[]): Promise<Map<string, DiscountCode[]>> {
    const result = new Map<string, DiscountCode[]>();
    if (discountIds.length === 0) return result;

    const rows = await this.getAll({ discountId: [...discountIds] }, { orderBy: 'createdAt', orderDirection: 'asc' });
    for (const row of rows) {
      const list = result.get(row.discountId);
      if (list) list.push(row);
      else result.set(row.discountId, [row]);
    }
    return result;
  }

  /**
   * Koda göre kapı — HARF AYRIMSIZ (DB indeksi de `upper(code)`). Yoksa `null`.
   *
   * Dönen satır hem kuralı hem hangi kodun tuttuğunu söyler: kullanım kaydı o kimliği taşır, "TR
   * kodu mu FR kodu mu tuttu" sorusu ancak böyle yanıtlanır.
   */
  async findByCode(code: string): Promise<DiscountCode | null> {
    const term = code.trim();
    if (!term) return null;
    const { data, error } = await this.supabase.from(this.tableName).select('*').ilike('code', term).limit(1);
    if (error) throw error;
    return this.parseRows(data ?? [])[0] ?? null;
  }

  /**
   * Kuralın kodlarını verilen kümeye EŞİTLER — eksikler silinir, yeniler eklenir, kalanlara
   * dokunulmaz.
   *
   * Dokunulmaması önemli: kod satırının kimliği kullanım kayıtlarında yaşıyor (`discount_use.
   * discount_code_id`). Her kaydetmede hepsini silip yeniden yazsaydık, adı değişmeyen bir kodun
   * geçmişi her düzenlemede kopardı ve "hangi kod tuttu" raporu boşalırdı.
   */
  async replaceCodes(discountId: string, codes: readonly DiscountCodeInsert[]): Promise<DiscountCode[]> {
    const existing = await this.listByDiscount(discountId);
    const keyOf = (code: string) => code.trim().toUpperCase();
    const wanted = new Map(codes.map((c) => [keyOf(c.code), c]));

    const stale = existing.filter((row) => !wanted.has(keyOf(row.code)));
    for (const row of stale) await this.delete(row.id);

    const survivors = existing.filter((row) => wanted.has(keyOf(row.code)));
    for (const row of survivors) {
      const want = wanted.get(keyOf(row.code))!;
      // Yalnız dil etiketi değişmiş olabilir; kodun kendisi (harf ayrımı dışında) aynı.
      if ((want.locale ?? null) !== row.locale) await this.update({ id: row.id, locale: want.locale ?? null });
    }

    const fresh = codes.filter((c) => !survivors.some((row) => keyOf(row.code) === keyOf(c.code)));
    for (const code of fresh) await this.insert({ ...code, discountId, code: code.code.trim() });

    return this.listByDiscount(discountId);
  }
}
