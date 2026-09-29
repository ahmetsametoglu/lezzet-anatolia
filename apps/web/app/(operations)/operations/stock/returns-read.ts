import 'server-only';
import { serviceDb } from '@lezzet/database';
import { listWarehouseReturns } from '@lezzet/application';
import { readWarehouseLabels } from '@/lib/warehouse/context';
import type { ReturnDropView } from './stock-types';

/**
 * Depoya dönenler — masaüstünün görünürlük yarısı: akıbet telefonda ya da sipariş detayının karar penceresinde verilir,
 * bu okuma yalnız ikisine işaret eder. Sayfalanmaz, çünkü küme açık iade süreçleri kadardır ve karar bekleyen koli
 * kuyruğun dibinde kalmamalı.
 */
export async function readReturnDrops(warehouseIds: readonly string[] | undefined): Promise<ReturnDropView[]> {
  // Kapsam SÜZGEÇ olarak geçer (`ctx.warehouseIds`, kapalı depoları da kapsar): kapanmış bir depoya
  // dönen mal da rampada duruyor ve akıbeti bekliyor — `visibleWarehouseIds` onu listeden düşürür,
  // yani en çok unutulacak koliyi tam da unutulacağı an gizlerdi (`CLAUDE §1`).
  const [drops, labels] = await Promise.all([
    listWarehouseReturns(serviceDb(), { warehouseId: warehouseIds }),
    readWarehouseLabels(),
  ]);

  return drops.map((drop) => ({
    ...drop,
    warehouseName: labels.get(drop.warehouseId)?.name ?? null,
    // Kaç satır karar bekliyor — ekranın rozeti. Toplam satır sayısı YANLIŞ olurdu: yarısı
    // işaretlenmiş bir koli listede tamamıyla döner (kapı künyesi), ama işi kalan yarısıdır.
    pendingLineCount: drop.lines.filter((line) => line.pendingQty > 0).length,
  }));
}
