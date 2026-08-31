/**
 * Koordinatı çözülmemiş adreslerin taraması (11.9) — **taramalı ve idempotent** (`STACK §13`).
 *
 * ── AYRI BİR "GERİ DOLDURMA" BETİĞİ YOK, ÇÜNKÜ BU ZATEN ODUR ────────────────
 * Tarama tanımı gereği "noktası olmayan satırları bulup doldurur". İkinci bir betik aynı seçim
 * sorgusunu, aynı parti frenini ve aynı sayaç mantığını **ikinci kez** yazmak olurdu (`CLAUDE §1`)
 * ve ikisi bir gün ayrışırdı. Elle tetikleme aynı fonksiyonu daha büyük partiyle çağırır.
 *
 * ── BU İŞ TELAFİDİR, BİRİNCİL YOL DEĞİL (kullanıcı düzeltmesi 31.08) ────────
 * Asıl yol öneriye tıklamaktır: BAN koordinatı zaten o cevapta gönderiyor ve `resolveAddressPoint`
 * onu kayıtla birlikte yazıyor — ikinci bir ağ çağrısı yok, gecikme yok.
 *
 * İlk sürümde sıra TERS kurulmuştu (bu iş birincil, öneri bağlantısı `BEKLEYEN`) ve gerekçesi de
 * abartılıydı: "senkron çağrı BAN kotasını tüketir" denmişti, oysa o kural OTOMATİK TAMAMLAMA için
 * geçerli (her tuş vuruşunda çağrı) — adres KAYDETME müşteri başına yılda birkaç kez olan bir
 * işlemdir ve IP başına saniyelik bir sınırı zorlayamaz.
 *
 * Geriye kalan ve gerçek olan iş: öneriye tıklamadan ELLE yazılan adres · operasyon panelinden
 * girilen sipariş adresi (orada öneri kutusu yok) · makullük süzgecinden düşen aday · servis o an
 * düştüyse yeniden deneme · ve ileride Almanya sağlayıcısı eklendiğinde birikmiş DE satırlarının
 * toplu çözümü. Hepsi azınlık; iş bu yüzden seyrek koşuyor ve kuyruk boşken tek sorguyla no-op.
 *
 * ── SAYAÇ YALNIZ CEVAPLI RET'TE ARTAR ───────────────────────────────────────
 * `no_match` = servis cevapladı, adres muhtemelen hatalı → sayaç artar, satır seyrekleşir ve
 * sonunda kuyruktan düşer. `unavailable`/`rate_limited` = geçici → yalnız damga ilerler. Ayrım
 * olmasaydı servisin düştüğü bir öğleden sonra yüzlerce adres kalıcı "çözülemez" damgası yerdi.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { AddressService } from '@lezzet/database';
import type { Address } from '@lezzet/types';
import { captureError, SOURCES } from '@lezzet/observability';
import { geocoder as defaultGeocoder } from './geocode-provider';
import type { Geocoder, GeocodeOutcome } from './geocode-port';

/** Bir turda kaç satır — küçük tutuluyor: tur sık koşuyor ve servisi dövmemek gerekiyor. */
const BATCH = 20;
/** Kaç CEVAPLI ret'ten sonra satır kuyruktan düşer. */
const MAX_ATTEMPTS = 3;

/** Taramanın bir satır için verdiği karar — yazılacak alanlar + hangi kovaya sayıldığı. */
export interface GeoScanDecision {
  patch: {
    lat?: number;
    lng?: number;
    geoPrecision?: 'housenumber' | 'street' | 'locality' | 'municipality';
    geoSource?: 'ban' | 'manual';
    geoAt?: string;
    geoCheckedAt: string;
    geoAttempts?: number;
  };
  bucket: 'located' | 'noMatch' | 'deferred';
}

/**
 * **Saf karar** — servis ne dediyse satıra ne yazılacağı. DB'siz olduğu için şerit kendi testini
 * koşabiliyor (`CLAUDE §4b`); yazma tarafı entegrasyonda kalıyor.
 *
 * Ayrımın kalbi: **`no_match` sayacı tüketir, geçici hâller tüketmez.** Olmasaydı servisin düştüğü
 * bir öğleden sonra yüzlerce adres kalıcı "çözülemez" damgası yer ve bir daha hiç denenmezdi.
 */
export function nextGeoState(
  outcome: GeocodeOutcome,
  current: { geoAttempts: number },
  now: string,
): GeoScanDecision {
  if (outcome.status === 'ok') {
    return {
      patch: {
        lat: outcome.point.lat,
        lng: outcome.point.lng,
        geoPrecision: outcome.precision,
        geoSource: outcome.source,
        geoAt: now,
        geoCheckedAt: now,
        geoAttempts: 0,
      },
      bucket: 'located',
    };
  }

  if (outcome.status === 'no_match') {
    return { patch: { geoCheckedAt: now, geoAttempts: current.geoAttempts + 1 }, bucket: 'noMatch' };
  }

  // `rate_limited` · `unavailable` · `invalid_response` · `unsupported_country`: damga ilerler,
  // sayaç DURUR. Almanya bugün kalıcı olarak bu daldadır (sağlayıcı yok) ve sonsuza dek denenmez —
  // satır kuyrukta kalır ama sayacı tüketilmediği için ikinci bir kaynak takıldığı gün çözülür.
  return { patch: { geoCheckedAt: now }, bucket: 'deferred' };
}

export interface GeocodeScanResult {
  scanned: number;
  located: number;
  /** Servis "eşleşme yok" dedi — sayaç arttı. */
  noMatch: number;
  /** Geçici arıza ya da desteklenmeyen ülke — sayaç ARTMADI, satır kuyrukta kaldı. */
  deferred: number;
}

export async function geocodeAddressesScan(
  db: SupabaseClient,
  options: {
    geocoder?: Geocoder;
    limit?: number;
    /**
     * Taranacak satırlar — **testler kendi kümesini KENDİ verir.**
     *
     * Bu bir kolaylık değil, yaşanmış bir arızanın çaresi (03.08 `translate-user-text`): küresel
     * tarayan bir işin testi, sahte cevabı 29 GERÇEK satıra yazdı. Burada aynı hata 29 adrese
     * yanlış koordinat yazmak olurdu — üstelik paylaşılan veritabanında başka şeridin verisini.
     */
    rows?: readonly Address[];
  } = {},
): Promise<GeocodeScanResult> {
  const addresses = new AddressService(db);
  const geocoder = options.geocoder ?? defaultGeocoder();
  const limit = options.limit ?? BATCH;

  const queue = options.rows ?? (await addresses.listMissingGeo({ limit, maxAttempts: MAX_ATTEMPTS }));
  const result: GeocodeScanResult = { scanned: queue.length, located: 0, noMatch: 0, deferred: 0 };

  for (const address of queue) {
    const now = new Date().toISOString();
    try {
      const outcome = await geocoder.locate({
        line1: address.line1,
        postalCode: address.postalCode,
        city: address.city,
        country: address.country,
      });

      const decision = nextGeoState(outcome, address, now);
      await addresses.update({ id: address.id, ...decision.patch });
      result[decision.bucket] += 1;
    } catch (error) {
      // Bağlama KİMLİK yazılır, adres/koordinat YAZILMAZ (`CLAUDE §1`): `addressId` teşhis için
      // yeter ve o kimlikle veritabanına bakılır.
      await captureError(error, {
        source: SOURCES.backendCron,
        context: { flow: 'geocode_scan', addressId: address.id },
      });
      result.deferred += 1;
    }
  }

  return result;
}
