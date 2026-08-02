/**
 * Yer adının GÜVENİLİRLİĞİ ve adres tutarlılığı (19.17) — saf kural, DB'siz.
 *
 * ── NEDEN AYRI BİR DOSYA ─────────────────────────────────────────────────────
 * `warehouse-resolve` "bu adres hangi depodan çıkar" sorusunu cevaplar. Buradaki soru başka:
 * "bu koda yazılan ad doğru mu, ve gösterilebilir mi". İkisi aynı veriyi okur ama farklı şeye karar
 * verir; birleştirilseydi depo motorunu değiştiren biri farkında olmadan adres doğrulamasını da
 * değiştirirdi.
 *
 * ── 19.8'İN YANLIŞ İDDİASI ───────────────────────────────────────────────────
 * İlk sürüm çok yerleşimli kodda bir üst idari birime çıkıyor ve künyesinde *"daha geniş, ama ASLA
 * yanlış değil"* diyordu. **İddia yanlıştı.** Fransız arrondissement'ı çoğu zaman merkez kasabasının
 * adını taşır: `67800` için tabloda "Strasbourg" yazıyordu, oysa orası Bischheim / Hœnheim. Yani
 * indirgeme geniş bir etiket değil, **geçerli bir belediye adı gibi okunan yanlış bir cevap**
 * üretiyordu — doğrudan ayırt edilemeyen türden. Ölçek de istisna değil: kodların ~%39'u çok
 * yerleşimli (FR 4.258 + DE 2.392 / 16.878).
 *
 * Bu yüzden ad artık İNDİRGENMİYOR: tek yerleşim varsa adı, yoksa `null`. "📍 67800" yanıltmaz,
 * "📍 67800 Strasbourg" yanıltır — ve yanıltmayan eksik cevap, yanıltan tam cevaptan iyidir.
 */

/**
 * Karşılaştırma için ad normalizasyonu — **yalnız yazım farklarını siler, anlamı değiştirmez.**
 *
 * Diyakritik, ligatür (`Hœnheim` ↔ `Hoenheim`), tire/boşluk/kesme ve büyük-küçük harf farkı aynı
 * yerin farklı yazımlarıdır; müşteri "HOENHEIM" yazdığında yanlış alarm ötmemeli. Ötesine
 * geçilmiyor: "St" ↔ "Saint" gibi genişletmeler kulağa makul gelir ama ayrı belediyeleri
 * birbirine karıştırabilir ve o hatanın kaynağı sonradan bulunamaz.
 */
export function normalizePlaceName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/œ/gi, 'oe')
    .replace(/æ/gi, 'ae')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Kodun TEK ve kesin adı — yoksa `null`.
 *
 * Tek yerleşimli kodda o yerin gerçek adı (kodların %60,6'sı böyle); çok yerleşimlide `null`, çünkü
 * 46 köyden birini seçmek keyfi olurdu ve üst idari birime çıkmak (19.8'in yaptığı) yanlış belediye
 * adı yazmaktı.
 *
 * **Bu bir VERİ cevabıdır, bir gösterim kararı değil:** "bu kodun tartışmasız bir adı var mı".
 * `null` gördüğünde ne yazılacağı — liste mi, ilk üç ad + "+X" mi, çıplak kod mu — ekranın
 * kararıdır ve `places` onun elinde. Buraya bir biçimlendirme koymak, tasarımı olmayan bir görsel
 * kararı motora gömmek olurdu (`CLAUDE.md §3`).
 */
export function placeLabel(places: readonly string[]): string | null {
  return places.length === 1 ? places[0]! : null;
}

/**
 * Yazılan şehir bu posta kodunun yerleşimlerinden biri mi (19.17).
 *
 * ── BİLİNMEYEN "UYUŞMUYOR" DEĞİLDİR ──────────────────────────────────────────
 * `places` boşsa `true` döner. Kod referansta yoksa (yalnız kendi bölge tablomuzda olabilir, 19.16a)
 * ölçüm YOKTUR — ve ölçülemeyen değer sıfır değildir (`CLAUDE.md §1`). Boş listeyi "uyuşmadı"
 * saymak, referansı eksik olan her adresi reddetmek olurdu. Aynı sebeple boş şehir de geçer: o
 * ayrı bir alanın (zorunluluk) sorusu, bu kuralın değil.
 *
 * ── GENİŞ TARAF GÜVENLİ TARAFTIR ─────────────────────────────────────────────
 * Bu kural bir siparişi REDDEDER; yanlış öten bir uyarı, bir süre sonra hiç okunmayan bir uyarıdır.
 * Bu yüzden eşleşme tarafı cömert: tam eşleşme tutmazsa şehirden arrondissement/CEDEX eki atılıp
 * bir kez daha denenir ("Paris 11e" → "Paris", "STRASBOURG CEDEX 2" → "Strasbourg"). Bu ek yalnız
 * kabul kümesini BÜYÜTÜR; hiçbir adresi yeni baştan reddetmez.
 */
export function cityMatchesPlaces(city: string, places: readonly string[]): boolean {
  if (places.length === 0) return true;

  const wanted = normalizePlaceName(city);
  if (!wanted) return true;

  const known = places.map(normalizePlaceName);
  if (known.includes(wanted)) return true;

  // "paris 11" · "paris 11e" · "strasbourg cedex 2" → gövde adı
  const bare = wanted.replace(/\s+(?:cedex\s*)?\d{1,2}\s*(?:e|er|eme|ieme)?$/, '').replace(/\s+cedex$/, '').trim();
  return bare !== wanted && bare.length > 0 && known.includes(bare);
}

/**
 * Bir adresin taşıdığı UYARI — operasyon ekranının "bu adrese gidebilecek miyiz" sorusu (19.19).
 *
 * `unknown_code` · kod ne bizim bölge tablomuzda ne referansta. Adres uydurma OLABİLİR ama
 *   olmayabilir de: referans bir anlık görüntüdür (GeoNames'te olmayan geçerli kod var, yenileri
 *   açılıyor). Bu yüzden bir ENGEL değil, bir işarettir.
 * `city_mismatch` · kod tanınıyor ama yazılan şehir o kodun hiçbir yerleşimi değil. **Daha güçlü
 *   sinyal budur**: burada bilinmeyen bir şey yok, çelişen iki beyan var — ve 19.17'yi doğuran
 *   yaşanmış şikâyet (`67000` + `LINGOLSHEIM`) tam olarak bu sınıftı, tanınmayan kod değil.
 */
export type AddressAnomaly = 'unknown_code' | 'city_mismatch';

/**
 * Adresin uyarılarını çıkarır — **saf karar**, girdiyi çağıran toplar.
 *
 * `inRoute` bizim bölge tablomuz, `places` referans tablosu. İkisi de "hayır" diyorsa kod tanınmıyor
 * demektir; **ikisinden biri yeterlidir** çünkü kendi tablomuz referansın üstündedir (19.16a): bir
 * kodu bölgemize eklemişsek o kod bizim için geçerlidir, GeoNames ne derse desin.
 *
 * Şehir uyuşmazlığı yalnız kod TANINIYORKEN sorulur: tanınmayan kodda karşılaştıracak bir liste
 * yoktur ve iki uyarıyı birden basmak aynı arızayı iki kez saymak olurdu.
 */
export function addressAnomalies(input: {
  city: string | null;
  places: readonly string[];
  inRoute: boolean;
}): AddressAnomaly[] {
  const known = input.inRoute || input.places.length > 0;
  if (!known) return ['unknown_code'];
  // Şehirsiz adres uyarı doğurmaz: eksik alan bir çelişki değildir (`CLAUDE.md §1` — ölçülemeyen
  // değer sıfır değildir; burada da "yazılmamış şehir" ≠ "yanlış şehir").
  if (input.city && !cityMatchesPlaces(input.city, input.places)) return ['city_mismatch'];
  return [];
}
