import type { SupabaseClient } from '@supabase/supabase-js';

/** `delete()` çağrısının daraltılabilir hâli — `mustDelete`'in süzgeç geri çağrısı bunu alır. */
type DeleteBuilder = ReturnType<ReturnType<SupabaseClient['from']>['delete']>;

/**
 * Hatası fırlatılan silme: Supabase `delete()` hatayı sonuç nesnesinde döndürür ve teardown'da kimse ona bakmadığı için `restrict` FK'ye
 * takılan silme görünmez bir birikime dönerdi. Teardown'da fırlamak testi düşürmek değil, teardown'un yalan söylemesini engellemektir.
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
 * Bir varyantın partilerini sırasıyla siler: önce partiyi `restrict` ile tutan bağlar, sonra parti. Sıra testte değil burada durur,
 * çünkü her dosya kendi sırasını uydurursa biri mutlaka yanlış olur.
 */
export async function purgeVariantStock(db: SupabaseClient, variantIds: readonly string[]): Promise<void> {
  const ids = variantIds.filter(Boolean);
  if (ids.length === 0) return;
  const stockIds = await idsOf(db, 'stock', 'variant_id', [...ids]);
  if (stockIds.length > 0) {
    // Partiyi tutan dört bağın dördü de `restrict`; sıra tek yerde dursun diye hepsi burada.
    await mustDelete(db, 'stock_movement', (q) => q.in('stock_id', stockIds));
    // Hazırlık/satış kalem eşlemesi — siparişin kendisi durabilir, kalem–parti bağı gider.
    await mustDelete(db, 'order_item_batch', (q) => q.in('stock_id', stockIds));
    // Sevk satırı partiyi İKİ uçtan tutuyor (kaynak ve hedef).
    await mustDelete(db, 'warehouse_transfer_line', (q) => q.in('source_stock_id', stockIds));
    await mustDelete(db, 'warehouse_transfer_line', (q) => q.in('target_stock_id', stockIds));
    // Partiye ÇIPALI rezervasyon (near-expiry teklif satırı).
    await mustDelete(db, 'reservation', (q) => q.in('stock_id', stockIds));
  }
  await mustDelete(db, 'stock', (q) => q.in('variant_id', [...ids]));
}

/**
 * Siparişleri sırasıyla siler: onları tutan bağlar önce, sipariş sonra; testlerin `beforeEach`i de aynı sıraya muhtaçtır. Anahtar
 * sipariştir, parti değil, çünkü siparişi tutan hareket başka bir partiye bağlı olabilir (kapı satışı aracın partisinden mal çıkarır).
 */
export async function purgeOrders(db: SupabaseClient, orderIds: readonly string[]): Promise<void> {
  const ids = [...new Set(orderIds.filter(Boolean))];
  if (ids.length === 0) return;

  await mustDelete(db, 'reservation', (q) => q.in('order_id', ids));
  // Siparişe ve talebe asılı bildirimler hedefleriyle birlikte gider: `notification` hedefini FK'siz tutar ve personel fan-out'u
  // satırı purge'ün malı olmayan gerçek yönetici profillerine yazar.
  const ticketIds = await idsOf(db, 'ticket', 'order_id', ids);
  const bildirimHedefleri: [string, string[]][] = [
    ['order', ids],
    ...(ticketIds.length > 0 ? ([['ticket', ticketIds]] as [string, string[]][]) : []),
  ];
  for (const [tur, kimlikler] of bildirimHedefleri) {
    await mustDelete(db, 'notification', (q) => q.eq('target_type', tur).in('target_id', kimlikler));
  }
  // Talepler siparişten önce: kaleme bağlı talepte sipariş silinince `ticket.order_id` `set null` düşer ve `ticket_items_need_order`
  // kısıtı patlar. Mesajlar ve kuyruk satırı talebe cascade.
  await mustDelete(db, 'ticket', (q) => q.in('order_id', ids));
  // Stok defteri siparişten önce, çünkü `stock_movement.order_id` `restrict`; `set null` çözüm değil, `stock_movement_source` kısıtı
  // satış satırında siparişi zorunlu tutar.
  await mustDelete(db, 'stock_movement', (q) => q.in('order_id', ids));
  // Kasa fişi siparişi `restrict` ile tutar; satırları ve ödemeleri fişe cascade.
  await mustDelete(db, 'register_ticket', (q) => q.in('order_id', ids));
  // Kalem–parti eşlemesi siparişe `cascade`, partiye `restrict` bağlı: sipariş silinince kendi
  // gider, ama partisi hâlâ duruyorsa `purgeVariantStock` onu ayrıca toplamak zorunda kalır.
  await mustDelete(db, 'order', (q) => q.in('id', ids)); // kalem/log/discount_use CASCADE
}

/** Siparişleri bir sütundan bularak siler; testler siparişi kimlikten değil bağlamdan tanır ("bu müşterinin", "bu deponun"). */
export async function purgeOrdersBy(
  db: SupabaseClient,
  column: 'customer_id' | 'warehouse_id' | 'delivery_run_id',
  values: readonly string[],
): Promise<void> {
  const ids = values.filter(Boolean);
  if (ids.length === 0) return;
  await purgeOrders(db, await idsOf(db, 'order', column, [...ids]));
}

/**
 * Sefer ve kapanışı: kurye profili, depo ve araç seferi `restrict` ile tutar, hangisi silinecekse önce o kaynağın seferleri gider.
 * Kapanış seferi tuttuğu için önce `delivery_run_close`.
 */
async function purgeDeliveryRuns(
  db: SupabaseClient,
  column: 'courier_id' | 'warehouse_id' | 'vehicle_id',
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const { data, error } = await db.from('delivery_run').select('id').in(column, ids);
  if (error) throw new Error(`teardown: 'delivery_run' okunamadı — ${error.message}`);
  const runIds = (data ?? []).map((row) => row.id as string);
  if (runIds.length === 0) return;
  await mustDelete(db, 'delivery_run_close', (q) => q.in('delivery_run_id', runIds));
  await mustDelete(db, 'delivery_run', (q) => q.in('id', runIds));
}

/**
 * Entegrasyon testlerinin zemin toplama yardımcısı; asıl bilgi silme sırasıdır, çünkü FK'lerin çoğu `restrict` ve yanlış sıra teardown'u
 * yarım bırakır. Sıra tek yerde tutulur ve yalnız testlerden çağrılır (`@lezzet/database/testing`).
 */
export interface PurgeTargets {
  /** Ürünler — varyantlar, fiyatlar ve koleksiyon bağları CASCADE ile gider. */
  productIds?: string[];
  categoryIds?: string[];
  collectionIds?: string[];
  /** Tarifler — kalemleri CASCADE ile gider (`recipe_item.recipe_id`). */
  recipeIds?: string[];
  /** Ürün aileleri; üyelik `product.family_id` kolonudur (`set null`), sıra baskısı yok ama silme bilgisi tek yerde durur. */
  familyIds?: string[];
  /** Tedarikçiler — kod eşlemeleri CASCADE, siparişleri burada elle silinir. */
  supplierIds?: string[];
  /**
   * Siparişler; kalemler, durum logları ve `discount_use` CASCADE ile gider. Rezervasyonun sipariş bağı FK'sızdır, açıkça silinmezse öksüz
   * rezervasyon birikir ve `available_stock`u sessizce düşürür.
   */
  orderIds?: string[];
  /**
   * Kimlik profilleri; adresleri ve kanıtlanmış numaraları CASCADE ile gider. Profili `restrict` ile tutan siparişler ve kurye gün
   * kapanışları da burada gider, çünkü bilgi testte dursaydı `beforeAll` düşünce tanımsız kimlik teardown'u tümden atlatırdı.
   */
  profileIds?: string[];
  /** Asistan onay kuyruğu satırları; kimse onları tutmaz ama kimse de toplamaz, silinmezse kuyruk test önerileriyle dolar. */
  assistantProposalIds?: string[];
  /**
   * MCP bağlantı anahtarları ve çağrı izleri; iz anahtara `set null` ile bağlı olduğu için önce iz, sonra anahtar silinir, yoksa panelin
   * "son çağrılar" listesi test artığıyla dolar.
   */
  mcpConnectionKeyIds?: string[];
  /**
   * Personel fan-out'unun bildirim satırları; `dispatchStaffNotification` gerçek personel profillerine yazar ve o profiller purge'ün malı
   * değildir. Sipariş ve talep hedefli satırlar `orderIds` dalında hedefleriyle gider.
   */
  notificationIds?: string[];
  /**
   * Sahiplenilmiş webhook olayları, sağlayıcı kimliğiyle (`event_id`). Silinmezse aynı olay kimliği sonraki koşuda "zaten sahiplenilmiş"
   * sayılır ve tekrar-güvenliği sınayan test sebebini göstermeden düşer.
   */
  webhookEventIds?: string[];
  /**
   * WhatsApp konuşmaları, mesajlarıyla; müşteriye bağlı olan profille gider, bu hedef kimliksiz konuşmalar içindir. Webhook mesajı önce
   * yazar, kimliği sonra çözer, o yüzden kimliksiz konuşmayı hiçbir cascade toplamaz.
   */
  conversationIds?: string[];
  /** AI kullanım satırları; sohbete ve talebe `set null` ile bağlıdır ki maliyet kaydı kalsın, o yüzden hiçbir cascade toplamaz. */
  aiUsageIds?: string[];
  /**
   * Ölçüm noktaları; sıcaklık kaydı onları `restrict` ile tutar, kayıt önce gider. Alan da depoyu `restrict` ile tutar, bildirilmezse
   * teardown depoda takılır ve depo operatörün seçicisinde kalır.
   */
  storageAreaIds?: string[];
  vehicleIds?: string[];
  /**
   * "Bölgeye girince haber ver" kayıtları, posta koduyla; kayıt henüz olmayan bir bölge için açıldığından FK yoktur ve `customer_id`
   * `set null`, yani hiçbir cascade toplamaz.
   */
  zoneNoticePostalCodes?: string[];
  /** Analitik oturum anahtarları; olay defterinde vekil anahtar yoktur ve damgalı anahtar silmeyi testin kendi satırlarına kilitler. */
  analyticsSessionKeys?: string[];
  /** Arama özeti satırları, terimin kendisiyle; özet oturumu kaybettiği için oturum anahtarıyla silinemez. */
  analyticsSearchQueries?: string[];
  /** OTP satırları (servis silme kapalı olduğu için doğrudan). */
  verificationEmails?: string[];
  /** Auth kullanıcıları — profil satırı `on delete set null` olduğu için ayrıca temizlenir. */
  authUserIds?: string[];
  /** Test depoları (`createTestWarehouse`) — bağlı transfer/eşik/bölge satırları burada gider. */
  warehouseIds?: string[];
  /**
   * Test hesapları; para hareketleri burada gider, çünkü `money_movement.order_id` `set null` olduğundan hareketin anahtarı hesaptır.
   * `account_id` `restrict`: önce hareket, sonra hesap.
   */
  accountIds?: string[];
  /** Test belgeleri; bağı (`money_allocation`) iki uçtan `cascade`, hareketlerden sonra silinir. */
  documentIds?: string[];
  /** Testin sözlüğe eklediği etiketler, damgalı slug'la; hareketlerden sonra, etiket taşıyan satır kalmasın. */
  tagSlugs?: string[];
  /** Testin eklediği türler; hareket, belge ve carinin varsayılanı türe FK ile bağlıdır, o yüzden hepsinden sonra. */
  natureSlugs?: string[];
  /** Testin açtığı cariler; hareket ve belge bağı `set null`, hareketlerden sonra ve türlerden önce. */
  counterpartyIds?: string[];
  /**
   * Ayar satırları, kimlikle: anahtar kapsam satırlarını da taşır ve anahtarla silen test işletmenin gerçek ayarını götürürdü. Küresel
   * tekil satırın geçici değişimi `settingsSnapshot`ın işidir.
   */
  settingIds?: string[];
  /**
   * Test iş adları; cron kabuğunun bıraktığı iki iz (`job_run` ve `error_log`) birlikte gider, çünkü ayrı hedefte biri unutulur ve
   * `error_log` sessizce birikirdi. `job_run` ad başına tek satırdır, testler damgalı ad kullanır.
   */
  jobNames?: string[];
}

export async function purgeTestData(db: SupabaseClient, targets: PurgeTargets): Promise<void> {
  // Tanımsız kimlikler ayıklanır: `beforeAll` yarıda düştüyse teardown ikinci bir uuid hatası basar ve asıl sebep gürültünün altında
  // kaybolurdu.
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
    assistantProposalIds,
    mcpConnectionKeyIds,
    notificationIds,
    webhookEventIds,
    conversationIds,
    aiUsageIds,
    storageAreaIds,
    vehicleIds,
    zoneNoticePostalCodes,
    verificationEmails,
    authUserIds,
    warehouseIds,
    accountIds,
    documentIds,
    tagSlugs,
    natureSlugs,
    counterpartyIds,
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
    assistantProposalIds: clean(targets.assistantProposalIds),
    mcpConnectionKeyIds: clean(targets.mcpConnectionKeyIds),
    notificationIds: clean(targets.notificationIds),
    webhookEventIds: clean(targets.webhookEventIds),
    conversationIds: clean(targets.conversationIds),
    aiUsageIds: clean(targets.aiUsageIds),
    storageAreaIds: clean(targets.storageAreaIds),
    vehicleIds: clean(targets.vehicleIds),
    zoneNoticePostalCodes: clean(targets.zoneNoticePostalCodes),
    verificationEmails: clean(targets.verificationEmails),
    authUserIds: clean(targets.authUserIds),
    warehouseIds: clean(targets.warehouseIds),
    accountIds: clean(targets.accountIds),
    documentIds: clean(targets.documentIds),
    tagSlugs: clean(targets.tagSlugs),
    natureSlugs: clean(targets.natureSlugs),
    counterpartyIds: clean(targets.counterpartyIds),
    jobNames: clean(targets.jobNames),
    settingIds: clean(targets.settingIds),
  };

  /**
   * Bir engel arkasındaki her şeyi bırakmasın: gruplar birbirine FK ile bağlı olmayan dallardır, biri düşse öteki yine denenir. Hatalar
   * biriktirilir ve sonda topluca fırlar; teardown hem işini bitirir hem ne yapamadığını söyler.
   */
  const failures: string[] = [];
  const step = async (fn: () => Promise<void>): Promise<void> => {
    try {
      await fn();
    } catch (err) {
      failures.push(err instanceof Error ? err.message : String(err));
    }
  };

  // 0a) Analitik: defterin FK'si yok, sıradan bağımsız. Gün özeti silinmez; testler özeti kendi ürettiği güne bakarak sınar.
  await step(async () => {
    if (analyticsSessionKeys.length > 0) {
      // Ürün özeti olaylar silinmeden okunur: uydurma ürün kimliğiyle yazılan olayın özet satırı `productIds` süzgecine girmez ve
      // öksüz kalırdı.
      const { data: signalRows } = await db
        .from('analytics_event')
        .select('product_id')
        .in('session_key', analyticsSessionKeys)
        .not('product_id', 'is', null);
      const signalProductIds = [...new Set((signalRows ?? []).map((row) => (row as { product_id: string }).product_id))];

      await mustDelete(db, 'analytics_event', (q) => q.in('session_key', analyticsSessionKeys));
      await mustDelete(db, 'analytics_session', (q) => q.in('session_key', analyticsSessionKeys));
      if (signalProductIds.length > 0) {
        await mustDelete(db, 'analytics_daily_product', (q) => q.in('product_id', signalProductIds));
      }
    }
    // Ürün ve arama özetleri damgalı anahtar taşır, bırakılırsa sahipsiz birikir: ürün özeti ürünle, arama özeti kendi hedefiyle gider.
    if (productIds.length > 0) {
      await mustDelete(db, 'analytics_daily_product', (q) => q.in('product_id', productIds));
    }
    if (analyticsSearchQueries.length > 0) {
      await mustDelete(db, 'analytics_daily_search', (q) => q.in('query', analyticsSearchQueries));
    }
  });

  // 0) İş izleri: FK'leri yok, en başta gitsinler ki aşağıdaki gruplardan biri düşse de gözlem tabloları temiz kalsın.
  await step(async () => {
    if (jobNames.length > 0) {
      await mustDelete(db, 'job_run', (q) => q.in('name', jobNames));
      for (const name of jobNames) await mustDelete(db, 'error_log', (q) => q.eq('context->>job', name));
    }
  });

  // 0a) Asistan önerileri: bağımsız satırlar, sırası önemsiz — ama silinmezlerse hiç toplanmazlar.
  await step(async () => {
    if (assistantProposalIds.length > 0) {
      await mustDelete(db, 'assistant_proposal', (q) => q.in('id', assistantProposalIds));
    }
    // Bildirimler de bağımsız: hiçbir şey onları restrict ile tutmaz, ama personel fan-out'unun
    // satırlarını profil cascade'i DE toplamaz — kimlikle gelirler (künye yukarıda).
    if (notificationIds.length > 0) {
      await mustDelete(db, 'notification', (q) => q.in('id', notificationIds));
    }
    // Webhook olayları da bağımsız: mesajı silinmiş bir olay kaydı geride kalırsa, aynı sağlayıcı
    // kimliği bir daha ASLA yazılamaz (claim onu tekrar sayar) — sessiz bir kilit olurdu.
    if (webhookEventIds.length > 0) {
      await mustDelete(db, 'webhook_event', (q) => q.in('event_id', webhookEventIds));
    }
    // MCP anahtarı: İZ ÖNCE. Bağ `set null` olduğu için anahtar tek başına silinebilir ama izi
    // sahipsiz kalır ve panelin "son çağrılar" listesinde birikir (künye yukarıda).
    if (mcpConnectionKeyIds.length > 0) {
      await mustDelete(db, 'mcp_call_log', (q) => q.in('connection_key_id', mcpConnectionKeyIds));
      await mustDelete(db, 'mcp_connection_key', (q) => q.in('id', mcpConnectionKeyIds));
    }
  });

  // ── ANA ZİNCİR: sipariş → ürün → tedarik → katalog → profil ─────────────────────────────────
  // Tek grup, çünkü halkalar birbirini `restrict` ile tutuyor: biri kalırsa sonrakinin denenmesi
  // zaten anlamsız. Depo ve para AYRI gruplarda — onlar bu zincirin dalı değil, komşusu.
  await step(async () => {
    // 0b) Sipariş grafiği üründen ve profilden önce: `order_item.variant_id` ürünü, `order.customer_id` profili `restrict` ile tutar.
    //     Profilin siparişleri aynı listeye katılır, çünkü FK'siz rezervasyon bağını iki yerde kapatmak birini unutmanın kapısıdır.
    const allOrderIds =
      profileIds.length > 0
        ? [...new Set([...orderIds, ...(await idsOf(db, 'order', 'customer_id', profileIds))])]
        : orderIds;

    await purgeOrders(db, allOrderIds);

    // 0c) Depo devirleri partilerden önce: `warehouse_transfer_line` partiyi iki uçtan `restrict` ile tutar. Başlık gider, satırları
    //     CASCADE.
    if (warehouseIds.length > 0) {
      // Stok defteri transferden de önce, çünkü `stock_movement.transfer_id` `restrict`; depo kimliğinden gidilir, hareketin kendi
      // `warehouse_id`si var.
      await mustDelete(db, 'stock_movement', (q) => q.in('warehouse_id', warehouseIds));
      await mustDelete(db, 'warehouse_transfer', (q) => q.in('from_warehouse_id', warehouseIds));
      await mustDelete(db, 'warehouse_transfer', (q) => q.in('to_warehouse_id', warehouseIds));
    }

    // 1) Ürün grafiği: varyantlara `restrict` ile bağlı ne varsa ÖNCE gider.
    if (productIds.length > 0) {
      const variantIds = await idsOf(db, 'product_variant', 'product_id', productIds);
      if (variantIds.length > 0) {
        const stockIds = await idsOf(db, 'stock', 'variant_id', variantIds);
        // Stok defteri partiden önce (`stock_movement.stock_id` `restrict`); ters kayıtların `reverses_id` self-FK'sını tek `delete`
        // ifadesi kendiliğinden çözer.
        if (stockIds.length > 0) {
          await mustDelete(db, 'stock_movement', (q) => q.in('stock_id', stockIds));
          // Kalem–parti eşlemesi de partiyi `restrict` ile tutar; sipariş purge'ün kapsamı dışındaysa onu cascade toplamaz.
          await mustDelete(db, 'order_item_batch', (q) => q.in('stock_id', stockIds));
        }
        await mustDelete(db, 'reservation', (q) => q.in('variant_id', variantIds));
        await mustDelete(db, 'purchase_order_item', (q) => q.in('variant_id', variantIds));
        // Tarif kalemi üründen önce: `recipe_item.variant_id` `restrict` ve burada olmasaydı tarif fikstürü başka dosyanın teardown'unu
        // kırardı.
        await mustDelete(db, 'recipe_item', (q) => q.in('variant_id', variantIds));
        // Kasa ürün eşlemesi varyantı `restrict` ile tutar.
        await mustDelete(db, 'register_product', (q) => q.in('variant_id', variantIds));
        await mustDelete(db, 'stock', (q) => q.in('variant_id', variantIds));
      }
    }

    // 3) Tedarik grafiği: giriş → sipariş → tedarikçi. Girişler siparişe `set null`, partiler zaten gitti.
    if (supplierIds.length > 0) {
      // Stok defteri mal kabulden önce (`stock_movement.intake_id` `restrict`); parti dalı bu satırları yalnız `productIds` verilmişse
      // yakalar.
      const intakeIds = await idsOf(db, 'stock_intake', 'supplier_id', supplierIds);
      if (intakeIds.length > 0) await mustDelete(db, 'stock_movement', (q) => q.in('intake_id', intakeIds));
      await mustDelete(db, 'stock_intake', (q) => q.in('supplier_id', supplierIds));
      await mustDelete(db, 'purchase_order', (q) => q.in('supplier_id', supplierIds)); // kalemleri CASCADE
      await mustDelete(db, 'supplier', (q) => q.in('id', supplierIds)); // eşlemeleri CASCADE
    }

    // 4) Katalog ve müşteri kökleri.
    // Tarif üründen önce: kalemleri `cascade` ile gider ve ürünün varyantını `restrict` ile tutar, ters sırada hata başka testin
    // teardown'unda görünürdü.
    if (recipeIds.length > 0) await mustDelete(db, 'recipe', (q) => q.in('id', recipeIds));
    if (productIds.length > 0) await mustDelete(db, 'product', (q) => q.in('id', productIds));
    // Aile ÜRÜNDEN SONRA: `product.family_id` FK'si `set null`, yani sıra zorunlu değil — ama ürünler
    // gittikten sonra silmek, aradaki bir hatada yarım kalan üyelik bırakmaz.
    if (familyIds.length > 0) await mustDelete(db, 'product_family', (q) => q.in('id', familyIds));
    if (categoryIds.length > 0) await mustDelete(db, 'category', (q) => q.in('id', categoryIds));
    if (collectionIds.length > 0) await mustDelete(db, 'collection', (q) => q.in('id', collectionIds));
    // AI kullanım satırları bağımsız (FK'leri `set null`) — sıra zorunlu değil, konuşmanın yanında toplanır.
    if (aiUsageIds.length > 0) await mustDelete(db, 'ai_usage', (q) => q.in('id', aiUsageIds));
    // Konuşma PROFİLDEN ÖNCE: profile bağlı olanlar zaten cascade ile giderdi, ama kimliksiz olanlar
    // gitmez ve bu sıra ikisini tek yoldan toplar. Mesajları `cascade` ile gider.
    if (conversationIds.length > 0) await mustDelete(db, 'conversation', (q) => q.in('id', conversationIds));
    if (profileIds.length > 0) {
      // Sefer kaydı kuryeyi `restrict` ile tutar (0046); kapanış da seferi tutar — ikisi tek
      // yardımcıdan, sabit sırayla gider. `closed_by` `set null`, ikinci silme gerektirmez.
      await purgeDeliveryRuns(db, 'courier_id', profileIds);
      // Talepler profilden önce ve açıkça: tek DELETE içinde sıra tanımsızdır ve personel profili önce düşerse cevabın `author_id`si
      // `set null` olur, `ticket_message_author` kısıtı patlar.
      await mustDelete(db, 'ticket', (q) => q.in('customer_id', profileIds));
      // "Gelince haber ver" kayıtları profilden önce: `customer_id` `set null`, profil gidince satır sahipsiz kalır ve hiçbir cascade
      // toplamaz.
      await mustDelete(db, 'variant_stock_notice', (q) => q.in('customer_id', profileIds));
      await mustDelete(db, 'user_profiles', (q) => q.in('id', profileIds)); // adresleri CASCADE
    }

    // 6) Auth kullanıcısı EN SON: profil satırı ona `set null` ile bağlı, silinince profil yetim kalır —
    //    o yüzden profil de burada gider (trigger'ın açtığı satırın sahibi testtir).
    if (authUserIds.length > 0) {
      await mustDelete(db, 'user_profiles', (q) => q.in('auth_user_id', authUserIds));
      for (const id of authUserIds) await db.auth.admin.deleteUser(id);
    }
  });

  // 2+7) Para grafiği: hareket, sonra hesap; transfer tek satırdır ve karşı uçtan da `restrict` ile tutulur. Ayrı grupta, çünkü
  //      hareketin siparişe, kabule ve yüklemeye bakan FK'leri `set null` ve zincir yarıda kalsa da para tarafı temizlenebilir.
  await step(async () => {
    if (accountIds.length > 0) {
      // Kasa eşlemesi hesabı `restrict` ile tutar ve eşlenmiş hesabın hareketi kasa kuyruğuna FK'siz satır bırakır; eşleme
      // hareketlerden önce gider ki silinen hareket kuyruğa yeniden düşmesin.
      const mapped = await mappedCashAccounts(db, accountIds);
      if (mapped.length > 0) {
        const movementIds = [
          ...(await idsOf(db, 'money_movement', 'account_id', mapped)),
          ...(await idsOf(db, 'money_movement', 'counter_account_id', mapped)),
        ];
        await mustDelete(db, 'register_store', (q) => q.in('cash_account_id', mapped));
        if (movementIds.length > 0) await mustDelete(db, 'register_queue', (q) => q.in('movement_id', movementIds));
      }
      await mustDelete(db, 'money_movement', (q) => q.in('account_id', accountIds));
      await mustDelete(db, 'money_movement', (q) => q.in('counter_account_id', accountIds));
      // Banka import zinciri de hesaba bağlı ve `bank_import` `restrict` — şablon `cascade` olduğu
      // için tek başına görünmez ama yükleme kaydı hesabı tutar. Sıra: yükleme → şablon (şablon
      // silinince yükleme `set null` alır, tersi FK'yi ihlal eder).
      await mustDelete(db, 'bank_import', (q) => q.in('account_id', accountIds));
      await mustDelete(db, 'bank_import_profile', (q) => q.in('account_id', accountIds));
      await mustDelete(db, 'account', (q) => q.in('id', accountIds));
    }
    // Belge, cari, etiket ve tür hareketlerden sonra: tür FK'dir (`no action`) ve onu taşıyan hareket, belge ya da cari varsayılanı
    // durdukça silinemez, bu yüzden en sonda.
    if (documentIds.length > 0) await mustDelete(db, 'money_document', (q) => q.in('id', documentIds));
    if (counterpartyIds.length > 0) await mustDelete(db, 'counterparty', (q) => q.in('id', counterpartyIds));
    if (tagSlugs.length > 0) await mustDelete(db, 'movement_tag', (q) => q.in('slug', tagSlugs));
    if (natureSlugs.length > 0) await mustDelete(db, 'movement_nature', (q) => q.in('slug', natureSlugs));
  });

  // 5) Bağımsız kayıtlar — hiçbirinin ötekiyle bağı yok, o yüzden hepsi tek grupta ve zincirden
  //    ayrı: yukarıda ne olursa olsun bunlar denenmeli.
  await step(async () => {
    // Sıcaklık kayıtları noktalardan ÖNCE: nokta `restrict` ile tutuluyor (denetim geçmişi bir
    // noktanın adına değil kaydına bağlı, o yüzden kayıtlı nokta silinemez).
    if (storageAreaIds.length > 0) {
      await mustDelete(db, 'temperature_log', (q) => q.in('storage_area_id', storageAreaIds));
    }
    if (vehicleIds.length > 0) {
      await mustDelete(db, 'temperature_log', (q) => q.in('vehicle_id', vehicleIds));
    }
    // Sefer aracı `restrict` ile tutar (0046) — sefer görmüş araç ancak seferleriyle gider.
    await purgeDeliveryRuns(db, 'vehicle_id', vehicleIds);
    // Araç satırı burada değil §9'da silinir: araç deposu onu `restrict` ile tutar ve bu blok depolardan önce koşar.
    if (zoneNoticePostalCodes.length > 0) {
      await mustDelete(db, 'zone_notice', (q) => q.in('postal_code', zoneNoticePostalCodes));
    }
    if (verificationEmails.length > 0) await mustDelete(db, 'email_verifications', (q) => q.in('email', verificationEmails));
    // Ayar satırı bölgeye yalnız `scope_id` METNİYLE bağlı (FK yok) — hiçbir cascade toplamaz,
    // bildirilmezse damgalı bölge silindikten sonra sahipsiz kalır ve anahtarın kapsam listesini
    // sessizce şişirir.
    if (settingIds.length > 0) await mustDelete(db, 'settings', (q) => q.in('id', settingIds));
  });

  // 8) Depolar en son, profillerden de sonra: personel kapsamında geçen depo tetikleyiciyle korunur. Kendi grubundadır, çünkü depo
  //    çöpün operatöre göründüğü tablodur ve başka daldaki engel onu bırakmamalı.
  let vanVehicleIds: string[] = [];
  await step(async () => {
    if (warehouseIds.length > 0) {
      // Tedarikçisi olmayan mal kabulü (elle giriş) §3'te yakalanmaz ve depoyu `restrict` ile tutar.
      await mustDelete(db, 'stock_intake', (q) => q.in('warehouse_id', warehouseIds));
      // Devirler burada değil §0c'de gider, çünkü satırları partiyi tutar.
      await mustDelete(db, 'warehouse_variant_threshold', (q) => q.in('warehouse_id', warehouseIds));
      // Ölçüm noktaları: alan depoyu `restrict` ile tutar, aracınki `set null` — yani alan gitmek
      // ZORUNDA, araç depoyla birlikte adresini kaybeder ve yaşamaya devam eder. Testin kendi
      // aracını bildirmesi gerekir (`vehicleIds`), deposunu bildirmesi yetmez.
      await mustDelete(db, 'storage_area', (q) => q.in('warehouse_id', warehouseIds));
      // Sefer rotayı `restrict` ile tutar (0046): bölge silinmeden önce o deponun seferleri gitmeli.
      // Süzgeç `warehouse_id` SNAPSHOT kolonundan — seferin deposu start anında donuyor, testin
      // bildirdiği depoyla aynıdır.
      await purgeDeliveryRuns(db, 'warehouse_id', warehouseIds);
      await mustDelete(db, 'delivery_zone', (q) => q.in('warehouse_id', warehouseIds)); // posta kodları CASCADE
      // Belge numaratörü depo KODUNA çıpalı (`next_document_no('KBL-' || kod, yıl)`): test deposunun
      // sayacı depoyla birlikte gitmeli, yoksa her koşu tabloya iki ölü satır bırakır. FK yok, o
      // yüzden bu satır sessizce birikirdi — sayacı silmemek hiçbir yerde hata üretmez.
      const codes = await codesOf(db, warehouseIds);
      for (const code of codes) await mustDelete(db, 'document_counter', (q) => q.like('prefix', `%-${code}`));
      // Kargo kutusu tipleri (0052) — depoyu `restrict` ile tutuyorlar, yani depodan ÖNCE gitmeli.
      // Süzgeç `warehouse_id`: **sistem şablonları (`warehouse_id null`) BU SÜZGECE GİRMEZ** ve
      // girmemeli — onlar migration'ın kurduğu kalıcı kayıtlar, testin çöpü değil.
      await mustDelete(db, 'shipping_box', (q) => q.in('warehouse_id', warehouseIds));
      // Kasa eşlemesi, fiş ve kasa hareketi depoyu `restrict` ile tutar; fişin satırları ve ödemeleri ona cascade.
      await mustDelete(db, 'register_store', (q) => q.in('warehouse_id', warehouseIds));
      await mustDelete(db, 'register_cash_op', (q) => q.in('warehouse_id', warehouseIds));
      await mustDelete(db, 'register_ticket', (q) => q.in('warehouse_id', warehouseIds));
      // Araç deposunun aracı da gider ama depodan sonra (§9), çünkü bağ depodan araca `restrict`; burada yalnız okunur, depo silindikten
      // sonra sorulamaz.
      vanVehicleIds = await vehiclesOfWarehouses(db, warehouseIds);
      await mustDelete(db, 'warehouse', (q) => q.in('id', warehouseIds));
    }
  });

  // 9) Araçlar depolardan sonra: testin bildirdiği araçlar ve §8'in silinen araç depolarından okuduğu araçlar, küme olarak.
  await step(async () => {
    const targets = [...new Set([...vehicleIds, ...vanVehicleIds])];
    if (targets.length === 0) return;
    // Sefer aracı `restrict` ile tutar (0046) — deposu başkasının olan bir sefer §8'e takılmaz.
    await purgeDeliveryRuns(db, 'vehicle_id', targets);
    await mustDelete(db, 'temperature_log', (q) => q.in('vehicle_id', targets));
    await mustDelete(db, 'vehicle', (q) => q.in('id', targets));
  });

  // Sahipsiz bildirimler en sonda, hedefler silindikten sonra: `notification` hedefini FK'siz tutar ve teardown'ların çoğu siparişi
  // elle sildiği için süpürme listeye değil hedefin varlığına bakar. Hedefi olmayan satır tanımı gereği çöptür, duranınkine dokunulmaz.
  await step(async () => {
    // Liste `NotificationTargetTypeEnum`in tamamıdır, eksik bırakılan tür sessizce birikir; karşılığı o türün tablosu.
    for (const [tur, tablo] of [
      ['order', 'order'],
      ['ticket', 'ticket'],
      ['feedback_request', 'feedback_request'],
      ['zone_notice', 'zone_notice'],
      ['customer', 'user_profiles'],
      ['variant', 'product_variant'],
    ] as const) {
      const { data, error } = await db.from('notification').select('id, target_id').eq('target_type', tur).not('target_id', 'is', null);
      if (error) throw error;
      const satirlar = (data ?? []) as { id: string; target_id: string }[];
      if (satirlar.length === 0) continue;
      const hedefler = [...new Set(satirlar.map((r) => r.target_id))];
      const { data: duran, error: duranHata } = await db.from(tablo).select('id').in('id', hedefler);
      if (duranHata) throw duranHata;
      const yasayan = new Set(((duran ?? []) as { id: string }[]).map((r) => r.id));
      const sahipsiz = satirlar.filter((r) => !yasayan.has(r.target_id)).map((r) => r.id);
      if (sahipsiz.length > 0) await mustDelete(db, 'notification', (q) => q.in('id', sahipsiz));
    }

    // Hedef türü olmayan bildirimler bağını `payload`da taşır: sefere referansla, transfere ve kasa hareketine kimlikle bağlananlar
    // kendi turunda süpürülür.
    await sahipsizBildirimleriSil(db, ['run_close_mismatch', 'run_close_pending'], 'delivery_run', 'reference_no', 'referenceNo');
    await sahipsizBildirimleriSil(db, ['transfer_shortfall', 'transfer_excess'], 'warehouse_transfer', 'id', 'transferId');
    await sahipsizBildirimleriSil(db, ['register_write_stuck'], 'money_movement', 'id', 'movementId');
  });

  // Ne yapılamadıysa TEK hatada toplanır: teardown işini bitirdi ve şimdi ne bırakmak zorunda
  // kaldığını söylüyor. Sessizce geçmek `mustDelete`'in var oluş sebebini geri alırdı.
  if (failures.length > 0) {
    throw new Error(`teardown ${failures.length} adımda yarım kaldı:\n· ${failures.join('\n· ')}`);
  }
}

/**
 * Hedef nesnesi olmayan personel bildirimlerini sahipliğine göre süpürür: bu türler bağlarını `payload`da taşır ve oradaki kimlik
 * tabloda yoksa satır bir testin artığıdır.
 */
async function sahipsizBildirimleriSil(
  db: SupabaseClient,
  kinds: string[],
  tablo: string,
  kolon: string,
  payloadAlani: string,
): Promise<void> {
  const { data, error } = await db.from('notification').select('id, payload').in('kind', kinds);
  if (error) throw error;
  const bagli = ((data ?? []) as { id: string; payload: Record<string, unknown> | null }[])
    .map((row) => ({ id: row.id, bag: row.payload?.[payloadAlani] }))
    .filter((row): row is { id: string; bag: string } => typeof row.bag === 'string');
  if (bagli.length === 0) return;

  const bagsiz = [...new Set(bagli.map((row) => row.bag))];
  const { data: duran, error: duranHata } = await db.from(tablo).select(kolon).in(kolon, bagsiz);
  if (duranHata) throw duranHata;
  const yasayan = new Set(((duran ?? []) as unknown as Record<string, unknown>[]).map((row) => String(row[kolon])));
  const sahipsiz = bagli.filter((row) => !yasayan.has(row.bag)).map((row) => row.id);
  if (sahipsiz.length > 0) await mustDelete(db, 'notification', (q) => q.in('id', sahipsiz));
}

/** Depo kodları — belge numaratörü kimliğe değil KODA çıpalı olduğu için gerekli. */
async function codesOf(db: SupabaseClient, warehouseIds: string[]): Promise<string[]> {
  const { data, error } = await db.from('warehouse').select('code').in('id', warehouseIds);
  if (error) throw error;
  return (data ?? []).map((row) => (row as { code: string }).code);
}

/** Silinecek depoların araç kayıtları; depo silinmeden önce okunur, araç ise depodan sonra silinir (`warehouse.vehicle_id` `restrict`). */
async function vehiclesOfWarehouses(db: SupabaseClient, warehouseIds: string[]): Promise<string[]> {
  const { data, error } = await db.from('warehouse').select('vehicle_id').in('id', warehouseIds);
  if (error) throw error;
  return (data ?? [])
    .map((row) => (row as { vehicle_id: string | null }).vehicle_id)
    .filter((id): id is string => id !== null);
}

/** Kasa eşlemesi olan hesaplar; eşlenmiş hesabın hareketi kasa kuyruğuna FK'siz satır bırakır. */
async function mappedCashAccounts(db: SupabaseClient, accountIds: string[]): Promise<string[]> {
  const { data, error } = await db.from('register_store').select('cash_account_id').in('cash_account_id', accountIds);
  if (error) throw error;
  return (data ?? []).map((row) => (row as { cash_account_id: string }).cash_account_id);
}

/** Bir üst kaydın alt satır kimlikleri — silme sırası için gerekli ara adım. */
async function idsOf(db: SupabaseClient, table: string, column: string, parentIds: string[]): Promise<string[]> {
  const { data, error } = await db.from(table).select('id').in(column, parentIds);
  if (error) throw error;
  return (data ?? []).map((row) => (row as { id: string }).id);
}
