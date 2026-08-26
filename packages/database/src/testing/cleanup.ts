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
 * Sefer + kapanışı (0046). Üç `restrict` FK'nin ÜÇÜ de buradan geçer: kurye profili, rota→depo
 * zinciri (`warehouse_id` snapshot'ı) ve araç — hangisi silinecekse önce o kaynağın seferleri
 * gitmek zorunda. Sıra sabit: kapanış seferi `restrict` ile tutar → önce `delivery_run_close`.
 * `order.delivery_run_id` `set null` — sipariş sırası etkilenmez.
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
  /**
   * Kimlik profilleri (`user_profiles`) — adresleri ve **kanıtlanmış numaraları** (`customer_phone`,
   * 04.10) CASCADE ile gider. Ayrı müşteri tablosu yok.
   *
   * `customer_phone` bilerek `cascade` ile bağlandı, `restrict` ile değil: kanıt satırı kimliğin
   * kendisine ait bir künyedir, ondan bağımsız bir hayatı yoktur. `restrict` olsaydı her teardown
   * onu ayrıca silmek zorunda kalırdı ve biri mutlaka unuturdu — sonuç, aktif tekillik indeksinde
   * sonsuza dek tutulan bir test numarası olurdu.
   *
   * **Profilin SİPARİŞLERİ ve KURYE GÜN KAPANIŞLARI da burada gider** (14.08): ikisi de profili
   * `restrict` ile tutuyor, yani bildirilmezse profil silinemez. Testler bunu yıllarca kendi
   * `mustDelete` satırlarıyla çözdü ve tam olarak o satırlar teardown'ı öldürüyordu — `beforeAll`
   * düşünce `customerId` `undefined` kalıyor, `customer_id=eq.undefined` uuid hatasıyla fırlıyor ve
   * `purgeTestData` HİÇ çağrılmıyordu (ölçüldü 14.08: 51 artık depo, 46'sı bomboş — yani silme
   * denenmemişti bile). Bilgi burada durunca `undefined` da `clean()` süzgecine takılır.
   */
  profileIds?: string[];
  /**
   * Asistan onay kuyruğu satırları (`assistant_proposal`, 0042). Hiçbir şeye FK'yle bağlı DEĞİL —
   * `decided_by` dışında bağı yok ve o da `set null`. Yani kimse onu tutmaz ama kimse de
   * toplamaz: silinmezse kuyruk test önerileriyle dolar ve panel açıldığı gün operatör
   * kendisinin kurmadığı kalemlerle karşılaşır.
   */
  assistantProposalIds?: string[];
  /**
   * MCP bağlantı anahtarları (`mcp_connection_key`, 0051) ve onların çağrı izleri.
   *
   * İz satırları anahtara `set null` ile bağlı — yani anahtar silinse iz KALIR ve sahipsizleşir.
   * Bu üretimde doğru (iptal edilmiş anahtarın geçmişi cevaplanabilir olmalı), testte yanlış:
   * teardown yalnız anahtarı silerse `mcp_call_log` sessizce birikir ve panelin "son çağrılar"
   * listesi bir gün test artığıyla açılır. Bu yüzden İZ ÖNCE, anahtar sonra silinir — sıra tek
   * yerde durmalı ki her dosya kendi sırasını uydurmasın.
   */
  mcpConnectionKeyIds?: string[];
  /**
   * Bildirim satırları (`notification`, 0049) — YALNIZ personel fan-out'unun izleri için.
   * Müşteri satırları profille cascade gider (`profileIds` yeter); ama `dispatchStaffNotification`
   * GERÇEK personel profillerine yazar (seed yöneticileri dahil) ve o profiller purge'ün malı
   * değildir. Kapı bu yüzden yazdığı kimlikleri döndürür; test onları buraya taşır. Teslim
   * defteri (`notification_delivery`) satıra cascade bağlı, ayrıca anılmaz.
   */
  notificationIds?: string[];
  /**
   * Sahiplenilmiş webhook olayları (`webhook_event`, 0022) — anahtar **sağlayıcı kimliği**
   * (`event_id`), bizim uuid'imiz değil: satırı testin kendi ürettiği `wamid.…`/`evt_…` damgası
   * tanır ve çağıran o damgayı zaten biliyor.
   *
   * Hiçbir FK'si yok, yani kimse onu tutmaz ama kimse de toplamaz. Silinmezse tekrar-güvenliği
   * sınayan her koşu bir sonrakini SESSİZCE bozar: aynı olay kimliği ikinci koşuda "zaten
   * sahiplenilmiş" sayılır, `written` beklenirken `duplicates` gelir ve düşen test kendi
   * sebebini göstermez. Damgalı kimlik bunu bugün engelliyor; hedefi burada tutmak birikimi de
   * engelliyor.
   */
  webhookEventIds?: string[];
  /**
   * WhatsApp konuşmaları (15.1) — mesajları CASCADE ile gider.
   *
   * Müşteriye bağlı konuşma zaten profil silinince gider (`conversation.customer_id` CASCADE); bu
   * hedef **kimliksiz** konuşmalar içindir. Kimliksiz konuşma bir kaza değil, tasarımın bir
   * hâlidir: adım 2'de webhook mesajı önce yazar, kimliği sonra çözer. Profile bağlı olmadıkları
   * için hiçbir cascade onları toplamaz — bildirilmezse sessizce birikirler.
   */
  conversationIds?: string[];
  /**
   * Ölçüm noktaları (19.28) — sıcaklık kaydı bunlara `restrict` ile bağlı, yani kayıtlar önce
   * gider sonra nokta. Eskiden burada `temperatureLocations: string[]` vardı ve kayıtları serbest
   * metin konumdan siliyordu; nokta tanımlı bir satır olunca anahtar da kimliğe döndü.
   *
   * **Alan deponun ÖNÜNDE silinir** (kendisi `restrict` ile depoyu tutar); bildirilmezse teardown
   * depoda takılır ve artık depo operatörün seçicisinde görünür — 14.08'de ölçülen arızanın aynısı.
   */
  storageAreaIds?: string[];
  vehicleIds?: string[];
  /**
   * "Bölgeye girince haber ver" kayıtları — anahtar POSTA KODU (`zone_notice.postal_code`).
   *
   * Bölgeye FK ile bağlı değil: kayıt, bölgenin HENÜZ OLMADIĞI bir kod için açılıyor — bağ
   * kurulabilseydi zaten kaydın sebebi kalmazdı. `customer_id` de `set null`, yani hiçbir cascade
   * bu satırı toplamaz; bildirilmezse ziyaretçi beklenti listesi test kodlarıyla dolar.
   */
  zoneNoticePostalCodes?: string[];
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
    assistantProposalIds,
    mcpConnectionKeyIds,
    notificationIds,
    webhookEventIds,
    conversationIds,
    storageAreaIds,
    vehicleIds,
    zoneNoticePostalCodes,
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
    assistantProposalIds: clean(targets.assistantProposalIds),
    mcpConnectionKeyIds: clean(targets.mcpConnectionKeyIds),
    notificationIds: clean(targets.notificationIds),
    webhookEventIds: clean(targets.webhookEventIds),
    conversationIds: clean(targets.conversationIds),
    storageAreaIds: clean(targets.storageAreaIds),
    vehicleIds: clean(targets.vehicleIds),
    zoneNoticePostalCodes: clean(targets.zoneNoticePostalCodes),
    verificationEmails: clean(targets.verificationEmails),
    authUserIds: clean(targets.authUserIds),
    warehouseIds: clean(targets.warehouseIds),
    accountIds: clean(targets.accountIds),
    jobNames: clean(targets.jobNames),
    settingIds: clean(targets.settingIds),
  };

  /**
   * **BİR ENGEL, ARKASINDAKİ HER ŞEYİ KURTARMASIN** (ölçüldü 14.08).
   *
   * `mustDelete` fırlatarak sessiz birikimi gürültüye çevirdi — ama tek bir `await` zincirinde
   * fırlayan hata, kendinden SONRAKİ bütün silmeleri de iptal ediyordu. Yaprak bir tabloda
   * (`category`) takılan teardown, kendisiyle hiç ilgisi olmayan DEPOYU da bırakıyordu; oysa depo
   * operasyon ekranının listelediği yer, yani çöpün göründüğü tek tablo.
   *
   * Buradaki gruplar birbirine FK ile bağlı OLMAYAN dallar: biri düşse öteki yine denenebilir. Grup
   * İÇİNDE sıra hâlâ kutsal (bağımlılık orada) — o yüzden grup içi zincir aynen duruyor.
   *
   * Hatalar yutulmaz, BİRİKTİRİLİR ve sonda topluca fırlar: teardown hem işini bitirir hem de ne
   * yapamadığını söyler. Yutmak, `mustDelete`'in var oluş sebebini geri almak olurdu.
   */
  const failures: string[] = [];
  const step = async (fn: () => Promise<void>): Promise<void> => {
    try {
      await fn();
    } catch (err) {
      failures.push(err instanceof Error ? err.message : String(err));
    }
  };

  // 0a) Analitik: defterin hiçbir FK'si yok (bilinçli — `0035`), o yüzden sıradan bağımsız.
  //     GÜN özeti (`analytics_daily`) SİLİNMEZ: gün bazlıdır ve testin damgalı anahtarıyla
  //     eşleşmez; testler özeti kendi ürettiği güne bakarak sınar, küresel sayıya değil.
  await step(async () => {
    if (analyticsSessionKeys.length > 0) {
      // ── ÖZET, OLAYLAR SİLİNMEDEN ÖNCE OKUNUR (09.08 · müşteri şeridinin gözlemi) ────────────
      // Aşağıdaki `productIds` süzgeci yalnız testin KURDUĞU ürünleri kapsıyor. Bir test uydurma
      // bir ürün kimliğiyle olay yazıp `buildAll` çağırdığında özet satırı o kimliğe düşüyor, ürün
      // satırı hiç var olmadığı için `productIds` onu içermiyor ve satır **öksüz kalıyor** —
      // ölçüldü: taze veritabanında tek satır, ürünü yok, ham defteri (`analytics_event`) boş,
      // yani artık yeniden de türetilemez. Zararsız görünüyordu ama özeti ham defterle
      // karşılaştıran her denetim "rollup kaçırmış mı" sorusuyla başlayıp cevabı bulamazdı.
      //
      // Kimlikler olayların KENDİSİNDEN okunuyor: çağırana yeni bir alan eklemek, her testin kendi
      // silme listesini uydurması demekti — `CLAUDE §4b`'nin tam olarak uyardığı şey.
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
    //   Ama ÜRÜN ve ARAMA özetleri damgalı bir anahtar taşıyor (test ürünü, damgalı terim) — yani
    //   bırakılırlarsa gün geçtikçe biriken, kimsenin sahiplenmediği satırlar olurlar. Ürün özeti
    //   ürünle birlikte gider (anahtar `product_id`), arama özeti kendi hedefiyle.
    if (productIds.length > 0) {
      await mustDelete(db, 'analytics_daily_product', (q) => q.in('product_id', productIds));
    }
    if (analyticsSearchQueries.length > 0) {
      await mustDelete(db, 'analytics_daily_search', (q) => q.in('query', analyticsSearchQueries));
    }
  });

  // 0) İş izleri: hiçbir şeye FK ile bağlı değiller, sıradan bağımsız — en başta gitsinler ki
  // aşağıdaki grafiklerden biri düşse bile gözlemleme tabloları kirli kalmasın.
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
    // 0b) Sipariş grafiği ÜRÜNDEN VE PROFİLDEN ÖNCE: `order_item.variant_id` restrict ürünü,
    //     `order.customer_id` restrict profili tutar — sipariş dururken ikisi de silinemez.
    //     Rezervasyon AÇIKÇA: `order_id` bağı FK'sız (0006), cascade toplamaz (interface künyesi).
    //
    // Profilin siparişleri AYNI listeye katılır, ayrı bir silme olarak değil: rezervasyon bağı
    // FK'siz ve o boşluğu iki ayrı yerde kapatmak, birini unutmanın kapısıdır.
    const allOrderIds =
      profileIds.length > 0
        ? [...new Set([...orderIds, ...(await idsOf(db, 'order', 'customer_id', profileIds))])]
        : orderIds;

    if (allOrderIds.length > 0) {
      await mustDelete(db, 'reservation', (q) => q.in('order_id', allOrderIds));
      // Talepler SİPARİŞTEN ÖNCE (ölçüldü 26.08): kaleme bağlı talepte (`order_item_ids` dolu)
      // sipariş silinince `ticket.order_id` `set null` düşer ve `ticket_items_need_order` kısıtı
      // patlar — "kalemi olan talep siparişsiz olamaz". Profil-cascade buraya yetişmiyor: sıra
      // gereği profil EN SONDA gidiyor. Mesajlar/kuyruk satırı talebe cascade.
      await mustDelete(db, 'ticket', (q) => q.in('order_id', allOrderIds));
      await mustDelete(db, 'order', (q) => q.in('id', allOrderIds)); // kalem/log/discount_use CASCADE
    }

    // 0c) **Depo devirleri PARTİLERDEN ÖNCE** (ölçüldü 14.08): `warehouse_transfer_line` partiyi
    //     İKİ uçtan da `restrict` ile tutuyor (`source_stock_id`, `target_stock_id`). Devir
    //     temizliği §8'de duruyordu, yani parti silmesinden (§1) SONRA — sıra tersti ve parti
    //     silinemiyordu. Görünmüyordu çünkü devir testi kendi `mustDelete` satırıyla önden
    //     temizliyordu; o satır kalkınca eksik sıra ortaya çıktı. Başlık gider, satırları CASCADE.
    if (warehouseIds.length > 0) {
      await mustDelete(db, 'warehouse_transfer', (q) => q.in('from_warehouse_id', warehouseIds));
      await mustDelete(db, 'warehouse_transfer', (q) => q.in('to_warehouse_id', warehouseIds));
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
    if (profileIds.length > 0) {
      // Sefer kaydı kuryeyi `restrict` ile tutar (0046); kapanış da seferi tutar — ikisi tek
      // yardımcıdan, sabit sırayla gider. `closed_by` `set null`, ikinci silme gerektirmez.
      await purgeDeliveryRuns(db, 'courier_id', profileIds);
      // Talepler PROFİLDEN ÖNCE ve AÇIKÇA (ölçüldü 26.08): profil cascade'i talebi de götürür ama
      // tek DELETE içinde sıra tanımsız — personel profili müşterininkinden önce düşerse cevabının
      // `author_id`si `set null` olur ve `ticket_message_author` kısıtı patlar ("admin mesajı
      // yazarsız olamaz"). Önce müşterilerin talepleri (mesajlar cascade), sonra profiller.
      await mustDelete(db, 'ticket', (q) => q.in('customer_id', profileIds));
      await mustDelete(db, 'user_profiles', (q) => q.in('id', profileIds)); // adresleri CASCADE
    }

    // 6) Auth kullanıcısı EN SON: profil satırı ona `set null` ile bağlı, silinince profil yetim kalır —
    //    o yüzden profil de burada gider (trigger'ın açtığı satırın sahibi testtir).
    if (authUserIds.length > 0) {
      await mustDelete(db, 'user_profiles', (q) => q.in('auth_user_id', authUserIds));
      for (const id of authUserIds) await db.auth.admin.deleteUser(id);
    }
  });

  // 2+7) Para grafiği — hareket, sonra hesap. Hesap silmesi `restrict` ile korunuyor, yani
  //      hareketler durdukça hesap gitmez (denetim R1). Karşı hesap da sayılır: transfer TEK
  //      satırdır ve karşı uçtan da `restrict` ile tutulur.
  //
  //      **Zincirin dalı DEĞİL, komşusu** (ölçüldü 14.08): hareketin siparişe, tedarik girişine ve
  //      banka yüklemesine bakan FK'lerinin hepsi `set null` — yani yukarıdaki zincir yarıda kalsa
  //      bile para tarafı temizlenebilir. Eskiden zincirin ortasındaydı ve ordaki bir engel bunu da
  //      bırakırdı.
  await step(async () => {
    if (accountIds.length > 0) {
      await mustDelete(db, 'money_movement', (q) => q.in('account_id', accountIds));
      await mustDelete(db, 'money_movement', (q) => q.in('counter_account_id', accountIds));
      // Banka import zinciri de hesaba bağlı ve `bank_import` `restrict` — şablon `cascade` olduğu
      // için tek başına görünmez ama yükleme kaydı hesabı tutar. Sıra: yükleme → şablon (şablon
      // silinince yükleme `set null` alır, tersi FK'yi ihlal eder).
      await mustDelete(db, 'bank_import', (q) => q.in('account_id', accountIds));
      await mustDelete(db, 'bank_import_profile', (q) => q.in('account_id', accountIds));
      await mustDelete(db, 'account', (q) => q.in('id', accountIds));
    }
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
    if (vehicleIds.length > 0) await mustDelete(db, 'vehicle', (q) => q.in('id', vehicleIds));
    if (zoneNoticePostalCodes.length > 0) {
      await mustDelete(db, 'zone_notice', (q) => q.in('postal_code', zoneNoticePostalCodes));
    }
    if (verificationEmails.length > 0) await mustDelete(db, 'email_verifications', (q) => q.in('email', verificationEmails));
    // Ayar satırı bölgeye yalnız `scope_id` METNİYLE bağlı (FK yok) — hiçbir cascade toplamaz,
    // bildirilmezse damgalı bölge silindikten sonra sahipsiz kalır ve anahtarın kapsam listesini
    // sessizce şişirir.
    if (settingIds.length > 0) await mustDelete(db, 'settings', (q) => q.in('id', settingIds));
  });

  // 8) Depolar EN SON, profillerden de sonra: depoya `restrict` ile bağlı ne varsa (parti, sipariş,
  //    giriş, sıcaklık kaydı, bölge) yukarıda gitti; personel kapsamı ise ayrı bir tetikleyiciyle
  //    korunuyor — kapsamda geçen depo silinemez, o yüzden profiller önce gitmek zorunda.
  //
  //    **KENDİ GRUBUNDA** ve bu kritik: depo, çöpün OPERATÖRE GÖRÜNDÜĞÜ tek tablo (depo seçicisi
  //    `T-MSAFW5VS1` gibi satırları listeler). Yukarıdaki herhangi bir dalda takılan teardown,
  //    eskiden depoyu da bırakıyordu — ölçüldü 14.08: 51 artık deponun 46'sı bomboştu, yani onları
  //    hiçbir FK tutmuyordu, silme sadece hiç denenmemişti.
  await step(async () => {
    if (warehouseIds.length > 0) {
      // Tedarikçisi olmayan mal kabulü de vardır (elle giriş) — o satır §3'te yakalanmaz ve depoyu
      // `restrict` ile tutar (denetim R3).
      await mustDelete(db, 'stock_intake', (q) => q.in('warehouse_id', warehouseIds));
      // Devirler burada DEĞİL §0c'de gidiyor — satırları partiyi tutuyor, o yüzden partilerden önce
      // gitmek zorundalar (yukarıdaki künye).
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
      await mustDelete(db, 'warehouse', (q) => q.in('id', warehouseIds));
    }
  });

  // Ne yapılamadıysa TEK hatada toplanır: teardown işini bitirdi ve şimdi ne bırakmak zorunda
  // kaldığını söylüyor. Sessizce geçmek `mustDelete`'in var oluş sebebini geri alırdı.
  if (failures.length > 0) {
    throw new Error(`teardown ${failures.length} adımda yarım kaldı:\n· ${failures.join('\n· ')}`);
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
