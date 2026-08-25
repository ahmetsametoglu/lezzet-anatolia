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
 * ── `PlaceSuggestion` SİLİNDİ (08.41) ────────────────────────────────────────
 * Autocomplete satırının (19.7) burada kendi arayüzü vardı ve künyesi *"kopya değil, doğrulanan bir
 * sözleşme"* diyordu. Doğruydu ama ihtiyaç ortadan kalktı: eylem artık `suggestPlaces` köprüsünden
 * geçiyor ve o kapı `@lezzet/types`in `PlaceOption`ını dönüyor — **istemci güvenli bir paket**, yani
 * "veri paketine bağlanmayalım" gerekçesi bu tipe uymuyor. İki arayüz de aynı dört alanı taşıyordu;
 * `PlaceOption` ayrıca `placeName`i (ad türetiminin TEK yeri) getiriyor.
 *
 * Bir tipi bir alan eksiğiyle ikinci kez yazmak, o alanı isteyen ekranın onu üçüncü kez türetmesiyle
 * biter — 19.8'in yanlış ad üretmesi tam olarak bu zincirdi (`CLAUDE §1`).
 */

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
  /**
   * Kodun coğrafi noktası (`postal_code_place.lat/lng`) — **yalnız adres önerisini SIRALAMAK için**
   * (08.41). Ekranda hiçbir yerde gösterilmez ve bir karar girdisi değildir; teslimat kararı rota
   * tablosundan çıkar, noktadan değil.
   *
   * Neden burada: BAN araması TARAYICIDAN çağrılıyor (kota IP başına — `use-address-search.hook`
   * künyesi), yani nokta istemcide bilinmek zorunda. Çözüm zaten `postal_code_place` satırını
   * okuyor, o yüzden ek bir sorgu yok — taşınmayan bir alanı taşımaya başladık, o kadar.
   *
   * `null` GEÇERLİ bir hâl: koordinatsız kayıt olabilir (kısıt `postal_code_place_point`: lat ve
   * lng ya birlikte var ya birlikte yok). O zaman öneri ipuçsuz istenir — bugünkü davranış.
   */
  point: { lat: number; lng: number } | null;
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
 * `elsewhere` hâlinin ALT SEBEBİ — **kural artık `@lezzet/helper`'da, burası KÖPRÜ** (21.20).
 *
 * Gerekçe `helper/src/delivery.ts` künyesinde: aynı üç cümleyi native uygulamanın katalog/vitrin
 * kartı da kuruyor ve `apps/mobile` ne `@lezzet/application`'ı ne `domain-core`'u biliyor. İki
 * yüzeyin de bildiği tek ev `helper` — `normalizePostalCode`in emsali (üstteki satır).
 *
 * Köprü duruyor çünkü web tarafındaki ÜÇ çağıran (işaret · haber düğmesi · teslimat kutusu) yerin
 * sözlüğünü tek dosyadan okuyor; import yolunu üç yerde değiştirmek, taşımanın kendisinden başka
 * hiçbir şey kazandırmazdı.
 */
export { elsewhereReasonOf } from '@lezzet/helper';

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
