import { OrderBoxService, ShipmentEventService, ShipmentService } from '@lezzet/database';
import { getR2Private, r2Keys } from '@lezzet/storage';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveDispatch, type DispatchBlock } from './dispatch';
import type { ShippingRateProvider } from './port';

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
  /**
   * Ön koşul dalları teklifle ORTAK (`dispatch.ts`) ve burada YENİDEN YAZILMIYOR: ikinci bir
   * kopya, bir gün yalnız birinde büyüyen iki liste olurdu ve ekran hangisinde olduğunu
   * bilemezdi.
   */
  | DispatchBlock;

/**
 * Etiket yükleyicisi — **enjekte edilebilir, ve bunun tek sebebi TESTİN DIŞ DEPOYA YAZMAMASI.**
 *
 * Yaşandı 28.08: ilk yazımda kapı doğrudan `getR2Private()` çağırıyordu ve entegrasyon testi
 * sahte etiketi GERÇEK özel kovaya yükledi. Depoda o güne kadar hiçbir testin yazmadığı bir yerdi
 * — yani ihlal sessizdi: test yeşil geçti, kovada bir dosya kaldı. `fetchImpl` enjeksiyonunun
 * (`@lezzet/sendcloud`) aynı gerekçesi: dış dünyaya çıkan her kapı testte kapatılabilmeli.
 */
export type LabelUploader = (key: string, pdf: Buffer) => Promise<void>;

export interface AnnounceInput {
  orderId: string;
  /** Depocunun çalıştığı depo — siparişinki değilse yazım HİÇ yapılmaz (CLAUDE §1). */
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
  /*
    ÖN KOŞULLAR + KOLİ KURULUMU ARTIK ORTAK (`resolveDispatch`, 29.08).

    Aynı hesap iki kapıya lazım oldu: duyuru ve depocunun servis seçtiği teklif. İkisi ayrı
    yazılsaydı listede görünen seçenek satın alma anında reddedilebilirdi — koli sayısı iki
    hesapta ayrışırdı. Adres de artık siparişin kendi anlık görüntüsünden okunuyor; çağıran
    yalnız "hangi sipariş" diyor (künyesi `dispatch.ts`te).
  */
  const resolved = await resolveDispatch(db, { orderId: input.orderId, warehouseId: input.warehouseId });
  if (!resolved.ok) return resolved.block;
  const { order, boxes: ordered, from, to, parcels } = resolved.plan;

  const shipments = new ShipmentService(db);
  const mevcut = (await shipments.listByOrder(input.orderId)).find((s) => s.cancelledAt === null && s.status !== 'cancelled');
  // Aynı siparişe ikinci kez duyuru = ikinci koli = gerçek para. Operatöre "zaten var" denir.
  if (mevcut) return { status: 'already_announced', shipmentId: mevcut.id };

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
      to,
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
  const sonuc: Array<{ boxId: string; trackingNumber: string; labelKey: string | null }> = [];
  const labelFailures: number[] = [];

  for (const [i, box] of ordered.entries()) {
    const parcel = announced.parcels[i];
    if (!parcel) continue;

    /*
      ETİKET ÖZEL KOVAYA — ve yükleme HATASI duyuruyu GERİ ÇEKMEZ.

      Gönderi alındı, parası ödendi: yüklemenin düşmesi yüzünden satırı yazmamak, ödenmiş bir
      etiketi kayıt dışı bırakmak olurdu (öksüz koli'nin ta kendisi). Bunun yerine `label_key`
      boş kalıyor ve hangi kutuda olduğu çağırana söyleniyor — ekran "etiketi yeniden al" der.
      23.7'nin çizgisi: *"basım hatası kutu kapanışını geri çekmez"*.
    */
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
