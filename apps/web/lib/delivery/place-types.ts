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
  /** Yer adı — kod yalnız kendi bölge tablomuzda varsa `null` (uydurulmaz, `zoneName` gösterilir). */
  placeName: string | null;
  /** Rota bölgemize düşüyor mu — liste bunu önce gösterir (daha olası cevap). */
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
   * Rota dışında da DOLUDUR: tasarımın istediği "75011 Paris · kargo" artık yazılabiliyor. Eskiden
   * burada bir itiraf vardı — *"75011'in Paris olduğunu bilmemiz için bir posta kodu veritabanı
   * gerekirdi ve elimizde yok"* — `postal_code_place` tam olarak o boşluğu kapattı. Uydurulmuş ad
   * yasağı yerinde: kodun birden çok yerleşimi varsa bir üst idari birim yazılır, rastgele bir köy
   * değil.
   */
  placeName: string | null;
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

/** Posta kodu normalizasyonu — kullanıcı "67 000" ya da " 67000 " yazabilir; kimlik tek biçimdir. */
export function normalizePostalCode(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

/**
 * Posta kodu biçimi: 5 rakam — Fransa ve Almanya'da AYNI, o yüzden biçim ülkeyi ayırt etmez
 * (ayrımı `postal_code_place` yapar, 19.8). Doğrulama İSTEMCİDE de yapılır ki her tuşta sunucuya
 * gidilmesin; sunucu yine de kendi kontrolünü yapar (istemciden gelen hiçbir şeye güvenilmez).
 */
export function isValidPostalCode(raw: string): boolean {
  return /^\d{5}$/.test(normalizePostalCode(raw));
}
