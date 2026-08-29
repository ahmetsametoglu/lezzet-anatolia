import {
  OrderBoxItemService,
  OrderBoxService,
  OrderItemService,
  OrderService,
  ProductVariantService,
  ShippingBoxService,
  WarehouseService,
} from '@lezzet/database';
import { homeDeliveryOnly, requiresHomeDelivery } from '@lezzet/domain-core';
import type { ParcelSpec } from '@lezzet/sendcloud';
import type { Order, OrderBox, ShippingBox } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RecipientAddress, SenderAddress, ShippingRateProvider } from './port';

/**
 * **SEVK HAZIRLIĞI — duyuru ile teklifin ORTAK zemini** (07.12).
 *
 * ── NEDEN AYRI DOSYA ────────────────────────────────────────────────────────
 * `announceOrderShipment` para harcayan çağrıdan ÖNCE altı ön koşulu ölçüyordu ve kolileri
 * mühürlü kutulardan kuruyordu. Depocuya "hangi servisle gönderelim" diye sormak için AYNI
 * hesabın bir kez daha yapılması gerekti — çünkü seçenekler **gerçek kolilere** göre sorulmalı,
 * plana göre değil: `quoteShipping` kalemlerden kendi planını kurar ve o plan depocunun eline
 * aldığı kartonlarla aynı olmak zorunda değildir. İki ayrı hesap, bir gün "listede gördüğüm
 * seçenek satın alırken reddedildi" demekti.
 *
 * Bu yüzden ön koşullar + koli kurulumu tek yerde (`resolveDispatch`), iki kapı da oradan geçiyor.
 *
 * ── ALICI ADRESİ SİPARİŞTEN OKUNUR, ÇAĞIRANDAN DEĞİL ────────────────────────
 * Adres siparişin kendi anlık görüntüsünde (`addressSnapshot`) duruyor ve gönderi oraya gidecek.
 * İstemciden almak, depocunun telefonunu müşteri adresini kuran taraf yapardı — yanlış yazılmış
 * bir posta kodu hem yanlış tarife hem yanlış teslimat demek. Çağıran yalnız "hangi sipariş"
 * diyor.
 */

/** Ön koşulların olumsuz cevapları — duyuru ve teklif AYNI kümeyi paylaşır. */
export type DispatchBlock =
  | { status: 'not_found' }
  | { status: 'not_shipping' }
  | { status: 'no_sealed_box' }
  | { status: 'box_type_missing'; boxNos: number[] }
  | { status: 'unmeasured'; variantIds: string[] }
  | { status: 'no_sender' }
  /** Siparişin adres kopyası yok ya da posta kodu boş — gönderi nereye gideceğini bilmiyor. */
  | { status: 'no_recipient' }
  | { status: 'too_many_parcels'; count: number; max: number };

export interface DispatchPlan {
  order: Order;
  /** Mühürlü kutular, `boxNo` sırasıyla — koli sırası budur ve duyuruda da bu sırayla gider. */
  boxes: readonly OrderBox[];
  from: SenderAddress;
  to: RecipientAddress & { name?: string; addressLine1?: string; phone?: string };
  parcels: readonly ParcelSpec[];
  totalWeightG: number;
}

/** Sağlayıcının senkron duyuru tavanı — çağrıdan ÖNCE denetlenir. */
export const MAX_PARCELS = 15;

function textOf(snapshot: Record<string, unknown> | null, key: string): string | undefined {
  const raw = snapshot?.[key];
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
}

/** Deponun serbest `address` alanı → gönderici. Posta kodu ZORUNLU: tarife çıkıştan hesaplanıyor. */
function senderOf(w: { countryCode: string; address: Record<string, unknown> | null; name: string }): SenderAddress | null {
  const a = w.address ?? {};
  const postalCode = typeof a.postalCode === 'string' ? a.postalCode : null;
  if (!postalCode) return null;
  return {
    countryCode: w.countryCode,
    postalCode,
    city: typeof a.city === 'string' ? a.city : undefined,
    name: w.name,
    addressLine1: typeof a.line1 === 'string' ? a.line1 : undefined,
  };
}

/**
 * Siparişin adres kopyası → alıcı.
 *
 * **E-posta BİLEREK gönderilmiyor.** Sağlayıcı e-posta gördüğünde kendi takip bildirimlerini
 * yolluyor; müşteriye biz zaten yazıyoruz (`order_out_for_delivery` + mail şablonu) ve ikinci bir
 * kanal aynı olayı iki kez anlatırdı. Telefon gidiyor — taşıyıcının teslimat için aradığı numara
 * odur ve onun karşılığı bizde yok.
 */
function recipientOf(snapshot: Record<string, unknown> | null): DispatchPlan['to'] | null {
  const countryCode = textOf(snapshot, 'country');
  const postalCode = textOf(snapshot, 'postalCode');
  if (!countryCode || !postalCode) return null;
  return {
    countryCode,
    postalCode,
    city: textOf(snapshot, 'city'),
    name: textOf(snapshot, 'recipient'),
    addressLine1: textOf(snapshot, 'line1'),
    phone: textOf(snapshot, 'phone'),
  };
}

/**
 * **Ön koşullar + koli kurulumu.** Sıra bilinçli: ucuz kontroller önce, veritabanı turları sonra.
 * Her olumsuz dal ADLI — depocuya "olmadı" değil, "neden olmadı" söylenebilsin.
 */
export async function resolveDispatch(
  db: SupabaseClient,
  input: { orderId: string; warehouseId: string },
): Promise<{ ok: true; plan: DispatchPlan } | { ok: false; block: DispatchBlock }> {
  const order = await new OrderService(db).getById(input.orderId);
  if (!order) return { ok: false, block: { status: 'not_found' } };
  // Kapsam dışı sipariş "yok" sayılır: başka deponun siparişinin var olduğunu bile söylemeyiz.
  if (order.warehouseId !== input.warehouseId) return { ok: false, block: { status: 'not_found' } };
  if (order.deliveryType !== 'shipping') return { ok: false, block: { status: 'not_shipping' } };

  const to = recipientOf(order.addressSnapshot);
  if (!to) return { ok: false, block: { status: 'no_recipient' } };

  // Açık kutunun içeriği kesinleşmemiştir, ağırlığı da öyle — yalnız mühürlüler koli olur.
  const boxes = [...(await new OrderBoxService(db).listByOrder(input.orderId))]
    .filter((b) => b.sealedAt !== null)
    .sort((a, b) => a.boxNo - b.boxNo);
  if (boxes.length === 0) return { ok: false, block: { status: 'no_sealed_box' } };
  if (boxes.length > MAX_PARCELS) {
    return { ok: false, block: { status: 'too_many_parcels', count: boxes.length, max: MAX_PARCELS } };
  }

  const tipsiz = boxes.filter((b) => b.shippingBoxId === null).map((b) => b.boxNo);
  if (tipsiz.length > 0) return { ok: false, block: { status: 'box_type_missing', boxNos: tipsiz } };

  const [boxTypes, contents, warehouse, items] = await Promise.all([
    new ShippingBoxService(db).listForWarehouse(input.warehouseId),
    new OrderBoxItemService(db).listByBoxes(boxes.map((b) => b.id)),
    new WarehouseService(db).getById(input.warehouseId),
    new OrderItemService(db).listByOrder(input.orderId),
  ]);

  const from = warehouse ? senderOf(warehouse) : null;
  if (!from) return { ok: false, block: { status: 'no_sender' } };

  const itemVariant = new Map<string, string | null>(items.map((i) => [i.id, i.variantId]));
  const variantIds = [...new Set([...itemVariant.values()].filter((v): v is string => v !== null))];
  const variants = await new ProductVariantService(db).listByIds(variantIds);
  const weightOf = new Map(variants.map((v) => [v.id, v.packedWeightG]));

  // Tartılmamış mal tarifeye giremez: uydurulmuş bir ağırlık doğrudan faturaya yansır.
  const unmeasured = [...new Set(variantIds.filter((id) => (weightOf.get(id) ?? null) === null))];
  if (unmeasured.length > 0) return { ok: false, block: { status: 'unmeasured', variantIds: unmeasured } };

  const typeById = new Map<string, ShippingBox>(boxTypes.map((t) => [t.id, t]));
  const parcels: ParcelSpec[] = [];
  for (const box of boxes) {
    const type = typeById.get(box.shippingBoxId!);
    // Tip başka depoya ait olamaz (bileşik FK) — buraya düşmesi tipin SİLİNMİŞ olması demektir.
    if (!type) return { ok: false, block: { status: 'box_type_missing', boxNos: [box.boxNo] } };
    const icerik = contents
      .filter((c) => c.boxId === box.id)
      .reduce((sum, c) => sum + (weightOf.get(itemVariant.get(c.orderItemId) ?? '') ?? 0) * c.qty, 0);
    // Taşıyıcıya bildirilen ağırlık İÇERİK + DARA (tavan denetimi ise yalnız içeriğe bakar).
    parcels.push({ weightG: icerik + type.tareG, lengthMm: type.lengthMm, widthMm: type.widthMm, heightMm: type.heightMm });
  }

  return {
    ok: true,
    plan: { order, boxes, from, to, parcels, totalWeightG: parcels.reduce((s, p) => s + p.weightG, 0) },
  };
}

export type DispatchQuoteOutcome =
  | {
      status: 'ok';
      /** Ucuzdan pahalıya sıralı; çok kolide `multicollo` desteklemeyenler ELENMİŞ. */
      options: Array<{
        code: string;
        carrierName: string;
        name: string;
        priceCents: number;
        leadTimeHours: number | null;
        lastMile: string | null;
        tracked: boolean;
      }>;
      parcelCount: number;
      totalWeightG: number;
      /**
       * **Liste "yalnız adrese teslim"e daraltıldı mı** (kullanıcı kararı 29.08). Ücretsiz kargoda
       * parayı biz ödüyoruz ve koli EVE gider; ekran bunu SÖYLEMELİ, yoksa depocu listeyi eksik
       * sanır. Liste boş kaldıysa sebebini de bu bayrak anlatır.
       */
      homeOnly: boolean;
    }
  | DispatchBlock
  | { status: 'provider_error'; message: string };

/**
 * **GERÇEK KOLİLER İÇİN TEKLİF** — depocunun servis seçtiği liste.
 *
 * Checkout'un teklifinden (`quoteShipping`) farkı girdisi: orası müşterinin sepetinden bir plan
 * KURAR, burası depoda mühürlenmiş kutuları ÖLÇER. Sevk anında bağlayıcı olan ikincisidir —
 * depocu üç kalemi tek kutuya sığdırmış olabilir, ya da tam tersi.
 *
 * ⚠ **Çok kutulu gönderide `multicollo` desteklemeyen seçenek listeden düşer.** Ölçüldü (28.08):
 * gerçek hesapta seçeneklerin bir kısmı desteklemiyor ve en ucuzların bir bölümü tam o kümede.
 * Süzgeç olmasaydı depocu en ucuzu seçer, satın alma anında sağlayıcı reddeder ve sipariş sevk
 * edilemez hâlde kalırdı.
 *
 * **Fiyatı olmayan VE sıfır olan seçenekler elenir.** `null` = tarife hesaplanamadı; **sıfır ise
 * gerçek bir kargo hizmeti değildir** — sağlayıcı her sorguya ücretsiz "mektup" kanalını da
 * döndürüyor ve ucuzdan sıralı bir listede o daima başa geçer (ölçüldü 28.08: müşteri yüzeyinde
 * tam bu yüzden her siparişte 0,00 € hesaplanıyordu). Depocuya 15 kg'lık koliyi mektup tarifesiyle
 * göndermeyi önermek, reddedilecek bir etiketi satın almaya davet etmek olurdu.
 */
export async function quoteOrderShipment(
  db: SupabaseClient,
  provider: ShippingRateProvider,
  input: { orderId: string; warehouseId: string },
): Promise<DispatchQuoteOutcome> {
  const resolved = await resolveDispatch(db, input);
  if (!resolved.ok) return resolved.block;
  const { plan } = resolved;

  let options;
  try {
    options = await provider.quote({ from: plan.from, to: plan.to, parcels: plan.parcels });
  } catch (err) {
    return { status: 'provider_error', message: err instanceof Error ? err.message : String(err) };
  }

  const usable = plan.parcels.length > 1 ? options.filter((o) => o.multicollo) : options;

  /*
    **ÜCRETSİZ KARGO EVE GİDER** (kullanıcı kararı 29.08) — ve kural BURADA bağlayıcı, checkout'ta
    değil: müşterinin seçtiği servis kodu hiçbir yere yazılmıyor (ölçüldü), taşıyıcıyı gerçekte bu
    kapı seçtiriyor. Checkout'a koysaydık kuralı söylemiş ama uygulamamış olurduk — depo yine
    teslim noktası satın alabilirdi.

    Ölçüt ücretin sıfır olması: müşteri ödemediyse seçim bizimdir ve "ücretsiz kargo" sözü
    kapıya teslimi kapsar. Müşteri ödüyorsa teslim noktasını KENDİSİ seçebilir — o hâlde bu süzgeç
    hiç çalışmaz.
  */
  const homeOnly = requiresHomeDelivery(plan.order);
  const izinli = homeOnly ? homeDeliveryOnly(usable) : usable;

  return {
    status: 'ok',
    homeOnly,
    options: izinli
      .filter((o): o is typeof o & { priceCents: number } => typeof o.priceCents === 'number' && o.priceCents > 0)
      .sort((a, b) => a.priceCents - b.priceCents)
      .map((o) => ({
        code: o.code,
        carrierName: o.carrierName,
        name: o.name,
        priceCents: o.priceCents,
        leadTimeHours: o.leadTimeHours,
        lastMile: o.lastMile,
        tracked: o.tracked,
      })),
    parcelCount: plan.parcels.length,
    totalWeightG: plan.totalWeightG,
  };
}
