/**
 * Yer çözümü (19.3) — DOMAIN §17. **Posta kodu → bölge → warehouse.**
 *
 * Zincirin tamamı burada, tek yerde: adres bir bölgeye düşerse o bölgenin deposu, düşmezse shipping
 * deposu. Kargo dalı da tek depoya iner (K9: ülke başına en fazla bir aktif shipping deposu), bu
 * yüzden ortada bir "warehouse seçim algoritması" yoktur.
 *
 * ── BELİRSİZLİK ARTIK SESSİZ DEĞİL ───────────────────────────────────────────
 * `findZoneForPostalCode` aynı kodu içeren iki bölgede "ilki kazanır" diyordu. Tek depoda bunun
 * bedeli yanlış bir rota günüydü; çok depoda **siparişin yanlış depoya düşmesi** demek — mal bir
 * şehirde, sipariş başka şehirde. Bu yüzden burada belirsizlik bir cevap değil bir HATA'dır.
 * (Veritabanı da aynı şeyi söylüyor: posta kodu bağ tablosunda birincil anahtar. Motor onun saf
 * karşılığıdır — kural iki yerde de aynı, çünkü ikisi de kuralın kendisi.)
 *
 * ── ÜLKE ZİNCİRİN PARÇASIDIR ─────────────────────────────────────────────────
 * `67000` hem Fransa'da hem Almanya'da geçerlidir. Yer çözümü daima `(ülke, kod)` ikilisidir;
 * ülkesiz bir posta kodu eksik bir sorudur ve bu motor onu cevaplamaz.
 *
 * Saf: satırları çağıran getirir, karar burada verilir.
 */

import type { Country } from '@lezzet/types';
import { matchZones, type DeliveryZoneCandidate } from './delivery-days';

/** Motorun gördüğü asgari warehouse alanları (DB karşılığı `Warehouse`). */
export interface WarehouseCandidate {
  id: string;
  code: string;
  countryCode: Country;
  /** Kargo çıkış deposu mu — bölge dışı adresler buraya düşer. */
  shipsOnline: boolean;
  isActive: boolean;
}

/**
 * Bölge + bağlı warehouse (DB karşılığı `DeliveryZoneWithCodes`).
 *
 * `DeliveryZoneCandidate`'i GENİŞLETİR, kopyalamaz: rota günü kararı ile warehouse kararı aynı bölge
 * satırını okur; iki ayrı tip yazsaydık alan eklendiğinde biri güncellenip öteki unutulurdu.
 */
export interface ZoneWithWarehouse extends DeliveryZoneCandidate {
  warehouseId: string;
  isActive: boolean;
}

export type PlaceResolution =
  /** Adres bir rota bölgesine düştü: teslimat araçla, ücretsiz, kapıda ödeme mümkün. */
  | { kind: 'route'; warehouseId: string; zoneId: string; weekdays: readonly number[] }
  /** Bölge dışı: shipping deposundan gönderilir. */
  | { kind: 'shipping'; warehouseId: string }
  /**
   * Çözülemedi. `reason` ekranın ne diyeceğini belirler ve ikisi AYRI şeylerdir:
   * `no_shipping_warehouse` bizim eksiğimizdir (shipping deposu tanımlı değil) ve müşteriye "bölge
   * dışısınız" dedirtmemelidir — o bir yapılandırma arızasıdır, operatöre bildirilir.
   * `ambiguous_zone` ise veri çakışmasıdır: aynı kod iki bölgede.
   */
  | { kind: 'unresolved'; reason: 'no_shipping_warehouse' | 'ambiguous_zone' };

/**
 * Adresin (ülke + posta kodu) hangi depodan karşılanacağı.
 *
 * Pasif bölge YOK sayılır (rota kapalı) ama bu "shipping" demektir, "hizmet yok" değil: kapalı
 * bölgedeki müşteri kargoyla alışveriş yapabilir.
 */
export function resolveWarehouseForPostalCode(
  place: { country: Country; postalCode: string },
  zones: readonly ZoneWithWarehouse[],
  warehouses: readonly WarehouseCandidate[],
): PlaceResolution {
  // Eşleştirme TEK KAYNAKTAN (`matchZones`): kod normalizasyonu ve aktiflik kuralı iki yerde
  // yazılsaydı biri güncellenip öteki unutulurdu — ve fark ancak yanlış depoya düşen bir siparişle
  // görünürdü. Bu okumanın kendine ait olan tek şey belirsizliğe verdiği CEVAP.
  const matched = matchZones(place, zones);

  // İki aktif bölge aynı kodu tutuyorsa hangisinin geçerli olduğu BİLİNMEZ. Birini seçmek, yanlış
  // seçme ihtimalini sessizce kabul etmektir; sipariş yanlış depoya düşerse kimse sebebini aramaz.
  if (matched.length > 1) return { kind: 'unresolved', reason: 'ambiguous_zone' };

  const zone = matched[0];
  if (zone) {
    // Bölgenin deposu kapatılmışsa rota fiilen yoktur — müşteri kargoya düşer, hizmetsiz kalmaz.
    const warehouse = warehouses.find((w) => w.id === zone.warehouseId && w.isActive);
    if (warehouse) return { kind: 'route', warehouseId: warehouse.id, zoneId: zone.id, weekdays: zone.weekdays };
  }

  const shipping = warehouses.find((w) => w.isActive && w.shipsOnline && w.countryCode === place.country);
  if (!shipping) return { kind: 'unresolved', reason: 'no_shipping_warehouse' };
  return { kind: 'shipping', warehouseId: shipping.id };
}

/**
 * Ülke seçici gösterilmeli mi (C11).
 *
 * Cevap VERİDEN türer, bir ayardan değil: aktif depoların ve aktif bölgelerin kapsadığı ülke kümesi
 * 1'i aşıyorsa müşteriye sorulur. Yeni ülkede warehouse açıldığı gün seçici kendiliğinden belirir —
 * kimsenin bir bayrağı açması gerekmez, açmayı unutması da mümkün olmaz.
 *
 * Dış coğrafi servis YOKTUR ve olamaz: belirsizlik niyettedir (`67000` iki ülkede de geçerlidir),
 * hiçbir servis müşterinin hangisini kastettiğini bilemez. Site dili en fazla bir ÖN-SEÇİM ipucudur.
 */
export function activeCountries(
  zones: readonly ZoneWithWarehouse[],
  warehouses: readonly WarehouseCandidate[],
): Country[] {
  const countries = new Set<Country>();
  for (const w of warehouses) if (w.isActive) countries.add(w.countryCode);
  for (const z of zones) {
    if (!z.isActive) continue;
    for (const c of z.postalCodes) countries.add(c.country);
  }
  return [...countries].sort();
}

/** Ülke seçici görünsün mü — `activeCountries`'in evet/hayır hâli (çağrı yerini okunur kılar). */
export function needsCountryChoice(
  zones: readonly ZoneWithWarehouse[],
  warehouses: readonly WarehouseCandidate[],
): boolean {
  return activeCountries(zones, warehouses).length > 1;
}
