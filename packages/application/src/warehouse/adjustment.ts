import { StockMovementService, StockService } from '@lezzet/database';
import { documentPrefixFor, remainingShelfLifePercent } from '@lezzet/domain-core';
import type {
  AdjustBatchResult,
  CaseSizeContract,
  ProductDateType,
  StockBatchDetail,
  StockDirection,
  StockMovementKind,
  StockWriteOffReason,
} from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { caseSizesByVariant } from './case-sizes';
import { displayName, variantNames } from './names';
import { rpcRejectionMessage } from './rpc-error';

/**
 * **İmha / sayım — D4** (10.5), terfi 21.11. Kaynağı `apps/web/lib/stock/adjustment.ts`;
 * `design/pages/depo-imha-sayim.md` + `design/BACKLOG.md §1c` + DOMAIN §4 + mobil v2 "Sayım /
 * Düzeltme" ekranı bağlayıcı.
 *
 * Kapının eklediği ÜÇ şey var; üçü de kural, üçü de yapısal:
 *
 * 1. **OLAY belgesi.** Bir imhada üç parti çöpe gidebilir; üçü tek numarayı paylaşır ve o numara
 *    kâğıt tutanakla eşleşir (v2: *"OLAY REFERANSI … kâğıt tutanakla eşleşir"*). Öneki motor seçer
 *    (sınıflandırma), numarayı DB üretir (atomiklik).
 *
 * 2. **Depocuya restok seçeneği SUNULMAZ.** Teslim sonrası geri gelen malın stoğa iadesi bir admin
 *    istisnasıdır (DOMAIN §4/§8): soğuk zincir belgelenemediği için varsayılan imhadır. Kural bir
 *    arayüz disiplini olarak bırakılsaydı er geç bir ekranda o seçenek belirirdi — burada TİPTE
 *    duruyor (v2: *"'İade stoğa döndü' depocuya açılmaz — yönetim istisnasıdır"*).
 *
 * 3. **Parti BAŞKA DEPONUNSA yazım yapılmaz** (21.11 · CLAUDE.md §1). Web kopyasında bu soru hiç
 *    sorulmuyordu, çünkü ekranın guard'ı zaten kapıda duruyordu. Mobil depocunun kapısında o guard
 *    "hangi depo" sorusunu cevaplamıyor: `stockId` bir kimliktir ve başka şehrin partisini
 *    gösterebilir. Kapı kimliği ister, kapsam dışını GÖRÜNÜR retle döner.
 */

/**
 * Depocunun seçebileceği sebepler — `return_restock` YOK (admin istisnası).
 *
 * **Tek liste, iki seviye** (06.14): veride imha bir hareket TİPİ (`write_off`) ve DLC/hasar/kayıp
 * onun SEBEBİ; sayım farkı ayrı bir tip. Depocu ise tek bir listeden seçer — tip-sebep ayrımı onun
 * sorunu değil. Çeviriyi bu kapı yapıyor (`kindOf`/`reasonOf`), ekran değil.
 */
export type WarehouseReason = StockWriteOffReason | 'count_diff';

/**
 * Raf listesinin tavanı — seçicinin penceresi, sayfa değil (`listWarehouseBatches`).
 *
 * 60: bir deponun rafında aynı anda duran parti sayısı bu mertebede (yerel veriden ÇIKARIM
 * yapılmadı — CLAUDE.md'nin yasağı; sayı bir tavan, bir ölçüm değil). Dolduğunda ekran "aramayla
 * daralt" der; parametrik, çağıran değiştirebilir.
 */
const BATCH_LIST_LIMIT = 60;

/** Depocunun seçimi → defterin hareket tipi. */
function kindOf(reason: WarehouseReason): Extract<StockMovementKind, 'write_off' | 'count_diff'> {
  return reason === 'count_diff' ? 'count_diff' : 'write_off';
}

/** Depocunun seçimi → imhanın sebebi. Sayım farkının sebebi YOKTUR (kısıt da öyle diyor). */
function reasonOf(reason: WarehouseReason): StockWriteOffReason | null {
  return reason === 'count_diff' ? null : reason;
}

export interface AdjustmentLine {
  stockId: string;
  /** DAİMA pozitif — yön ayrı alanda (06.14). */
  qty: number;
  /** `out` = stoktan düş, `in` = stoğa ekle (yalnız sayım FAZLASI). */
  direction: StockDirection;
}

/**
 * Yazımdan SONRA ölçülen iki sayı — sonuç kartının *"12 → 9"*u (v3:08/09, 02.09).
 *
 * Hesaplanmıyor, OKUNUYOR: `eski − düşülen` çıkarması aynı partiye o sırada dokunan başka bir
 * yazımı (kabul, toplama) sessizce yok sayardı ve tutanağa yanlış sayı yazılırdı.
 */
export interface AdjustmentAfterCounts {
  batchQty: number;
  variantWarehouseQty: number;
}

export type AdjustmentOutcome =
  | { status: 'ok'; result: AdjustBatchResult; after: AdjustmentAfterCounts | null }
  /** Tek satır bile yazılmadı — sebep operatöre aynen gösterilir (partide o kadar mal yok gibi). */
  | { status: 'failed'; message: string }
  /**
   * Satırlardan biri (ya da birkaçı) BAŞKA deponun partisi — hiçbiri yazılmadı. Hangi parti olduğu
   * dönüyor: "kapsam dışı" tek başına ekranda çözülemeyen bir cümledir, operatör hangi satırı
   * sileceğini bilmeli.
   */
  | { status: 'forbidden'; reason: 'out_of_scope'; stockIds: string[] }
  /** Verilen kimlikte parti yok — "başka deponun" ile aynı şey DEĞİL, teşhisi de farklı. */
  | { status: 'not_found'; stockIds: string[] }
  | { status: 'empty' };

/**
 * **İmha / sayım kaydı.** Bütün satırlar tek transaction'da yazılır ve tek belge numarasını
 * paylaşır; bir satır düşerse HİÇBİRİ yazılmaz — yarım tutanak, hiç tutanak olmamasından kötüdür
 * (kâğıtla eşleşmez ve stok da yarı düşmüş kalır).
 *
 * Stoğa geri ekleme (`direction: 'in'`) yalnız **sayım fazlasında** meşrudur ve sebep notu
 * ZORUNLUDUR; kuralı veritabanı zorlar (`adjust_stock_batch`) — burada tekrarlanmaz (v2: *"Geri
 * eklemede sebep notu zorunlu — sistem zorlar"*).
 *
 * @param db service-role istemci — çağıran enjekte eder (`serviceDb()`), `auth/otp` deseni.
 */
export async function recordAdjustment(
  db: SupabaseClient,
  input: {
    /** Depocunun çalıştığı depo — satırların hepsi buranın partisi olmalı (CLAUDE.md §1). */
    warehouseId: string;
    lines: readonly AdjustmentLine[];
    reason: WarehouseReason;
    note?: string | null;
    actorId?: string | null;
  },
): Promise<AdjustmentOutcome> {
  if (input.lines.length === 0) return { status: 'empty' };

  const stockIds = [...new Set(input.lines.map((line) => line.stockId))];
  const batches = await new StockService(db).listByIds(stockIds);
  const warehouseOf = new Map(batches.map((batch) => [batch.id, batch.warehouseId]));

  const missing = stockIds.filter((id) => !warehouseOf.has(id));
  if (missing.length > 0) return { status: 'not_found', stockIds: missing };

  const foreign = stockIds.filter((id) => warehouseOf.get(id) !== input.warehouseId);
  if (foreign.length > 0) return { status: 'forbidden', reason: 'out_of_scope', stockIds: foreign };

  try {
    const kind = kindOf(input.reason);
    const result = await new StockMovementService(db).adjustBatch({
      lines: input.lines,
      kind,
      // Önek TİPTEN seçilir, sebepten değil: DLC/hasar/kayıp üçü de aynı imha tutanağına yazılır.
      prefix: documentPrefixFor(kind),
      reason: reasonOf(input.reason),
      note: input.note,
      createdBy: input.actorId,
    });
    return { status: 'ok', result, after: await measureAfter(db, input.warehouseId, stockIds) };
  } catch (error) {
    // Fiziksel gerçeğin ihlali bir hata DEĞİL, operatöre söylenecek bir cevaptır ("partide 3 adet
    // var, 5 düşülemez"). Fırlatıp ekranı çökertmek yerine mesajı taşıyoruz (STACK §8).
    // Çıkarım `rpcRejectionMessage`in işi: supabase-js reddi `Error` ÖRNEĞİ DEĞİL (ölçüldü) ve
    // örnek denetimiyle bakan eski süzgeç gerçek cümleyi atıyordu — gerekçe o dosyanın künyesinde.
    return { status: 'failed', message: rpcRejectionMessage(error, 'Kayıt yazılamadı') };
  }
}

/**
 * Yazımdan sonraki iki sayıyı OKUR — sonuç kartının kaynağı (02.09).
 *
 * ── YALNIZ TEK PARTİLİ YAZIMDA ──────────────────────────────────────────────
 * Sonuç kartı *"partide 12 → 9"* diyor; çok partili bir imhada bu cümlenin öznesi yoktur ve
 * "hangi parti" sorusu tek cevaplı değildir. Çoğulda `null` dönüyor — ekran o hâlde yalnız olay
 * referansını gösterir, hangisi olduğu belirsiz bir sayıyı değil.
 *
 * ── OKUMA DÜŞERSE YAZIM YİNE GEÇERLİDİR ─────────────────────────────────────
 * Buraya gelindiğinde mal ZATEN düşmüş ve tutanak numarası doğmuştur. Okuma turu düşerse fırlatmak,
 * başarılı bir yazımı ekranda başarısız göstermek olurdu — en kötü yanlış budur (depocu aynı malı
 * ikinci kez düşer). Bu yüzden hata YUTULUYOR ama `null` ile: ölçülemeyen değer sıfır değildir
 * (CLAUDE §1) ve ekran o hâlde "yeni değer" satırını hiç çizmez.
 */
async function measureAfter(
  db: SupabaseClient,
  warehouseId: string,
  stockIds: readonly string[],
): Promise<AdjustmentAfterCounts | null> {
  const stockId = stockIds.length === 1 ? stockIds[0] : null;
  if (stockId === undefined || stockId === null) return null;

  try {
    const stock = new StockService(db);
    const [batch] = await stock.listByIds([stockId]);
    if (batch === undefined) return null;
    const available = await stock.getAvailable(warehouseId, batch.variantId);
    return { batchQty: batch.physicalQty, variantWarehouseQty: available.physicalQty };
  } catch {
    // Sessiz DEĞİL, kararlı: hata burada bir cevaba (`null`) çevriliyor ve gerekçesi künyede.
    return null;
  }
}

/** Rafta okunan etiketin çözümü — sayımın KONUSU. **Para YOK**: partinin alışı depo yolundan geçmez. */
export interface ResolvedBatch {
  stockId: string;
  variantId: string;
  /** "Ürün (boy)" — operasyon dilinde; ekranın üstbaşlığı. */
  name: string;
  /** Lot numarası; **okutma yolunda daima dolu, raf listesinde `null` olabilir** (kabulde boş
      bırakmak meşru). Lotsuz partiyi listeden düşürmek, sayımın en çok gerektiği partiyi görünmez
      yapardı. */
  lotNumber: string | null;
  expiryDate: string;
  /** Tarih rejimi (`DLC`/`DDM`) — bağlam kartında tarihin yanında; rejimsiz tarih yanlış imha demek. */
  dateType: ProductDateType;
  physicalQty: number;
  /** Partinin alanının ADI ("Derin dondurucu 2"); rafı seçilmemiş partide `null` (19.29). */
  storageAreaName: string | null;
  /** Alanın kimliği — ekranın "aktif alanım bu mu" sorusu adla sorulamaz (sözleşme künyesi, 03.09). */
  storageAreaId: string | null;
  /** Ürün kapağı — `variantNames` zaten çözüyor, ek okuma yok (kullanıcı isteği 03.09). */
  imageUrl: string | null;
  /** Kalan raf ömrü yüzdesi; **`null` = ölçülemedi** (ürünün toplam ömrü girilmemiş), sıfır DEĞİL. */
  lifePercent: number | null;
  /**
   * Ürünün BU DEPODAKİ toplam fiili stoğu — bağlam kartının ikinci sayısı (02.09).
   *
   * Parti adedi tek başına "ürün bitiyor mu" sorusunu cevaplamaz: aynı ürünün rafta üç partisi
   * olabilir. Depo süzgeçli ve öyle kalmalı (CLAUDE §1) — depo-üstü toplam, başka şehrin malını
   * burada varmış gibi gösterirdi.
   */
  variantWarehouseQty: number;
  /** Ürünün kayıtlı koli boyları — sayım çekmecesinin çarpanı (sözleşme künyesi). */
  caseSizes: CaseSizeContract[];
}

export type ResolveBatchOutcome = { status: 'found'; batches: ResolvedBatch[] } | { status: 'unknown' };

/**
 * **RAFTAKİ ETİKETİ OKUT** — D4'ün ikinci çıkış yolu (v3 · 08), 30.08'de açıldı.
 *
 * ── NEDEN `resolveScannedCode` DEĞİL ────────────────────────────────────────
 * O kapı bir kodu VARYANTA çevirir ("bu hangi mal") ve künyesi stok okumasını bilerek dışarıda
 * bırakıyor. Sayımın sorusu başkadır: düzeltme daima bir PARTİYE yazılır ve aynı varyantın aynı
 * depoda birden çok partisi olabilir — varyant cevabı, "hangi partiden düşeyim" sorusunu
 * cevapsız bırakırdı. İki soru tek kapıya yüklenseydi cevabın tipi ikiye ayrılır ve çağıranların
 * yarısı ötekinin dalını hiç kullanmazdı.
 *
 * ── PARTİ KODU = `stock.lot_number`, VE BU ÖLÇÜLDÜ ──────────────────────────
 * Veride sistemin ürettiği bir parti kodu YOK (`stock` tablosunda böyle bir kolon yok; kendi lot
 * etiketimizi basmak bilinçli olarak ertelendi — 23 §3). Rafta okunan şey TEDARİKÇİNİN kutuya
 * yazdığı lot numarasıdır ve o alan zaten kayıtta: `stock.lot_number`. Yani bu kapı olmayan bir
 * alanı uydurmuyor, var olan alanı okutuyor.
 *
 * ── KAPSAM VE STOK SÜZGECİ SORGUDA ──────────────────────────────────────────
 * Yalnız çağıranın deposu (CLAUDE.md §1 — depo süzgeçsiz okuma yok) ve yalnız stoğu duran
 * partiler: tükenmiş bir partiyi göstermek, `recordAdjustment`ın reddedeceği bir satır
 * seçtirirdi. Süzgeçler servisin sorgusunda, elde değil — tavana dayanan bir listeyi sonradan
 * süzmek kapsamdaki partiyi sessizce dışarıda bırakabilirdi.
 *
 * `now` DIŞARIDAN verilir: aynı okumanın bütün satırları aynı ana göre değerlendirilsin
 * (`batch-view`in aynı kararı) — istek ortasında gün dönerse iki satır iki farklı güne bakardı.
 */
export async function resolveBatchCode(
  db: SupabaseClient,
  input: { code: string; warehouseId: string; now?: Date },
): Promise<ResolveBatchOutcome> {
  const code = input.code.trim();
  if (code.length === 0) return { status: 'unknown' };

  const batches = await new StockService(db).findByLot(code, { warehouseId: input.warehouseId, onlyInStock: true });
  if (batches.length === 0) return { status: 'unknown' };

  return { status: 'found', batches: await toResolvedBatches(db, batches, input.warehouseId, input.now ?? new Date()) };
}

/**
 * Parti satırlarının TEK çevirici hâli — okutma ile raf listesi aynı satırı çiziyor (02.09).
 *
 * İkisi ayrı yazılsaydı bir gün ayrışırlardı: ekran aynı kartı gösteriyor ve "sistemde kayıtlı"
 * ile "ürünün toplam stoğu" iki yoldan farklı hesaplanmaya başlasaydı, depocu hangi yoldan
 * geldiğine göre başka sayı görürdü.
 *
 * `now` DIŞARIDAN: aynı okumanın bütün satırları aynı ana bakmalı (`batch-view`in kararı).
 */
async function toResolvedBatches(
  db: SupabaseClient,
  batches: readonly StockBatchDetail[],
  warehouseId: string,
  now: Date,
): Promise<ResolvedBatch[]> {
  const variantIds = [...new Set(batches.map((batch) => batch.variantId))];
  // İki okuma birbirini beklemez ve ikisi de TEK tur: satır başına ayrı sorgu, otuz partili bir
  // rafta altmış gidiş-dönüş demekti.
  const [names, availability, casesOf] = await Promise.all([
    variantNames(db, variantIds),
    new StockService(db).getAvailableMap(warehouseId, variantIds),
    // Rafta koli de durur: sayımın çekmecesi çarpanı ürün kartından alır (kullanıcı 02.09).
    caseSizesByVariant(db, variantIds),
  ]);

  return batches.map((batch) => ({
    stockId: batch.id,
    variantId: batch.variantId,
    name: displayName(names.get(batch.variantId)),
    lotNumber: batch.lotNumber,
    expiryDate: batch.expiryDate,
    dateType: batch.variant.product.dateType,
    physicalQty: batch.physicalQty,
    storageAreaName: batch.storageArea?.name ?? null,
    storageAreaId: batch.storageArea?.id ?? null,
    imageUrl: names.get(batch.variantId)?.imageUrl ?? null,
    // Ömür yüzdesi MOTORDAN (`domain-core`): uygulama katmanı kendi hesabını kurmaz. Ürünün
    // toplam ömrü girilmemişse motor `null` döner ve ekran "bilinmiyor" gösterir.
    lifePercent: remainingShelfLifePercent(batch.expiryDate, batch.variant.product.shelfLifeDays, now),
    // Ürünün DEPODAKİ toplamı — bağlam kartının ikinci sayısı. Satır yoksa okuma sıfırlarla
    // döner (servisin sözleşmesi), yani burada `null` doğmaz.
    variantWarehouseQty: availability.get(batch.variantId)?.physicalQty ?? 0,
    caseSizes: casesOf.get(batch.variantId) ?? [],
  }));
}

/**
 * **RAF LİSTESİ** — D4/D4b'nin *"ya da raf listesinden seç"* yolu (v3:08/09), 02.09.
 *
 * ── NEDEN VAR ───────────────────────────────────────────────────────────────
 * Sayımın konusu bugüne kadar yalnız DIŞARIDAN geliyordu: D3 turundan taşınıyor ya da rafta bir
 * etiket okutuluyordu. Okunamayan etiket depocuyu çıkışsız bırakıyordu — ve sayım tam da o partide
 * gerekir: kaydı şüpheli olan parti, etiketi de şüpheli olandır.
 *
 * ── PENCERE + ARAMA, SAYFA DEĞİL ────────────────────────────────────────────
 * Bu bir liste ekranı değil, bir SEÇİCİ: depocu aradığı partiyi bilir. Sabit tavan + arama
 * (`/warehouse/variants` deseni). Tavana dayanıldığında `truncated` SÖYLER — sessiz kırpma,
 * depocunun "listede yok" deyip yanlış partiye gitmesi demekti (CLAUDE §1).
 *
 * Arama hem ÜRÜN ADINDA hem LOTTA: depocunun elinde ya kutunun üstündeki isim vardır ya numara.
 * Ad süzgeci elde çünkü ad `stock` satırında değil, varyantın kendi tablosunda durur ve isimler
 * zaten bu tur için okunuyor.
 */
export async function listWarehouseBatches(
  db: SupabaseClient,
  input: { warehouseId: string; query?: string; limit?: number; now?: Date },
): Promise<{ batches: ResolvedBatch[]; truncated: boolean }> {
  const limit = input.limit ?? BATCH_LIST_LIMIT;
  // Küme fiziksel gerçekle sınırlı (servis künyesi): depoda duran parti sayısı kadar, mal
  // tükendikçe erir. Sayfalanmıyor — süzgeci elde uygulamak için TAM kümeye ihtiyaç var.
  const rows = await new StockService(db).listInStockDetailed(undefined, [input.warehouseId]);
  const resolved = await toResolvedBatches(db, rows, input.warehouseId, input.now ?? new Date());

  const term = (input.query ?? '').trim().toLocaleLowerCase('tr-TR');
  const matched =
    term.length === 0
      ? resolved
      : resolved.filter(
          (batch) =>
            batch.name.toLocaleLowerCase('tr-TR').includes(term) ||
            (batch.lotNumber ?? '').toLocaleLowerCase('tr-TR').includes(term),
        );

  return { batches: matched.slice(0, limit), truncated: matched.length > limit };
}
