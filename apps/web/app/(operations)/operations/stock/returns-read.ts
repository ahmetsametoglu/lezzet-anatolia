import 'server-only';
import { serviceDb } from '@lezzet/database';
import { listWarehouseReturns } from '@lezzet/application';
import { readWarehouseLabels } from '@/lib/warehouse/context';
import type { ReturnDropView } from './stock-types';

/**
 * **Depoya dönenler — masaüstünün GÖRÜNÜRLÜK yarısı** (10.5).
 *
 * Kapı (`listWarehouseReturns`) ve yazım (`adjust_fulfillment`, 0020) çoktan hazırdı; eksik olan tek
 * şey masaüstünde çağıran yoktu. Sonucu sessizdi ve tam da bu yüzden tehlikeliydi: depocu telefonda
 * akıbeti işaretlemezse sipariş `returned`'da asılı kalıyor, mal rampada duruyor ve **hiçbir ekran**
 * bunu söylemiyordu. Kayıp bir malın en sessiz hâli, kimsenin sormadığı maldır.
 *
 * ── KARAR BURADA VERİLMEZ ───────────────────────────────────────────────────
 * Akıbet (stoğa dön · imha · jest) iki yüzeyde işaretlenir ve ikisi de bilinçli: telefonda depocu
 * (koli elinde), masaüstünde yönetici (sipariş detayının karar diyaloğu — para tarafıyla birlikte).
 * Bu okuma üçüncü bir yol AÇMAZ, yalnız var olan iki yola işaret eder: satır siparişin detayına
 * götürür. Stok ekranına bir karar formu daha koymak, aynı kararı üç yerden verdirmek olurdu.
 *
 * ── SAYFALAMA YOK, VE OLMAMALI ──────────────────────────────────────────────
 * `returned` kalıcı bir durum değil (durum makinesi `returned → completed`): küme açık iade süreçleri
 * kadardır. Kapının kendi tavanı (`limit`) yine geçerli ve künyesinde yazılı; buradan ikinci bir
 * tavan konmuyor — karar bekleyen bir koliyi kuyruğun dibinde bırakmak, Dikkat sekmesinin var olma
 * sebebine aykırı (`attention-tab` künyesi).
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
    pendingLineCount: drop.lines.filter((line) => line.disposition === null).length,
  }));
}
