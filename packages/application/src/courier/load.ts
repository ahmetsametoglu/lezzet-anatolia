import { DeliveryRunService, DeliveryZoneService, OrderBoxService, OrderService } from '@lezzet/database';
import { canTransition } from '@lezzet/domain-core';
import type { Order } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyStatusEffect, type OrderEffects } from '../order/effects';
import { refundShortfallOnDeparture } from '../order/refund';
import { issueDoorCode } from './door-code';

/**
 * Araca yükleme okutması: kutu kuryenin seferine damgalı siparişin malıysa yüklendi damgası yazılır, değilse görünür biçimde reddedilir.
 * Yükleme siparişi yola çıkarmaz, çünkü araç birden çok seferin kutusunu taşıyabilir; geçişin sahibi sefer başlatmadır.
 */

export type LoadBoxOutcome =
  | {
      status: 'ok';
      orderId: string;
      referenceNo: string | null;
      boxNo: number;
      loadedBoxes: number;
      boxCount: number;
      /** Siparişin son kutusu da araçta; yola çıktı demek değildir, durumu sefer başlatma değiştirir. */
      allBoxesLoaded: boolean;
      /** Sefer zaten yoldaydı ve bu son kutu durağı açtı (`out_for_delivery`, haber gitti). */
      stopOpened: boolean;
    }
  | { status: 'already_loaded'; orderId: string; boxNo: number; loadedBoxes: number; boxCount: number }
  | {
      status: 'wrong_route';
      referenceNo: string | null;
      /** Kutunun ait olduğu rotanın adı, çünkü kurye seferi kayıt numarasıyla değil rota adıyla tanır; `null` = siparişin seferi yok. */
      routeName: string | null;
      /** Seferin künyesi — rampada kâğıtla eşleştirmek için; rota adının yanında ikincil. */
      runReferenceNo: string | null;
    }
  | { status: 'not_sealed'; boxNo: number }
  | { status: 'not_loadable'; currentStatus: Order['status'] }
  | { status: 'unknown_code' };

export async function loadBox(
  db: SupabaseClient,
  input: { code: string; courierId: string; effects?: OrderEffects },
): Promise<LoadBoxOutcome> {
  const boxes = new OrderBoxService(db);
  const box = await boxes.getByCode(input.code.trim());
  if (!box) return { status: 'unknown_code' };

  const order = await new OrderService(db).getById(box.orderId);
  // Kutusu olan sipariş silinemez (cascade kutuyu da götürür) — bu dal saf savunma.
  if (!order) return { status: 'unknown_code' };

  /*
    Sipariş bu kuryenin seferine damgalı değilse kutu bu rotanın malı değildir; ret kutunun ait olduğu rotayı da söyler ki kurye kutuyu
    nereye götüreceğini bilsin. Rota adı seferden çözülür ve iki ek tur yalnız bu nadir dalda ödenir.
  */
  if (order.courierId !== input.courierId) {
    const run = order.deliveryRunId === null ? null : await new DeliveryRunService(db).getById(order.deliveryRunId);
    const zone = run === null ? null : await new DeliveryZoneService(db).getById(run.deliveryZoneId);
    return {
      status: 'wrong_route',
      referenceNo: order.referenceNo,
      routeName: zone?.name ?? null,
      runReferenceNo: run?.referenceNo ?? null,
    };
  }

  // Açık kutu araca binemez (0048 kısıtı `check` olarak da duruyor; burası okunur cümle).
  if (box.sealedAt === null) return { status: 'not_sealed', boxNo: box.boxNo };

  const siblings = await boxes.listByOrder(box.orderId);
  const loadedOthers = siblings.filter((row) => row.id !== box.id && row.loadedAt !== null).length;

  // İkinci okutma hata değil "zaten araçta" — sayaç değişmez, kurye sayımına güvenmeye devam eder.
  if (box.loadedAt !== null) {
    return {
      status: 'already_loaded',
      orderId: order.id,
      boxNo: box.boxNo,
      loadedBoxes: loadedOthers + 1,
      boxCount: siblings.length,
    };
  }

  // Teslim edilmiş/iptal edilmiş siparişin kutusu yüklenmez — durum cevabın kendisi.
  if (order.status !== 'ready' && order.status !== 'out_for_delivery') {
    return { status: 'not_loadable', currentStatus: order.status };
  }

  await boxes.update({ id: box.id, loadedAt: new Date().toISOString(), loadedBy: input.courierId });
  const loadedBoxes = loadedOthers + 1;
  const allBoxesLoaded = loadedBoxes >= siblings.length;

  return {
    status: 'ok',
    orderId: order.id,
    referenceNo: order.referenceNo,
    boxNo: box.boxNo,
    loadedBoxes,
    boxCount: siblings.length,
    allBoxesLoaded,
    stopOpened: allBoxesLoaded ? await openStopIfRunDeparted(db, order, input) : false,
  };
}

/**
 * Son kutu okutuldu ve sefer zaten yoldaysa durak açılır, çünkü eksik kutuyla başlatılan seferde durağı yola çıkaracak başka kapı yoktur.
 * Sefer başlamamışsa açılmaz ki yarının kutusu bugün yola çıkmasın; araya başka yazım girdiyse `false`, ekran gerçeği sonraki okumada görür.
 */
async function openStopIfRunDeparted(
  db: SupabaseClient,
  order: Order,
  input: { courierId: string; effects?: OrderEffects },
): Promise<boolean> {
  if (order.status !== 'ready' || order.deliveryRunId === null) return false;
  const run = await new DeliveryRunService(db).getById(order.deliveryRunId);
  if (run === null || run.departedAt === null) return false;
  if (!canTransition('ready', 'out_for_delivery').allowed) return false;

  const transitioned = await new OrderService(db).transition({
    orderId: order.id,
    from: 'ready',
    to: 'out_for_delivery',
    actorId: input.courierId,
  });
  if (!transitioned.ok) return false;
  // Kod haberden önce üretilir, çünkü "yolda" mesajı kodu taşır; haberin tekrar kilidi `notifyOrderStatus`ta.
  await issueDoorCode(db, order.id);
  await notifyStatusEffect(input.effects, order.id, 'out_for_delivery');
  await refundShortfallOnDeparture(db, order.id, input.effects);
  return true;
}
