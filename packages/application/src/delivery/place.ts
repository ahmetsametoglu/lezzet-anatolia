import { DeliveryZoneService, PostalCodePlaceService, WarehouseService } from '@lezzet/database';
import { findShippingWarehouse, resolvePlaceByPostalCode, type PostalCodeResolution } from '@lezzet/domain-core';
import { normalizePostalCode } from '@lezzet/helper';
import type { Country } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { PlaceWarehouses } from '../catalog/storefront-types';

/*
  Yer çözümünün girdileri burada toplanır, karar motordadır. Çözülmüş depo kimliği istemciye verilmez ve istemciden alınmaz:
  istemcinin yazabildiği bir değer hangi deponun stoğunu göstereceğimizi belirleyemez.
*/

/**
 * Bölgeler aktiflik süzgecisiz okunur: pasif bölgenin kodu da bizim kaydımızdır, süzülseydi kapalı bölgedeki müşteri "tanımadık"
 * cevabı alırdı. `country` bir seçimdir ve adayları süzer; kod o ülkede yoksa çözüm `unknown`a düşer.
 */
export async function resolvePlaceForPostalCode(db: SupabaseClient, postalCode: string, country?: Country): Promise<PostalCodeResolution> {
  const code = normalizePostalCode(postalCode);
  const [matches, zones, warehouses] = await Promise.all([
    new PostalCodePlaceService(db).findByPostalCode(code),
    new DeliveryZoneService(db).listWithCodes(),
    // Yalnız tesisler; `readDeliveryInputs` ile aynı süzgeç.
    new WarehouseService(db).list({ activeOnly: true, kind: 'facility' }),
  ]);
  const scoped = country ? matches.filter((match) => match.country === country) : matches;
  return resolvePlaceByPostalCode(code, scoped, zones, warehouses);
}

/**
 * Çözümün `warehouseId`i kargo hâlinde kargo deposunu taşır; burada yalnız rota deposu olarak yayılır, yoksa rota dışındaki müşteri
 * "ücretsiz kapı teslimi" görürdü. Çözülemeyen kodda iki kimlik de `null`dur: tahmin, yanlış stok ve yanlış teslimat sözü demek.
 */
export async function resolvePlaceWarehouses(db: SupabaseClient, postalCode: string, country?: Country): Promise<PlaceWarehouses> {
  const [resolution, warehouses] = await Promise.all([
    resolvePlaceForPostalCode(db, postalCode, country),
    // Araç zaten kargo deposu olamaz; tesis süzgeci sonucu değiştirmez, listeyi niyetiyle uyumlu tutar.
    new WarehouseService(db).list({ activeOnly: true, kind: 'facility' }),
  ]);

  if (resolution.kind !== 'route' && resolution.kind !== 'shipping') return UNRESOLVED_PLACE;

  return {
    // Kargo hâlinde `null` ki yerel havuz boş kalsın.
    warehouseId: resolution.kind === 'route' ? resolution.warehouseId : null,
    // Kargo deposu ülkeden türer, rotadan değil: rota içindeki müşteri de kargo dolgusu alabilir.
    shippingWarehouseId: findShippingWarehouse(resolution.country, warehouses)?.id ?? null,
  };
}

/** İki `null` bir hâldir: yer bilinmiyor. */
export const UNRESOLVED_PLACE: PlaceWarehouses = { warehouseId: null, shippingWarehouseId: null };

/**
 * Adres defteri hizmet alanını bilmez: ülke depo tablosundan değil referansın kendisinden türer ve kayıt hiçbir hâlde reddedilmez.
 * İstemcinin ülkesi bir seçim olarak kodun geçerli ülkeleriyle kesiştirilir, çünkü ülke KDV'yi belirler; `null` kolon varsayılanına
 * bırakır.
 */
export async function resolveAddressCountry(
  db: SupabaseClient,
  input: { postalCode: string; country?: Country },
): Promise<Country | null> {
  const matches = await new PostalCodePlaceService(db).findByPostalCode(normalizePostalCode(input.postalCode));
  const options = matches.map((match) => match.country);

  // Referansın tanımadığı kodda müşterinin seçimi tek bilgimizdir.
  if (options.length === 0) return input.country ?? null;
  if (input.country !== undefined) return options.includes(input.country) ? input.country : null;
  // Birden çok ülkede geçerli kodda tahmin edilmez: adayların farkı KDV oranıdır, seçim müşterinin.
  return options.length === 1 ? (options[0] ?? null) : null;
}
