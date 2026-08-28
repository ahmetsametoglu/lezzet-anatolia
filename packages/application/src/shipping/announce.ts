import {
  OrderBoxItemService,
  OrderBoxService,
  OrderItemService,
  OrderService,
  ProductVariantService,
  ShipmentEventService,
  ShipmentService,
  ShippingBoxService,
  WarehouseService,
} from '@lezzet/database';
import type { OrderBox, ShippingBox } from '@lezzet/types';
import type { ParcelSpec } from '@lezzet/sendcloud';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RecipientAddress, SenderAddress, ShippingRateProvider } from './port';

/**
 * **GÖNDERİYİ DUYUR + ETİKETLERİ AL** (07.12) — gerçek para harcayan tek kapı.
 *
 * ── SİPARİŞ KUTUSU = TAŞIYICININ KOLİSİ ─────────────────────────────────────
 * Ayrı bir koli varlığı yok (kullanıcı kararı 28.08): depoda mühürlenen kutu, taşıyıcıya verilen
 * kutunun kendisidir. Bu kapı her MÜHÜRLENMİŞ kutuyu bir koliye çeviriyor ve dönen takip
 * numarasını o kutunun satırına yazıyor.
 *
 * ── ÖN KOŞULLAR — hepsi ÇAĞRIDAN ÖNCE ölçülüyor ─────────────────────────────
 * Sağlayıcıya eksik girdiyle gitmek yalnız boşuna bir tur değil: `announce` para harcayan bir
 * çağrı ve yarım açılmış bir gönderiyi geri almak elle iş demek. O yüzden sıra şu:
 *   1. sipariş KARGO kulvarında mı (kural `check` olamaz — başka tabloya bakar, künyesi 0053'te)
 *   2. mühürlenmiş kutusu var mı (açık kutunun içeriği kesinleşmemiştir)
 *   3. her kutunun TİPİ seçilmiş mi (ölçü oradan geliyor)
 *   4. kutulardaki her kalemin AMBALAJ AĞIRLIĞI var mı (tartılmamış mal tarifeye giremez)
 *   5. deponun adresi var mı
 *   6. koli sayısı sağlayıcının tavanını aşıyor mu
 *
 * ── YENİDEN DENEME YOK ──────────────────────────────────────────────────────
 * İstemci katmanı POST'u tekrarlamıyor (idempotency anahtarı yok). Bu kapı da tekrarlamıyor:
 * hata hâlinde hiçbir satır yazılmıyor ve operatör yeniden dener. Yarım yazılmış bir gönderi
 * (koli açıldı, satır yok) referans projenin "öksüz koli" runbook'unun tam sebebiydi — bizde
 * yazım sağlayıcı cevabından SONRA başlıyor.
 */

export type AnnounceOutcome =
  | { status: 'ok'; shipmentId: string; parcels: ReadonlyArray<{ boxId: string; trackingNumber: string; labelPdf: Buffer | null }> }
  | { status: 'not_found' }
  | { status: 'not_shipping' }
  | { status: 'no_sealed_box' }
  | { status: 'box_type_missing'; boxNos: readonly number[] }
  | { status: 'unmeasured'; variantIds: readonly string[] }
  | { status: 'no_sender' }
  | { status: 'too_many_parcels'; count: number; max: number }
  | { status: 'already_announced'; shipmentId: string }
  | { status: 'provider_error'; code: string; message: string };

export interface AnnounceInput {
  orderId: string;
  /** Depocunun çalıştığı depo — siparişinki değilse yazım HİÇ yapılmaz (CLAUDE §1). */
  warehouseId: string;
  shippingOptionCode: string;
  to: RecipientAddress & { name?: string; addressLine1?: string; email?: string; phone?: string };
  servicePointId?: string;
  /** Müşteriye gösterilen teklif (cent) — maliyetin ilk kaydı; fatura sonradan düzeltebilir. */
  quotedCents?: number;
}

/** Sağlayıcının senkron duyuru tavanı — çağrıdan ÖNCE denetlenir. */
const MAX_PARCELS = 15;

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

export async function announceOrderShipment(
  db: SupabaseClient,
  provider: ShippingRateProvider,
  input: AnnounceInput,
): Promise<AnnounceOutcome> {
  const orders = new OrderService(db);
  const order = await orders.getById(input.orderId);
  if (!order) return { status: 'not_found' };
  if (order.warehouseId !== input.warehouseId) return { status: 'not_found' };
  // (1) Kural burada, veride değil — `check` başka tabloya bakamaz (0053 künyesi).
  if (order.deliveryType !== 'shipping') return { status: 'not_shipping' };

  const shipments = new ShipmentService(db);
  const mevcut = (await shipments.listByOrder(input.orderId)).find((s) => s.cancelledAt === null && s.status !== 'cancelled');
  // Aynı siparişe ikinci kez duyuru = ikinci koli = gerçek para. Operatöre "zaten var" denir.
  if (mevcut) return { status: 'already_announced', shipmentId: mevcut.id };

  // (2) Mühürlenmiş kutular — açık kutunun içeriği kesinleşmemiştir, ağırlığı da öyle.
  const boxes = (await new OrderBoxService(db).listByOrder(input.orderId)).filter((b) => b.sealedAt !== null);
  if (boxes.length === 0) return { status: 'no_sealed_box' };
  if (boxes.length > MAX_PARCELS) return { status: 'too_many_parcels', count: boxes.length, max: MAX_PARCELS };

  // (3) Her kutunun TİPİ seçilmiş olmalı — ölçü oradan geliyor.
  const tipsiz = boxes.filter((b) => b.shippingBoxId === null).map((b) => b.boxNo);
  if (tipsiz.length > 0) return { status: 'box_type_missing', boxNos: tipsiz };

  const [boxTypes, contents, warehouse] = await Promise.all([
    new ShippingBoxService(db).listForWarehouse(input.warehouseId),
    new OrderBoxItemService(db).listByBoxes(boxes.map((b) => b.id)),
    new WarehouseService(db).getById(input.warehouseId),
  ]);

  // (5) Gönderici adresi.
  const from = warehouse ? senderOf(warehouse) : null;
  if (!from) return { status: 'no_sender' };

  // Kalem → varyant → ambalaj ağırlığı.
  const items = await new OrderItemService(db).listByOrder(input.orderId);
  const itemVariant = new Map<string, string | null>(items.map((i) => [i.id, i.variantId]));
  const variantIds = [...new Set([...itemVariant.values()].filter((v): v is string => v !== null))];
  const variants = await new ProductVariantService(db).listByIds(variantIds);
  const weightOf = new Map(variants.map((v) => [v.id, v.packedWeightG]));

  // (4) Tartılmamış mal tarifeye giremez — hangi varyant olduğunu söyler.
  const unmeasured = [...new Set(variantIds.filter((id) => (weightOf.get(id) ?? null) === null))];
  if (unmeasured.length > 0) return { status: 'unmeasured', variantIds: unmeasured };

  const typeById = new Map<string, ShippingBox>(boxTypes.map((t) => [t.id, t]));
  const parcels: ParcelSpec[] = [];
  const ordered: OrderBox[] = [...boxes].sort((a, b) => a.boxNo - b.boxNo);

  for (const box of ordered) {
    const type = typeById.get(box.shippingBoxId!);
    // Tip başka depoya ait olamaz (bileşik FK) — buraya düşmesi tipin silinmiş olması demektir.
    if (!type) return { status: 'box_type_missing', boxNos: [box.boxNo] };
    const icerik = contents
      .filter((c) => c.boxId === box.id)
      .reduce((sum, c) => sum + (weightOf.get(itemVariant.get(c.orderItemId) ?? '') ?? 0) * c.qty, 0);
    parcels.push({
      // Taşıyıcıya bildirilen ağırlık İÇERİK + DARA. Tavan denetimi içeriğe bakar, bu sayı ise
      // kutuyla birlikte olandır (`planParcels` ile aynı ayrım).
      weightG: icerik + type.tareG,
      lengthMm: type.lengthMm,
      widthMm: type.widthMm,
      heightMm: type.heightMm,
    });
  }

  // ── SAĞLAYICI ÇAĞRISI — buradan sonrası gerçek para ────────────────────────
  const shipmentId = crypto.randomUUID();
  let announced;
  try {
    announced = await provider.announce({
      // ÜÇ KİMLİK, üçü de bilerek (tasarım §4.5): makine eşleşmesi · insan araması · fiziksel iz.
      externalReferenceId: shipmentId,
      orderNumber: order.referenceNo ?? undefined,
      reference: ordered[0]?.code,
      from,
      to: input.to,
      parcels,
      shippingOptionCode: input.shippingOptionCode,
      servicePointId: input.servicePointId,
    });
  } catch (err) {
    const code = (err as { code?: string })?.code ?? 'provider';
    return { status: 'provider_error', code, message: err instanceof Error ? err.message : String(err) };
  }

  // ── YAZIM — sağlayıcı cevabından SONRA ─────────────────────────────────────
  // Referans projenin "öksüz koli" runbook'unun sebebi tersiydi: satır önce yazılıyor, çağrı
  // düşünce yarım kayıt kalıyordu. Burada çağrı başarılı olmadan hiçbir satır doğmuyor; ters
  // yönde kalan risk (sağlayıcıda koli var, bizde satır yok) NÖBET cron'unun konusu.
  // `id` sağlayıcıya `external_reference_id` olarak gitti — aynı olmak ZORUNDA, o yüzden
  // insert şemasının dışından geçiyor (şema `id` üretmeyi veritabanına bırakıyor).
  const shipment = await new ShipmentService(db).insert({
    id: shipmentId,
    orderId: input.orderId,
    warehouseId: input.warehouseId,
    status: 'created',
    providerShipmentId: announced.providerShipmentId,
    shippingOptionCode: input.shippingOptionCode,
    carrierCode: announced.carrierCode,
    carrierName: announced.carrierName,
    servicePointId: input.servicePointId ?? null,
    quotedCents: input.quotedCents ?? null,
  });

  const boxSvc = new OrderBoxService(db);
  const sonuc: Array<{ boxId: string; trackingNumber: string; labelPdf: Buffer | null }> = [];
  for (const [i, box] of ordered.entries()) {
    const parcel = announced.parcels[i];
    if (!parcel) continue;
    await boxSvc.update({
      id: box.id,
      shipmentId: shipment.id,
      providerParcelRef: parcel.providerParcelRef,
      trackingNumber: parcel.trackingNumber,
      trackingUrl: parcel.trackingUrl,
    });
    sonuc.push({ boxId: box.id, trackingNumber: parcel.trackingNumber, labelPdf: parcel.labelPdf });
  }

  // Defterin ilk satırı — gönderi düzeyi olay (`orderBoxId` null).
  await new ShipmentEventService(db).insert({
    shipmentId: shipment.id,
    providerCode: 'ANNOUNCED',
    mappedStatus: 'created',
    message: announced.warnings.length > 0 ? announced.warnings.join(' · ') : null,
    occurredAt: new Date().toISOString(),
  });

  return { status: 'ok', shipmentId: shipment.id, parcels: sonuc };
}
