import {
  DeliveryZoneService,
  OrderBoxItemService,
  OrderBoxService,
  OrderService,
  ShippingBoxService,
  UserProfileService,
  WarehousePrinterService,
} from '@lezzet/database';
import { boxCompletion, orderBoxCode } from '@lezzet/domain-core';
import type { Order, PreparationPick, PrinterPurpose, TransitionResult } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { variantNames } from './names';
import { adviseShortfalls, findPinnedViolation, pickedBatches, recipientOf, type PreparationBox } from './preparation';
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
  /** Kutu TİPİ geçersiz — başka deponun kutusu ya da kapatılmış bir tip. Sipariş duruyor. */
  | { status: 'unknown_box' }
  | { status: 'not_found' };

/**
 * **Kutu açar** — sipariş içi sıradaki numarayla, üretilmiş QR koduyla (`orderBoxCode`; sipariş
 * referansı DEĞİL — Netleşecek 4). Benzersizlik DB'de; çakışmada yeniden denenir.
 *
 * ── KUTU TİPİ BURADA SEÇİLİR (07.12) ────────────────────────────────────────
 * `shippingBoxId` kargo kulvarının FİZİKSEL kimliğidir: gönderi ağırlığı ve dış ölçüsü ondan
 * çıkıyor (§4.4). Açılışta sorulmasının sebebi zamanlama: depocu kartonu kutuyu doldurmaya
 * başlarken eline alıyor, duyuru anında ise kutu çoktan kapalı — o an sorulsaydı cevap hatırlanan
 * bir şey olurdu, elde tutulan değil.
 *
 * Tip **veriden de korunuyor** (bileşik FK `(warehouse_id, shipping_box_id)`, `0052`), ama kapı
 * onu yeniden ölçüyor: kısıt ihlali depocuya `23503` diye görünürdü ve okunur bir cevap yerine
 * bir veritabanı hatası, ekranı "sunucu hatası"na düşürürdü. `isActive` denetimi ise VERİDE HİÇ
 * YOK — kapatılmış bir tipi FK memnuniyetle kabul eder; kural yalnız burada durabiliyor.
 */
export async function openBox(
  db: SupabaseClient,
  input: { orderId: string; warehouseId: string; shippingBoxId?: string | null },
): Promise<OpenBoxOutcome> {
  const order = await new OrderService(db).getById(input.orderId);
  if (!order) return { status: 'not_found' };
  if (order.warehouseId !== input.warehouseId) return { status: 'forbidden', reason: 'out_of_scope' };
  // Kutu yalnız TOPLANABİLİR siparişe açılır — hazırlık kuyruğunun kendi kümesi (0015 çizgisi).
  if (order.status !== 'confirmed' && order.status !== 'preparing') {
    return { status: 'stale', currentStatus: order.status };
  }

  const shippingBoxId = input.shippingBoxId ?? null;
  if (shippingBoxId !== null) {
    const known = await new ShippingBoxService(db).listForWarehouse(order.warehouseId, { onlyActive: true });
    if (!known.some((row) => row.id === shippingBoxId)) return { status: 'unknown_box' };
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
        shippingBoxId,
      });
      return {
        status: 'ok',
        box: { boxId: box.id, boxNo: box.boxNo, code: box.code, sealedAt: null, items: [], shippingBoxId: box.shippingBoxId },
      };
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

/**
 * 4×6 ETİKETİN İÇERİĞİ (23.7 · karar §1.5/§1.9) — içerik SUNUCUDAN, telefon yalnız gösterir/basar:
 * tek şablon, tek yerde test; yazıcı değişse mobil kod değişmez.
 *
 * **FİYAT/TUTAR ASLA YOK** ve bu bir tip sınırıdır (karar §1.5): depo yüzeyi tutar görmez;
 * etikette tahsilatın yalnız YÖNTEMİ yazar — kurye tutarı QR'ı okutunca kendi ekranında görür.
 * Ad "koliye yazılacak ad" kuralıyla gelir (alıcı ≠ hesap sahibi olabilir — 10.9'un aynı kararı).
 */
export interface BoxLabel {
  /** QR'ın içeriği — kutu kodu (`KT-…`); sipariş referansı DEĞİL. */
  code: string;
  boxNo: number;
  boxCount: number;
  referenceNo: string | null;
  /** Koliye yazılacak ad: adresin alıcısı, yoksa hesap sahibi. */
  parcelName: string;
  /** Rota adı; kargo siparişinde `null` (rota yok — kulvar `deliveryType`). */
  routeName: string | null;
  deliveryType: Order['deliveryType'];
  deliveryDate: string | null;
  /** Tahsilatın YÖNTEMİ — tutar asla (karar §1.5). `null` = yöntem yazılı değil. */
  paymentMethod: Order['paymentMethod'];
  /** Kutunun dökümü: ürün adı + adet — operasyon dilinde. */
  items: Array<{ name: string; qty: number }>;
}

export type BoxLabelOutcome =
  | { status: 'ok'; label: BoxLabel }
  /** Açık kutunun etiketi yoktur: içerik kesinleşmedi — basılan etiket yalan söylerdi. */
  | { status: 'not_sealed' }
  | { status: 'forbidden'; reason: 'out_of_scope' }
  | { status: 'not_found' };

/**
 * **Etiket içeriğini kurar** (23.7). Bugünkü tüketicisi kapanış ÖNİZLEMESİ (mobil); Brother SDK
 * bağlanınca (23.5 iğne deneyi) aynı içerik basılır — dosya biçimi (PDF/PNG) o gün kesinleşir
 * (Netleşecek 2), içerik sözleşmesi değişmez.
 */
export async function boxLabelPayload(
  db: SupabaseClient,
  input: { boxId: string; warehouseId: string },
): Promise<BoxLabelOutcome> {
  const boxes = new OrderBoxService(db);
  const box = await boxes.getById(input.boxId);
  if (!box) return { status: 'not_found' };
  if (box.warehouseId !== input.warehouseId) return { status: 'forbidden', reason: 'out_of_scope' };
  if (box.sealedAt === null) return { status: 'not_sealed' };

  const found = await new OrderService(db).getWithItems(box.orderId);
  if (!found) return { status: 'not_found' };
  const { order, items } = found;

  const boxItems = (await new OrderBoxItemService(db).listByBoxes([box.id])).filter((row) => row.boxId === box.id);
  const itemById = new Map(items.map((item) => [item.id, item]));
  const names = await variantNames(db, boxItems.map((row) => itemById.get(row.orderItemId)?.variantId ?? ''));

  const [siblings, customer, zone] = await Promise.all([
    boxes.listByOrder(box.orderId),
    new UserProfileService(db).getById(order.customerId),
    order.deliveryZoneId ? new DeliveryZoneService(db).getById(order.deliveryZoneId) : Promise.resolve(null),
  ]);

  return {
    status: 'ok',
    label: {
      code: box.code,
      boxNo: box.boxNo,
      boxCount: siblings.length,
      referenceNo: order.referenceNo,
      parcelName: recipientOf(order.addressSnapshot) ?? customer?.name ?? '—',
      routeName: zone?.name ?? null,
      deliveryType: order.deliveryType,
      deliveryDate: order.deliveryDate,
      paymentMethod: order.paymentMethod,
      items: boxItems.map((row) => {
        const item = itemById.get(row.orderItemId);
        const name = item ? names.get(item.variantId) : undefined;
        return { name: name ? `${name.productName}${name.variantLabel ? ` · ${name.variantLabel}` : ''}` : '—', qty: row.qty };
      }),
    },
  };
}

/**
 * Deponun etiket yazıcısı — `settings` warehouse kapsamı (23.7; yeni tablo YOK, plan kararı).
 * Üçü birden dolu değilse yazıcı TANIMSIZDIR ve `null` döner: yarım ayarla basmaya kalkmak,
 * hatayı depocunun telefonuna taşımak olurdu — ekran "yazıcı tanımlı değil" der, karar Depolar
 * ekranındadır. `labelSize` Brother SDK'nın boy adıdır (23.5 ölçümü: takılı kâğıt SDK'dan
 * okunamıyor, boyu ayar söylemek zorunda — ör. `DieCutW103H164`, `RollW62`).
 */
export interface BoxPrinter {
  id: string;
  /** Operatörün gördüğü ad — adres teknik kimlik, bu insan kimliği. */
  name: string;
  /** `box` bizim 4×6 QR'lı etiketimiz · `shipping` taşıyıcının A6 etiketi (ayrım FİZİKSEL). */
  purpose: PrinterPurpose;
  address: string;
  model: string;
  labelSize: string;
}

/**
 * **Deponun yazıcıları** (07.12) — envanter, seçim DEĞİL.
 *
 * 23.7'nin `labelPrinterFor`u burada emekli oldu: `settings`ten tek yazıcı okuyordu ve kargo
 * kanalı hem yazıcıyı hem etiket türünü çoğalttı. Hangi yazıcının kullanılacağı artık CİHAZIN
 * bilgisi (kullanıcı kararı 29.08); bu kapı yalnız "bu depoda hangi yazıcılar var" diyor.
 *
 * Yalnız AÇIK satırlar: kapalı bir yazıcıyı cihazın seçim listesine koymak, sökülmüş bir cihaza
 * basmayı denetmektir.
 */
export async function printersFor(db: SupabaseClient, warehouseId: string): Promise<BoxPrinter[]> {
  const rows = await new WarehousePrinterService(db).listForWarehouse(warehouseId, { onlyActive: true });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    purpose: row.purpose,
    address: row.address,
    model: row.model,
    labelSize: row.labelSize,
  }));
}

export type MarkPrintedOutcome =
  | { status: 'ok'; printedAt: string }
  | { status: 'not_sealed' }
  | { status: 'forbidden'; reason: 'out_of_scope' }
  | { status: 'not_found' };

/**
 * **Basım damgası** (23.7) — telefon SDK'dan "bastı" cevabını alınca çağırır; damga BAŞARININ
 * kaydıdır, niyetin değil (05.08 sayaç dersi). Yeniden basım damgayı GÜNCELLER: `printed_at`
 * "en son ne zaman basıldı"dır, "ilk kez" değil — yırtılan etiketin yenisi de bir basımdır.
 */
export async function markBoxPrinted(
  db: SupabaseClient,
  input: { boxId: string; warehouseId: string },
): Promise<MarkPrintedOutcome> {
  const boxes = new OrderBoxService(db);
  const box = await boxes.getById(input.boxId);
  if (!box) return { status: 'not_found' };
  if (box.warehouseId !== input.warehouseId) return { status: 'forbidden', reason: 'out_of_scope' };
  // Açık kutunun etiketi yoktur (`boxLabelPayload` ile aynı çizgi) — basılamayanın damgası da olamaz.
  if (box.sealedAt === null) return { status: 'not_sealed' };

  const printedAt = new Date().toISOString();
  await boxes.update({ id: box.id, printedAt });
  return { status: 'ok', printedAt };
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
