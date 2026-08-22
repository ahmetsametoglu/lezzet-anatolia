import { ProductVariantService, VariantBarcodeService } from '@lezzet/database';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * ARAMA TERİMİ BİR KOD MU? (23.3) — fiyat ve tedarik seçicilerinin kod zinciri.
 *
 * İki arama da yalnız ÜRÜN ADINA bakıyordu (etüt §0'ın ölçtüğü boşluk): elinde koli olan operatör
 * barkodu okutup/yazıp ürünü bulamıyordu. Zincirin kendisi TEK kapıda (`findByCode`: barkod → sku
 * → tedarikçi kodu — ekranlar başka yol kurmaz, etüt §4); buradaki iş yalnız eşleşen varyantı
 * ÜRÜNE çıkarmak, çünkü iki seçici de ürün satırı üstünden okuyor ve "eşleşen ürünün tüm boyları
 * döner" kuralı kodla aramada da geçerli.
 *
 * `null` = terim kod değil → çağıran ada bakar. Kod eşleşirse ad araması HİÇ koşmaz: kod kesin
 * bir kimliktir, adın belirsizliğiyle harmanlamak "8691… yazan neden iki ürün görüyor" sorusunu
 * doğururdu.
 */
export async function productIdOfCode(db: SupabaseClient, term: string): Promise<string | null> {
  const query = term.trim();
  if (query.length === 0) return null;

  const match = await new VariantBarcodeService(db).findByCode(query);
  if (!match) return null;
  return (await new ProductVariantService(db).getById(match.variantId))?.productId ?? null;
}
