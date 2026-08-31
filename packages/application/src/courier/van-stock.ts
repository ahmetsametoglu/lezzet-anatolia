import { StockService, WarehouseService, WarehouseTransferService } from '@lezzet/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import { dispatchTransfer, receiveTransfer } from '../warehouse/transfer';
import { displayName, variantNames } from '../warehouse/names';

/**
 * **ARACA SERBEST ÜRÜN** (v3:19 · kullanıcı kararı 31.08) — sipariş dışı, kapıda satılabilecek mal.
 *
 * ── İKİ AYRI ŞEY, TEK EKRAN ─────────────────────────────────────────────────
 * Araca iki tür mal biniyor ve mekanizmaları AYNI DEĞİL:
 *   · **Sipariş kutusu** → emanet değişimi. Mal siparişin, depoda rezerve; stok oynamaz
 *     (`ready → out_for_delivery` etkisi `none`). `loadBox` yalnız damga yazar.
 *   · **Serbest ürün** → GERÇEK STOK HAREKETİ. Mal depodan çıkıp aracın stoğuna girer, çünkü
 *     kapıda o stoktan satılacak (`quickSale` araç deposundan düşüyor) ve akşam sayılıp geri
 *     devredilecek (v3:14). İkisini tek mekanizmaya indirmek, satılan malın hangi depodan
 *     düştüğünü belirsiz bırakırdı.
 *
 * ── NEDEN TRANSFER, NEDEN TEK ÇAĞRIDA ───────────────────────────────────────
 * Depo→araç bir TRANSFERDİR ve mekanizması hazır: `dispatch_transfer` malı kaynaktan O AN düşürür
 * (sanal transit depo yok — 0031'in T4 kararı), `receive_transfer` hedefe yazar. Yeni bir RPC
 * yazılmadı; ikinci bir stok taşıma yolu açmak, aynı gerçeği iki yerden oynatmak olurdu (CLAUDE §1).
 *
 * İki adım TEK çağrıda kapanıyor ve bu bir kestirme değil, sahanın kendisi: kurye rampada malı
 * eline alıp araca koyuyor — veren de alan da O. Ayrı bir "kabul" adımı, kuryeye kendi koyduğu
 * malı ikinci kez onaylatmak olurdu. Yarım kalma riski de var ve GÖRÜNÜR: sevk yazılıp kabul
 * düşerse mal transferde asılı kalır, o yüzden cevap ikisini birden söyler.
 *
 * ── ARAÇ DEPOSU KAPSAMDAN GELİR, İSTEMCİDEN DEĞİL ───────────────────────────
 * Kuryenin `warehouseIds`i içindeki `kind='vehicle'` depo — yerinde satış ucunun aynı çözümü
 * (`sale.ts` künyesi). İstemciden gelen bir depo kimliği, kapsam kontrolünü kandırmanın kendisidir.
 */

/** Araçta duran bir kalem — parti değil VARYANT düzeyinde toplanır (kurye partiyi konuşmaz). */
export interface VanStockLine {
  variantId: string;
  name: string;
  /** Araçta kalan adet — partiler toplanmış hâlde. */
  qty: number;
}

/** Depoda alınabilir bir kalem — "sık koyulanlar" şeridinin satırı. */
export interface VanCandidate {
  variantId: string;
  name: string;
  /** Depoda KULLANILABİLİR adet (rezerveler düşülmüş) — söz verilmiş mal araca alınamaz. */
  available: number;
}

export type TakeToVanOutcome =
  | { status: 'ok'; variantId: string; movedQty: number; vanQty: number }
  /** Depoda o kadar KULLANILABİLİR mal yok — sipariş için ayrılmış mal araca alınmaz. */
  | { status: 'not_enough'; available: number }
  | { status: 'no_vehicle' }
  | { status: 'forbidden'; reason: 'out_of_scope' }
  /** Sevk yazıldı ama kabul düşdü — mal transferde asılı; kimliği dönüyor ki çözülebilsin. */
  | { status: 'stuck'; transferId: string }
  | { status: 'failed'; message: string };

/** Kuryenin araç deposu — kapsamındaki `kind='vehicle'` ilk depo; yoksa `null`. */
export async function vehicleWarehouseOf(db: SupabaseClient, warehouseIds: readonly string[]): Promise<string | null> {
  if (warehouseIds.length === 0) return null;
  const service = new WarehouseService(db);
  const rows = await Promise.all(warehouseIds.map((id) => service.getById(id)));
  return rows.find((row) => row?.kind === 'vehicle')?.id ?? null;
}

/**
 * **Araçta ne var** — varyant düzeyinde toplanmış. Parti kırılımı BİLEREK yok: kurye "üç Şöbiyet
 * var" diye düşünüyor, "iki farklı SKT'den üç Şöbiyet" diye değil. Kırılım depo ekranlarının işi.
 */
export async function readVanStock(db: SupabaseClient, input: { vehicleWarehouseId: string }): Promise<VanStockLine[]> {
  const batches = await new StockService(db).listInStockDetailed(undefined, [input.vehicleWarehouseId]);
  const toplam = new Map<string, number>();
  for (const batch of batches) {
    if (batch.physicalQty <= 0) continue;
    toplam.set(batch.variantId, (toplam.get(batch.variantId) ?? 0) + batch.physicalQty);
  }
  if (toplam.size === 0) return [];

  const names = await variantNames(db, [...toplam.keys()]);
  return [...toplam.entries()]
    .map(([variantId, qty]) => ({ variantId, name: displayName(names.get(variantId)), qty }))
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
}

/**
 * **Alınabilecekler** — çıkış deposunda kullanılabilir malı olan varyantlar.
 *
 * ÖLÇÜ FİİLİ DEĞİL KULLANILABİLİR ve gerekçe `dispatch_transfer`ın kendi künyesinde yazılı: fiiliye
 * bakılsaydı müşteriye SÖZ VERİLMİŞ mal araca alınabilir görünürdü, gider, sipariş depoda karşılıksız
 * kalırdı — üstelik aynı mal araçta "serbest" görünüp ikinci kez satılabilirdi.
 *
 * Liste TAVANLI: bu bir katalog değil, rampada tek dokunuşla alınacak kısa bir şerit (v3:19 "SIK
 * KOYULANLAR"). Sınırsız büyüyen bir küme olsaydı sayfalama gerekirdi; burada gereken şey seçim
 * kolaylığı ve tavan onu koruyor (CLAUDE §1'in "editoryal seçki" dalı).
 */
export async function listVanCandidates(
  db: SupabaseClient,
  input: { warehouseId: string; limit?: number },
): Promise<VanCandidate[]> {
  const stocks = new StockService(db);
  const batches = await stocks.listInStockDetailed(undefined, [input.warehouseId]);
  const variantIds = [...new Set(batches.map((batch) => batch.variantId))];
  if (variantIds.length === 0) return [];

  /* KULLANILABİLİR ÖLÇÜSÜ GÖRÜNÜMDEN gelir (`available_stock`), partiden çıkarılmaz: rezerve
     PARTİDE durmuyor, ayrı bir kayıt — parti satırından "fiili − rezerve" hesaplamak mümkün
     değil ve denenirse rezerveleri sıfır saymış olurduk. */
  const [available, names] = await Promise.all([
    stocks.listAvailableAcross([input.warehouseId], variantIds),
    variantNames(db, variantIds),
  ]);

  return available
    .filter((row) => row.availableQty > 0)
    .map((row) => ({ variantId: row.variantId, name: displayName(names.get(row.variantId)), available: row.availableQty }))
    .sort((a, b) => b.available - a.available)
    .slice(0, input.limit ?? 12);
}

/**
 * **Araca al** — depodan araca, tek çağrıda sevk + kabul.
 *
 * Parti seçimi KAPININ işi, kuryenin değil: rampada "hangi SKT" diye sormak, kapıda satılacak bir
 * paket için anlamsız bir karar. FEFO uygulanıyor (tarihi yakın önce) — depo kapılarının aynı
 * ilkesi ve aynı gerekçe: yakın tarihli mal önce hareket etmezse fire olur.
 */
export async function takeToVan(
  db: SupabaseClient,
  input: {
    warehouseId: string;
    vehicleWarehouseId: string | null;
    variantId: string;
    qty: number;
    actorId?: string | null;
  },
): Promise<TakeToVanOutcome> {
  if (input.vehicleWarehouseId === null) return { status: 'no_vehicle' };
  if (input.warehouseId === input.vehicleWarehouseId) return { status: 'forbidden', reason: 'out_of_scope' };

  const stocks = new StockService(db);
  /* Kapı ÖNCE ölçüyor, sonra yazıyor: `dispatch_transfer` de kullanılabiliri kontrol ediyor ama
     onun reddi ham bir RPC hatasıdır. Buradaki ölçüm ekrana "depoda şu kadar var" diyebilmek
     için — kuryeye "olmadı" demek yerine SEBEBİNİ söylemek. */
  const [row] = await stocks.listAvailableAcross([input.warehouseId], [input.variantId]);
  const available = row?.availableQty ?? 0;
  if (available < input.qty) return { status: 'not_enough', available };

  const batches = (await stocks.listInStockDetailed([input.variantId], [input.warehouseId]))
    /* FEFO: tarihsiz parti EN SONA — "bilinmiyor"u en yakın tarih saymak, gerçekten yakın olanı
       geride bırakırdı. (`listInStockDetailed` zaten `expiryDate`e göre sıralı; bu satır o sırayı
       KORUYOR ve tarihsizi sona itiyor.) */
    .sort((a, b) => (a.expiryDate ?? '9999-12-31').localeCompare(b.expiryDate ?? '9999-12-31'));

  const lines: Array<{ sourceStockId: string; qty: number }> = [];
  let kalan = input.qty;
  for (const batch of batches) {
    if (kalan <= 0) break;
    const pay = Math.min(kalan, batch.physicalQty);
    if (pay <= 0) continue;
    lines.push({ sourceStockId: batch.id, qty: pay });
    kalan -= pay;
  }

  const sevk = await dispatchTransfer(db, {
    fromWarehouseId: input.warehouseId,
    toWarehouseId: input.vehicleWarehouseId,
    lines,
    actorId: input.actorId ?? null,
    note: 'Araca serbest ürün',
  });
  if (sevk.status !== 'ok') {
    if (sevk.status === 'failed') return { status: 'failed', message: sevk.message };
    return { status: 'forbidden', reason: 'out_of_scope' };
  }

  const transferLines = await new WarehouseTransferService(db).listLines(sevk.transferId);
  const kabul = await receiveTransfer(db, {
    transferId: sevk.transferId,
    warehouseId: input.vehicleWarehouseId,
    lines: transferLines.map((line) => ({ lineId: line.id, receivedQty: line.qty })),
    actorId: input.actorId ?? null,
  });
  /* Kabul düşerse mal TRANSFERDE asılı kalır ve bu gizlenmez: kimliği dönüyor ki depo ekranından
     çözülebilsin. Sessiz bir `ok`, kaybolmuş bir malı "araçta" diye gösterirdi. */
  if (kabul.status !== 'ok') return { status: 'stuck', transferId: sevk.transferId };

  const vanda = (await readVanStock(db, { vehicleWarehouseId: input.vehicleWarehouseId })).find(
    (line) => line.variantId === input.variantId,
  );
  return { status: 'ok', variantId: input.variantId, movedQty: input.qty, vanQty: vanda?.qty ?? input.qty };
}

/**
 * **Depoya devret** — araçtan depoya, aynı yoldan ters yön (v3:14 "SAY VE DEVRET").
 *
 * Akşam dönüşünde satılmayan mal geri veriliyor. Ayrı bir kapı DEĞİL aynı kapının aynası: kaynak
 * ile hedef yer değiştiriyor, mekanizma bir. İki ayrı yol yazılsaydı biri bir gün ötekinden
 * ayrılırdı (fire kaydı, parti izi, defter satırı).
 */
export async function returnFromVan(
  db: SupabaseClient,
  input: {
    warehouseId: string;
    vehicleWarehouseId: string | null;
    variantId: string;
    qty: number;
    actorId?: string | null;
  },
): Promise<TakeToVanOutcome> {
  if (input.vehicleWarehouseId === null) return { status: 'no_vehicle' };
  return takeToVan(db, {
    warehouseId: input.vehicleWarehouseId,
    vehicleWarehouseId: input.warehouseId,
    variantId: input.variantId,
    qty: input.qty,
    actorId: input.actorId ?? null,
  });
}
