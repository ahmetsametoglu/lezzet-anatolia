import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Entegrasyon testlerinin **zemin toplama** yardımcısı. Testler yerel veritabanını kirletmemeli:
 * kalan satırlar operasyon ekranlarında çöp olarak görünür, sonraki koşuşların sayımlarını bozar
 * ve "bu kayıt gerçek mi test mi" sorusunu doğurur.
 *
 * Buradaki asıl bilgi **silme SIRASI**: FK'lerin çoğu `restrict` (parti duran varyant silinemez,
 * siparişi olan tedarikçi silinemez). Sıra yanlışsa teardown sessizce patlar ve kirlilik birikir.
 * Bu sıra tek yerde tutulur; her test dosyası kendi sırasını uydurursa biri mutlaka yanlış olur.
 *
 * Yalnız testlerden çağrılır (`@lezzet/database/testing`); paketin kamu API'sinde yer almaz.
 */
export interface PurgeTargets {
  /** Ürünler — varyantlar, fiyatlar ve koleksiyon bağları CASCADE ile gider. */
  productIds?: string[];
  categoryIds?: string[];
  collectionIds?: string[];
  /** Tedarikçiler — kod eşlemeleri CASCADE, siparişleri burada elle silinir. */
  supplierIds?: string[];
  /** Kimlik profilleri (`user_profiles`) — adresleri CASCADE ile gider. Ayrı müşteri tablosu yok. */
  profileIds?: string[];
  /** Sıcaklık kaydı konumları (testler benzersiz konum adı üretir). */
  temperatureLocations?: string[];
  /** OTP satırları (servis silme kapalı olduğu için doğrudan). */
  verificationEmails?: string[];
  /** Auth kullanıcıları — profil satırı `on delete set null` olduğu için ayrıca temizlenir. */
  authUserIds?: string[];
}

export async function purgeTestData(db: SupabaseClient, targets: PurgeTargets): Promise<void> {
  const {
    productIds = [],
    categoryIds = [],
    collectionIds = [],
    supplierIds = [],
    profileIds = [],
    temperatureLocations = [],
    verificationEmails = [],
    authUserIds = [],
  } = targets;

  // 1) Ürün grafiği: varyantlara `restrict` ile bağlı ne varsa ÖNCE gider.
  if (productIds.length > 0) {
    const variantIds = await idsOf(db, 'product_variant', 'product_id', productIds);
    if (variantIds.length > 0) {
      const stockIds = await idsOf(db, 'stock', 'variant_id', variantIds);
      if (stockIds.length > 0) await db.from('stock_adjustment').delete().in('stock_id', stockIds);
      await db.from('reservation').delete().in('variant_id', variantIds);
      await db.from('purchase_order_item').delete().in('variant_id', variantIds);
      await db.from('stock').delete().in('variant_id', variantIds);
    }
  }

  // 2) Tedarik grafiği: giriş → sipariş → tedarikçi. Girişler siparişe `set null`, partiler zaten gitti.
  if (supplierIds.length > 0) {
    await db.from('stock_intake').delete().in('supplier_id', supplierIds);
    await db.from('purchase_order').delete().in('supplier_id', supplierIds); // kalemleri CASCADE
    await db.from('supplier').delete().in('id', supplierIds); // eşlemeleri CASCADE
  }

  // 3) Katalog ve müşteri kökleri.
  if (productIds.length > 0) await db.from('product').delete().in('id', productIds);
  if (categoryIds.length > 0) await db.from('category').delete().in('id', categoryIds);
  if (collectionIds.length > 0) await db.from('collection').delete().in('id', collectionIds);
  if (profileIds.length > 0) await db.from('user_profiles').delete().in('id', profileIds); // adresleri CASCADE

  // 4) Bağımsız kayıtlar.
  if (temperatureLocations.length > 0) await db.from('temperature_log').delete().in('location', temperatureLocations);
  if (verificationEmails.length > 0) await db.from('email_verifications').delete().in('email', verificationEmails);

  // 5) Auth kullanıcısı EN SON: profil satırı ona `set null` ile bağlı, silinince profil yetim kalır —
  //    o yüzden profil de burada gider (trigger'ın açtığı satırın sahibi testtir).
  if (authUserIds.length > 0) {
    await db.from('user_profiles').delete().in('auth_user_id', authUserIds);
    for (const id of authUserIds) await db.auth.admin.deleteUser(id);
  }
}

/** Bir üst kaydın alt satır kimlikleri — silme sırası için gerekli ara adım. */
async function idsOf(db: SupabaseClient, table: string, column: string, parentIds: string[]): Promise<string[]> {
  const { data, error } = await db.from(table).select('id').in(column, parentIds);
  if (error) throw error;
  return (data ?? []).map((row) => (row as { id: string }).id);
}
