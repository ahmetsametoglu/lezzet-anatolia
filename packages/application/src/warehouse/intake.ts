import {
  ProductService,
  ProductVariantService,
  PurchaseOrderItemService,
  PurchaseOrderService,
  StockIntakeService,
  StockService,
  StorageAreaService,
  SupplierProductService,
  SupplierService,
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
import { caseSizesByVariant } from './case-sizes';
import { variantNames } from './names';

/**
 * Mal kabul: satırlar partiye dönüşür; depocu alış fiyatı görmez ve girmez, birim maliyet tedarik siparişinden sunucuda eklenir.
 * Raf ömrü (MLOR) ve beklenen–gelen farkı uyarır ama kabulü engellemez, çünkü kayıt gelen malın gerçeğini yazmalı.
 */

/** Depocunun doldurduğu satır — para alanı yok. */
export interface IntakeFormLine {
  variantId: string;
  qty: number;
  expiryDate: string;
  lotNumber?: string | null;
  /** Partinin konacağı depo içi alan (`storage_area`); serbest metin değil kimlik. */
  storageAreaId?: string | null;
}

/**
 * Yöneticinin doldurduğu, maliyet taşıyan tek satır tipi: fiyat ortak tipe alan olarak konsaydı depo ekranı onu gönderebilirdi.
 * Maliyet varyanta değil satıra aittir; aynı varyant farklı lot ya da tarihle farklı fiyattan gelmiş olabilir.
 */
export interface PurchaseIntakeLine extends IntakeFormLine {
  /** Birim alış fiyatı, tamsayı cent; `null` = bilinmiyor ve siparişli kabulde siparişteki fiyat kullanılır. */
  unitCostCents: number | null;
}

/** PO'dan dolu gelen form satırı — beklenen adet + ürün adı; fiyat yok. */
export interface IntakeFormRow {
  variantId: string;
  productName: string;
  variantLabel: string;
  /**
   * Bu kabulde daha ne bekleniyor: ısmarlanan toplam değil kalan (`missingQty`), çünkü kayıt da farkı kalana göre yazıyor. Tamamı gelmiş
   * kalem `0` ile listede kalır; fazla kabul meşrudur ve satırı gizlemek gelen malı yazacak yeri kaldırırdı.
   */
  expectedQty: number;
  /**
   * Tedarikçinin bu kaleme verdiği kod: depocunun elindeki irsaliye tedarikçinin kâğıdıdır ve satırı eşleştirmenin kesin anahtarı budur.
   * `null` = kalem bir eşlemeye bağlanmadan açılmış.
   */
  supplierCode: string | null;
  /** Varyantın kendi kodu: plansız kabulde tedarikçi kodu olmadığı için satırı tanıtan tek kod budur. */
  sku: string | null;
  /** Tarih rejimi (DOMAIN §4) — depocu kutunun üstünde DLC mi DDM mi arayacağını bilmeli. */
  dateType: ProductDateType;
  /** Ürünün toplam raf ömrü (gün); `null` ise kalan ömür hesaplanamaz. Yüzde burada üretilmez, çünkü son tarih henüz yazılmamıştır. */
  shelfLifeDays: number | null;
  /**
   * Ürünün kayıtlı koli boyları: depocu "3 koli" der, paketi ekran çarpar. Boş dizi bir cevaptır; varsayılan boy koymak ölçülmemiş bir
   * çarpanla sayımı bozardı.
   */
  caseSizes: CaseSizeContract[];
  /** Varyantın depoda duran lot kodları, çekmecenin öneri listesi; boş dizi kodlu parti yok ya da form deposuz açıldı demektir. */
  lotCandidates: string[];
}

/**
 * Bekleyen tedarik siparişinden dolu form; kalem yoksa boş dizi döner ve form elle doldurulur. Depo sorulmaz, çünkü satın alma depo-üstüdür
 * ve süzmek siparişin ikinci deposundaki kalemleri gizlerdi.
 */
export async function openIntakeForm(
  db: SupabaseClient,
  purchaseOrderId: string,
  /** Lot önerileri bu deponun partilerinden okunur; depo verilmezse yanlış deponun kodları yerine öneri hiç dönmez. */
  warehouseId?: string | null,
): Promise<IntakeFormRow[]> {
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
  const [names, mappings, casesOf, lotsOf] = await Promise.all([
    variantNames(db, lines.map((line) => line.variantId)),
    new SupplierProductService(db).listByIds(
      lines.map((line) => line.supplierProductId).filter((id): id is string => id !== null),
    ),
    // Koli boyları TEK sorguda, form açılışında: çekmece açıldığında ikinci bir tur atılsaydı
    // depocu ± düğmelerine bir yükleme beklerken basardı. Eleme ve sıra tek kapıda (`case-sizes`).
    caseSizesByVariant(db, lines.map((line) => line.variantId)),
    // LOT ADAYLARI da aynı turda: çekmece açıldığında ayrı bir uçuş, depocuyu öneri listesi
    // dolarken bekletirdi. Deposuz çağrıda okuma hiç yapılmaz (künye imzada).
    warehouseId == null
      ? Promise.resolve(new Map<string, string[]>())
      : new StockService(db).recentLotsByVariants(warehouseId, lines.map((line) => line.variantId), LOT_CANDIDATE_LIMIT),
  ]);
  const codeOf = new Map(mappings.map((mapping) => [mapping.id, mapping.supplierCode]));

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
    caseSizes: casesOf.get(line.variantId) ?? [],
    // İlerleme satırı yoksa kalan = ısmarlanan; `?? 0` OLAMAZ: görünüm bir satırı bir gün taşımazsa
    // "0 bekleniyor" demek, depocuyu kendi kaydımıza karşı sessizce kör bırakırdı (`CLAUDE §1` —
    // ölçülemeyen değer sıfır değildir).
    expectedQty: progress.get(line.id) ?? line.qty,
    lotCandidates: lotsOf.get(line.variantId) ?? [],
  }));
}

/** Varyant başına lot önerisi: liste bir hatırlatmadır ve gözle taranacak kadar kısa kalmalı. */
const LOT_CANDIDATE_LIMIT = 3;

/** Tedarik siparişinin künyesi (numara, tedarikçi); para taşımaz, çünkü depocu belgenin tutarını değil hangisi olduğunu bilmeli. */
export interface IntakeHeader {
  purchaseOrderId: string;
  /** İnsan-okur numara; **taslakta `null`** — numara gönderimde doğar (`markSent`). */
  referenceNo: string | null;
  /** Tedarikçi adı; erişilemeyen kayıtta `null` — uydurma ad yerine görünür boşluk. */
  supplierName: string | null;
}

/**
 * Siparişin künyesi; sipariş yoksa `null`. `openIntakeForm`a alan olarak eklenmedi, çünkü künye sipariş başına tekildir ve o kapının
 * künyeye ihtiyacı olmayan çağıranı da var.
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
 * Bekleyen sevkiyatlar `sent` ve `partially_received`dır, çünkü ilk depo kabulü siparişi kapatmaz ve ikinci deponun payı kaybolmamalı.
 * Depo sorulmaz ve dönen tipte para yok: fiyatlar okunsa da bu fonksiyonun sınırında kalır.
 */
export async function listPendingIntakes(db: SupabaseClient, opts: { limit?: number } = {}): Promise<PendingIntake[]> {
  const limit = opts.limit ?? 20;
  const service = new PurchaseOrderService(db);

  // İki çağrı, çünkü `listRows` tek durum süzüyor. Paralel: ikisi birbirini beklemez.
  const [sent, partial] = await Promise.all([
    service.listRows({ status: 'sent', limit }),
    service.listRows({ status: 'partially_received', limit }),
  ]);

  // Durum satırın kendi alanından okunur, süzgeçten türetilmez: beklenmedik durumdaki satır sessizce yanlış etiketlenmek yerine
  // listeye hiç girmez.
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
 * Ürünün saklama rejimi ile konduğu alan uyuşmuyor. Engellemez, söyler: bozuk dondurucu yüzünden malı geçici olarak başka alana koymak
 * meşrudur ve reddetmek depocuyu yanlış kayda iterdi.
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
 * Maliyet değişince otomatik fiyatı hedef marja çeken port; dönen sayı hedefe çekilen fiyat adedidir. Kabulü bozmaz: port patlarsa
 * yazılmış mal kabulü geri alınmaz.
 */
export type RepricePort = (variantIds: readonly string[]) => Promise<number>;

type IntakeOutcome =
  | {
      status: 'ok';
      result: ReceiveIntakeResult;
      /** Raf ömrü kısa gelen partiler — kabul ENGELLENMEZ, yalnız bildirilir. */
      warnings: IntakeWarning[];
      /** Saklama rejimine uymayan alana konan partiler; MLOR gibi uyarır, engellemez. */
      storageMismatches: StorageMismatch[];
      /** PO'ya göre eksik/fazla — fark olarak işaretlenir, iş durmaz. */
      differences: IntakeDifference[];
      /** Yeni maliyet yüzünden hedefe çekilen fiyat sayısı, depocuya gösterilmez; `null` = ölçülemedi, sıfır değil. */
      repricedCount: number | null;
    }
  | { status: 'empty' };

/**
 * Mal kabul, depocu yolu: satırlar partiye dönüşür, sipariş kapanır ve son alış fiyatı güncellenir, hepsi tek RPC'de. Bu kapı fiyat kabul
 * etmez; fiyatlı giriş `receivePurchase`tır.
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
 * Satın alma kaydı: `receiveGoods`tan tek farkı satırların maliyet taşıması, envanter tarafı aynı çekirdekten geçer. Siparişsiz alımda
 * maliyet yalnız buradan gelir; siparişli kabulde belgedeki gerçek fiyat siparişteki fiyatı düzeltir.
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

  const costsInCents = await purchaseOrderUnitCosts(db, input.purchaseOrderId);
  const expected = await expectedQtysOf(db, input.purchaseOrderId);

  const result = await new StockIntakeService(db).receive({
    warehouseId: input.warehouseId,
    supplierId: input.supplierId ?? (await supplierOf(db, input.purchaseOrderId)),
    purchaseOrderId: input.purchaseOrderId,
    date: input.date,
    note: input.note,
    actorId: input.actorId,
    // Maliyetin önceliği satır > sipariş > yok: belge gerçeği söyler; tedarikçi zamlı gönderdiyse son alış fiyatı ve otomatik fiyat
    // onu görmeli.
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
 * Saklama rejimi ile alan uyuşmazlığı; rafı seçilmemiş satır sorulmaz. Geçiş alanı (`staging`) hiç uyarmaz, çünkü bir saklama rejimi
 * değil malın geçtiği yerdir.
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

/** Beklenen–gelen farkı, yalnız sapan satırlar; sipariş yoksa fark da yoktur. */
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
 * Sipariş kalemlerinin birim fiyatı (cent, varyant anahtarlı): kabul bu fiyatı yazar, yetkili ekran da aynı haritayı gösterir ki görünen
 * ile yazılan ayrışmasın. Fiyatı girilmemiş kalem haritaya girmez, çünkü yokluk bir değer gibi taşınmamalı.
 */
export async function purchaseOrderUnitCosts(db: SupabaseClient, purchaseOrderId?: string | null): Promise<Map<string, number>> {
  if (!purchaseOrderId) return new Map();
  const lines = await new PurchaseOrderItemService(db).listByOrder(purchaseOrderId);
  return new Map(
    lines.filter((line) => line.unitPriceCents != null).map((line) => [line.variantId, line.unitPriceCents!]),
  );
}

/**
 * Siparişin kalan beklentisi `purchase_order_progress` görünümünden okunur, ham `qty`'den değil: sipariş birden çok depoda parça parça
 * kabul edilebilir ve ham adet gelmiş malı eksik gösterirdi.
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
