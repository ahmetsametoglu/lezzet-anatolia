import { z } from 'zod';

/**
 * PostgreSQL `numeric` supabase-js'te **string** dönebilir (js `number` her numeric'i güvenle
 * temsil edemediği için sürücü kaybetmemeyi seçiyor). Okuma tarafında sayıya indirilir.
 *
 * Bu iki satır SEKİZ ayrı şema dosyasında birebir tekrarlanıyordu (fiyat · ürün · stok · stok
 * düzeltme · tedarik · sipariş · para · profil); para ya da oran taşıyan her yeni varlık bir kopya
 * daha ekliyordu. Tek kaynak burada — sürücü davranışı değişirse tek yerden döner.
 */
export const dbNumeric = z.union([z.number(), z.string()]).transform((v) => Number(v));

/** `null` geçebilen numeric alanlar (hedef marj, opsiyonel tutar). */
export const dbNumericNullable = z
  .union([z.number(), z.string()])
  .nullable()
  .transform((v) => (v == null ? null : Number(v)));
