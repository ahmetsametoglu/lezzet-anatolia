/**
 * Coğrafi kodlama fabrikası (11.9) — portu gerçek sağlayıcıya bağlayan tek yer.
 *
 * ── İKİ ÜLKE, İKİ SAĞLAYICI, TEK PORT (13.09) ───────────────────────────────
 * · **FR → BAN** (`packages/address-fr`): anahtarsız, ücretsiz, koordinatı süresiz saklanabilir
 *   (Licence Ouverte). Yeni npm paketi girmediği için `STACK §2` beyanı gerekmedi.
 * · **DE → Google Address Validation** (`packages/address-google`; karar 02.09 `INTEGRATIONS.md`,
 *   bağlandı 13.09): tek çağrı geçerliliği, neyin düzeltildiğini, düzeltilmiş adresi VE noktayı
 *   veriyor. Anahtar yoksa ülke "desteklenmiyor" sayılır — adlı yokluk, sessiz bir eksik değil.
 * Çağıran hiç değişmedi: `checkAddress` ve tarama aynı `Geocoder`ı görüyor.
 *
 * ── BAN: `postcode` SERT SÜZGEÇ ─────────────────────────────────────────────
 * Otomatik tamamlamada bilerek verilmiyor (müşteri hediye/iş adresi ararken başka şehri yazıyor
 * olabilir — `ban-client` künyesi); burada posta kodunu ZATEN BİLİYORUZ ve başka kodda çıkan sonuç
 * aradığımız cevap değildir.
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
 * Servisin `score`u artık KULLANILIYOR: `addressVerdict` düzeltme teklifini 0,8 eşiğine bağlıyor —
 * 0,973 ile 0,717 arasındaki fark aradığımız sinyalin ta kendisiydi.
 *
 * **`kind` süzgeci verilmiyor:** `housenumber` dayatmak, kapı numarası bilinmeyen adreste "eşleşme
 * yok" derdi. Kaba eşleşme atılmıyor — kaba OLDUĞU söyleniyor (`precision`).
 *
 * ── GOOGLE: AYNI İKİ SORU, TEK ÇAĞRI ────────────────────────────────────────
 * Gövde sokak satırı + kod + şehir taşır; Google kodu DEĞİŞTİRDİYSE (`replacedPostalCode`) kapı
 * istenen kodda yoktur → `no_match`, ve `elsewhere` AYNI cevabın düzelttiği adresi tek aday olarak
 * taşır — ikinci kez ağa çıkılmaz. BAN'ın kısıtsız ikinci araması burada KULLANILMAZ: Google metin
 * araması değil bileşen doğrulaması yapar, bağlamı atınca rastgele bir kapı seçiyor (ölçüldü 13.09,
 * gerçek anahtarla: yalnız "Hauptstraße 1" → 84544 Aschau am Inn; müşteri 77694 Kehl'deydi). Skor
 * servisin bayraklarından türer (aşağıda): BAN'ın 0..1'ine karşılık gelen bir ölçek, ki
 * `addressVerdict`in 0,8 eşiği iki kaynakta da aynı anlama gelsin.
 */

import { searchAddresses } from '@lezzet/address-fr';
import { validateAddress, type AddressValidation } from '@lezzet/address-google';
import type { Country } from '@lezzet/types';
import { googleMapsApiKey, traceGoogleFailure } from './google-maps';
import type { Geocoder, GeocodeElsewhere, GeocodeOutcome, GeocodeQuery } from './geocode-port';

/**
 * Bu skorun altındaki eşleşme `no_match` sayılır. Parametrik ve makul seçildi: BAN'ın kendi skoru
 * 0..1 ve 0,4'ün altı pratikte "adresi bulamadım ama elimdeki en yakın satır bu" demek.
 */
const MIN_SCORE = 0.4;

/**
 * Kısıtsız aramada kaç aday. Küçük ve bilinçli: karar yalnız EN İYİ kapıyı ve onun rakibini
 * kullanıyor (`addressVerdict`), uzun liste ne kararı değiştirir ne ekrana çıkar. Ölçülen vakada
 * doğru cevap zaten ilk sıradaydı; rakip kontrolü için birkaç satır yeter.
 */
const ELSEWHERE_LIMIT = 5;

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

    /**
     * KISITSIZ arama (11.11) — `postcode` pini KALDIRILIR. Kısıtın körlüğünü açan tek yol bu.
     *
     * Ölçülen vaka: `192c Rue du Maréchal Foch` için pinli sorgu 0,717'lik Strasbourg SOKAĞINI
     * döndürüyor; pinsiz sorgu **0,973 ile 67380 Lingolsheim'daki kapıyı** buluyor — yani doğrusu
     * elimizdeymiş ve kısıt onu görmemizi engelliyormuş.
     *
     * **Şehir de sorguya girmez.** Yanlış posta koduyla gelen adresin şehri de çoğu zaman yanlıştır
     * (müşteri Strasbourg yazdı, adres Lingolsheim'da); şehri sorguya koymak aynı yanlışı ikinci kez
     * dayatır ve doğru cevabın skorunu düşürürdü.
     */
    async elsewhere(query: GeocodeQuery): Promise<GeocodeElsewhere> {
      if (query.country !== 'FR') return { status: 'unsupported_country' };

      const lookup = await searchAddresses({ query: query.line1.trim(), limit: ELSEWHERE_LIMIT });
      // `too_short` burada da geçici DEĞİL kalıcı bir yokluk, ama çağıran için ikisi de "susulacak"
      // hâl: aday yok. Boş liste bunu zaten söylüyor.
      if (lookup.status === 'too_short') return { status: 'ok', candidates: [] };
      if (lookup.status !== 'ok') return { status: 'unavailable' };

      return {
        status: 'ok',
        // Eşik ve ayıklama KARARIN işi (`addressVerdict`), burada değil: adaptör servisin dediğini
        // taşır, yorumlamaz. Skoru da servisin verdiği gibi geçer — biz yeniden sıralamayız.
        candidates: lookup.suggestions.map((suggestion) => ({
          label: suggestion.label,
          postalCode: suggestion.postalCode,
          city: suggestion.city,
          precision: suggestion.kind,
          score: suggestion.score,
        })),
      };
    },
  };
}

/**
 * Google'ın bayrakları → BAN ölçeğinde bir skor. Servis sayı vermiyor, üç bayrak veriyor; eşik
 * (`OFFER_MIN_SCORE` 0,8) iki kaynakta aynı anlama gelmeli: **kapı düzeyinde ve tam doğrulanmış**
 * adres teklif edilebilir, doğrulanmamış bileşeni olan da (yeni bina, tuhaf numara) eşiğin hemen
 * üstünde kalır — Google kodu DEĞİŞTİRMİŞSE bu bilinçli bir düzeltmedir, tahmin değil. Sokak
 * düzeyi eşiğin altında: teklif edilmez, yalnız "kapı doğrulanamadı" der (`addressVerdict`).
 */
function scoreOf(validation: AddressValidation): number {
  if (validation.precision === 'housenumber') return validation.complete && !validation.unconfirmed ? 0.95 : 0.85;
  if (validation.precision === 'street') return 0.6;
  return 0.2;
}

/** Google Address Validation'a bakan kodlayıcı — yalnız anahtar varken kurulur. */
function googleGeocoder(apiKey: string): Geocoder {
  /* İki soru, TEK çağrı: Google yanlış kodu kendisi düzeltir, yani `elsewhere`in cevabı `locate`in
     cevabının içinde. Aynı sorgu için ücretli uca ikinci kez çıkılmaz — son sorgunun cevabı
     tutulur (`checkAddress` ikisini aynı kodlayıcıyla arka arkaya soruyor). */
  let last: { key: string; lookup: ReturnType<typeof validateAddress> } | null = null;
  const validate = (query: GeocodeQuery): ReturnType<typeof validateAddress> => {
    const key = [query.country, query.line1, query.postalCode, query.city].join('\n');
    if (last?.key === key) return last.lookup;
    const lookup = validateAddress({ apiKey, country: query.country, line1: query.line1, postalCode: query.postalCode, city: query.city }).then((result) =>
      traceGoogleFailure('address_validation', result),
    );
    last = { key, lookup };
    return lookup;
  };

  return {
    async locate(query: GeocodeQuery): Promise<GeocodeOutcome> {
      const lookup = await validate(query);
      if (lookup.status === 'rate_limited') return lookup;
      // `denied`/`rejected` geçici DEĞİL ama çağıran için aynı: kapı susar (FAIL-OPEN). Adları
      // burada kaybolur, iz kaybolmaz — `traceGoogleFailure` yukarıda bıraktı.
      if (lookup.status !== 'ok') return { status: lookup.status === 'invalid_response' ? 'invalid_response' : 'unavailable' };

      const v = lookup.validation;
      // Nokta yoksa cevap yok: bu kapının varlık sebebi koordinat.
      if (v.latitude === null || v.longitude === null) return { status: 'no_match' };
      // Kodu Google DEĞİŞTİRDİYSE kapı istenen kodda yoktur — BAN'ın pinli sorgusunun "bulamadı"sı.
      // Doğrusunu `elsewhere` taşır; burada söylemek iki hâli tek kutuya sıkıştırırdı.
      if (v.replacedPostalCode) return { status: 'no_match' };
      const score = scoreOf(v);
      if (score < MIN_SCORE) return { status: 'no_match' };

      return { status: 'ok', point: { lat: v.latitude, lng: v.longitude }, precision: v.precision, source: 'google', score };
    },

    /**
     * "Kapı BAŞKA kodda mı" — `locate`in AYNI sorusu, aynı cevabı. BAN'dan farklı ve bilerek: BAN
     * bir metin aramasıdır ve yanlış kod doğru cevabın skorunu düşürür, o yüzden orada kod ve şehir
     * atılır; Google bileşen düzeyinde doğrular ve yanlış kodu sokak + şehirden DÜZELTİR. Bağlamı
     * atmak onu kör ediyor — ölçüldü 13.09: yalnız "Hauptstraße 1" soruldu, Google 84544 Aschau am
     * Inn'i seçti; müşteri 77694 Kehl'deydi (Almanya'da binlerce Hauptstraße var).
     */
    async elsewhere(query: GeocodeQuery): Promise<GeocodeElsewhere> {
      const lookup = await validate(query);
      if (lookup.status !== 'ok') return { status: 'unavailable' };

      const v = lookup.validation;
      // Adaylık için kod ve şehir şart: teklif yapılandırılmış alan yazar, etiket ayrıştırılamaz.
      if (v.postalCode === null || v.city === null || v.formattedAddress === null) return { status: 'ok', candidates: [] };
      return {
        status: 'ok',
        candidates: [{ label: v.formattedAddress, postalCode: v.postalCode, city: v.city, precision: v.precision, score: scoreOf(v) }],
      };
    },
  };
}

/**
 * Ülkeye bakan kodlayıcı — FR her zaman (BAN), DE anahtar varsa (Google).
 *
 * Ülkeyi SORGUDAN okur, çağırandan değil: aynı tarama bir turda iki ülkenin satırını görebiliyor.
 * Anahtarsız Almanya `unsupported_country` döner: nokta `null` kalır, tarama o satırları kuyrukta
 * tüketmez, sipariş anındaki doğrulama SUSAR (`checkAddress` künyesi).
 */
export function geocoder(): Geocoder {
  const ban = banGeocoder();
  const key = googleMapsApiKey();
  const google = key === null ? null : googleGeocoder(key);
  const pick = (country: Country): Geocoder | null => (country === 'FR' ? ban : google);

  return {
    locate: (query) => pick(query.country)?.locate(query) ?? Promise.resolve({ status: 'unsupported_country' }),
    elsewhere: (query) => pick(query.country)?.elsewhere(query) ?? Promise.resolve({ status: 'unsupported_country' }),
  };
}

/** O ülke için koordinat çözümü açık mı — ekran "Almanya adresleri çözülemiyor" diyebilsin. */
export function geocoderConfigured(country: string): boolean {
  if (country === 'FR') return true;
  return country === 'DE' && googleMapsApiKey() !== null;
}

/**
 * Tarama işi bu ülkenin satırlarını KENDİLİĞİNDEN çözsün mü (13.09).
 *
 * FR evet: BAN ücretsiz ve koordinat süresiz saklanabilir — bir kez çözülen satır bir daha
 * sorulmaz. DE HAYIR: Google ücretli (5.000/ay sonrası) ve koordinatı 30 günden uzun saklanamaz;
 * her Alman adresini ayda bir yeniden çözmek, hiç sipariş vermeyecek adresler için de para
 * ödemek olurdu. Alman adresi **sipariş anında** çözülür (`checkAddress`) — koordinatın gerçek
 * ömrü sipariş↔teslimat penceresi kadar (kullanıcı düzeltmesi 02.09) ve o pencere 30 günün içinde.
 */
export function geocoderScanAllowed(country: string): boolean {
  return country === 'FR';
}
