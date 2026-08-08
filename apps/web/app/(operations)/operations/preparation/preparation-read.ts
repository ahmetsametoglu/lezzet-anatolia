import 'server-only';
import { listPreparationQueue } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import { titleOf } from '@/lib/catalog/title';
import type { PreparationData, PreparationLineView, PreparationOrderView } from './preparation-types';

/**
 * **Hazırlık masasının okuması** (10.1–10.3) — `design/project/Operasyon - Depo Hazirlik.dc.html`.
 *
 * ── İŞ YOK, TÜRETİM VAR ─────────────────────────────────────────────────────
 * Kuyruğun kendisi kapıdan geliyor (`listPreparationQueue`: gün süzgeci, depo süzgeci, kalem başına
 * bölünmüş parti önerisi, ilerleme). Bu dosya tek bir şey yapıyor — ekranın okuduğu künyeleri ve
 * sayaçları türetmek. Sipariş ya da parti kararı BURADA verilmiyor.
 *
 * ── PARA BU YOLDAN GEÇMEZ ───────────────────────────────────────────────────
 * Kapı para alanı döndürmüyor ve bu dosya ikinci bir okuma açmıyor. Rol duvarı (tasarım: *"fiyat/
 * tutar/maliyet ve müşteri adresi/telefonu bu yüzeyde yoktur"*) böylece bir arayüz disiplini değil,
 * verinin şekli olarak duruyor.
 *
 * ── KUYRUK TEK BİR DEPONUNDUR ───────────────────────────────────────────────
 * Depo kimliği ZORUNLU (10.7 · `CLAUDE §1`). Eskiden opsiyoneldi ve boş bırakıldığında süzgeçsiz
 * okuma yapılırdı ("depo-üstü, yöneticiye açık"); o okuma tek depolu veride DOĞRU cevap verir ve
 * çok depoluda sessizce başka şehrin işini gösterirdi. Hangi depoda çalışıldığı sayfanın kararıdır
 * (`readWorkWarehouse`), bu dosyanınki değil — buraya artık yalnız kesinleşmiş bir kimlik gelir.
 */
export async function readPreparation(
  warehouse: { id: string; name: string },
  deliveryDate: string,
): Promise<PreparationData> {
  const orders = await listPreparationQueue(serviceDb(), { warehouseId: warehouse.id, deliveryDate });

  const views: PreparationOrderView[] = orders.map((order) => {
    const lines: PreparationLineView[] = order.lines.map((line) => {
      const remainingQty = Math.max(0, line.orderedQty - line.pickedQty);
      return {
        ...line,
        title: titleOf(line.productName, line.variantLabel),
        remainingQty,
        isPicked: remainingQty === 0,
        isPinned: line.pinnedStockId !== null,
        hasShortfall: line.shortfallQty > 0,
      };
    });

    return {
      ...order,
      lines,
      // "84 paket" — istenen adetlerin toplamı, toplanan değil: başlık siparişin BÜYÜKLÜĞÜNÜ
      // söylüyor (B2B'de hacim beklentisi kurar), ilerlemeyi ayrı sayaç söylüyor.
      totalQty: lines.reduce((sum, line) => sum + line.orderedQty, 0),
      isComplete: lines.every((line) => line.isPicked),
    };
  });

  return {
    orders: views,
    readyCount: views.filter((order) => order.isComplete).length,
    deliveryDate,
    warehouseName: warehouse.name,
  };
}
