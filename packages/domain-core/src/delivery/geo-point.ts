/**
 * Koordinatın **makullük süzgeci** ve depo noktasının çözümü (11.9) — saf karar, I/O yok.
 *
 * ── NEDEN SÜZGEÇ GEREKLİ: İSTEMCİNİN SAYISI BİR BEYANDIR ────────────────────
 * Müşteri adres önerisini seçtiğinde koordinat zaten cevapta geliyor (`AddressSuggestion`), yani
 * onu yazmak bedava. Ama gelen sayı istemciden geçiyor ve `AddressWriteSchema.country`nin künyesi
 * bu tür alanlar için kuralı zaten koymuş: *"alan bir beyan değil, ADAYLAR ARASINDAN yapılmış bir
 * seçimdir."* Koordinat için karşılığı budur — nokta, adresin posta kodunun bilinen merkezine makul
 * bir uzaklıkta olmalı.
 *
 * Süzgeç düşerse nokta YAZILMAZ (`null`) ve satır tarama kuyruğuna düşer: yanlış bir koordinat,
 * koordinatsızlıktan kötüdür — koordinatsız durak "sırasız" der ve görünür, yanlış koordinatlı
 * durak kuryeyi sessizce başka mahalleye dizer.
 */

import { distanceKm, type GeoPoint } from './distance';

/**
 * Noktanın posta kodu merkezinden azami uzaklığı (km). Parametrik ve makul seçildi (sorulmadı):
 * Fransız posta kodları kırsalda geniş olabiliyor, 25 km bunları kapsarken bir yazım/sıra hatasının
 * ürettiği "başka şehir" sapmasını yakalar.
 */
export const MAX_POINT_DRIFT_KM = 25;

/** Fransa + Almanya'yı kapsayan kaba sınır kutusu — merkez bilinmediğinde son savunma hattı. */
const BOUNDS = { minLat: 41, maxLat: 56, minLng: -6, maxLng: 16 };

export type PointVerdict = 'ok' | 'not_finite' | 'out_of_bounds' | 'too_far';

/**
 * Aday nokta yazılabilir mi.
 *
 * `centroid` (posta kodunun bilinen merkezi) verilmezse yalnız sınır kutusuna bakılır — merkez
 * bilinmediği için "uzak mı" sorusu ÖLÇÜLEMEZ ve ölçülemeyen bir şey ihlal sayılmaz. Bu, aracın
 * kabul edici olduğu tek yer ve bilinçli: kendi referansı olmayan bir kod yüzünden gerçek bir
 * koordinatı atmak, elde olan tek ölçümü kaybetmek olurdu.
 */
export function pointVerdict(input: {
  point: GeoPoint | null | undefined;
  centroid?: GeoPoint | null;
  maxDriftKm?: number;
}): PointVerdict {
  const point = input.point;
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return 'not_finite';
  if (
    point.lat < BOUNDS.minLat ||
    point.lat > BOUNDS.maxLat ||
    point.lng < BOUNDS.minLng ||
    point.lng > BOUNDS.maxLng
  ) {
    return 'out_of_bounds';
  }

  const drift = distanceKm(point, input.centroid);
  if (drift === null) return 'ok';
  return drift > (input.maxDriftKm ?? MAX_POINT_DRIFT_KM) ? 'too_far' : 'ok';
}

/** `pointVerdict`in evet/hayır hâli — çağıranların çoğu sebebi değil sonucu istiyor. */
export function plausiblePoint(input: {
  point: GeoPoint | null | undefined;
  centroid?: GeoPoint | null;
  maxDriftKm?: number;
}): boolean {
  return pointVerdict(input) === 'ok';
}

/**
 * Deponun posta kodu — `warehouse.address` serbest bir jsonb (`z.record(z.unknown())`), yani tip
 * güvencesi YOK. Boş/eksik hâlde `null` döner ve o depo için hiçbir coğrafi hesap yapılmaz;
 * uydurma bir başlangıç noktası bütün turu sessizce yanlış dizerdi.
 *
 * İki yazım da kabul ediliyor (`postalCode` / `postal_code`): jsonb'nin şekli hiçbir yerde
 * zorlanmıyor ve iki yüzey iki türlü yazmış olabilir.
 */
export function warehousePostalCode(address: Record<string, unknown> | null | undefined): string | null {
  const raw = address?.postalCode ?? address?.postal_code;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

/**
 * Deponun noktası: **önce kendi kolonu, sonra posta kodu merkezi.**
 *
 * Kolon (11.9) operatörün haritada onayladığı noktadır ve her zaman kazanır. Merkez yalnız bir geri
 * düşüştür — depo noktası girilmemiş kurulumda rota yine de dizilebilsin diye. İkisi de yoksa
 * `null`: motor `no_start` der ve sebebini söyler.
 */
export function warehousePoint(input: {
  lat?: number | null;
  lng?: number | null;
  address?: Record<string, unknown> | null;
  centroidOf?: (postalCode: string) => GeoPoint | null | undefined;
}): GeoPoint | null {
  if (typeof input.lat === 'number' && typeof input.lng === 'number') {
    return { lat: input.lat, lng: input.lng };
  }

  const code = warehousePostalCode(input.address);
  if (!code || !input.centroidOf) return null;
  return input.centroidOf(code) ?? null;
}
