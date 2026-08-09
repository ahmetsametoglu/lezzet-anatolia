import type { Country } from '@lezzet/types';

/**
 * Teslimat yeri (K30-K33) — müşterinin "nereye getirelim" cevabı.
 *
 * **Kısıt ürünün değil ADRESİN özelliğidir** (tasarım sözleşmesi §7). Soğuk zincirle taşınan ürün
 * kargoya verilemez; yani "bu ürünü alabilir miyim" sorusunun cevabı ürüne değil, teslimat yerine
 * bağlıdır. Müşteri yeri BİR KEZ söyler, her yüzey ona göre konuşur.
 *
 * **Adres değil, yalnız POSTA KODU tutulur.** Teslimat şeklini belirleyen tek şey o: kod aktif bir
 * bölgeye düşüyorsa kapıya teslim, düşmüyorsa kargo. Sokak/numara checkout'un işi — burada sormak
 * hem gereksiz hem de kişisel veriyi erkene çeker.
 *
 * **Yer bilinmiyorsa (`null`)** hiçbir şey kilitlenmez: başlık "Teslimat yerinizi seçin" der,
 * uyarılar "muhtemel" tonunda kalır. Soru cevaplanmamış olmak bir hata hâli değildir.
 *
 * **Bir SÖZDÜR, bir FİLTRE DEĞİLDİR.** Hiçbir yerde sepete eklemeyi engellemez: müşteri bölge
 * içindeki birine gönderiyor olabilir (tasarım: "yine de sepete ekle"). Yer bilgisi yalnız neyin
 * mümkün olduğunu söyler ve her uyarının yanında bir çıkış bırakır.
 */

/**
 * Müşterinin CEVABI — saklanan tek şey (19.9).
 *
 * Çerez bunu taşır, çözümü değil: `warehouseId`, `zoneId`, `nextDate` yazılmaz. Üç gerekçe:
 *
 * 1. **Çerezi istemci yazabilir.** Çözülmüş depo kimliğini oradan okursak, uydurulmuş bir çerez
 *    hangi deponun stoğunu göstereceğimizi belirler. Cevabı okuyup depoyu her istekte kendimiz
 *    çözersek bu sınıf tamamen kapanır.
 * 2. **Ucuz.** Bölge, depo ve posta kodu listeleri önbellekte; çözüm sıcak yolda DB'ye gitmiyor.
 * 3. **`nextDate` zaten bayatlar.** Kesim saati geçince "en yakın teslimat" kayar; çereze tarih
 *    yazmak o bayatlığı kalıcı hâle getirirdi.
 *
 * `country` da saklanır çünkü TÜRETİLEMEYEBİLİR: 610 kod iki ülkede birden geçerli ve o hâlde ülke
 * müşterinin cevabıdır. İkinci kez sormamak için tutuyoruz.
 */
export interface PlaceAnswer {
  country: Country;
  postalCode: string;
}

/**
 * `ambiguous` hâlinde müşteriye sunulan seçenek (19.16b). Ülke DEĞİL, tanınabilir bir YER
 * gösterilir — "Fransa mı Almanya mı" sorusu müşteriye bir şey ifade etmez, "Bischwiller mi
 * Bobenheim-Roxheim mi" eder.
 */
export interface PlaceOption {
  country: Country;
  /** Kodun tartışmasız adı — çok yerleşimliyse `null`, o hâlde `places` kullanılır (19.17). */
  placeName: string | null;
  /**
   * Kodun o ülkedeki tüm yerleşimleri (19.17) — **etiketi ekran kurar.**
   *
   * Belirsizlik seçicisinin işi "Fransa mı Almanya mı" değil "hangi yer" sorusunu sordurmak; ülke
   * adı müşteriye bir şey ifade etmez, "67240 · Bischwiller, Gries, Kaltenhouse +4" ile
   * "67240 · Bobenheim-Roxheim" arasında ise seçim yapılabilir. Kaç ad yazılıp nerede "+X"e
   * geçileceği bu şeridin kararı — veri tarafı bir biçim dayatmaz.
   */
  places: string[];
  /** Rota bölgemize düşüyor mu — liste bunu önce gösterir (daha olası cevap). */
  inRoute: boolean;
}

/**
 * Autocomplete satırı (19.7) — müşteri yazarken gösterilen aday.
 *
 * **Neden burada, `@lezzet/database`'ten alınmıyor:** bu tipi bir İSTEMCİ bileşeni okuyor (panel) ve
 * yüzeydeki hiçbir istemci dosyası veri paketine bağlanmıyor — bugün `import type` zararsız görünse
 * de aynı yoldan bir gün bir değer içe aktarılır ve sunucu kodu tarayıcı paketine düşer. Sınır
 * `DeliveryZoneSummary` ile aynı gerekçeyle burada çiziliyor.
 *
 * **Kopya değil, DOĞRULANAN bir sözleşme:** `suggestPostalCodesAction` dönüşünü bu tiple imzalıyor;
 * veri tarafındaki `PostalCodeSuggestion` ayrışırsa eylem derlenmez. Bağ yorumla değil, tip
 * denetimiyle duruyor.
 */
export interface PlaceSuggestion {
  country: Country;
  postalCode: string;
  /** Kodun kapsadığı TÜM yerleşimler, ham. Kısaltma ("+4") ekranın kararı. */
  places: string[];
  /** Kod bizim bir teslimat bölgemizde mi — sıralamayı belirler, seçimi DEĞİL. */
  inRoute: boolean;
}

/**
 * Yer çözümünün ekrana ulaşan hâli (19.16b) — **dört hâl ayrık taşınır.**
 *
 * Önceki sürüm `ambiguous`/`unknown`/`unresolved` hâllerinde `throw` ediyordu ve hepsi tek bir
 * `error: string`e iniyordu. Ekran belirsizlik seçicisini yazamıyordu: adayları göremiyor, hâli
 * ancak hata metnini ayrıştırarak anlayabilirdi — bir dizgi eşleştirmesi, üstelik üç dilde
 * çalışmayan biri. `throw` artık yalnız GERÇEK arıza için (DB düştü, kod biçimsiz).
 */
export type PlaceLookup =
  /** Çözüldü — ekran yeri gösterebilir. */
  | { kind: 'resolved'; place: DeliveryPlace }
  /** Kod birden çok hizmet ülkemizde geçerli; müşteri seçer. En az iki aday taşır. */
  | { kind: 'ambiguous'; options: PlaceOption[] }
  /** Ne kendi bölge tablomuzda ne referansta — büyük olasılıkla yazım hatası. */
  | { kind: 'unknown' }
  /**
   * Zincir koptu. İki sebep AYRI cümle gerektirir: `no_shipping_warehouse` bizim yapılandırma
   * eksiğimizdir (müşteriye "bölge dışısınız" dedirtilmemeli), `ambiguous_zone` veri çakışmasıdır.
   */
  | { kind: 'unresolved'; reason: 'no_shipping_warehouse' | 'ambiguous_zone' };

/** Çözülmüş teslimat yeri — sunucu `resolvePlaceAction` ile üretir, istemci saklar. */
export interface DeliveryPlace {
  /** Boşluksuz, normalize edilmiş posta kodu ("67000"). */
  postalCode: string;
  /**
   * Ülke — müşteriye SORULMAZ, posta kodundan türer (19.8). Bir alan değil, bir sonuçtur:
   * serbestçe seçilen ülke KDV oranını ve Alman B2B muafiyetini etkilerdi (`DOMAIN §5`).
   */
  country: Country;
  /**
   * Yer adı ("Strasbourg", "Vitry-le-François") — posta kodu referansından (19.8).
   *
   * Rota dışında da dolabilir: tasarımın istediği "75011 Paris · kargo" yazılabiliyor. Eskiden
   * burada bir itiraf vardı — *"75011'in Paris olduğunu bilmemiz için bir posta kodu veritabanı
   * gerekirdi ve elimizde yok"* — `postal_code_place` o boşluğu kapattı.
   *
   * **`null` SIK bir hâldir ve öyle olmalı (19.17):** kodların ~%39'u birden çok yerleşim kapsıyor
   * ve orada tartışmasız bir ad YOKTUR. Üst idari birime çıkmak (19.8'in yaptığı) çözüm değildi —
   * Fransız arrondissement'ı merkez kasabasının adını taşır, yani `67800` için üretilen "Strasbourg"
   * geçerli bir belediye adı gibi okunuyordu; orası Bischheim / Hœnheim.
   *
   * `null` "gösterilecek bir şey yok" demek DEĞİL: `places` yanında geliyor ve etiketi ekran kurar.
   */
  placeName: string | null;
  /**
   * Kodun kapsadığı tüm yerleşimler (19.17) — `placeName` null'ken hapın malzemesi.
   *
   * Ne kadarının yazılıp nereden sonra "+X" deneceği **bu şeridin kararı**: veri tarafı listeyi
   * verir, biçimi dayatmaz (`CLAUDE.md §3` — görsel karar tasarımdan gelir, motordan değil).
   */
  places: string[];
  /**
   * Bölgenin adı ("Strasbourg Merkez") — YALNIZ rota içindeyken bilinir. `placeName`'den farklıdır:
   * bu BİZİM rota bölgemizin adı, o coğrafi yer adı.
   */
  zoneName: string | null;
  /** Rota içi mi — kapıya teslim mi kargo mu (tek karar noktası). */
  inRoute: boolean;
  /**
   * En yakın teslimat tarihi (ISO), yalnız rota içinde. **Vaat değil bilgi**: sepette stok
   * ayrılmadığı için (DOMAIN §4) buradaki gün bağlayıcı olamaz; ekran "en yakın teslimat" der,
   * "kapınızda" demez. Kesim saati geçtiğinde değişir — bu yüzden sayfaya gömülmez, istemcide
   * çözülür ve sayfa önbelleğine yapışmaz.
   */
  nextDate: string | null;
}

/**
 * Kapıya teslim edilen bir bölgenin ekranda görünen künyesi.
 *
 * Sunucu okumasıyla (`read.ts`) ekran arasındaki sözleşme. Burada durur çünkü **istemci de**
 * okuyor (bağlam, panel) ve `read.ts` `server-only` — tipi oraya koymak istemci tarafını
 * sunucu modülüne bağlardı.
 *
 * `id` ve `weekdays` TAŞINMAZ: panelin tek işi "benimki listede var mı" sorusunu cevaplamak.
 * Hangi gün gidildiği yerin kendi cevabında (`DeliveryPlace.nextDate`) zaten var.
 */
export interface DeliveryZoneSummary {
  name: string;
  postalCodes: string[];
}

// Posta kodu normalizasyonu ve biçim doğrulaması `@lezzet/helper`'da (denetim A2). Form girdisi,
// motorun karşılaştırması ve DB'nin saklama biçimi AYNI fonksiyondan gelmek zorunda.
export { isValidPostalCode, normalizePostalCode } from '@lezzet/helper';

/**
 * `elsewhere` hâlinin ALT SEBEBİ (09.08 · kullanıcı kararı) — **aynı stok hâli, iki farklı gerçek.**
 *
 *   `stock`        rota İÇİNDEYİZ ama kalem bölgenin deposunda yok. GEÇİCİ: mal gelince çözülür,
 *                  beklenecek şey KALEMDİR (`variant_stock_notice`).
 *   `out_of_route` rota DIŞINDA. KALICI: ürün gelse bile oraya gidemez, çünkü soğuk zincir kargoya
 *                  verilemiyor. Beklenecek şey BÖLGENİN açılmasıdır (`zone_notice`).
 *
 * İkisini tek cümleye indirmek rota dışındaki müşteriye gelmeyecek bir malı bekletmek, ona kalem
 * notu yazdırmak ise tutulamayacak bir söz vermek olurdu. Ayrım sepetin kısıt bloğunda 01.08'den
 * beri vardı (`place-restriction`); kart ve ürün detayında yoktu — rota dışı müşteri bu hâle
 * 19.23'e kadar hiç düşmediği için eksik görünmüyordu.
 *
 * Kural burada tek nüsha yaşıyor: üç ekran öğesi (işaret · haber düğmesi · teslimat kutusu) aynı
 * soruyu soruyor ve üçünde ayrı yazılsaydı biri bir gün ötekilerden ayrışırdı.
 */
type ElsewhereReason = 'stock' | 'out_of_route';

/**
 * **Yer bilinmiyorsa `stock`** ve bu bilinçli: "gönderemiyoruz" demek için rota dışında olduğunu
 * BİLMEK gerekir. Bilinmeyeni kalıcı bir olumsuzluğa çevirmek uydurma olurdu (`CLAUDE §1`) — ve
 * pratikte bu hâl zaten oluşmaz, `elsewhere` ancak yer biliniyorken doğar.
 */
export function elsewhereReasonOf(place: Pick<DeliveryPlace, 'inRoute'> | null): ElsewhereReason {
  return place && !place.inRoute ? 'out_of_route' : 'stock';
}

// `isValidPostalCode`'un gerekçesi (5 rakam FR ve DE'de aynı; ayrımı `postal_code_place` yapar) ve
// gövdesi artık `@lezzet/helper`'da. Doğrulama İSTEMCİDE de yapılır ki her tuşta sunucuya
// gidilmesin; sunucu yine de kendi kontrolünü yapar — istemciden gelen hiçbir şeye güvenilmez.

/**
 * Vitrin okumalarının yer bağlamı (19.10) — **iki depo, tek nesne.**
 *
 * Ayrı konumsal parametreler yerine nesne: üçüncü bir alan eklendiğinde (ör. kapsam) çağıranların
 * imzası kaymaz, ve daha önemlisi ikisini birlikte geçmek zorunlu hâle gelir. `warehouseId` tek
 * başına geçilseydi "yerelde yok = tükendi" hatası ilk unutan çağırandan geri dönerdi.
*
 * ── ÜÇ HÂL, İKİ ALANDAN TÜRER (19.23 · 09.08) ────────────────────────────────
 *   (null, null)   yer bilinmiyor   → okuma ağ-geneline düşer (C3: "tükendi" ancak hiçbir depoda
 *                                     yoksa denir)
 *   (rota, kargo)  rota içi         → yerel havuz o deponun stoğu
 *   (null, kargo)  **ROTA DIŞI**    → yerel havuz BOŞ; müşteriye yalnız kargo gider
 *
 * **`warehouseId` YALNIZ ROTA deposudur.** Eskiden çözümün `warehouseId`i olduğu gibi yayılıyordu
 * ve o alan `shipping` hâlinde KARGO deposunu taşıyor — tek kutu iki anlam. Okuyan taraf ayırt
 * edemediği için rota dışındaki müşteriye "ücretsiz kapı teslimi" işareti veriliyor, kargo grubu
 * hiç doğmuyordu (ölçüldü: 75011 ile 67000 birebir aynı sonucu veriyordu).
 *
 * Üçüncü bir `mode` alanı EKLENMEDİ: türetilebilen bir şeyin ikinci kaynağı bir gün ötekiyle
 * çelişir. Alanların kendisi artık tek anlam taşıyor — kök sebep buydu.
 */
export interface PlaceWarehouses {
  /** **ROTA** deposu — aracın çıktığı yer. `null` = yer bilinmiyor YA DA rota dışı (üstteki tablo). */
  warehouseId: string | null;
  /** Ülkenin kargo çıkış deposu. `null` = yer bilinmiyor ya da o ülkeye kargo yok. */
  shippingWarehouseId: string | null;
}
