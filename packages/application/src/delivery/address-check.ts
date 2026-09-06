import type { SupabaseClient } from '@supabase/supabase-js';
import { AddressService } from '@lezzet/database';
import { addressVerdict, type AddressVerdict } from '@lezzet/domain-core';
import type { AddressGeoWrite } from '@lezzet/types';
import { captureError, SOURCES } from '@lezzet/observability';
import { geocoder as defaultGeocoder } from './geocode-provider';
import type { Geocoder } from './geocode-port';

/**
 * **"Bu kapı var mı" kapısı** (11.11) — servise sorar, kararı alır, satıra yazar.
 *
 * ── NE ZAMAN ÇALIŞIR: SİPARİŞ ANINDA, ADRES GİRİŞİNDE DEĞİL ────────────────
 * Kullanıcı kararı (02.09): müşteri on adres ekleyebilir ve her birini kaydederken doğrulamak, hiç
 * kullanılmayacak adresler için servise gitmek olurdu. Hangi adresi seçerse **sipariş anında** o
 * doğrulanır; düzeltme teklifi hem siparişin adresini hem KAYDI düzeltir.
 *
 * ── ENGEL DEĞİL: HER HÂLDE `ok` DÖNER ──────────────────────────────────────
 * Dönüş bir RET değil bir BİLGİDİR. Servis düşerse `unknown` döner ve çağıran hiçbir şey yapmaz —
 * bir dış servisin kesintisi satışı durduramaz (`FAIL-OPEN`, kullanıcı kararı 02.09). Adres defteri
 * de hiçbir hâlde reddetmez (10.08) ve bu kapı o kuralı bozmaz.
 *
 * ── İKİNCİ SORGU YALNIZ GEREKİRSE ──────────────────────────────────────────
 * Kapı ilk turda doğrulandıysa `elsewhere`e hiç çıkılmaz. Bugünkü veride yirmi adresin biri ikinci
 * sorguyu görüyor; yani maliyet sıfıra yakın ve bu bir hız ayarı değil, **servise saygı**.
 */

export type AddressCheckOutcome =
  | { status: 'confirmed' }
  /**
   * Kapı BAŞKA kodda bulundu. `label` EKRANA yazılan metin (servisin kendi yazımı, biz cümle
   * kurmayız); `postalCode`/`city` ise teklifi UYGULAMAK için — etiketi ayrıştırmak kırılgan olurdu.
   * Ölçülen vakada değişen tam olarak bu ikili: sokak+numara aynı, kod ve şehir farklı.
   */
  | { status: 'wrong_postal_code'; label: string; postalCode: string; city: string }
  /** Sokak var, kapı hiçbir yerde yok — yeni yapı olabilir; yalnız yumuşak uyarı. */
  | { status: 'street_only' }
  | { status: 'not_found' }
  /**
   * Sorulamadı: servis düştü, ülke desteklenmiyor, ya da satır okunamadı. **Susulur** —
   * "doğrulayamadım" ile "adres yanlış" ayrı şeylerdir ve ikincisini söylemek müşteriyi suçlamak
   * olurdu (`CLAUDE §1`: ölçülemeyen değer sıfır değildir).
   */
  | { status: 'unknown' };

export async function checkAddress(
  db: SupabaseClient,
  input: { addressId: string; geocoder?: Geocoder },
): Promise<AddressCheckOutcome> {
  const addresses = new AddressService(db);
  try {
    const [row] = await addresses.listByIds([input.addressId]);
    if (!row) return { status: 'unknown' };

    const service = input.geocoder ?? defaultGeocoder();
    const query = { line1: row.line1, postalCode: row.postalCode, city: row.city, country: row.country };

    const located = await service.locate(query);
    if (located.status === 'rate_limited' || located.status === 'unavailable' || located.status === 'invalid_response') {
      return { status: 'unknown' };
    }
    /* Ülkenin sağlayıcısı yoksa SUSULUR — bugün Almanya bu hâlde. "Doğrulayamadım"ı "adres yanlış"
       diye göstermek, hakkında hiçbir şey bilmediğimiz bir adresi suçlamak olurdu. */
    if (located.status === 'unsupported_country') return { status: 'unknown' };

    const matchedPrecision = located.status === 'ok' ? located.precision : null;

    /* İKİNCİ SORGU YALNIZ GEREKİRSE: kapı zaten doğrulandıysa soracak bir şey yok. */
    const alternatives = matchedPrecision === 'housenumber' ? [] : await elsewhereOf(service, query);
    if (alternatives === null) return { status: 'unknown' };

    const verdict = addressVerdict({ matchedPrecision, elsewhere: alternatives, postalCode: row.postalCode });
    await writeVerdict(addresses, { addressId: row.id, verdict, located });
    return toOutcome(verdict);
  } catch (error) {
    /* Bağlama KİMLİK yazılır, adres YAZILMAZ (`CLAUDE §1`): `addressId` teşhis için yeter ve o
       kimlikle veritabanına bakılır. Fırlatmıyoruz — bu kapı satışı durduramaz. */
    await captureError(error, {
      source: SOURCES.applicationDelivery,
      context: { flow: 'address_check', addressId: input.addressId },
    });
    return { status: 'unknown' };
  }
}

/** Kısıtsız arama; geçici arıza `null` döner ve çağıran SUSAR (boş liste ile karıştırılmaz). */
async function elsewhereOf(service: Geocoder, query: Parameters<Geocoder['locate']>[0]) {
  const found = await service.elsewhere(query);
  if (found.status === 'unavailable') return null;
  // `unsupported_country` burada boş listeyle EŞ: soru soruldu, cevap yok. Kararın kendisi zaten
  // "aday bulunamadı" dalını doğru işliyor.
  return found.status === 'ok' ? found.candidates : [];
}

/**
 * Kararın satıra yansıması. **Koordinat künyesi de TAZE yazılır**, yalnız etiket değil: az önce
 * ölçtüğümüz bir cevabın yanında bayat bir koordinat bırakmak, satırı kendi içinde çelişkili yapardı
 * — ve `address_geo_alt` kısıtı da tam olarak o çelişkiyi reddediyor.
 */
async function writeVerdict(
  addresses: AddressService,
  input: {
    addressId: string;
    verdict: AddressVerdict;
    located: { status: 'ok'; point: { lat: number; lng: number }; precision: AddressGeoWrite['geoPrecision']; source: AddressGeoWrite['geoSource'] } | { status: 'no_match' };
  },
): Promise<void> {
  const now = new Date().toISOString();
  const alt = input.verdict.kind === 'wrong_postal_code' ? input.verdict.suggestion.label : null;

  if (input.located.status === 'no_match') {
    // Nokta yok: künyenin beş alanı birlikte boşalır (`address_geo_meta`). Sayaç BURADA artmaz —
    // o taramanın muhasebesi (`nextGeoState`); bu kapı doğrulama yapar, kuyruk yönetmez.
    await addresses.update({
      id: input.addressId,
      lat: null,
      lng: null,
      geoPrecision: null,
      geoSource: null,
      geoAt: null,
      geoCheckedAt: now,
      geoAltLabel: alt,
    });
    return;
  }

  await addresses.update({
    id: input.addressId,
    lat: input.located.point.lat,
    lng: input.located.point.lng,
    geoPrecision: input.located.precision,
    geoSource: input.located.source,
    geoAt: now,
    geoCheckedAt: now,
    geoAltLabel: alt,
  });
}

function toOutcome(verdict: AddressVerdict): AddressCheckOutcome {
  switch (verdict.kind) {
    case 'confirmed':
      return { status: 'confirmed' };
    case 'wrong_postal_code':
      return {
        status: 'wrong_postal_code',
        label: verdict.suggestion.label,
        postalCode: verdict.suggestion.postalCode,
        city: verdict.suggestion.city,
      };
    case 'street_only':
      return { status: 'street_only' };
    case 'not_found':
      return { status: 'not_found' };
  }
}
