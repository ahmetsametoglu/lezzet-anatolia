import { OrderBoxService, OrderService } from '@lezzet/database';
import { canTransition } from '@lezzet/domain-core';
import type { Order } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * **ARACA YÜKLEME OKUTMASI** (23.8 · karar §1.11) — kurye kutunun QR'ını okutur; kutu rotasına
 * aitse `loaded_at/by` damgalanır, değilse GÖRÜNÜR reddedilir.
 *
 * Kararın iki yarısı: rota onayı NİYET doğrulamasıdır (yorgun bir sabahta gözü kapalı basılır),
 * garanti KUTU kontrolüdür — yanlış kutu araca hiç binmez. Sayaç ("5/8 bindi") damgalardan türer,
 * ayrı tablo yok.
 *
 * ── "YOLDA"NIN TEK KAPISI (kutulu siparişte) ────────────────────────────────
 * Etüt 2.4: *"araca binmeyen kutu 'yolda' görünmez; çok kutulu siparişte tüm kutular binmeden
 * sipariş yolda sayılmaz."* `startCourierDay` kutulu siparişi ATLAR (`awaitingBoxes`); geçişi
 * son kutunun okutması BURADAN yazar. Kenarın izni yine motorda (`canTransition`) — kapı kendi
 * kural icat etmez.
 *
 * ── ROTA KONTROLÜNÜN KAYNAĞI SİPARİŞİN DAMGASIDIR ───────────────────────────
 * `start_delivery_run` seferi açarken siparişlere `courier_id` yazar ("siparişin kuryesi seferin
 * kuryesinden gelir" — 0046). Kutu → sipariş → kurye zinciri bu damgayı okur; ayrı bir rota
 * hesabı yapılmaz — yapılsaydı iki kaynak bir gün ayrışırdı.
 */

export type LoadBoxOutcome =
  | {
      status: 'ok';
      orderId: string;
      referenceNo: string | null;
      boxNo: number;
      loadedBoxes: number;
      boxCount: number;
      /** Bu okutma siparişin SON kutusuydu ve sipariş yola çıktı. */
      orderStarted: boolean;
    }
  | { status: 'already_loaded'; orderId: string; boxNo: number; loadedBoxes: number; boxCount: number }
  | { status: 'wrong_route'; referenceNo: string | null }
  | { status: 'not_sealed'; boxNo: number }
  | { status: 'not_loadable'; currentStatus: Order['status'] }
  | { status: 'unknown_code' };

export async function loadBox(
  db: SupabaseClient,
  input: { code: string; courierId: string },
): Promise<LoadBoxOutcome> {
  const boxes = new OrderBoxService(db);
  const box = await boxes.getByCode(input.code.trim());
  if (!box) return { status: 'unknown_code' };

  const order = await new OrderService(db).getById(box.orderId);
  // Kutusu olan sipariş silinemez (cascade kutuyu da götürür) — bu dal saf savunma.
  if (!order) return { status: 'unknown_code' };

  // Sipariş bu kuryenin seferine damgalı değil → kutu bu rotanın malı değil. Referans söylenir
  // ki kurye rampada kutuyu DOĞRU yığına geri koyabilsin — sessiz bir ret, kutuyu araçta unutturur.
  if (order.courierId !== input.courierId) return { status: 'wrong_route', referenceNo: order.referenceNo };

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

  let orderStarted = false;
  if (loadedBoxes >= siblings.length && order.status === 'ready' && canTransition('ready', 'out_for_delivery').allowed) {
    const transitioned = await new OrderService(db).transition({
      orderId: order.id,
      from: 'ready',
      to: 'out_for_delivery',
      actorId: input.courierId,
    });
    orderStarted = transitioned.ok;
  }

  return {
    status: 'ok',
    orderId: order.id,
    referenceNo: order.referenceNo,
    boxNo: box.boxNo,
    loadedBoxes,
    boxCount: siblings.length,
    orderStarted,
  };
}
