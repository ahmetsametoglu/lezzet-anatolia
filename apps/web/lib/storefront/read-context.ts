import 'server-only';
import { PriceService, StockService } from '@lezzet/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProductWithRelations } from '@lezzet/types';
import type { ProductContext } from './map';

/**
 * Bir ürün listesinin fiyat ve stok yan verilerini TOPLU okur (08.10).
 *
 * Kart başına sorgu atılmaz: liste kaç ürün olursa olsun sabit sayıda sorgu çalışır — 30 ürünlük
 * katalog sayfası 30 fiyat + 30 stok sorgusu atarsa sayfa açılmaz (`CLAUDE.md`: N+1 kırılır).
 * `findApplicableMap` bu iş için `PriceService`'e eklendi; stokta `getAvailableMap` zaten vardı.
 *
 * Fiyat ziyaretçi kanalından (`b2c`) okunur. Giriş yapmış müşterinin kanalı ve özel fiyatı 04/07
 * bağlandığında buraya parametre olarak girer — kart ve sayfa değişmez.
 */
export async function loadProductContext(db: SupabaseClient, rows: ProductWithRelations[]): Promise<Map<string, ProductContext>> {
  const context = new Map<string, ProductContext>();
  if (!rows.length) return context;

  const variantsByProduct = new Map(rows.map((r) => [r.id, r.variants]));
  const variantIds = rows.flatMap((r) => r.variants.filter((v) => v.isActive).map((v) => v.id));

  const [prices, stock] = await Promise.all([
    new PriceService(db).findApplicableMap(variantIds, 'b2c'),
    new StockService(db).getAvailableMap(variantIds),
  ]);

  for (const row of rows) {
    context.set(row.id, { variants: variantsByProduct.get(row.id) ?? [], prices, stock });
  }
  return context;
}
