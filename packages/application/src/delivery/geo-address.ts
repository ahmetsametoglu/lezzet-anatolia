/**
 * Adresin koordinat künyesinin yazıldığı **tek kapı** (11.9).
 *
 * Her yazma yolu buradan geçer (web checkout, hesap adres defteri, mobil uç, operasyon paneli):
 * kural bir kez yazılır. Beş alan bölünemez — nokta olmadan kademe yazmak `address_geo_meta`
 * kısıtını ihlal eder, kademe olmadan nokta yazmak ölçümün inceliğini kaybeder.
 *
 * ── İSTEMCİNİN NOKTASI BEDAVA AMA BEYANDIR ──────────────────────────────────
 * Müşteri adres önerisini seçtiğinde koordinat zaten cevapta (`AddressSuggestion.latitude`) ve
 * bugüne dek çöpe atılıyordu — taşımak yeni bir ağ turu getirmiyor. Ama gelen sayı istemciden
 * geçiyor; `AddressWriteSchema.country`nin kuralı burada da geçerli: *"alan bir beyan değil,
 * ADAYLAR ARASINDAN yapılmış bir seçimdir."* Bu yüzden makullük süzgecinden geçiyor
 * (`plausiblePoint`) ve düşerse nokta yazılmıyor, satır tarama kuyruğuna giriyor.
 *
 * ── ADRES DEĞİŞİNCE NOKTA DÜŞER ─────────────────────────────────────────────
 * En kolay unutulan kural ve yazılmazsa en sinsi arıza: müşteri adresini düzeltir, kurye ESKİ
 * kapıya sıralanır. `updateCustomerAddress`teki *"ülke kodun peşinden gider"* mantığının aynısı.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { PostalCodePlaceService } from '@lezzet/database';
import { plausiblePoint } from '@lezzet/domain-core';
import type { AddressGeoPrecision, AddressGeoWrite } from '@lezzet/types';

/** İstemcinin taşıdığı aday nokta — öneriden gelir, formdan elle girilmez. */
export interface AddressPointCandidate {
  lat: number;
  lng: number;
  precision: AddressGeoPrecision;
}

/** Koordinatı olmayan (ya da düşürülen) adresin künyesi — tarama kuyruğunun girişi. */
const UNRESOLVED: AddressGeoWrite = {
  lat: null,
  lng: null,
  geoPrecision: null,
  geoSource: null,
  geoAt: null,
  geoCheckedAt: null,
  geoAttempts: 0,
};

/**
 * Yazılacak koordinat künyesi.
 *
 * @param current Düzenlemede satırın BUGÜNKÜ hâli — adres alanları değişmediyse nokta korunur.
 */
export async function resolveAddressPoint(
  db: SupabaseClient,
  input: {
    candidate?: AddressPointCandidate | null;
    postalCode: string;
    /** Düzenlemede: satırın mevcut adres alanları + noktası. Yeni kayıtta verilmez. */
    current?: {
      line1: string;
      postalCode: string;
      city: string;
      geo: AddressGeoWrite;
    } | null;
    /** Düzenlemede yazılacak yeni adres alanları — `current` ile karşılaştırılır. */
    next?: { line1: string; postalCode: string; city: string } | null;
  },
): Promise<AddressGeoWrite> {
  const candidate = input.candidate;

  if (candidate) {
    // Merkez bilinmiyorsa süzgeç kabul edici davranır (`geo-point` künyesi): kendi referansı olmayan
    // bir kod yüzünden gerçek bir koordinatı atmak, elde olan tek ölçümü kaybetmek olurdu.
    const centroid = await centroidOf(db, input.postalCode);
    if (plausiblePoint({ point: candidate, centroid })) {
      return {
        lat: candidate.lat,
        lng: candidate.lng,
        geoPrecision: candidate.precision,
        geoSource: 'ban',
        geoAt: new Date().toISOString(),
        geoCheckedAt: new Date().toISOString(),
        geoAttempts: 0,
      };
    }
    // Aday makul değil → nokta yazılmaz ve satır kuyruğa düşer. Yanlış bir koordinat,
    // koordinatsızlıktan kötüdür: koordinatsız durak "sırasız" der ve GÖRÜNÜR.
    return UNRESOLVED;
  }

  // Aday yok. Düzenlemede adres alanları değişmediyse mevcut nokta korunur.
  if (input.current && input.next && !addressChanged(input.current, input.next)) {
    return input.current.geo;
  }

  return UNRESOLVED;
}

function addressChanged(
  current: { line1: string; postalCode: string; city: string },
  next: { line1: string; postalCode: string; city: string },
): boolean {
  return (
    norm(current.line1) !== norm(next.line1) ||
    norm(current.postalCode) !== norm(next.postalCode) ||
    norm(current.city) !== norm(next.city)
  );
}

const norm = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

async function centroidOf(db: SupabaseClient, postalCode: string) {
  const rows = await new PostalCodePlaceService(db).findByPostalCode(postalCode);
  const withPoint = rows.find((row) => row.lat !== null && row.lng !== null);
  return withPoint ? { lat: Number(withPoint.lat), lng: Number(withPoint.lng) } : null;
}
