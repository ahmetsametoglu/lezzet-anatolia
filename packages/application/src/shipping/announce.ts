import { OrderBoxService, ShipmentEventService, ShipmentService } from '@lezzet/database';
import { getR2Private, r2Keys } from '@lezzet/storage';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isOpenShipment } from './cancel';
import { resolveDispatch, type DispatchBlock } from './dispatch';
import type { ShippingRateProvider } from './port';

/**
 * Gönderiyi duyurur ve etiketleri alır: gerçek para harcayan tek kapı, her mühürlü kutu bir koli olur.
 * Ön koşullar çağrıdan önce ölçülür ve yeniden deneme yoktur, çünkü yarım açılmış gönderiyi geri almak elle iştir.
 */

export type AnnounceOutcome =
  | {
      status: 'ok';
      shipmentId: string;
      parcels: Array<{ boxId: string; trackingNumber: string; labelKey: string | null }>;
      /** Etiketi saklanamayan kutuların numarası — gönderi ALINDI, dosya kaydedilemedi. */
      labelFailures: number[];
    }
  /** Zaten duyurulmuş: ikinci duyuru ikinci koli ve GERÇEK PARA demek — kapı onu açmaz. */
  | { status: 'already_announced'; shipmentId: string }
  | { status: 'provider_error'; code: string; message: string }
  /** Ön koşul dalları teklifle ortaktır (`dispatch.ts`); ikinci kopya bir gün ayrışırdı. */
  | DispatchBlock;

/** Etiket yükleyicisi enjekte edilebilir, çünkü test gerçek özel kovaya yazmamalı. */
export type LabelUploader = (key: string, pdf: Buffer) => Promise<void>;

export interface AnnounceInput {
  orderId: string;
  /** Depocunun çalıştığı depo — siparişinki değilse yazım hiç yapılmaz. */
  warehouseId: string;
  shippingOptionCode: string;
  servicePointId?: string;
  /** Müşteriye gösterilen teklif (cent) — maliyetin ilk kaydı; fatura sonradan düzeltebilir. */
  quotedCents?: number;
}

/** Üretimin yükleyicisi: özel kova. Yapılandırılmamışsa `null` — etiket saklanamaz, söylenir. */
function defaultLabelUploader(): LabelUploader | null {
  const r2 = getR2Private();
  return r2 ? (key, pdf) => r2.uploadFile(key, pdf, 'application/pdf') : null;
}

export async function announceOrderShipment(
  db: SupabaseClient,
  provider: ShippingRateProvider,
  input: AnnounceInput,
  uploadLabel: LabelUploader | null = defaultLabelUploader(),
): Promise<AnnounceOutcome> {
  /* Ön koşullar ve koli kurulumu teklifle ortak: ayrı hesaplansa listede görünen seçenek satın almada reddedilebilirdi. */
  const resolved = await resolveDispatch(db, { orderId: input.orderId, warehouseId: input.warehouseId });
  if (!resolved.ok) return resolved.block;
  const { order, boxes: ordered, from, to, parcels } = resolved.plan;

  const shipments = new ShipmentService(db);
  const mevcut = (await shipments.listByOrder(input.orderId)).find(isOpenShipment);
  // Aynı siparişe ikinci kez duyuru = ikinci koli = gerçek para. Operatöre "zaten var" denir.
  if (mevcut) return { status: 'already_announced', shipmentId: mevcut.id };

  // ── SAĞLAYICI ÇAĞRISI — buradan sonrası gerçek para ────────────────────────
  const shipmentId = crypto.randomUUID();
  let announced;
  try {
    announced = await provider.announce({
      // Üç kimlik bilerek: makine eşleşmesi · insan araması · fiziksel iz.
      externalReferenceId: shipmentId,
      orderNumber: order.referenceNo ?? undefined,
      reference: ordered[0]?.code,
      from,
      to,
      parcels,
      shippingOptionCode: input.shippingOptionCode,
      servicePointId: input.servicePointId,
    });
  } catch (err) {
    const code = (err as { code?: string })?.code ?? 'provider';
    return { status: 'provider_error', code, message: err instanceof Error ? err.message : String(err) };
  }

  // Yazım sağlayıcı cevabından sonra: çağrı başarılı olmadan satır doğmaz. `id` sağlayıcıya
  // `external_reference_id` olarak gittiği için insert şemasının dışından geçer.
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
  const sonuc: Array<{ boxId: string; trackingNumber: string; labelKey: string | null }> = [];
  const labelFailures: number[] = [];

  for (const [i, box] of ordered.entries()) {
    const parcel = announced.parcels[i];
    if (!parcel) continue;

    /* Yükleme hatası duyuruyu geri çekmez: ödenmiş etiket kayıt dışı kalmasın diye `label_key` boş kalır ve çağırana söylenir. */
    let labelKey: string | null = null;
    if (parcel.labelPdf) {
      if (!uploadLabel) {
        labelFailures.push(box.boxNo);
      } else {
        const key = r2Keys.shippingLabel(box.id);
        try {
          await uploadLabel(key, parcel.labelPdf);
          labelKey = key;
        } catch {
          labelFailures.push(box.boxNo);
        }
      }
    }

    await boxSvc.update({
      id: box.id,
      shipmentId: shipment.id,
      providerParcelRef: parcel.providerParcelRef,
      trackingNumber: parcel.trackingNumber,
      trackingUrl: parcel.trackingUrl,
      labelKey,
    });
    sonuc.push({ boxId: box.id, trackingNumber: parcel.trackingNumber, labelKey });
  }

  // Defterin ilk satırı — gönderi düzeyi olay (`orderBoxId` null).
  await new ShipmentEventService(db).insert({
    shipmentId: shipment.id,
    providerCode: 'ANNOUNCED',
    mappedStatus: 'created',
    message: [
      ...announced.warnings,
      ...(labelFailures.length > 0 ? [`etiket saklanamadı: kutu ${labelFailures.join(', ')}`] : []),
    ].join(' · ') || null,
    occurredAt: new Date().toISOString(),
  });

  return { status: 'ok', shipmentId: shipment.id, parcels: sonuc, labelFailures };
}
