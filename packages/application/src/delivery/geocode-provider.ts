/**
 * Coğrafi kodlama fabrikası (11.9) — portu gerçek sağlayıcıya bağlayan tek yer.
 *
 * ── FR: MEVCUT İSTEMCİ, YENİ BAĞIMLILIK YOK ─────────────────────────────────
 * `packages/address-fr` zaten yazılı, anahtarsız ve ücretsiz (BAN / Géoplateforme, Etalab 2.0) —
 * müşterinin adres önerisi kutusu onu kullanıyor. Yeni npm paketi girmediği için `STACK §2` beyanı
 * gerekmedi.
 *
 * **`postcode` burada SERT SÜZGEÇ olarak veriliyor.** Otomatik tamamlamada bilerek verilmiyor
 * (müşteri hediye/iş adresi ararken başka şehri yazıyor olabilir — `ban-client` künyesi); burada
 * posta kodunu ZATEN BİLİYORUZ ve başka kodda çıkan sonuç aradığımız cevap değildir.
 *
 * ⚠ **AMA BU KISIT AYNI ZAMANDA BİR KÖRLÜK — ve künyenin eski hâli onu "doğru" diye savunuyordu.**
 * Kullanıcı ölçtü (01.09): `192c Rue du Maréchal Foch` yalnız **67380 Lingolsheim**'de var
 * (BAN kısıtsız: `housenumber`, score 0.973). Aynı satır **67000 Strasbourg** ile kaydedilince bu
 * fonksiyon `postcode=67000` pinliyor, BAN elindeki en iyisini veriyor — aynı adlı SOKAK, score
 * 0.717 — ve satır `precision: street` ile yazılıyor. Sonuç: **var olmayan bir kapıya çıkan sipariş,
 * 7,2 km ötede bir sokağın ortasına dizilmiş bir durak, ve hiçbir yerde uyarı.**
 *
 * Kısıt "yanlış posta kodu" hâlini yapısal olarak GÖRÜNMEZ kılıyor: kodu pinlediğimiz sürece
 * adresin başka kodda olduğunu öğrenmenin yolu yok. Çözüm kısıtı kaldırmak DEĞİL (o zaman hediye
 * adresi yanlış şehirde eşleşirdi) — ilk sonuç `housenumber` değilse **İKİNCİ ve kısıtsız** bir
 * sorgu atmak; iki hâl ancak böyle ayrılıyor: "kapı hiçbir yerde yok" (yeni yapı — yumuşak uyarı)
 * ile "kapı VAR ama başka kodda" (yazım hatası — düzeltme teklifi).
 *
 * Servisin `score`u da bugün ALINIP ATILIYOR (`GeocodeOutcome.score` taşıyor, kimse okumuyor,
 * kolonu yok) — oysa 0.973 ile 0.717 arasındaki fark aradığımız sinyalin ta kendisi.
 * BEKLEYEN(11.11)
 *
 * **`kind` süzgeci verilmiyor:** `housenumber` dayatmak, kapı numarası bilinmeyen adreste "eşleşme
 * yok" derdi. Kaba eşleşme atılmıyor — kaba OLDUĞU söyleniyor (`precision`).
 */

import { searchAddresses } from '@lezzet/address-fr';
import type { Geocoder, GeocodeOutcome, GeocodeQuery } from './geocode-port';

/**
 * Bu skorun altındaki eşleşme `no_match` sayılır. Parametrik ve makul seçildi: BAN'ın kendi skoru
 * 0..1 ve 0,4'ün altı pratikte "adresi bulamadım ama elimdeki en yakın satır bu" demek.
 */
const MIN_SCORE = 0.4;

/** BAN'a bakan kodlayıcı. Anahtarsız çalıştığı için her zaman var — yokluk yalnız ülke ekseninde. */
function banGeocoder(): Geocoder {
  return {
    async locate(query: GeocodeQuery): Promise<GeocodeOutcome> {
      if (query.country !== 'FR') return { status: 'unsupported_country' };

      const lookup = await searchAddresses({
        query: `${query.line1} ${query.postalCode} ${query.city}`.trim(),
        postalCode: query.postalCode,
        limit: 1,
      });

      if (lookup.status === 'too_short') return { status: 'no_match' };
      if (lookup.status !== 'ok') return lookup;

      const best = lookup.suggestions[0];
      if (!best || best.score < MIN_SCORE) return { status: 'no_match' };

      return {
        status: 'ok',
        point: { lat: best.latitude, lng: best.longitude },
        // Kademe servisin söylediğidir, bizim varsayımımız değil: `municipality` dönerse nokta
        // belediye merkezidir ve öyle kaydedilir.
        precision: best.kind,
        source: 'ban',
        score: best.score,
      };
    },
  };
}

/**
 * Ülkeye bakan kodlayıcı — bugün yalnız FR.
 *
 * Almanya için sağlayıcı **yok ve uydurulmuyor** (ADR-002 sınır ötesi rotaya izin veriyor, yani bu
 * gerçek bir boşluk): `unsupported_country` döner, nokta `null` kalır, tarama o satırları kuyrukta
 * tüketmez. İkinci kaynak takıldığı gün yalnız BU dosya değişir — çağıran hiç değişmez.
 */
export function geocoder(): Geocoder {
  return banGeocoder();
}

/** O ülke için koordinat çözümü açık mı — ekran "Almanya adresleri çözülemiyor" diyebilsin. */
export function geocoderConfigured(country: string): boolean {
  return country === 'FR';
}
