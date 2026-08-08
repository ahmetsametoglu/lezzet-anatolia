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
  /** Tarifler — kalemleri CASCADE ile gider (`recipe_item.recipe_id`). */
  recipeIds?: string[];
  /**
   * Ürün aileleri (05.15). Üyelik ayrı tabloda DEĞİL — `product.family_id` kolonudur ve FK'si
   * `set null`, yani aile üyeleri dururken de silinebilir. Sıra baskısı yok; yine de burada
   * olması şart (`CLAUDE §4b`): silme bilgisi tek yerde durmalı, test dosyasına sızmamalı.
   */
  familyIds?: string[];
  /** Tedarikçiler — kod eşlemeleri CASCADE, siparişleri burada elle silinir. */
  supplierIds?: string[];
  /**
   * Siparişler (e2e checkout dumanları UI'dan GERÇEK sipariş açar — 00.9). Kalemler, durum
   * logları ve `discount_use` CASCADE ile gider; `money_movement.order_id` `set null` (hareketin
   * anahtarı HESAP, üstteki künye). Tek tuzak REZERVASYON: `reservation.order_id` FK'sız
   * (bilinçli — `0006`, tablo siparişten önce doğdu), yani hiçbir cascade toplamaz; burada açıkça
   * silinir, yoksa sipariş başına öksüz rezervasyon birikir ve `available_stock`u sessizce düşürür.
   */
  orderIds?: string[];
  /** Kimlik profilleri (`user_profiles`) — adresleri CASCADE ile gider. Ayrı müşteri tablosu yok. */
  profileIds?: string[];
  /**
   * WhatsApp konuşmaları (15.1) — mesajları CASCADE ile gider.
   *
   * Müşteriye bağlı konuşma zaten profil silinince gider (`conversation.customer_id` CASCADE); bu
   * hedef **kimliksiz** konuşmalar içindir. Kimliksiz konuşma bir kaza değil, tasarımın bir
   * hâlidir: adım 2'de webhook mesajı önce yazar, kimliği sonra çözer. Profile bağlı olmadıkları
   * için hiçbir cascade onları toplamaz — bildirilmezse sessizce birikirler.
   */
  conversationIds?: string[];
  /** Sıcaklık kaydı konumları (testler benzersiz konum adı üretir). */
  temperatureLocations?: string[];
  /**
   * Analitik oturum anahtarları — olay ve oturum satırları burada gider.
   *
   * Anahtar `session_key`, `id` DEĞİL: olay defterinde vekil anahtar yok (bilinçli — bkz. `0035`).
   * Testler damgalı bir anahtar üretir, yani silme kendi satırlarına kilitli kalır ve başka bir
   * ajanın ölçümüne dokunmaz (`CLAUDE §4b`).
   */
  analyticsSessionKeys?: string[];
  /**
   * Arama özeti satırları — anahtar TERİMİN KENDİSİ (`analytics_daily_search.query`).
   *
   * Oturum anahtarıyla silinemezler: özet gruplama sırasında oturumu kaybeder. Damgalı bir terim
   * kullanan test kendi satırını buradan bildirir; bildirmezse satır günlerce birikir ve
   * "aranıp bulunamayan" listesini test verisiyle kirletir.
   */
  analyticsSearchQueries?: string[];
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
  /**
   * Ayar satırları — kimlikle, ANAHTARLA DEĞİL: anahtar kapsam satırlarını da taşır ve anahtarla
   * silen bir test, kendi damgalı bölge satırıyla birlikte işletmenin gerçek ayarını da götürürdü.
   * Buraya yalnız testin KENDİ AÇTIĞI (damgalı kapsam — ör. e2e fikstürünün bölge satırı) kimlik
   * bildirilir; küresel tekil satırın geçici değişimi bu hedefin işi değil, `settingsSnapshot`ın.
   */
  settingIds?: string[];
  /**
   * Test iş adları — cron kabuğunun (`runJob`) BIRAKTIĞI İKİ İZ birden gider: `job_run` satırı ve
   * `error_log` kayıtları (`context->>job`).
   *
   * İkisi tek hedefte, çünkü tek bir kabuk ikisini birden yazıyor: düşen bir tur hem "koştu mu"
   * izini hem "neden koşamadı" kaydını bırakır. Ayrı hedefler olsaydı biri yazılıp öteki unutulur
   * ve `error_log` sessizce birikirdi — üstelik kimse fark etmezdi, çünkü artık satır bir HATA gibi
   * görünür ve "eski bir kayıt" sanılır.
   *
   * `job_run` iş adı başına TEK satır tutar: testler damgalı ad kullanmalı, gerçek iş adını
   * kullanan bir test üretim izini ezer.
   */
  jobNames?: string[];
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
    recipeIds,
    familyIds,
    supplierIds,
    orderIds,
    profileIds,
    conversationIds,
    temperatureLocations,
    verificationEmails,
    authUserIds,
    warehouseIds,
    accountIds,
    jobNames,
    settingIds,
    analyticsSessionKeys,
    analyticsSearchQueries,
  } = {
    analyticsSessionKeys: clean(targets.analyticsSessionKeys),
    analyticsSearchQueries: clean(targets.analyticsSearchQueries),
    productIds: clean(targets.productIds),
    categoryIds: clean(targets.categoryIds),
    collectionIds: clean(targets.collectionIds),
    recipeIds: clean(targets.recipeIds),
    familyIds: clean(targets.familyIds),
    supplierIds: clean(targets.supplierIds),
    orderIds: clean(targets.orderIds),
    profileIds: clean(targets.profileIds),
    conversationIds: clean(targets.conversationIds),
    temperatureLocations: clean(targets.temperatureLocations),
    verificationEmails: clean(targets.verificationEmails),
    authUserIds: clean(targets.authUserIds),
    warehouseIds: clean(targets.warehouseIds),
    accountIds: clean(targets.accountIds),
    jobNames: clean(targets.jobNames),
    settingIds: clean(targets.settingIds),
  };

  // 0a) Analitik: defterin hiçbir FK'si yok (bilinçli — `0035`), o yüzden sıradan bağımsız.
  //     GÜN özeti (`analytics_daily`) SİLİNMEZ: gün bazlıdır ve testin damgalı anahtarıyla
  //     eşleşmez; testler özeti kendi ürettiği güne bakarak sınar, küresel sayıya değil.
  if (analyticsSessionKeys.length > 0) {
    await mustDelete(db, 'analytics_event', (q) => q.in('session_key', analyticsSessionKeys));
    await mustDelete(db, 'analytics_session', (q) => q.in('session_key', analyticsSessionKeys));
  }
  //     Ama ÜRÜN ve ARAMA özetleri damgalı bir anahtar taşıyor (test ürünü, damgalı terim) — yani
  //     bırakılırlarsa gün geçtikçe biriken, kimsenin sahiplenmediği satırlar olurlar. Ürün özeti
  //     ürünle birlikte gider (anahtar `product_id`), arama özeti kendi hedefiyle.
  if (productIds.length > 0) {
    await mustDelete(db, 'analytics_daily_product', (q) => q.in('product_id', productIds));
  }
  if (analyticsSearchQueries.length > 0) {
    await mustDelete(db, 'analytics_daily_search', (q) => q.in('query', analyticsSearchQueries));
  }

  // 0) İş izleri: hiçbir şeye FK ile bağlı değiller, sıradan bağımsız — en başta gitsinler ki
  // aşağıdaki grafiklerden biri düşse bile gözlemleme tabloları kirli kalmasın.
  if (jobNames.length > 0) {
    await mustDelete(db, 'job_run', (q) => q.in('name', jobNames));
    for (const name of jobNames) await mustDelete(db, 'error_log', (q) => q.eq('context->>job', name));
  }

  // 0b) Sipariş grafiği ÜRÜNDEN VE PROFİLDEN ÖNCE: `order_item.variant_id` restrict ürünü,
  //     `order.customer_id` restrict profili tutar — sipariş dururken ikisi de silinemez.
  //     Rezervasyon AÇIKÇA: `order_id` bağı FK'sız (0006), cascade toplamaz (interface künyesi).
  if (orderIds.length > 0) {
    await mustDelete(db, 'reservation', (q) => q.in('order_id', orderIds));
    await mustDelete(db, 'order', (q) => q.in('id', orderIds)); // kalem/log/discount_use CASCADE
  }

  // 1) Ürün grafiği: varyantlara `restrict` ile bağlı ne varsa ÖNCE gider.
  if (productIds.length > 0) {
    const variantIds = await idsOf(db, 'product_variant', 'product_id', productIds);
    if (variantIds.length > 0) {
      const stockIds = await idsOf(db, 'stock', 'variant_id', variantIds);
      if (stockIds.length > 0) await mustDelete(db, 'stock_adjustment', (q) => q.in('stock_id', stockIds));
      await mustDelete(db, 'reservation', (q) => q.in('variant_id', variantIds));
      await mustDelete(db, 'purchase_order_item', (q) => q.in('variant_id', variantIds));
      // **Tarif kalemi ÜRÜNDEN ÖNCE** (05.16 · denetim eki 07.08): `recipe_item.variant_id` FK'si
      // `restrict` — tarifte duran varyantın ürünü silinemez. Burada olmasaydı, bir tarif fikstürü
      // kuran test MEVCUT ürün-fikstürlü testlerin teardown'unu kırardı; kırılma da kendi
      // dosyasında değil BAŞKA bir dosyada görünürdü.
      await mustDelete(db, 'recipe_item', (q) => q.in('variant_id', variantIds));
      await mustDelete(db, 'stock', (q) => q.in('variant_id', variantIds));
    }
  }

  // 2) Para grafiği ÖNDE: hareket hem tedarik girişine hem siparişe hem hesaba bağlanır. Hesap
  //    silmesi `restrict` ile korunuyor, yani hareketler durdukça hesap gitmez (denetim R1).
  //    Karşı hesap da sayılır: transfer TEK satırdır ve karşı uçtan da `restrict` ile tutulur.
  if (accountIds.length > 0) {
    await mustDelete(db, 'money_movement', (q) => q.in('account_id', accountIds));
    await mustDelete(db, 'money_movement', (q) => q.in('counter_account_id', accountIds));
    // Banka import zinciri de hesaba bağlı ve `bank_import` `restrict` — şablon `cascade` olduğu
    // için tek başına görünmez ama yükleme kaydı hesabı tutar. Sıra: yükleme → şablon (şablon
    // silinince yükleme `set null` alır, tersi FK'yi ihlal eder).
    await mustDelete(db, 'bank_import', (q) => q.in('account_id', accountIds));
    await mustDelete(db, 'bank_import_profile', (q) => q.in('account_id', accountIds));
  }

  // 3) Tedarik grafiği: giriş → sipariş → tedarikçi. Girişler siparişe `set null`, partiler zaten gitti.
  if (supplierIds.length > 0) {
    await mustDelete(db, 'stock_intake', (q) => q.in('supplier_id', supplierIds));
    await mustDelete(db, 'purchase_order', (q) => q.in('supplier_id', supplierIds)); // kalemleri CASCADE
    await mustDelete(db, 'supplier', (q) => q.in('id', supplierIds)); // eşlemeleri CASCADE
  }

  // 4) Katalog ve müşteri kökleri.
  // Tarif ÜRÜNDEN ÖNCE: kalemleri `cascade` ile gider ve o kalemler ürünün varyantını `restrict`
  // ile tutuyor. Ters sırada ürün silinemez ve hata BAŞKA bir testin teardown'unda görünürdü.
  if (recipeIds.length > 0) await mustDelete(db, 'recipe', (q) => q.in('id', recipeIds));
  if (productIds.length > 0) await mustDelete(db, 'product', (q) => q.in('id', productIds));
  // Aile ÜRÜNDEN SONRA: `product.family_id` FK'si `set null`, yani sıra zorunlu değil — ama ürünler
  // gittikten sonra silmek, aradaki bir hatada yarım kalan üyelik bırakmaz.
  if (familyIds.length > 0) await mustDelete(db, 'product_family', (q) => q.in('id', familyIds));
  if (categoryIds.length > 0) await mustDelete(db, 'category', (q) => q.in('id', categoryIds));
  if (collectionIds.length > 0) await mustDelete(db, 'collection', (q) => q.in('id', collectionIds));
  // Konuşma PROFİLDEN ÖNCE: profile bağlı olanlar zaten cascade ile giderdi, ama kimliksiz olanlar
  // gitmez ve bu sıra ikisini tek yoldan toplar. Mesajları `cascade` ile gider.
  if (conversationIds.length > 0) await mustDelete(db, 'conversation', (q) => q.in('id', conversationIds));
  if (profileIds.length > 0) await mustDelete(db, 'user_profiles', (q) => q.in('id', profileIds)); // adresleri CASCADE

  // 5) Bağımsız kayıtlar.
  if (temperatureLocations.length > 0) await mustDelete(db, 'temperature_log', (q) => q.in('location', temperatureLocations));
  if (verificationEmails.length > 0) await mustDelete(db, 'email_verifications', (q) => q.in('email', verificationEmails));
  // Ayar satırı bölgeye yalnız `scope_id` METNİYLE bağlı (FK yok) — hiçbir cascade toplamaz,
  // bildirilmezse damgalı bölge silindikten sonra sahipsiz kalır ve anahtarın kapsam listesini
  // sessizce şişirir.
  if (settingIds.length > 0) await mustDelete(db, 'settings', (q) => q.in('id', settingIds));

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
