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

/** Çözülmüş teslimat yeri — sunucu `resolvePlaceAction` ile üretir, istemci saklar. */
export interface DeliveryPlace {
  /** Boşluksuz, normalize edilmiş posta kodu ("67000"). */
  postalCode: string;
  /**
   * Bölgenin adı ("Strasbourg Merkez") — YALNIZ rota içindeyken bilinir.
   *
   * Rota dışında **şehir adı yazılmaz**: 75011'in "Paris" olduğunu bilmemiz için bir posta kodu
   * veritabanı gerekirdi ve elimizde yok. Tasarım "75011 Paris · kargo" gösteriyor; biz "75011 ·
   * kargo" diyoruz — uydurulmuş bir şehir adı, yanlış olduğunda güveni doğrudan zedeler.
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
 * Fransız posta kodu biçimi: 5 rakam. Doğrulama İSTEMCİDE de yapılır ki her tuşta sunucuya
 * gidilmesin; sunucu yine de kendi kontrolünü yapar (istemciden gelen hiçbir şeye güvenilmez).
 */
export function isValidPostalCode(raw: string): boolean {
  return /^\d{5}$/.test(normalizePostalCode(raw));
}
