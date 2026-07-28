'use server';

import { DeliveryZoneService, serviceDb } from '@lezzet/database';
import { findZoneForPostalCode } from '@lezzet/domain-core';
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

    const [delivery, zones] = await Promise.all([
      resolveDelivery({ postalCode }),
      new DeliveryZoneService(serviceDb()).list({ activeOnly: true }),
    ]);

    // Bölge adı yalnız rota içinde bilinir; rota dışında şehir adı UYDURULMAZ (`place-types`).
    // Motor aday tipini döndürür (ad taşımaz — karar için gereksiz); adı kendi listemizden okuruz.
    const matched = findZoneForPostalCode(postalCode, zones);
    const zone = matched ? zones.find((z) => z.id === matched.id) : undefined;
    const inRoute = delivery.deliveryType === 'route';

    // Talep sayacı sonucu BEKLETMEZ ve hata verirse akışı kesmez: müşterinin sorusuna cevap
    // vermek asıl iş, sayaç yan üründür. Sayamamak yüzünden ekranın boş kalması saçma olurdu.
    void recordDemand(postalCode);

    return {
      data: {
        postalCode,
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

/**
 * Kapıya teslim ettiğimiz posta kodları — hapa tıklayan müşteri "benimki var mı" diye bakabilsin.
 *
 * Liste operatörün elle kurduğu bir küme (CLAUDE.md §1: doğal tavanı olan), tek turda okunur.
 * Guard yok: hangi bölgelere gittiğimiz zaten vitrinde söylenen bir şey, sır değil.
 */
export async function listDeliveryZonesAction(): Promise<ActionResult<{ name: string; postalCodes: string[] }[]>> {
  try {
    const zones = await new DeliveryZoneService(serviceDb()).list({ activeOnly: true });
    return { data: zones.map((z) => ({ name: z.name, postalCodes: z.postalCodes })), error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
