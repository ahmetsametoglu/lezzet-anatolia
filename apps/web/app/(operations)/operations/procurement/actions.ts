'use server';

import { revalidatePath } from 'next/cache';
import { PurchaseOrderItemService, PurchaseOrderService, ReorderService, SupplierProductService, serviceDb } from '@lezzet/database';
import { matchSupplierItem, supplierItemKeyOf } from '@lezzet/domain-core';
import type { KeysetCursor, PurchaseOrderStatus } from '@lezzet/types';
import { requireAdmin, requireFinance } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { readWarehouseContext } from '@/lib/warehouse/context';
import { sendPurchaseOrder } from '@/lib/stock/purchase-order-send';
import { readOrderDetail, readOrderPage, readSupplierProducts, searchVariantOptions } from './procurement-read';
import type { OrderDetailView, PurchaseOrderRowView, SupplierProductRowView, VariantPickOption } from './procurement-types';

const PATH = '/operations/procurement';

// Tedarik ekranı server action'ları — 'use server' + requireAdmin ilk + servise devret +
// `{ data, error }` DÖNER (throw yok).
//
// Guard ekranın kapısını TEKRARLAR: sayfanın `requireAdmin`'i düğmeyi gizlemeye yarar, action
// kendi kapısını kendi tutar (çağrı doğrudan da yapılabilir).

/**
 * Sipariş listesinin sonraki sayfası (sonsuz kaydırma): imleç ve süzgeç birlikte gelir, yoksa ikinci sayfa birincinin ölçütünü taşımaz
 * ve liste sessizce karışırdı. Süzgeç istemciden gelir ama tehlikesizdir, daraltır ve yetki genişletmez.
 */
export async function loadMorePurchaseOrdersAction(
  cursor: KeysetCursor,
  filters: { status?: PurchaseOrderStatus; supplierId?: string },
): Promise<ActionResult<{ rows: PurchaseOrderRowView[]; nextCursor: KeysetCursor | null }>> {
  try {
    await requireFinance();
    return { data: await readOrderPage(serviceDb(), { cursor, ...filters }), error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/** Sipariş penceresinin açılış okuması — kalemler + tedarikçiye gidecek metin, tek turda. */
export async function loadOrderDetailAction(orderId: string): Promise<ActionResult<OrderDetailView>> {
  try {
    await requireFinance();
    return { data: await readOrderDetail(serviceDb(), orderId), error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

// ─── Tedarikçi kartı ──────────────────────────────────────────────────────────
// Kart olmadan sipariş de olmaz: sıfırdan kurulumda ilk iş tedarikçiyi tanıtmaktır. Bu yüzden
// CRUD ekranın en temel parçası, süsü değil.

// Kartın kaydı `lib/stock/supplier-actions.ts`tedir (`saveSupplierAction`): asistan kuyruğunun tedarikçi önerisi de aynı kapıdan yazar ve
// kardeş sayfadan import edemez.

// ─── Ürün–kod eşlemesi ────────────────────────────────────────────────────────
// `DOMAIN §16`: tedarik siparişi TEDARİKÇİNİN DİLİYLE yazılsın diye — bizim varyantımız ↔ onun
// kodu. Eşleme olmadan liste bizim adımızla gider ve tedarikçi neyi göndereceğini kendi
// kataloğundan aramak zorunda kalır.

/** Bir tedarikçinin kataloğu — eşleme satırları, bizim ürün adımızla birlikte. */
export async function loadSupplierProductsAction(supplierId: string): Promise<ActionResult<SupplierProductRowView[]>> {
  try {
    await requireFinance();
    return { data: await readSupplierProducts(serviceDb(), supplierId), error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/** Eşleme formunun varyant seçicisi — ürün adında arar, eşleşen ürünün TÜM boyları döner. */
export async function searchVariantsForMappingAction(term: string): Promise<ActionResult<VariantPickOption[]>> {
  try {
    await requireFinance();
    return { data: await searchVariantOptions(serviceDb(), term), error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/**
 * Eşleme yazar ya da günceller; aynı (tedarikçi, varyant) ikilisi bir kez tanımlanır, servis `upsert` yapar. `lastPurchasePriceCents`
 * buradan yazılmaz, onu mal kabul günceller.
 */
export async function saveSupplierProductAction(input: {
  supplierId: string;
  variantId: string;
  supplierCode: string;
  nameAtSupplier?: string | null;
  packQty?: number | null;
}): Promise<ActionResult> {
  try {
    await requireFinance();
    // Kod yoksa ad anahtar olur, anahtarı motor türetir (`supplierItemKeyOf`); aynı anahtar başka varyanta bağlıysa veritabanı reddeder,
    // önce okunur bir cümleyle söylenir.
    const code = supplierItemKeyOf(input.supplierCode, input.nameAtSupplier);
    if (!code) throw new Error('Tedarikçideki kod ya da tedarikçinin ürün adı gerekli — ikisinden biri kalemin anahtarıdır.');
    const service = new SupplierProductService(serviceDb());
    const clash = matchSupplierItem(await service.listBySupplier(input.supplierId), { code, name: input.nameAtSupplier });
    if (clash.status === 'found' && clash.record.variantId !== input.variantId) {
      throw new Error(`'${code}' anahtarı ya da bu ad bu tedarikçide başka bir ürüne bağlı — önce o eşlemeyi düzeltin.`);
    }
    if (clash.status === 'ambiguous') throw new Error(`'${code}' anahtarı bu tedarikçide birden çok eşlemeye gidiyor — önce onları düzeltin.`);

    await service.setMapping({
      supplierId: input.supplierId,
      variantId: input.variantId,
      supplierCode: code,
      nameAtSupplier: input.nameAtSupplier?.trim() || null,
      // 1 ve altı "koli yok" demektir; liste o zaman koli karşılığı yazmaz.
      packQty: input.packQty && input.packQty > 1 ? input.packQty : null,
    });
    revalidatePath(PATH);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/**
 * Tercihli kaynağı değiştirir — aynı varyantın diğer eşlemeleri düşer (servisin kuralı).
 * "İki tercihli" sessiz bir belirsizliktir: sipariş önerisi hangisini seçeceğini bilemez.
 */
export async function setPreferredSupplierProductAction(mappingId: string): Promise<ActionResult> {
  try {
    await requireFinance();
    await new SupplierProductService(serviceDb()).setPreferred(mappingId);
    revalidatePath(PATH);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/**
 * Eşlemeyi kaldırır. Bu bir SATIN ALMA geçmişi değil, bir sözlük satırıdır — silinmesi geçmişi
 * yalanlamaz: verilmiş siparişler kendi kalemlerinde kodu zaten taşıyor.
 */
export async function deleteSupplierProductAction(mappingId: string): Promise<ActionResult> {
  try {
    await requireFinance();
    await new SupplierProductService(serviceDb()).delete(mappingId);
    revalidatePath(PATH);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

// ─── Tedarik siparişi ─────────────────────────────────────────────────────────

/**
 * Öneri grubundan tek dokunuşla taslak açar (DOMAIN §16). Grup sunucuda yeniden okunur, istemcinin satırlarına güvenmek eşik altı olmayan
 * ürünü de sipariş ettirebilirdi.
 */
export async function createDraftFromSuggestionAction(supplierId: string): Promise<ActionResult<{ orderId: string }>> {
  try {
    await requireFinance();
    const db = serviceDb();
    const ctx = await readWarehouseContext();
    const reorder = new ReorderService(db);

    // Kalem hedef deposunu taşır: depoları tek satıra toplamak tedarikçiye giden listeden niyeti silerdi; aynı varyant iki depoda eşik
    // altıysa iki satır olur.
    const lines: Array<{ variantId: string; qty: number; unitPriceCents: number | null; targetWarehouseId: string }> = [];
    // Tur yalnız tesislerden, `readSuggestionGroups` ile aynı evren: hedef depo bir tesistir ve ikisi ayrışsaydı ekrandaki öneri ile
    // taslağın satırları tutmazdı.
    const facilityIds = ctx.facilities.map((w) => w.id).filter((id) => ctx.visibleWarehouseIds.includes(id));
    for (const warehouseId of facilityIds) {
      const group = (await reorder.suggestions(warehouseId)).find((g) => g.supplierId === supplierId);
      for (const line of group?.lines ?? []) {
        lines.push({
          variantId: line.variantId,
          qty: line.suggestedQty,
          unitPriceCents: line.lastPurchasePriceCents,
          targetWarehouseId: warehouseId,
        });
      }
    }
    // Öneri sunucuda YENİDEN okunur, istemciden gelen satırlarla değil: ekrandaki liste birkaç
    // dakika önce okunmuş olabilir ve o arada mal girmiş olabilir. Grup kaybolduysa sessiz başarı
    // YOK — operatör siparişi verdiğini sanmamalı.
    if (lines.length === 0) throw new Error('Bu tedarikçide eşik altı kalem kalmadı — liste yenilendi.');

    const { order } = await new PurchaseOrderService(db).createDraft(supplierId, lines);
    revalidatePath(PATH);
    return { data: { orderId: order.id }, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/**
 * Elle sipariş, öneriden bağımsız: kampanya malı, yeni ürün ya da tedarikçinin teklifi öneriyi beklemez. Kalemler pencerede toplanır ve
 * sipariş tek turda `createDraft`ten doğar, çünkü kod eşlemesini ve son alış fiyatını bulan yer orasıdır.
 */
export async function createManualDraftAction(input: {
  supplierId: string;
  note?: string | null;
  lines: Array<{ variantId: string; qty: number; targetWarehouseId?: string | null }>;
}): Promise<ActionResult<{ orderId: string }>> {
  try {
    await requireFinance();
    if (!input.supplierId) throw new Error('Tedarikçi seçin.');
    if (input.lines.length === 0) throw new Error('En az bir kalem ekleyin.');
    if (input.lines.some((l) => !Number.isInteger(l.qty) || l.qty <= 0)) throw new Error('Adet en az 1 olmalı.');

    const { order } = await new PurchaseOrderService(serviceDb()).createDraft(
      input.supplierId,
      input.lines.map((l) => ({ variantId: l.variantId, qty: l.qty, targetWarehouseId: l.targetWarehouseId ?? null })),
      input.note?.trim() || undefined,
    );
    revalidatePath(PATH);
    return { data: { orderId: order.id }, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

// Öneriden sipariş açan kapı `lib/stock/purchase-order-actions.ts`tedir: o eylemi asistan kuyruğu çağırır ve kardeş sayfadan import
// yasaktır.

// ─── Taslak kalemleri ─────────────────────────────────────────────────────────
// Öneri başlangıçtır, taslağın adedi değişir ve kalemi çıkarılır; ikisi de `requireDraft` kapısından geçer, çünkü gönderilmiş siparişin
// kalemini değiştirmek gelen malı "fazla" gösterir.

/** Taslak mı — değilse eylem reddedilir. Sipariş okunur, istemcinin beyanına güvenilmez. */
async function requireDraft(orderId: string): Promise<void> {
  const order = await new PurchaseOrderService(serviceDb()).getById(orderId);
  if (!order) throw new Error('Sipariş bulunamadı.');
  if (order.status !== 'draft') throw new Error('Gönderilmiş sipariş değiştirilemez — kayıt tedarikçiye gideni yansıtmalı.');
}

/**
 * Kalemin adedini ya da beklenen alışını değiştirir; fiyat isteğe bağlıdır ve `null` "bilinmiyor" demektir, sıfır bedava alım olurdu.
 */
export async function updateDraftLineAction(input: {
  orderId: string;
  itemId: string;
  qty?: number;
  unitPriceCents?: number | null;
}): Promise<ActionResult> {
  try {
    await requireFinance();
    await requireDraft(input.orderId);
    if (input.qty !== undefined && (!Number.isInteger(input.qty) || input.qty <= 0)) {
      throw new Error('Adet en az 1 olmalı.');
    }

    await new PurchaseOrderItemService(serviceDb()).update({
      id: input.itemId,
      ...(input.qty === undefined ? {} : { qty: input.qty }),
      // Cent ile euro arasındaki çevrim servisin işidir (`moneyFields`), burada birim değişmez.
      ...(input.unitPriceCents === undefined ? {} : { unitPriceCents: input.unitPriceCents }),
    });
    revalidatePath(PATH);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/** Kalemi taslaktan çıkarır. Son kalem de silinebilir: kalemsiz taslak geçerli bir ara hâldir. */
export async function removeDraftLineAction(input: { orderId: string; itemId: string }): Promise<ActionResult> {
  try {
    await requireFinance();
    await requireDraft(input.orderId);
    await new PurchaseOrderItemService(serviceDb()).delete(input.itemId);
    revalidatePath(PATH);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/**
 * "Gönderildi" işareti: sistem göndermez, insan gönderir ve bunu söyler (DOMAIN §16). Ayrı eylemdir, çünkü listeyi kopyalamak gönderim
 * değildir.
 */
export async function markOrderSentAction(orderId: string): Promise<ActionResult> {
  try {
    await requireFinance();
    // Numara BURADA üretilmiyor: kapı motoru ve veritabanını birleştiriyor (çarpışmada yeniden
    // dener). Belge dışarı çıktığı için gönderilmiş siparişin numarası olmak zorunda — kural DB'de.
    await sendPurchaseOrder(orderId);
    revalidatePath(PATH);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/**
 * Siparişi iptal eder; mal gelmiş siparişi servis reddeder, ekran o hâlde eylemi sunmasa da kapı kuralını kendisi tutar. İptal yalnız
 * yöneticinindir, muhasebeci akışı okur ama durdurmaz.
 */
export async function cancelOrderAction(orderId: string): Promise<ActionResult> {
  try {
    await requireAdmin();
    await new PurchaseOrderService(serviceDb()).cancel(orderId);
    revalidatePath(PATH);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}
