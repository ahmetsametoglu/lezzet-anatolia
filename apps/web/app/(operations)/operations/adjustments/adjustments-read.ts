import 'server-only';
import { StockAdjustmentDetailService, StockService, serviceDb } from '@lezzet/database';
import { resolveLocalizedText } from '@lezzet/types';
import { titleOf } from '@/lib/catalog/title';
import { OPERATIONS_LOCALE } from '@/components/operation/ui/labels';
import { readTemperature } from './temperature-read';
import type { AdjustmentsData, BatchOption, TodayEntry } from './adjustments-types';

/** Şeridin tavanı — bir günün düzeltmeleri doğal tavanlı ama sonsuz değil. */
const TODAY_LIMIT = 30;

/**
 * **Stoktan düşme masasının okuması** (10.5) — `design/project/Operasyon - Depo Imha Sayim.dc.html`.
 *
 * ── PARA OKUNMUYOR ──────────────────────────────────────────────────────────
 * Kayıt satırında `unitCost` var (fire raporu onu kullanıyor, 12.x) ama bu görünüme HİÇ
 * taşınmıyor: tasarımın kuralı *"fire maliyeti/parasal değer asla görünmez"*. Alanı burada
 * susturmak, ekranda unutmaktan güvenli — ekran isteseydi bile gösteremez.
 *
 * ── PARTİLER TEK BİR DEPONUN ────────────────────────────────────────────────
 * Depocu yalnız kendi deposunun partisini düşebilir; başka deponun malını buradan eksiltmek,
 * olmayan bir rafı saymak olurdu (`DOMAIN §17`). Kimlik ZORUNLU (10.7): kapı da öyle istiyor ve
 * hangi depoda çalışıldığı sayfanın kararı — buraya kesinleşmiş bir kimlik gelir.
 */
export async function readAdjustments(warehouse: { id: string; name: string }): Promise<AdjustmentsData> {
  const db = serviceDb();
  const stocks = new StockService(db);

  // Eldeki partiler + sıcaklık noktaları TEK turda: ikisi de aynı deponun aynı anki gerçeği ve
  // sırayla beklemelerinin sebebi yok.
  const [details, temperature] = await Promise.all([
    // Eldeki partiler (fiziksel adedi sıfırdan büyük olanlar, son tarihe göre sıralı).
    stocks.listInStockDetailed(undefined, [warehouse.id]),
    readTemperature(warehouse.id),
  ]);

  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const batches: BatchOption[] = details.map((batch) => ({
    stockId: batch.id,
    title: titleOf(
      resolveLocalizedText(batch.variant.product.name, OPERATIONS_LOCALE) || 'Adsız ürün',
      resolveLocalizedText(batch.variant.label, OPERATIONS_LOCALE),
    ),
    expiryDate: batch.expiryDate,
    physicalQty: batch.physicalQty,
    // Son tarihi GEÇMİŞ parti listede kalır ve işaretlenir: düşülecek ilk şey odur, gizlenmesi
    // tam ters etki yapardı.
    isExpired: new Date(batch.expiryDate) < startOfDay,
  }));

  /**
   * Bugünün kayıtları — *"girdim mi girmedim mi"* belirsizliği kalmasın (tasarım §2).
   *
   * **Tavan GÖRÜNÜR, sessiz değil:** okuma keyset sayfalı ve `nextCursor` dönüyor. Bu şerit
   * doğal tavanlı bir liste sayılıyor (bir günün düzeltmeleri, `CLAUDE §1`) ama çok düzeltme
   * girilen bir depoda imleç gerçekten dolabilir — arka uç şeridi bunu ayrıca uyardı. Kuyruğu
   * sessizce yutmuyoruz: ekran taramanın nerede kesildiğini yazıyor.
   *
   * ── DEPO SÜZGECİ BURADA, SORGUDA DEĞİL — VE BU BİR ÖDÜNÇ ────────────────────
   * `listPage`in depo süzgeci YOK (`stock_adjustment_detail` görünümü depo kolonu bile
   * seçmiyor, ölçüldü 08.08) ve o dosya bizim şeridimizde değil. Süzgeçsiz bırakmak seçenek
   * değildi: çok depolu bir operatörde şerit BAŞKA deponun imhalarını da gösteriyordu — hem
   * "girdim mi" sorusunun cevabını bozar hem depo değişmezini deler.
   *
   * Süzgeç bu yüzden bellekte: satırların partileri `listByIds` ile okunuyor (tükenmiş parti de
   * gelir — `listInStockDetailed` onları elerdi ve bugün düşülen partinin çoğu tam olarak öyle
   * biter) ve yalnız bu deponunkiler kalıyor. **Ödünç şurada:** sayfalama süzgeçten ÖNCE
   * çalışıyor, yani taranan 30 satırın kaçı bu depodansa o kadarı görünür. Kesilme noktası
   * ekranda yazılı; sessiz kırpma yok. Kalıcı çözüm sorguya süzgeç eklemek — talep açıldı.
   */
  const page = await new StockAdjustmentDetailService(db).listPage({ from: startOfDay, limit: TODAY_LIMIT });
  const pageStocks = await stocks.listByIds([...new Set(page.rows.map((row) => row.stockId))]);
  const warehouseOfStock = new Map(pageStocks.map((batch) => [batch.id, batch.warehouseId]));

  const entries: TodayEntry[] = page.rows
    .filter((row) => warehouseOfStock.get(row.stockId) === warehouse.id)
    .map((row) => ({
      id: row.id,
      title: titleOf(
        resolveLocalizedText(row.stock.variant.product.name, OPERATIONS_LOCALE) || 'Adsız ürün',
        resolveLocalizedText(row.stock.variant.label, OPERATIONS_LOCALE),
      ),
      qty: Math.abs(row.qty),
      reason: row.reason,
      referenceNo: row.referenceNo,
      time: new Date(row.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    }));

  return {
    batches,
    today: entries,
    points: temperature.points,
    // Tarama nerede kesildi — ekran bunu yazabilsin diye. Sessiz kırpma, olmayan bir tamlık sözü
    // vermek olurdu; süzgeç bellekte olduğu için burada "daha fazlası var" değil "tarama kesildi"
    // deniyor: kesilen kısımda bu depoya ait kayıt olabilir de olmayabilir de.
    todayTruncated: page.nextCursor !== null,
    warehouseId: warehouse.id,
    warehouseName: warehouse.name,
  };
}
