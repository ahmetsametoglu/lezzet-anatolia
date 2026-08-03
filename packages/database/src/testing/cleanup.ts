import type { SupabaseClient } from '@supabase/supabase-js';

/** `delete()` çağrısının daraltılabilir hâli — `mustDelete`'in süzgeç geri çağrısı bunu alır. */
type DeleteBuilder = ReturnType<ReturnType<SupabaseClient['from']>['delete']>;

/**
 * Silme — **hatası fırlatılan** hâli (denetim R4).
 *
 * Supabase `delete()` hatayı FIRLATMAZ, sonuç nesnesinde döndürür. Teardown'larda kimse o nesneye
 * bakmadığı için `restrict` FK'ye takılan bir silme *düşen bir test* değil, **görünmez bir hiç**
 * oluyordu: satırlar kalıyor, koşu yeşil görünüyor, kirlilik haftalarca birikiyordu (ölçüldü:
 * `money_movement` 41 → 187). Fırlatılan hata vitest çıktısında görünür — sessiz birikim biter.
 *
 * Teardown'da fırlamak "testi düşürmek" değil, **teardown'un yalan söylemesini engellemektir**;
 * zaten testin kendisi çoktan geçmiş ya da kalmıştır.
 */
export async function mustDelete(
  db: SupabaseClient,
  table: string,
  narrow: (q: DeleteBuilder) => DeleteBuilder,
): Promise<void> {
  const { error } = await narrow(db.from(table).delete());
  if (error) throw new Error(`teardown: '${table}' silinemedi — ${error.message}`);
}

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
  /** Test depoları (`createTestWarehouse`) — bağlı transfer/eşik/bölge satırları burada gider. */
  warehouseIds?: string[];
  /**
   * Test hesapları (kasa/banka) — **para hareketleri burada gider** (denetim R1).
   *
   * Hareketi silmenin anahtarı HESAPTIR, sipariş değil: `money_movement.order_id`
   * `on delete set null`'dur, yani sipariş silindiği anda o anahtar buharlaşır ve hareket
   * bulunamaz hâle gelir. `account_id` ise `restrict` — hesabı silmeye çalışan teardown
   * hareketler durdukça sessizce yarım kalır. Doğru sıra: önce hareket, sonra hesap.
   */
  accountIds?: string[];
}

export async function purgeTestData(db: SupabaseClient, targets: PurgeTargets): Promise<void> {
  // TANIMSIZ kimlikler AYIKLANIR. `beforeAll` yarıda düşerse (ör. yığın cevap vermezse) kimlikler hiç
  // atanmamış olur ve teardown `invalid input syntax for uuid: "undefined"` ile İKİNCİ bir hata daha
  // basar; asıl sebep o gürültünün altında kaybolur. Silinecek şey yoksa yapılacak şey de yoktur.
  const clean = (ids?: (string | undefined | null)[]): string[] => (ids ?? []).filter((id): id is string => Boolean(id));
  const {
    productIds,
    categoryIds,
    collectionIds,
    supplierIds,
    profileIds,
    temperatureLocations,
    verificationEmails,
    authUserIds,
    warehouseIds,
    accountIds,
  } = {
    productIds: clean(targets.productIds),
    categoryIds: clean(targets.categoryIds),
    collectionIds: clean(targets.collectionIds),
    supplierIds: clean(targets.supplierIds),
    profileIds: clean(targets.profileIds),
    temperatureLocations: clean(targets.temperatureLocations),
    verificationEmails: clean(targets.verificationEmails),
    authUserIds: clean(targets.authUserIds),
    warehouseIds: clean(targets.warehouseIds),
    accountIds: clean(targets.accountIds),
  };

  // 1) Ürün grafiği: varyantlara `restrict` ile bağlı ne varsa ÖNCE gider.
  if (productIds.length > 0) {
    const variantIds = await idsOf(db, 'product_variant', 'product_id', productIds);
    if (variantIds.length > 0) {
      const stockIds = await idsOf(db, 'stock', 'variant_id', variantIds);
      if (stockIds.length > 0) await mustDelete(db, 'stock_adjustment', (q) => q.in('stock_id', stockIds));
      await mustDelete(db, 'reservation', (q) => q.in('variant_id', variantIds));
      await mustDelete(db, 'purchase_order_item', (q) => q.in('variant_id', variantIds));
      await mustDelete(db, 'stock', (q) => q.in('variant_id', variantIds));
    }
  }

  // 2) Para grafiği ÖNDE: hareket hem tedarik girişine hem siparişe hem hesaba bağlanır. Hesap
  //    silmesi `restrict` ile korunuyor, yani hareketler durdukça hesap gitmez (denetim R1).
  //    Karşı hesap da sayılır: transfer TEK satırdır ve karşı uçtan da `restrict` ile tutulur.
  if (accountIds.length > 0) {
    await mustDelete(db, 'money_movement', (q) => q.in('account_id', accountIds));
    await mustDelete(db, 'money_movement', (q) => q.in('counter_account_id', accountIds));
  }

  // 3) Tedarik grafiği: giriş → sipariş → tedarikçi. Girişler siparişe `set null`, partiler zaten gitti.
  if (supplierIds.length > 0) {
    await mustDelete(db, 'stock_intake', (q) => q.in('supplier_id', supplierIds));
    await mustDelete(db, 'purchase_order', (q) => q.in('supplier_id', supplierIds)); // kalemleri CASCADE
    await mustDelete(db, 'supplier', (q) => q.in('id', supplierIds)); // eşlemeleri CASCADE
  }

  // 4) Katalog ve müşteri kökleri.
  if (productIds.length > 0) await mustDelete(db, 'product', (q) => q.in('id', productIds));
  if (categoryIds.length > 0) await mustDelete(db, 'category', (q) => q.in('id', categoryIds));
  if (collectionIds.length > 0) await mustDelete(db, 'collection', (q) => q.in('id', collectionIds));
  if (profileIds.length > 0) await mustDelete(db, 'user_profiles', (q) => q.in('id', profileIds)); // adresleri CASCADE

  // 5) Bağımsız kayıtlar.
  if (temperatureLocations.length > 0) await mustDelete(db, 'temperature_log', (q) => q.in('location', temperatureLocations));
  if (verificationEmails.length > 0) await mustDelete(db, 'email_verifications', (q) => q.in('email', verificationEmails));

  // 6) Auth kullanıcısı EN SON: profil satırı ona `set null` ile bağlı, silinince profil yetim kalır —
  //    o yüzden profil de burada gider (trigger'ın açtığı satırın sahibi testtir).
  if (authUserIds.length > 0) {
    await mustDelete(db, 'user_profiles', (q) => q.in('auth_user_id', authUserIds));
    for (const id of authUserIds) await db.auth.admin.deleteUser(id);
  }

  // 7) Hesaplar, hareketleri gittikten sonra.
  if (accountIds.length > 0) await mustDelete(db, 'account', (q) => q.in('id', accountIds));

  // 8) Depolar EN SON, profillerden de sonra: depoya `restrict` ile bağlı ne varsa (parti, sipariş,
  //    giriş, sıcaklık kaydı, bölge) yukarıda gitti; personel kapsamı ise ayrı bir tetikleyiciyle
  //    korunuyor — kapsamda geçen depo silinemez, o yüzden profiller önce gitmek zorunda.
  if (warehouseIds.length > 0) {
    // Tedarikçisi olmayan mal kabulü de vardır (elle giriş) — o satır §3'te yakalanmaz ve depoyu
    // `restrict` ile tutar (denetim R3).
    await mustDelete(db, 'stock_intake', (q) => q.in('warehouse_id', warehouseIds));
    await mustDelete(db, 'warehouse_transfer', (q) => q.in('from_warehouse_id', warehouseIds)); // satırları CASCADE
    await mustDelete(db, 'warehouse_transfer', (q) => q.in('to_warehouse_id', warehouseIds));
    await mustDelete(db, 'warehouse_variant_threshold', (q) => q.in('warehouse_id', warehouseIds));
    await mustDelete(db, 'delivery_zone', (q) => q.in('warehouse_id', warehouseIds)); // posta kodları CASCADE
    // Belge numaratörü depo KODUNA çıpalı (`next_document_no('KBL-' || kod, yıl)`): test deposunun
    // sayacı depoyla birlikte gitmeli, yoksa her koşu tabloya iki ölü satır bırakır. FK yok, o
    // yüzden bu satır sessizce birikirdi — sayacı silmemek hiçbir yerde hata üretmez.
    const codes = await codesOf(db, warehouseIds);
    for (const code of codes) await mustDelete(db, 'document_counter', (q) => q.like('prefix', `%-${code}`));
    await mustDelete(db, 'warehouse', (q) => q.in('id', warehouseIds));
  }
}

/** Depo kodları — belge numaratörü kimliğe değil KODA çıpalı olduğu için gerekli. */
async function codesOf(db: SupabaseClient, warehouseIds: string[]): Promise<string[]> {
  const { data, error } = await db.from('warehouse').select('code').in('id', warehouseIds);
  if (error) throw error;
  return (data ?? []).map((row) => (row as { code: string }).code);
}

/** Bir üst kaydın alt satır kimlikleri — silme sırası için gerekli ara adım. */
async function idsOf(db: SupabaseClient, table: string, column: string, parentIds: string[]): Promise<string[]> {
  const { data, error } = await db.from(table).select('id').in(column, parentIds);
  if (error) throw error;
  return (data ?? []).map((row) => (row as { id: string }).id);
}
