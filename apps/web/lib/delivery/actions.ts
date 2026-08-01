'use server';

import { DeliveryZoneService, PostalCodePlaceService, WarehouseService, serviceDb } from '@lezzet/database';
import { findZoneForPostalCode, resolvePlaceByPostalCode } from '@lezzet/domain-core';
import { captureError, SOURCES } from '@lezzet/observability';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { resolveDelivery } from '@/lib/order/delivery';
import { isValidPostalCode, normalizePostalCode, type PlaceLookup } from './place-types';

/**
 * Teslimat yeri çözümü (K30-K31) — posta kodu → "ne gönderebiliriz, ne zaman".
 *
 * Guard YOK ve olmamalı: soru ziyaretçiye de açıktır, zaten alışverişin önüne konmamak için var.
 *
 * Checkout'un teslimat çözümünü (`resolveDelivery`, 07.2) YENİDEN YAZMAZ, ona sorar — yoksa aynı
 * "rota içi mi, hangi gün" kuralı iki yerde yaşar ve bir gün ayrışır. Aradaki tek fark kapsam:
 * burada sepet bilinmez, o yüzden "kargo tamamen kapalı mı" sorusu sorulmaz (o karar sepetin
 * içeriğine bağlıdır ve kısıt bloğunun işidir).
 */
export async function resolvePlaceAction(rawPostalCode: string): Promise<ActionResult<PlaceLookup>> {
  try {
    const postalCode = normalizePostalCode(rawPostalCode);
    if (!isValidPostalCode(postalCode)) throw new Error('Posta kodu 5 haneli olmalı');

    const db = serviceDb();
    const [matches, zones, warehouses] = await Promise.all([
      new PostalCodePlaceService(db).findByPostalCode(postalCode),
      // Bölgeler AKTİFLİK SÜZGECİSİZ okunur (19.16a): pasif bölgedeki kod da bizim kaydımızdır ve
      // ülkesi ondan türer. Rotanın açık olup olmadığına motor karar verir — okuma o kararı
      // önden vermemeli, yoksa kapalı bölgedeki müşteri "tanımadık" cevabı alır.
      new DeliveryZoneService(db).listWithCodes(),
      new WarehouseService(db).list({ activeOnly: true }),
    ]);

    // ── ÜLKE SORULMAZ, TÜRETİLİR (19.8) ──────────────────────────────────────
    // Eskiden burada `country: 'FR'` sabiti vardı. O sabit iki şeyi birden varsayıyordu: tek ülkede
    // hizmet verdiğimizi ve müşterinin Fransa'da olduğunu. İkincisi bir varsayım olarak kalamaz —
    // ülke KDV oranını belirler (`DOMAIN §5`).
    const lookup = resolvePlaceByPostalCode(postalCode, matches, zones, warehouses);

    // ── DÖRT HÂL EKRANA VERİ OLARAK GİDER (19.16b) ────────────────────────────
    // Önceki sürüm bu hâllerde `throw` ediyordu ve `ActionResult` hepsini tek bir `error: string`e
    // indiriyordu. Ekran belirsizlik seçicisini yazamıyordu: adayları göremiyor, hâli ancak hata
    // metnini ayrıştırarak anlayabilirdi — bir dizgi eşleştirmesi, üstelik üç dilde çalışmayan.
    // Metin ekranın işi (i18n orada); buradan çıkan şey VERİ.
    if (lookup.kind === 'unknown') return { data: { kind: 'unknown' }, error: null };

    if (lookup.kind === 'ambiguous') {
      // Kayıt tutulur ama HATA değil: müşterinin cevaplayabileceği meşru bir soru. Yine de iz
      // bırakıyoruz — hangi kodların gerçekten sorulduğunu bilmek veri kalitesinin ölçüsü.
      return {
        data: {
          kind: 'ambiguous',
          options: lookup.candidates.map((c) => ({ country: c.country, placeName: c.placeName, inRoute: c.inRoute })),
        },
        error: null,
      };
    }

    if (lookup.kind === 'unresolved') {
      // Bu ikisi BİZİM tarafımızın sorunu, o yüzden iz bırakılır: `no_shipping_warehouse` bir
      // yapılandırma eksiği, `ambiguous_zone` bir veri çakışması. Müşteriye ikisi de "bölge
      // dışısınız" diye görünmemeli — ekran sebebe göre farklı cümle kurar.
      await captureError(new Error(`Yer çözülemedi: ${lookup.reason}`), {
        source: SOURCES.webAction,
        context: { postalCode, country: lookup.country, reason: lookup.reason },
      });
      return { data: { kind: 'unresolved', reason: lookup.reason }, error: null };
    }

    const delivery = await resolveDelivery({ postalCode, country: lookup.country });

    // Bölge adı yalnız rota içinde bilinir. Motor aday tipini döndürür (ad taşımaz — karar için
    // gereksiz); adı kendi listemizden okuruz.
    const matched = findZoneForPostalCode({ country: lookup.country, postalCode }, zones);
    const zone = matched ? zones.find((z) => z.id === matched.id) : undefined;
    const inRoute = delivery.deliveryType === 'route';

    // Talep sayacı sonucu BEKLETMEZ ve hata verirse akışı kesmez: müşterinin sorusuna cevap
    // vermek asıl iş, sayaç yan üründür. Sayamamak yüzünden ekranın boş kalması saçma olurdu.
    void recordDemand(postalCode);

    return {
      data: {
        kind: 'resolved',
        place: {
          postalCode,
          country: lookup.country,
          // Rota dışında da dolu: "75011 Paris · kargo" artık yazılabiliyor (19.8). Yalnız kendi
          // bölge tablomuzda olan kodda null kalır — orada bölge adı zaten daha bilgilendirici.
          placeName: lookup.placeName,
          zoneName: inRoute ? (zone?.name ?? null) : null,
          inRoute,
          nextDate: delivery.availableDates[0] ?? null,
        },
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

async function recordDemand(postalCode: string): Promise<void> {
  try {
    await new DeliveryZoneService(serviceDb()).recordDemand(postalCode);
  } catch {
    // Sessiz: sayaç bir yan kayıt, müşterinin gördüğü hiçbir şeyi değiştirmez.
  }
}
