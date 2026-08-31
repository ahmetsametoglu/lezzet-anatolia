import {
  ProductService,
  ProductVariantService,
  PurchaseOrderItemService,
  PurchaseOrderService,
  StockIntakeService,
  StorageAreaService,
  SupplierProductService,
  SupplierService,
  VariantBarcodeService,
} from '@lezzet/database';
import { meetsMlor } from '@lezzet/domain-core';
import { logger } from '@lezzet/observability';
import type {
  CaseSizeContract,
  ProductDateType,
  ProductStorageType,
  PurchaseOrderStatus,
  ReceiveIntakeResult,
  StorageAreaKind,
} from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { variantNames } from './names';

/**
 * **Mal kabul — D2** (10.4), terfi 21.11. Kaynağı `apps/web/lib/stock/intake.ts`;
 * `design/pages/depo-stok-giris.md` + DOMAIN §16 + mobil v2 "Mal Kabul" ekranı bağlayıcı.
 *
 * **Depocu alış fiyatı GÖRMEZ ve GİRMEZ.** Form satırı yalnız adet, son tarih, lot ve konum ister;
 * birim maliyet tedarik siparişinden (admin'in girdiği) sunucu tarafında eklenir. Bu yüzden depocu
 * yolunun satır tipinde `unitCostCents` alanı YOKTUR — ekran isteseydi bile gönderemez.
 *
 * **MLOR uyarısı engellemez, uyarır** (DOMAIN §4): raf ömrünün yeterince kalmadığı parti yine kabul
 * edilebilir — kararı mal kabul eden verir (v2: *"kalan ömür %X — uyarı, engellemez"*). Sistem yalnız
 * görünür kılar.
 *
 * **Parçalı kabul meşrudur ve cevapta görünür:** beklenen–gelen farkı `differences` ile döner, iş
 * durmaz (v2: *"FARK ÖZETİ — YALNIZ SAPAN SATIRLAR"*). Tedarikçi eksik ya da fazla göndermiş
 * olabilir; kayıt gerçeği yazar, fark görünür kalır.
 *
 * **Çevrimdışı ÇALIŞMAZ ve bu kural burada DEĞİL** (doc 04 D2): bağlantı şartı istemci davranışıdır
 * — sunucu tarafında "kuyruk" diye bir kavram yok, olsaydı raf ↔ sistem çelişkisini kurumsallaştırırdı.
 */

/** Depocunun doldurduğu satır — para alanı yok. */
export interface IntakeFormLine {
  variantId: string;
  qty: number;
  expiryDate: string;
  lotNumber?: string | null;
  /** Partinin konacağı depo İÇİ alan (`storage_area`) — serbest metin değil kimlik (19.29). */
  storageAreaId?: string | null;
}

/**
 * Admin'in doldurduğu satır — **maliyeti taşıyan tek tip** (09.14).
 *
 * ── NEDEN AYRI TİP, `IntakeFormLine`'a ALAN DEĞİL ────────────────────────────
 * Depocunun fiyat görmemesi bir ekran kuralı değil, bir TİP sınırıdır: alanı ortak tipe koysaydık
 * depo ekranı onu "isteğe bağlı" diye gönderebilirdi ve sınır yalnız iyi niyetle ayakta kalırdı.
 * İki ayrı tip, iki ayrı kapı — depocu yolu fiyat gönderemez, admin yolu göndermeyi unutmaz.
 *
 * ── MALİYET SATIRIN, VARYANTIN DEĞİL ─────────────────────────────────────────
 * Aynı varyant birden çok satırda gelebilir (farklı son tarih ya da farklı lot ayrı satırdır ve aynı
 * sevkiyatta farklı fiyata alınmış olabilir); varyant anahtarlı bir harita o farkı sessizce yutardı.
 */
export interface PurchaseIntakeLine extends IntakeFormLine {
  /**
   * Birim alış fiyatı — **tamsayı cent** (`STACK §8`). Euro'ya çevrim bu dosyada DEĞİL, servisin RPC
   * sınırında (`StockIntakeService.receive`, 02.9).
   *
   * `null` = "bu satırın fiyatını bilmiyorum" ve bu meşrudur: PO'lu kabulde admin yalnız SAPAN
   * satırı düzeltir, ötekiler siparişten eşleşmeye devam eder.
   */
  unitCostCents: number | null;
}

/** PO'dan dolu gelen form satırı — beklenen adet + ürün adı; fiyat yok. */
export interface IntakeFormRow {
  variantId: string;
  productName: string;
  variantLabel: string;
  /**
   * **Bu kabulde daha ne bekleniyor** — ısmarlanan toplam DEĞİL, kalan (`missingQty`).
   *
   * Ayrım ölçümle geldi (25.08, 10.4 turu) ve düzeltilmeden önce ekranla kayıt aynı olay hakkında
   * iki farklı şey söylüyordu: kayıt tarafı (`expectedQtysOf` → `differencesOf`) ilk günden KALANa
   * bakıyor, form ise ısmarlanan toplamı gösteriyordu. Kısmen gelmiş bir siparişte (60 ısmarlandı,
   * 30 geldi) depocu ikinci 30'u sayıp yazınca ekran `30 / 60 · −30` diye **olmayan bir eksik**
   * çiziyor, kayıt ise farkı sıfır yazıyordu. Depocu ya olmayan eksiğin peşine düşer ya gerçek
   * eksiği o gürültünün içinde kaçırırdı.
   *
   * Tamamı gelmiş kalem `0` ile döner ve satır LİSTEDE KALIR: ikinci sevkiyatta koliden yine çıkabilir
   * ve fazla kabul meşrudur (tedarikçi fazla göndermiş olabilir) — satırı gizlemek, gelen malı
   * yazacak yeri ortadan kaldırırdı.
   */
  expectedQty: number;
  /**
   * **Tedarikçinin bu kaleme verdiği kod** (`supplier_product.supplier_code`) — kalemin
   * `supplierProductId` bağından çözülür.
   *
   * Depocunun elindeki kâğıt bizim katalogumuz değil TEDARİKÇİNİN irsaliyesidir ve satırı o kâğıtla
   * eşleştirmenin kesin anahtarı bu koddur; ürün adı çevrilmiş, boy etiketi bizim dilimizdedir.
   *
   * `null` = kalem bir eşlemeye bağlanmadan açılmış (`purchase_order_item.supplier_product_id`
   * nullable — `createDraft` künyesi: eşlemesi olmayan kalem de listeye girer). Uydurma bir kod
   * yerine görünür boşluk.
   */
  supplierCode: string | null;
  /**
   * Varyantın kendi kodu (`product_variant.sku`) — plansız kabulün satırında görünen kod.
   *
   * PO'lu satırın anahtarı tedarikçinin kodudur (elde onun irsaliyesi var); plansızda sipariş
   * kalemi yoktur, yani tedarikçi kodu da yoktur ve satırı tanıtan tek kod budur. Aramayla ve
   * okutmayla açılan satırlar aynı alanı göstermeli — biri kodlu öteki kodsuz bir liste,
   * depocuya "bu ürünün kodu yok mu" diye sordururdu.
   */
  sku: string | null;
  /** Tarih rejimi (DOMAIN §4) — depocu kutunun üstünde DLC mi DDM mi arayacağını bilmeli. */
  dateType: ProductDateType;
  /**
   * Ürünün toplam raf ömrü (gün); girilmemişse `null` → kalan ömür HESAPLANAMAZ.
   *
   * Yüzdenin kendisi burada üretilemez ve bu bir eksiklik değil sıralamadır: girdisi olan SON TARİH
   * henüz yazılmamıştır — depocu SKT'yi girdiği anda ekran `meetsMlor` ile hesaplar. Kabul
   * yazıldıktan sonraki uyarı ayrı bir yerde duruyor (`IntakeWarning`) ve o da aynı motoru çağırır.
   */
  shelfLifeDays: number | null;
  /**
   * Ürünün KAYITLI koli boyları (`variant_barcode`, `kind='case'`) — adet çekmecesinin çarpan
   * tablosu: depocu "3 koli geldi" der, paketi ekran çarpar.
   *
   * **Boş dizi bir eksiklik değil bir CEVAPTIR:** o ürüne henüz koli kodu öğretilmemiştir ve
   * çekmece yalnız tek paket sayar. Varsayılan bir boy (12'lik) koymak, ölçülmemiş bir çarpanı
   * ölçülmüş gibi gösterip stok sayımını sessizce bozardı (CLAUDE §1).
   */
  caseSizes: CaseSizeContract[];
}

/**
 * **Bekleyen tedarik siparişinden dolu form.** PO yoksa boş dizi döner — plansız alım da meşrudur
 * (v2'nin "+ plansız kabul" yolu), form elle doldurulur.
 *
 * **Depo sorulmaz ve sorulmamalı:** satın alma depo-üstüdür (K6), mal hangi kapıdan gireceğini
 * kabul anında söyler (`receiveGoods.warehouseId`). Formu depoya süzmek, aynı siparişin ikinci
 * deposundaki kalemleri gizlerdi.
 *
 * @param db service-role istemci — çağıran enjekte eder (`serviceDb()`), `auth/otp` deseni.
 */
export async function openIntakeForm(db: SupabaseClient, purchaseOrderId: string): Promise<IntakeFormRow[]> {
  const lines = await new PurchaseOrderItemService(db).listByOrder(purchaseOrderId);
  if (lines.length === 0) return [];

  // Beklenti KAYITLA aynı görünümden okunur (`expectedQtysOf` de `progressOf` çağırıyor): iki taban,
  // ekranın çizdiği farkla kaydın yazdığı farkın ayrışması demekti — ve öyle olmuştu (tipin künyesi).
  //
  // Eşleme KALEM kimliğiyle, varyantla DEĞİL: `expectedQtysOf` varyant anahtarlı toplar (fark varyant
  // bazında hesaplandığı için orada doğru), ama form kalem başına satır çizer — aynı varyant iki
  // kalemde geçiyorsa varyant anahtarlı okuma toplamı iki satıra birden yazar ve beklenti ikiye
  // katlanmış görünürdü.
  const progress = new Map(
    (await new PurchaseOrderService(db).progressOf(purchaseOrderId)).map((row) => [row.purchaseOrderItemId, row.missingQty]),
  );
  // İki okuma birbirini beklemez: ad+tarih rejimi tek zincirden (`names.ts`), tedarikçi kodu ayrı.
  // Kod eşlemesi KALEMİN işaret ettiği kimlikle çözülür (`supplierProductId`), varyantla değil —
  // gerekçe `SupplierProductService.listByIds` künyesinde.
  const [names, mappings, barcodes] = await Promise.all([
    variantNames(db, lines.map((line) => line.variantId)),
    new SupplierProductService(db).listByIds(
      lines.map((line) => line.supplierProductId).filter((id): id is string => id !== null),
    ),
    // Koli boyları TEK sorguda, form açılışında: çekmece açıldığında ikinci bir tur atılsaydı
    // depocu ± düğmelerine bir yükleme beklerken basardı. Paket kodları (`unit`) burada elenir —
    // çarpanı 1 olan bir kod çekmecede "1 paketlik koli" diye görünürdü.
    new VariantBarcodeService(db).listByVariants(lines.map((line) => line.variantId)),
  ]);
  const codeOf = new Map(mappings.map((mapping) => [mapping.id, mapping.supplierCode]));
  const casesOf = new Map<string, CaseSizeContract[]>();
  for (const barcode of barcodes) {
    if (barcode.kind !== 'case') continue;
    const list = casesOf.get(barcode.variantId) ?? [];
    list.push({ code: barcode.code, qtyPerCode: barcode.qtyPerCode });
    casesOf.set(barcode.variantId, list);
  }

  return lines.map((line) => ({
    variantId: line.variantId,
    productName: names.get(line.variantId)?.productName ?? '—',
    variantLabel: names.get(line.variantId)?.variantLabel ?? '',
    supplierCode: line.supplierProductId === null ? null : (codeOf.get(line.supplierProductId) ?? null),
    sku: names.get(line.variantId)?.sku ?? null,
    // Satırı hiç çözülemeyen varyantta `names.ts`in verdiği aynı varsayılana düşülür — ikinci bir
    // "bilinmiyorsa ne olur" kararı burada kurulmuyor (gerekçe orada, tek yerde).
    dateType: names.get(line.variantId)?.dateType ?? 'DDM',
    shelfLifeDays: names.get(line.variantId)?.shelfLifeDays ?? null,
    // Sıralama ÇARPANA göre: küçük koli önce. Okunan sıra (`createdAt`) depocuya bir şey söylemiyor;
    // elindeki koliyi listede ararken baktığı şey kaç paket olduğudur.
    caseSizes: (casesOf.get(line.variantId) ?? []).sort((a, b) => a.qtyPerCode - b.qtyPerCode),
    // İlerleme satırı yoksa kalan = ısmarlanan; `?? 0` OLAMAZ: görünüm bir satırı bir gün taşımazsa
    // "0 bekleniyor" demek, depocuyu kendi kaydımıza karşı sessizce kör bırakırdı (`CLAUDE §1` —
    // ölçülemeyen değer sıfır değildir).
    expectedQty: progress.get(line.id) ?? line.qty,
  }));
}

/**
 * Tedarik siparişinin KÜNYESİ (21.11d) — ekranın başlığı: *"TS-26-0114 · Gaziantep Gıda"*.
 *
 * **Para taşımaz ve taşıyamaz:** sipariş tutarı da birim alış da bu tipte YOK. Depocu hangi belgeyi
 * elinde tuttuğunu bilmeli, o belgenin kaç para olduğunu değil (`receiveGoods` ile aynı sınır).
 */
export interface IntakeHeader {
  purchaseOrderId: string;
  /** İnsan-okur numara; **taslakta `null`** — numara gönderimde doğar (`markSent`). */
  referenceNo: string | null;
  /** Tedarikçi adı; erişilemeyen kayıtta `null` — uydurma ad yerine görünür boşluk. */
  supplierName: string | null;
}

/**
 * **Siparişin künyesi** (D2 · 21.11d) — sipariş yoksa `null`.
 *
 * ── NEDEN `openIntakeForm`A ALAN OLARAK EKLENMEDİ ───────────────────────────
 * O kapı satır DİZİSİ döndürüyor ve künye sipariş başına TEKİLDİR; satıra kopyalamak aynı iki dizeyi
 * N kez taşımak olurdu (kurye ucundaki `readDoorCashAccountId` kararının aynısı). Dönüş tipini
 * nesneye çevirmek de seçenek değildi: kapının ikinci bir çağıranı var (operasyon web'in mal kabul
 * ekranı) ve künyeye ihtiyacı olmayan o çağıran, ihtiyacı olmayan iki sorgunun bedelini öderdi.
 *
 * İki tur okur (sipariş, sonra tedarikçi): `purchase_order` tek satır ve tedarikçi adı ayrı tabloda.
 * Yalnız bir sipariş açıldığında koşar — liste yolu (`listPendingIntakes`) adı gömülü okuyor.
 */
export async function readIntakeHeader(db: SupabaseClient, purchaseOrderId: string): Promise<IntakeHeader | null> {
  const order = await new PurchaseOrderService(db).getById(purchaseOrderId);
  if (!order) return null;

  const supplier = await new SupplierService(db).getById(order.supplierId);
  return { purchaseOrderId: order.id, referenceNo: order.referenceNo, supplierName: supplier?.name ?? null };
}

/** Bekleyen sevkiyat satırı — künye + ISMARLANAN KALEM sayısı (adet değil). */
export interface PendingIntake extends IntakeHeader {
  lineCount: number;
  /**
   * Siparişin durumu — liste İKİ durumu birden taşıyor (aşağıdaki künye) ve ikisi depocu için ayrı
   * cümledir: `sent`te koli hiç açılmadı, `partially_received`te bu ikinci turdur ve formdaki
   * beklenen adetler ISMARLANAN değil KALANDIR (`IntakeFormRow.expectedQty` künyesi).
   *
   * Küme durum tipinden DARALTILIR: `draft` bu listeye hiç girmez, `received`/`cancelled` kapandı.
   */
  status: Extract<PurchaseOrderStatus, 'sent' | 'partially_received'>;
}

/**
 * **"Hangi sevkiyatı bekliyorum"** (D2'nin konusuz açılışı · 21.11d).
 *
 * ── HANGİ DURUMLAR, VE NEDEN ÜÇÜ DEĞİL İKİSİ ────────────────────────────────
 * `sent` **ve** `partially_received`. İkincisi ölçümle geldi, kolaylık olsun diye değil: tek sipariş
 * birden çok depoda parça parça kabul edilebilir (K6 — `expectedQtysOf` künyesi) ve ilk kabul
 * siparişi kapatmaz; `partially_received` süzülseydi Strasbourg kabul ettikten sonra Kehl'in payı
 * listeden SESSİZCE kaybolurdu. `draft` DIŞARIDA: tedarikçi ondan habersizdir, mal yolda değildir
 * (`openProgress` künyesindeki aynı ayrım). `received`/`cancelled` zaten kapandı.
 *
 * ── DEPO SORULMAZ ───────────────────────────────────────────────────────────
 * `openIntakeForm` ile aynı gerekçe: satın alma depo-üstüdür (K6), mal hangi kapıdan gireceğini
 * kabul ANINDA söyler. Listeyi depoya süzmek, aynı siparişin ikinci deposundaki payını gizlerdi.
 *
 * ── PARA OKUNUR AMA ÇIKMAZ ──────────────────────────────────────────────────
 * `listRows` kalemleri fiyatlarıyla getiriyor (tek turda tedarikçi adı + kalem sayısı veren tek
 * kamu okuması bu). Fiyat bu fonksiyonun SINIRINDA kalır: dönen tipte para alanı yok, yani depo
 * ekranı isteseydi bile gösteremez.
 */
export async function listPendingIntakes(db: SupabaseClient, opts: { limit?: number } = {}): Promise<PendingIntake[]> {
  const limit = opts.limit ?? 20;
  const service = new PurchaseOrderService(db);

  // İki çağrı, çünkü `listRows` tek durum süzüyor. Paralel: ikisi birbirini beklemez.
  const [sent, partial] = await Promise.all([
    service.listRows({ status: 'sent', limit }),
    service.listRows({ status: 'partially_received', limit }),
  ]);

  // Durum SATIRIN kendi alanından geliyor (`listRows` `status`u taşıyor) — süzgeçten türetilmiş bir
  // sabit DEĞİL. İki kümeyi birleştirirken "bu satır `sent` sorgusundan geldi, demek ki `sent`"
  // demek, doğruluğu iki ayrı yerin uyumuna bağlayan bir çıkarımdır; satır zaten durumunu söylüyor.
  // Daraltma bir `as` ile değil, ayrımlı bir yoklamayla: beklenmedik bir durum gelirse satır
  // sessizce yanlış etiketlenmez, LİSTEYE GİRMEZ ve bu görünür bir eksikliktir.
  return [...sent.rows, ...partial.rows]
    // En yeni sipariş önce — birleştirilen iki sayfanın sırası tek başına anlamlı değil.
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
    .flatMap((row) => {
      if (row.status !== 'sent' && row.status !== 'partially_received') return [];
      return [
        {
          purchaseOrderId: row.id,
          referenceNo: row.referenceNo,
          supplierName: row.supplier?.name ?? null,
          lineCount: row.items.length,
          status: row.status,
        },
      ];
    });
}

export interface IntakeWarning {
  variantId: string;
  /** Raf ömrünün kalan yüzdesi — eşiğin altındaysa uyarı doğar. */
  remainingPercent: number | null;
}

/**
 * **Ürünün saklama rejimi ile konduğu alan uyuşmuyor** (19.29) — `0045`'in kendi gerekçesinin
 * tamamlandığı yer.
 *
 * `storage_area.kind` bilerek `product.storage_type` ile aynı kelimeleri kullanıyordu ve migration
 * künyesi sebebini yazmıştı: *"donuk ürün donuk alanda durur" cümlesi ancak iki taraf aynı dili
 * konuşursa kurulabilir.* Cümlenin öteki yarısı `stock.storage_area_id` gelince doğdu; bu uyarı da
 * onunla.
 *
 * **ENGELLEMEZ, söyler** (`DOMAIN §4` deseni — MLOR'un ikizi): dondurucu bozulduğu için malı geçici
 * olarak başka alana koymak meşru bir karardır ve kabulü reddetmek depocuyu ya kaydı hiç yazmamaya
 * ya da yanlış alan seçmeye iterdi. İkisi de defteri yalancı yapar.
 */
export interface StorageMismatch {
  variantId: string;
  /** Ürünün gerektirdiği rejim. */
  expected: ProductStorageType;
  /** Alanın türü ve adı — operatör hangi rafı seçtiğini görmeli. */
  areaKind: StorageAreaKind;
  areaName: string;
}

export interface IntakeDifference {
  variantId: string;
  expectedQty: number;
  receivedQty: number;
}

/**
 * **Maliyet değişince otomatik fiyatı hedefe çeken port** (09.5 · DOMAIN "Maliyet ve hedef marj").
 *
 * ── NEDEN PORT, NEDEN TERFİ DEĞİL ────────────────────────────────────────────
 * Web kopyası `repriceVariants`'ı doğrudan çağırıyor (`apps/web/lib/pricing/auto-price.ts`, 146
 * satır + `cost-basis.ts`). O modül FİYAT şeridinin işi ve bu turda taşınmadı: taşımak, sahibi başka
 * olan bir modülü habersiz çatallamak olurdu (`order/effects.ts` ile aynı gerekçe). Port, bağın
 * KAYIP olduğunu değil **kayıtsız** olduğunu söyler — ve kaydedildiği gün davranış birebir olur.
 *
 * Dönen sayı "kaç fiyat hedefe çekildi". Kabulü BOZMAZ: fiyat hizalaması zaten yazılmış bir partinin
 * ardından gelir; port patlarsa mal kabul geri alınmaz.
 */
export type RepricePort = (variantIds: readonly string[]) => Promise<number>;

type IntakeOutcome =
  | {
      status: 'ok';
      result: ReceiveIntakeResult;
      /** Raf ömrü kısa gelen partiler — kabul ENGELLENMEZ, yalnız bildirilir. */
      warnings: IntakeWarning[];
      /** Saklama rejimine uymayan alana konan partiler (19.29) — MLOR'un ikizi: uyarır, engellemez. */
      storageMismatches: StorageMismatch[];
      /** PO'ya göre eksik/fazla — fark olarak işaretlenir, iş durmaz. */
      differences: IntakeDifference[];
      /**
       * Yeni maliyet yüzünden hedefe çekilen fiyat sayısı (otomatik fiyatlı ürünler). Depocuya
       * gösterilmez — fiyat onun işi değil; kabul kaydında görünür kalması içindir.
       *
       * **`null` = ÖLÇÜLEMEDİ, sıfır DEĞİL** (CLAUDE.md §1): port kayıtlı değilse ya da çağrı
       * düştüyse "hiçbir fiyat değişmedi" demek, bozuk bir ölçümü sağlıklı gibi okutmak olurdu.
       */
      repricedCount: number | null;
    }
  | { status: 'empty' };

/**
 * **Mal kabul — DEPOCU yolu.** Satırlar partiye dönüşür, PO kapanır, son alış fiyatı güncellenir —
 * hepsi tek transaction'da (RPC). Bu kapının eklediği üç şey: PO'dan maliyet eşlemesi, MLOR uyarısı
 * ve beklenen–gelen farkı.
 *
 * Fiyatlı giriş için `receivePurchase` (09.14) — bu kapı fiyat KABUL ETMEZ ve etmemeli.
 */
export async function receiveGoods(
  db: SupabaseClient,
  input: {
    /** Mal HANGİ depoya girdi (K6) — zorunlu: satın alma depo-üstüdür ama mal bir kapıdan girer. */
    warehouseId: string;
    lines: readonly IntakeFormLine[];
    purchaseOrderId?: string | null;
    supplierId?: string | null;
    date?: string;
    note?: string | null;
    /**
     * **Kabulü yapan personel** — belgeye (`stock_intake.received_by`) ve doğan her harekete
     * (`stock_movement.actor_id`) yazılır. Kim aldığı defterin sorusudur, kabulün değil: kabul
     * aktörsüz de yazılabilir (seed, bakım) ve o hâlde defter "bilinmiyor" der.
     */
    actorId?: string | null;
    reprice?: RepricePort;
  },
): Promise<IntakeOutcome> {
  // Satırlar fiyatsız GİRER ve fiyatsız kalır: `null` burada "bilmiyorum" demek, ve çekirdek onu
  // PO'dan doldurur. Depocu yolunun fiyata dair söyleyebileceği hiçbir şey yok.
  return intake(db, { ...input, lines: input.lines.map((line) => ({ ...line, unitCostCents: null })) });
}

/**
 * **Satın alma kaydı** — admin'in "Stok girişi" yolu (09.14).
 *
 * `receiveGoods`'tan tek farkı satırların maliyet taşıması; envanter tarafı (parti, PO kapanışı,
 * MLOR uyarısı, fark raporu, yeniden fiyatlama) birebir aynıdır ve aynı çekirdekten geçer — iki
 * ayrı akış yazsaydık biri gün gelir ötekinden ayrılırdı.
 *
 * İki durumu birden karşılar: **PO'suz doğrudan alım** (maliyet yalnız buradan gelebilir) ve **PO'lu
 * kabulde fiyat düzeltmesi** (fatura siparişten farklı geldiyse gerçek fiyat yazılır).
 */
export async function receivePurchase(
  db: SupabaseClient,
  input: {
    warehouseId: string;
    lines: readonly PurchaseIntakeLine[];
    purchaseOrderId?: string | null;
    supplierId?: string | null;
    date?: string;
    note?: string | null;
    /** Kabulü yapan personel — depocu yoluyla aynı alan (`receiveGoods` künyesi). */
    actorId?: string | null;
    reprice?: RepricePort;
  },
): Promise<IntakeOutcome> {
  return intake(db, input);
}

async function intake(
  db: SupabaseClient,
  input: {
    warehouseId: string;
    lines: readonly PurchaseIntakeLine[];
    purchaseOrderId?: string | null;
    supplierId?: string | null;
    date?: string;
    note?: string | null;
    /** Kabulü yapan personel — iki kamu kapısı da (depocu · admin) buraya taşır. */
    actorId?: string | null;
    reprice?: RepricePort;
  },
): Promise<IntakeOutcome> {
  if (input.lines.length === 0) return { status: 'empty' };

  const costsInCents = await unitCostsOf(db, input.purchaseOrderId);
  const expected = await expectedQtysOf(db, input.purchaseOrderId);

  const result = await new StockIntakeService(db).receive({
    warehouseId: input.warehouseId,
    supplierId: input.supplierId ?? (await supplierOf(db, input.purchaseOrderId)),
    purchaseOrderId: input.purchaseOrderId,
    date: input.date,
    note: input.note,
    actorId: input.actorId,
    // ── MALİYETİN ÖNCELİĞİ: SATIR > PO > null ──────────────────────────────
    // Elle girilen fiyat siparişteki beklentiyi EZER, çünkü fatura gerçeği söyler: tedarikçi zamla
    // gönderdiyse "son alış fiyatı" o zamlı fiyattır ve `auto_price` da onu görmelidir. Tersi sıra
    // (PO kazansa) admin'in düzeltmesini sessizce çöpe atardı.
    //
    // Birim CENT ve öyle KALIR: euro'ya çevrim servisin RPC sınırında (02.9 · `STACK §8`).
    lines: input.lines.map((line) => ({
      variantId: line.variantId,
      qty: line.qty,
      expiryDate: line.expiryDate,
      lotNumber: line.lotNumber,
      storageAreaId: line.storageAreaId,
      unitCostCents: line.unitCostCents ?? costsInCents.get(line.variantId) ?? null,
    })),
  });

  return {
    status: 'ok',
    result,
    warnings: await mlorWarnings(db, input.lines),
    storageMismatches: await storageMismatches(db, input.lines),
    differences: differencesOf(input.lines, expected),
    repricedCount: await reprice(input.reprice, input.lines.map((line) => line.variantId)),
  };
}

/** Süreç başına tek uyarı: aynı eksik port her kabulde bağırırsa kimse duymaz olur (`effects.ts`). */
let warnedMissingReprice = false;

/**
 * Otomatik fiyat hizalaması. **Kayıtsız port sessizce atlanmaz** — bir kez uyarır ve `null` döner;
 * çağrı patlarsa kaydı düşer, kabulü geri almaz.
 */
async function reprice(port: RepricePort | undefined, variantIds: readonly string[]): Promise<number | null> {
  if (!port) {
    if (!warnedMissingReprice) {
      warnedMissingReprice = true;
      logger.warn(
        { context: 'application/warehouse-intake', effect: 'reprice' },
        'otomatik fiyat portu KAYITLI DEĞİL — maliyet değişti ama fiyat hizalaması atlandı',
      );
    }
    return null;
  }
  try {
    return await port(variantIds);
  } catch (err) {
    logger.warn(
      { context: 'application/warehouse-intake', err: err instanceof Error ? err.message : String(err) },
      'otomatik fiyat hizalaması düştü — mal kabul geri ALINMADI, fiyat sonraki tetikte hizalanır',
    );
    return null;
  }
}

/** Raf ömrü uyarıları — ölçüt üründe (`shelfLifeDays`); ömür bilinmiyorsa uyarı üretilmez. */
async function mlorWarnings(db: SupabaseClient, lines: readonly IntakeFormLine[]): Promise<IntakeWarning[]> {
  const names = await variantNames(db, lines.map((line) => line.variantId));

  const warnings: IntakeWarning[] = [];
  for (const line of lines) {
    const verdict = meetsMlor(line.expiryDate, names.get(line.variantId)?.shelfLifeDays);
    if (!verdict.ok) warnings.push({ variantId: line.variantId, remainingPercent: verdict.remainingPercent });
  }
  return warnings;
}

/**
 * Saklama rejimi ↔ alan uyuşmazlığı (19.29). Rafı seçilmemiş satır sorulmaz: alan yoksa
 * karşılaştırılacak bir şey de yok — "eksik" ile "yanlış" aynı uyarıya düşmemeli.
 *
 * `staging` HİÇ uyarmaz ve bu tanımın kendisi: geçiş alanı (mal kabul, sevk) bir saklama rejimi
 * değil, malın oradan geçtiği yerdir. Uyarsaydı her kabul kendi kabul alanını şikâyet ederdi.
 */
async function storageMismatches(db: SupabaseClient, lines: readonly IntakeFormLine[]): Promise<StorageMismatch[]> {
  const placed = lines.filter((line) => line.storageAreaId);
  if (placed.length === 0) return [];

  const [variants, areas] = await Promise.all([
    new ProductVariantService(db).listByIds([...new Set(placed.map((line) => line.variantId))]),
    new StorageAreaService(db).listByIds([...new Set(placed.map((line) => line.storageAreaId!))]),
  ]);
  const products = await new ProductService(db).listByIds([...new Set(variants.map((v) => v.productId))]);
  const storageOf = new Map(products.map((product) => [product.id, product.storageType]));
  const variantStorage = new Map(variants.map((v) => [v.id, storageOf.get(v.productId)]));
  const areaOf = new Map(areas.map((area) => [area.id, area]));

  const mismatches: StorageMismatch[] = [];
  for (const line of placed) {
    const expected = variantStorage.get(line.variantId);
    const area = areaOf.get(line.storageAreaId!);
    if (!expected || !area || area.kind === 'staging' || area.kind === expected) continue;
    mismatches.push({ variantId: line.variantId, expected, areaKind: area.kind, areaName: area.name });
  }
  return mismatches;
}

// Varyant → ürünün tarih rejimi okuması BURADAN KALKTI (30.08): `shelfLivesOf`/`dateRulesOf`,
// `names.ts`in yaptığı zinciri (varyant → ürün) ikinci kez kuruyordu. Ad çözümü ürün satırını zaten
// elinde tutuyor; `VariantName` artık `dateType` ve `shelfLifeDays` de taşıyor ve iki soru tek
// okumadan cevaplanıyor (`CLAUDE §1` — iki kopya, bir gün ayrışacak iki kopyadır).

/**
 * Beklenen–gelen farkı. Yalnız SAPAN satırlar döner; eşit olan satır gürültüdür.
 *
 * **PO yoksa fark da yoktur:** plansız alımda karşılaştırılacak bir sipariş bulunmaz; her satırı
 * "beklenmedik mal" diye işaretlemek anlamsız bir uyarı yığını üretirdi.
 */
function differencesOf(lines: readonly IntakeFormLine[], expected: Map<string, number>): IntakeDifference[] {
  if (expected.size === 0) return [];

  const received = new Map<string, number>();
  for (const line of lines) received.set(line.variantId, (received.get(line.variantId) ?? 0) + line.qty);

  const differences: IntakeDifference[] = [];
  for (const [variantId, expectedQty] of expected) {
    const receivedQty = received.get(variantId) ?? 0;
    if (receivedQty !== expectedQty) differences.push({ variantId, expectedQty, receivedQty });
  }
  // PO'da olmayan ama gelen mal da bir farktır (tedarikçi ikram/ikame göndermiş olabilir).
  for (const [variantId, receivedQty] of received) {
    if (!expected.has(variantId)) differences.push({ variantId, expectedQty: 0, receivedQty });
  }
  return differences;
}

/**
 * PO kalemlerinin birim fiyatı — **cent** olarak (servis öyle döndürüyor, 02.9 · `STACK §8`).
 *
 * Fiyatı GİRİLMEMİŞ kalem haritaya hiç girmez: `null`'ı taşımak "bilinmiyor"u bir değer gibi
 * göstermek olurdu; yokluk zaten `??` zincirinin bir sonraki halkasına düşüyor.
 */
async function unitCostsOf(db: SupabaseClient, purchaseOrderId?: string | null): Promise<Map<string, number>> {
  if (!purchaseOrderId) return new Map();
  const lines = await new PurchaseOrderItemService(db).listByOrder(purchaseOrderId);
  return new Map(
    lines.filter((line) => line.unitPriceCents != null).map((line) => [line.variantId, line.unitPriceCents!]),
  );
}

/**
 * Siparişin KALAN beklentisi — "bu kabulden önce daha ne bekliyorduk".
 *
 * Ölçü `purchase_order_progress` görünümüdür (0031_warehouse), PO kaleminin ham `qty`'si DEĞİL. Fark bu
 * yüzden önemli: tek sipariş birden çok depoda parça parça kabul edilebilir (K6). Ham `qty`'ye
 * bakan bir karşılaştırma, 30'luk siparişin 20'si Strasbourg'a girdikten sonra Kehl'deki ikinci
 * kabulde "20 eksik" derdi — oysa o 20 çoktan gelmişti.
 *
 * `missing_qty` kümülatiftir ve `initial_qty` üzerinden hesaplanır (`physical_qty` satışla erir).
 */
async function expectedQtysOf(db: SupabaseClient, purchaseOrderId?: string | null): Promise<Map<string, number>> {
  if (!purchaseOrderId) return new Map();
  const rows = await new PurchaseOrderService(db).progressOf(purchaseOrderId);

  // Aynı varyant iki kalemde olabilir: beklenti TOPLANIR, üzerine yazılmaz. `new Map(...)` ile
  // kurulsaydı sessizce sonuncu kalem kazanırdı ve fark raporu diğerini yok sayardı.
  const kalan = new Map<string, number>();
  for (const row of rows) kalan.set(row.variantId, (kalan.get(row.variantId) ?? 0) + row.missingQty);
  return kalan;
}

/** PO'lu kabulde tedarikçi siparişten türer — depocuya sorulmaz. */
async function supplierOf(db: SupabaseClient, purchaseOrderId?: string | null): Promise<string | null> {
  if (!purchaseOrderId) return null;
  return (await new PurchaseOrderService(db).getById(purchaseOrderId))?.supplierId ?? null;
}
