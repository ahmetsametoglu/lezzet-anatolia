'use server';

import { DeliveryZoneService, PostalCodePlaceService, WarehouseService, serviceDb } from '@lezzet/database';
import { findZoneForPostalCode, resolvePlaceByPostalCode } from '@lezzet/domain-core';
import { captureError, SOURCES } from '@lezzet/observability';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { resolveDelivery } from '@/lib/order/delivery';
import { isValidPostalCode, normalizePostalCode, type DeliveryPlace } from './place-types';

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
export async function resolvePlaceAction(rawPostalCode: string): Promise<ActionResult<DeliveryPlace>> {
  try {
    const postalCode = normalizePostalCode(rawPostalCode);
    if (!isValidPostalCode(postalCode)) throw new Error('Posta kodu 5 haneli olmalı');

    const db = serviceDb();
    const [matches, zones, warehouses] = await Promise.all([
      new PostalCodePlaceService(db).findByPostalCode(postalCode),
      new DeliveryZoneService(db).listWithCodes({ activeOnly: true }),
      new WarehouseService(db).list({ activeOnly: true }),
    ]);

    // ── ÜLKE SORULMAZ, TÜRETİLİR (19.8) ──────────────────────────────────────
    // Eskiden burada `country: 'FR'` sabiti vardı. O sabit iki şeyi birden varsayıyordu: tek ülkede
    // hizmet verdiğimizi ve müşterinin Fransa'da olduğunu. İkincisi bir varsayım olarak kalamaz —
    // ülke KDV oranını belirler (`DOMAIN §5`).
    const lookup = resolvePlaceByPostalCode(postalCode, matches, zones, warehouses);

    if (lookup.kind === 'unknown') {
      // Yazım hatası. Eskiden bu hâl YOKTU: geçersiz kod sessizce "bölge dışı → kargo" oluyordu ve
      // müşteri hiç ulaşmayacak bir siparişe kadar gidebiliyordu.
      throw new Error('Bu posta kodunu tanımadık — kontrol eder misiniz?');
    }
    if (lookup.kind === 'ambiguous') {
      // BEKLEYEN(19.7): iki somut yer gösterilip müşteriye seçtirilecek. Bugün oluşamaz (tek ülke
      // aktif) ama sessizce birini seçmiyoruz — yanlış ülke yanlış vergi demek.
      await captureError(new Error(`Posta kodu ${postalCode} birden çok ülkede geçerli`), {
        source: SOURCES.webAction,
        context: { postalCode, countries: lookup.candidates.map((c) => c.country) },
      });
      throw new Error('Bu posta kodu birden çok ülkede geçerli — seçim ekranı henüz hazır değil.');
    }
    if (lookup.kind === 'unresolved') {
      // İki sebep, iki AYRI cümle: `no_shipping_warehouse` "oraya gönderemiyoruz" (kod geçerli, biz
      // ulaşamıyoruz), `ambiguous_zone` ise BİZİM veri çakışmamız — müşteriye "bölge dışısınız"
      // dedirtmemeli, operatöre bildirilmeli.
      await captureError(new Error(`Yer çözülemedi: ${lookup.reason}`), {
        source: SOURCES.webAction,
        context: { postalCode, country: lookup.country, reason: lookup.reason },
      });
      throw new Error(
        lookup.reason === 'no_shipping_warehouse'
          ? 'Bu bölgeye şu an gönderim yapamıyoruz.'
          : 'Bu posta kodunu çözemedik; ekibimize bildirildi.',
      );
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
        postalCode,
        country: lookup.country,
        // Rota dışında da dolu: "75011 Paris · kargo" artık yazılabiliyor (19.8).
        placeName: lookup.placeName,
        zoneName: inRoute ? (zone?.name ?? null) : null,
        inRoute,
        nextDate: delivery.availableDates[0] ?? null,
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
