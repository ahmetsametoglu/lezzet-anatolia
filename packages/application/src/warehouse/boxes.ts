import { OrderBoxService, OrderService } from '@lezzet/database';
import { boxCompletion, orderBoxCode } from '@lezzet/domain-core';
import type { Order, PreparationPick, TransitionResult } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adviseShortfalls, findPinnedViolation, pickedBatches, type PreparationBox } from './preparation';
import { rpcRejectionMessage } from './rpc-error';

/**
 * **KUTU DÖNGÜSÜ** (23.6 · karar §1.4) — sipariş seç → kutu aç → okutarak doldur → kapat →
 * her şey konduysa sipariş kapanır, değilse yeni kutu. Tek kutu döngünün özel hâlidir.
 *
 * ── İKİ KAPI, TEK DİSİPLİN ──────────────────────────────────────────────────
 * `openBox` yalnız bir satır açar (kutu AÇIK doğar, içeriği yoktur); `sealBox` içeriği, parti
 * izini ve mührü TEK transaction'da yazar (`seal_order_box`, 0048 — STACK §13: "kutu var ama
 * picks yok" hâli doğamaz). Hazırlığın kuralları (çıpalı parti, eksik tavsiyesi) `preparation.ts`
 * ile ORTAK yardımcılardan gelir — kutu döngüsü ikinci bir hazırlık dili açmaz.
 *
 * ── ⚠ ABSOLÜT BİRLEŞİM BURADA KURULUR ───────────────────────────────────────
 * `record_preparation` picks yazımı kalem başına ABSOLÜTTÜR (0015: önceki kayıt silinip yeniden
 * yazılır). Çok kutulu siparişte bir kalem iki kutuya bölünürse ikinci kutunun kapanışı o kalemin
 * picks'ini ÖNCEKİ + YENİ birleşimiyle göndermeli — birleşimi EKRAN değil bu kapı kurar
 * (`order_item_batch` okuması burada). Ekran yalnız "bu kutuya ne koydum"u gönderir; kurmaya
 * kalksaydı yarım işte eski dağılımı bilmek zorunda kalırdı. RPC eşitliği ayrıca denetler
 * (Σ kutu = karşılanan) — eksik kurulmuş birleşim yazımı tümüyle geri alır.
 *
 * ── KUTUSUZ AKIŞ YAŞAR ──────────────────────────────────────────────────────
 * Web masası bugünkü gibi kutusuz onaylayabilir (`confirmPreparation`); kutusu olmayan sipariş
 * eski yoldan gider. Çift akış sipariş düzeyinde bilinçli — kalem düzeyinde karışım RPC
 * denetimine takılır (0048 künyesi).
 */

/** Kutu açılabilir mi sorusunun olumsuz cevapları cevabın kendisidir — ekran hangi durumda
    olduğunu söyleyebilmeli (`stale`: araya biri girdi, sipariş artık toplanmıyor). */
export type OpenBoxOutcome =
  | { status: 'ok'; box: PreparationBox }
  | { status: 'forbidden'; reason: 'out_of_scope' }
  | { status: 'stale'; currentStatus: Order['status'] }
  | { status: 'not_found' };

/**
 * **Kutu açar** — sipariş içi sıradaki numarayla, üretilmiş QR koduyla (`orderBoxCode`; sipariş
 * referansı DEĞİL — Netleşecek 4). Benzersizlik DB'de; çakışmada yeniden denenir.
 */
export async function openBox(
  db: SupabaseClient,
  input: { orderId: string; warehouseId: string },
): Promise<OpenBoxOutcome> {
  const order = await new OrderService(db).getById(input.orderId);
  if (!order) return { status: 'not_found' };
  if (order.warehouseId !== input.warehouseId) return { status: 'forbidden', reason: 'out_of_scope' };
  // Kutu yalnız TOPLANABİLİR siparişe açılır — hazırlık kuyruğunun kendi kümesi (0015 çizgisi).
  if (order.status !== 'confirmed' && order.status !== 'preparing') {
    return { status: 'stale', currentStatus: order.status };
  }

  const service = new OrderBoxService(db);
  const siblings = await service.listByOrder(input.orderId);
  let boxNo = (siblings[siblings.length - 1]?.boxNo ?? 0) + 1;

  // Çakışma iki kaynaktan gelebilir: aynı siparişe yarışan ikinci açılış (`order_box_no_uq`) ya da
  // — teoride — kod çakışması (`order_box_code_uq`). İkisinde de reçete aynı: sıradaki numara +
  // yeni kod. Numarada boşluk kalabilir ve zararsızdır (numara kimlik değil, insan sayısıdır).
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const box = await service.insert({
        orderId: input.orderId,
        warehouseId: order.warehouseId,
        boxNo,
        code: orderBoxCode(new Date().getFullYear()),
      });
      return { status: 'ok', box: { boxId: box.id, boxNo: box.boxNo, code: box.code, sealedAt: null, items: [] } };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      boxNo += 1;
    }
  }
  // Üç ardışık benzersizlik çakışması yarış değil arızadır — sessizce dördüncüyü denemek onu saklar.
  throw new Error('openBox: kutu numarası/kodu üç denemede de çakıştı');
}

export type SealBoxOutcome =
  | {
      status: 'ok';
      boxNo: number;
      ready: boolean;
      missing: Array<{ itemId: string; missingQty: number }>;
      shortfalls: Awaited<ReturnType<typeof adviseShortfalls>>;
    }
  | { status: 'pinned_violation'; itemId: string; requiredStockId: string }
  | { status: 'already_sealed' }
  | { status: 'empty' }
  | { status: 'forbidden'; reason: 'out_of_scope' }
  | { status: 'failed'; message: string }
  | { status: 'not_found' };

/**
 * **Kutuyu kapatır** — içerik + parti izi + mühür tek transaction'da; sonra döngünün kararı:
 * sipariş tamamen kutulandıysa `ready`'e geçer, değilse eksik listesi döner ("yeni kutu mu").
 *
 * `picks` BU KUTUNUN dağılımıdır (kümülatif değil); absolüt birleşim burada kurulur (dosya
 * künyesindeki ⚠). `declareShort` = "bu kutu son, eksikleri bildiriyorum" — yalnız o beyanla
 * eksik tavsiyesi üretilir; ara kutunun doğal eksiği yönetime soru olarak gitmez.
 */
export async function sealBox(
  db: SupabaseClient,
  input: {
    boxId: string;
    /** Depocunun çalıştığı depo — kutununki değilse yazım HİÇ yapılmaz (CLAUDE.md §1). */
    warehouseId: string;
    picks: readonly PreparationPick[];
    declareShort?: boolean;
    actorId?: string | null;
  },
): Promise<SealBoxOutcome> {
  const boxes = new OrderBoxService(db);
  const box = await boxes.getById(input.boxId);
  if (!box) return { status: 'not_found' };
  if (box.warehouseId !== input.warehouseId) return { status: 'forbidden', reason: 'out_of_scope' };
  // Ön kontrol okunur cevap içindir; yarışın son savunması RPC'nin kendi kilidi (0048).
  if (box.sealedAt !== null) return { status: 'already_sealed' };

  const found = await new OrderService(db).getWithItems(box.orderId);
  if (!found) return { status: 'not_found' };

  // Partisiz satır "bu kutuya bu kalemden koymadım" demektir — kutu içeriği değildir, süzülür.
  const picks = input.picks.filter((pick) => pick.batches.length > 0);
  if (picks.length === 0) return { status: 'empty' };

  const violation = await findPinnedViolation(db, box.orderId, found.items, picks);
  if (violation) return { status: 'pinned_violation', ...violation };

  // ⚠ Absolüt birleşim: kalemin önceki dağılımı (önceki kutular) + bu kutununki, parti başına
  // toplanarak. Yalnız BU kutuda görünen kalemler gönderilir — `record_preparation` gönderilmeyen
  // kaleme dokunmaz, önceki kutuların izi yerinde kalır.
  const existing = await pickedBatches(db, [box.orderId]);
  const union: PreparationPick[] = picks.map((pick) => ({
    orderItemId: pick.orderItemId,
    batches: mergeBatches(existing.get(pick.orderItemId) ?? [], pick.batches),
  }));
  const items = picks.map((pick) => ({
    orderItemId: pick.orderItemId,
    qty: pick.batches.reduce((sum, batch) => sum + batch.qty, 0),
  }));

  try {
    await boxes.seal(box.id, items, union, input.actorId ?? null);
  } catch (error) {
    return { status: 'failed', message: rpcRejectionMessage(error, 'Kutu kapatılamadı') };
  }

  // Döngünün kararı motora sorulur (uygulama iş kuralını kendi hesaplamaz — CLAUDE §1).
  // Kapanıştan sonra kalemin karşılanan adedi birleşim toplamının kendisidir (Σ kutu = karşılanan).
  const unionTotals = new Map(
    union.map((pick) => [pick.orderItemId, pick.batches.reduce((sum, batch) => sum + batch.qty, 0)]),
  );
  const boxedQty = (item: { id: string; fulfilledQty: number }): number =>
    unionTotals.get(item.id) ?? item.fulfilledQty;
  const completion = boxCompletion(
    found.items.map((item) => ({ itemId: item.id, orderedQty: item.qty, boxedQty: boxedQty(item) })),
  );

  // Tamamı kutulandıysa sipariş sevkiyata hazırdır — `confirmPreparation` ile aynı geçiş.
  let ready = false;
  if (completion.complete) {
    const transition: TransitionResult = await new OrderService(db).transition({
      orderId: box.orderId,
      from: found.order.status,
      to: 'ready',
      actorId: input.actorId,
    });
    ready = transition.ok;
  }

  const shortfalls = input.declareShort
    ? await adviseShortfalls(
        db,
        found.items.map((item) => ({ item, pickedQty: boxedQty(item) })),
      )
    : [];

  return { status: 'ok', boxNo: box.boxNo, ready, missing: completion.missing, shortfalls };
}

/** Parti başına toplanmış birleşim — aynı partiden iki kutuya konan mal tek satıra iner. */
function mergeBatches(
  existing: PreparationPick['batches'],
  added: PreparationPick['batches'],
): PreparationPick['batches'] {
  const totals = new Map<string, number>();
  for (const batch of [...existing, ...added]) {
    totals.set(batch.stockId, (totals.get(batch.stockId) ?? 0) + batch.qty);
  }
  return [...totals.entries()].map(([stockId, qty]) => ({ stockId, qty }));
}

/** Postgres benzersizlik ihlali — supabase-js reddi düz nesnedir (`rpc-error.ts` ölçümü). */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === '23505';
}
