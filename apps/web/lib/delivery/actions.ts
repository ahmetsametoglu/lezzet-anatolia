'use server';

import { isValidPostalCode, normalizePostalCode, placeLabel } from '@lezzet/address';
import { suggestPlaces } from '@lezzet/application';
import { DeliveryZoneService, PostalCodePlaceService, WarehouseService, serviceDb } from '@lezzet/database';
import { resolvePlaceByPostalCode } from '@lezzet/domain-core';
import { captureError, SOURCES } from '@lezzet/observability';
import type { Country, PlaceOption } from '@lezzet/types';
import { CustomerError, customerErrorKey, type CustomerResult } from '@/lib/customer-error';
import { recordEvent } from '@/lib/analytics/record';
import { describePlace } from './describe-place';
import type { PlaceLookup } from './place-types';

/**
 * Guard yok: soru ziyaretçiye de açık. Checkout'un teslimat çözümüne sorar, kuralı yeniden yazmaz; sepet bilinmediği için "kargo
 * tamamen kapalı mı" sorusu burada sorulmaz.
 */
export async function resolvePlaceAction(rawPostalCode: string, chosenCountry?: Country): Promise<CustomerResult<PlaceLookup>> {
  try {
    const postalCode = normalizePostalCode(rawPostalCode);
    if (!isValidPostalCode(postalCode)) throw new CustomerError('postal_code_invalid');

    const db = serviceDb();
    const [matches, zones, warehouses] = await Promise.all([
      new PostalCodePlaceService(db).findByPostalCode(postalCode),
      // Bölgeler aktiflik süzgecisiz: pasif bölgenin kodu da bizim kaydımızdır, rotanın açıklığına motor karar verir.
      new DeliveryZoneService(db).listWithCodes(),
      // Yalnız tesisler; `readDeliveryInputs` ile aynı süzgeç.
      new WarehouseService(db).list({ activeOnly: true, kind: 'facility' }),
    ]);

    // Ülke verilmezse koddan türer, verilirse kod o ülkeye bağlanır; ülke KDV oranını belirlediği için varsayılamaz.
    const lookup = resolvePlaceByPostalCode(postalCode, matches, zones, warehouses, chosenCountry);

    // Dört hâl ekrana veri olarak gider; cümleyi ekran kurar.
    if (lookup.kind === 'unknown') {
      // Çözülemeyen kod da huninin ilk adımında sayılır; talep sayacı yalnız çözülen kodu sayar.
      void recordEvent({ type: 'place_resolved', resolved: false });
      return { data: { kind: 'unknown' }, errorKey: null };
    }

    if (lookup.kind === 'ambiguous') {
      // Belirsizlik yalnız ülke verilmediğinde çıkar ve cevap müşterinindir; seçim `chosenCountry` olarak geri gelir.
      return {
        data: {
          kind: 'ambiguous',
          // Ad türetilir, taşınmaz; nasıl gösterileceği seçicinin kararı.
          options: lookup.candidates.map((c) => ({
            country: c.country,
            placeName: placeLabel(c.places),
            places: [...c.places],
            inRoute: c.inRoute,
          })),
        },
        errorKey: null,
      };
    }

    if (lookup.kind === 'unresolved') {
      // İki sebep de bizim tarafımızın sorunu olduğu için iz bırakılır; ekran sebebe göre ayrı cümle kurar.
      await captureError(new Error(`Yer çözülemedi: ${lookup.reason}`), {
        source: SOURCES.webAction,
        context: { postalCode, country: lookup.country, reason: lookup.reason },
      });
      return { data: { kind: 'unresolved', reason: lookup.reason }, errorKey: null };
    }

    return await finishResolved(postalCode, { country: lookup.country, placeName: lookup.placeName, places: lookup.places }, zones, matches);
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/**
 * Tarif layout'un ilk karesiyle ortaktır (`describePlace`); burada kalan niyetin sayımıdır, çünkü tarif her render'da koşar, sayım
 * yalnız müşteri sorduğunda.
 */
async function finishResolved(
  postalCode: string,
  identity: { country: Country; placeName: string | null; places: readonly string[] },
  zones: Awaited<ReturnType<DeliveryZoneService['listWithCodes']>>,
  /** Çağıranda zaten okunmuş; ikinci sorgu yok. */
  matches: readonly { country: Country; lat: number | null; lng: number | null }[],
): Promise<CustomerResult<PlaceLookup>> {
  // Sayaç cevabı bekletmez ve hata verirse akışı kesmez: asıl iş müşterinin sorusu.
  void recordDemand(postalCode);

  // Huni kaç kişinin yeri çözdüğünü sayar, talep sayacı hangi kodun sorulduğunu; posta kodu olay defterine girmez.
  void recordEvent({ type: 'place_resolved', resolved: true });

  return { data: { kind: 'resolved', place: await describePlace(postalCode, identity, zones, matches) }, errorKey: null };
}

/**
 * Onay eyleminden ayrı, çünkü o her sorulan kodu talep sayacına yazar; öneri yalnız okur. Hata hâlinde boş liste döner: öneri bir
 * kolaylıktır, müşteri kodu elle yazıp devam eder.
 */
export async function suggestPostalCodesAction(prefix: string): Promise<PlaceOption[]> {
  const normalized = normalizePostalCode(prefix);
  // Servisin eşiği (kodda iki hane, adda üç harf) burada da uygulanır ki kısa terim için sunucu turu harcanmasın.
  if (normalized.length < (/\p{L}/u.test(normalized) ? 3 : 2)) return [];
  try {
    // Öneri `suggestPlaces`ten geçer ki ad türetme kuralı tek yerde kalsın ve iki yüzey aynı cevabı görsün.
    return await suggestPlaces(serviceDb(), normalized);
  } catch (err) {
    await captureError(err, { source: SOURCES.webAction, context: { prefix: normalized } });
    return [];
  }
}

async function recordDemand(postalCode: string): Promise<void> {
  try {
    await new DeliveryZoneService(serviceDb()).recordDemand(postalCode);
  } catch {
    // Sayaç yan kayıttır ve müşterinin gördüğü hiçbir şeyi değiştirmez; bu yüzden hata yutulur.
  }
}
