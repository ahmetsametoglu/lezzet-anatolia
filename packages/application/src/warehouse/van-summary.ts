import { OrderBoxService, OrderService, WarehouseService } from '@lezzet/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readVanStock, type VanStockLine } from '../courier/van-stock';

/**
 * **TESİSİN ARAÇLARINDA NE VAR** (kullanıcı isteği 02.09) — depo kartının ve panelin okuması.
 *
 * ── İKİ AYRI ŞEY, TEK CÜMLE ─────────────────────────────────────────────────
 * Kullanıcının cümlesi (*"bu araçta şu kadar kutu, şu kadar şu üründen ek olarak var"*) modeldeki
 * ayrımın birebir karşılığı ve o ayrım `van-stock.ts` künyesinde zaten yazılı:
 *   · **Sipariş kutusu** → EMANET. Mal siparişin; stok oynamaz, kutu yalnız damga taşır
 *     (`loaded_at`). Depoda "eksilmiş" değildir, yalnız yola çıkmıştır.
 *   · **Serbest ürün** → GERÇEK STOK. Depodan çıkıp aracın deposuna girmiştir (`dispatch_transfer`)
 *     ve kapıda o stoktan satılır (`quickSale`).
 * İkisini tek sayıda toplamak yanlış olurdu: biri "yolda olan satılmış mal", öteki "araçta duran
 * satılabilir mal". Panelde de ayrı ayrı yazılıyorlar.
 *
 * ── KUTU TESİSE BAĞLI, ARACA DEĞİL ──────────────────────────────────────────
 * `order_box` bir araç kimliği TAŞIMIYOR; taşıdığı `warehouse_id` kutunun PAKETLENDİĞİ tesistir.
 * Yani kutular tesis düzeyinde sayılır, araç düzeyinde değil — tek araçlı tesiste ikisi aynı şey,
 * çok araçlıda kutu sayısı "bu tesisten yola çıkmış" demektir. Cümle bu yüzden araca değil tesise
 * kuruluyor; uydurma bir dağıtım yapmaktansa bildiğimizi söylemek.
 *
 * Serbest ürün ise araç deposunun kendi stoğu olduğu için ARAÇ BAŞINA kesindir.
 */

/** Araçta duran serbest malın tesis panelindeki özeti — araç başına. */
export interface VanLoadView {
  /** Araç deposunun kimliği (`warehouse.id`, `kind='vehicle'`). */
  warehouseId: string;
  code: string;
  name: string;
  /** Araçtaki toplam adet — kalemlerin toplamı; ekran "40 adet" der. */
  unitCount: number;
  /** Kaç ayrı üründen — "6 üründen" cümlesinin sayısı. */
  variantCount: number;
  /** Kalemler (varyant düzeyinde, ada göre sıralı). Ekran ilk birkaçını yazar, gerisini sayar. */
  lines: VanStockLine[];
}

/** Tesisin "yolda" tablosu: emanet kutular + araçlardaki serbest mal. */
export interface FacilityVanSummary {
  /**
   * Araçtaki sipariş kutusu sayısı — TESİS düzeyinde (yukarıdaki künye).
   *
   * `0` gerçek bir cevaptır ("hiç kutu çıkmamış"), `null` değil: sorgu her zaman koşuyor.
   */
  boxCount: number;
  /** O kutuların ait olduğu sipariş sayısı — "5 kutu / 3 sipariş" cümlesi için. */
  orderCount: number;
  /** Evi bu tesis olan AKTİF araçlar; boş dizi = tesisin aracı yok (ya da hiç bağlanmamış). */
  vans: VanLoadView[];
}

/**
 * Tek tesisin özeti.
 *
 * **Yalnız YOLDAKİ sipariş sayılır** (`out_for_delivery`): teslim edilmiş siparişin kutusu artık
 * araçta değildir ama `loaded_at` damgası satırda durmaya devam eder — damga bir olayın kaydıdır,
 * bir konum değil. Damgaya bakıp saysaydık sayaç gün boyunca hiç düşmez, akşam "12 kutu araçta"
 * derdi; oysa on ikisi de teslim edilmiş olurdu.
 *
 * Kargo kutuları da DIŞARIDA (`shipmentId`): onlar taşıyıcıya devredilir, araca binmez.
 */
export async function readFacilityVanSummary(
  db: SupabaseClient,
  input: { facilityId: string; lineLimit?: number },
): Promise<FacilityVanSummary> {
  const [vehicles, outOrders] = await Promise.all([
    new WarehouseService(db).list({ activeOnly: true, kind: 'vehicle', homeWarehouseId: input.facilityId }),
    // Kutular sipariş üzerinden bulunuyor çünkü "hâlâ araçta mı" sorusunun cevabı SİPARİŞİN
    // durumunda; kutu satırı onu bilmiyor. Küme günlük ve küçük.
    new OrderService(db).listPage(
      { status: ['out_for_delivery'], warehouseIds: [input.facilityId] },
      { limit: OUT_ORDER_SCAN_LIMIT },
    ),
  ]);

  const orderIds = outOrders.rows.map((o) => o.id);
  const boxes = orderIds.length > 0 ? await new OrderBoxService(db).listByOrders(orderIds) : [];
  const onVan = boxes.filter((b) => b.loadedAt !== null && b.shipmentId === null);

  const vans = await Promise.all(
    vehicles.map(async (vehicle): Promise<VanLoadView> => {
      const lines = await readVanStock(db, { vehicleWarehouseId: vehicle.id });
      return {
        warehouseId: vehicle.id,
        code: vehicle.code,
        name: vehicle.name,
        unitCount: lines.reduce((sum, line) => sum + line.qty, 0),
        variantCount: lines.length,
        lines: input.lineLimit ? lines.slice(0, input.lineLimit) : lines,
      };
    }),
  );

  return {
    boxCount: onVan.length,
    orderCount: new Set(onVan.map((b) => b.orderId)).size,
    vans,
  };
}

/**
 * Tarama tavanı: bir tesisin aynı anda yolda olan sipariş sayısı. Rota günü onlarca sipariştir;
 * tavan bozuk bir süzgecin tabloyu belleğe çekmesini engelliyor (`preparation-read` emsali).
 */
const OUT_ORDER_SCAN_LIMIT = 500;
