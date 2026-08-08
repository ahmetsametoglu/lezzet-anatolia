import type { PlaceMode } from './read-place';

/**
 * **"Adresime gönderilebilir" çipinin anlamı** (08.27) — kullanıcı bulgusu 08.08.
 *
 * ── BULUNAN ARIZA ────────────────────────────────────────────────────────────
 * Çipin adı adres hakkında bir soru soruyor ama kodu adresi HİÇ sormuyordu: süzgeç
 * `product.shippable = true`, yani ürünün kargolanabilir olup olmadığı — yerden bağımsız bir
 * özellik. Sonucu iki ayrı yanlış:
 *
 *   *(1) Posta kodu YOKKEN* ortada "adresim" yok; çip sessizce **"kargolanabilir mi"** sorusuna
 *   dönüşüyordu — müşterinin sormadığı soru. Kullanıcı bunu ekranda gördü: kod girilmemişken çip
 *   duruyor, tıklanıyor ve (o listede her ürün kargolanabilir olduğu için) hiçbir şey değişmiyordu.
 *
 *   *(2) BÖLGE İÇİNDEYKEN çip, adrese ULAŞABİLEN ürünleri gizliyordu.* Soğuk zincir ürünü
 *   (`shippable=false`) kargoya verilemez ama **rota aracıyla o adrese gider**. Ölçüldü (08.08):
 *   katalogda 6 böyle ürün var; çip açıldığında altısı da listeden düşüyordu. Tasarımın kuralı
 *   tersini söylüyor: *"açılınca yere göre karşılanabilen kalemleri süzer — artık kargo yoluyla
 *   gelebilenleri DE kapsar"* (`Musteri - Katalog.dc.html`).
 *
 * ── KURAL YERE BAĞLANDI ──────────────────────────────────────────────────────
 * Çipin sorduğu tek soru şu: *"bu ürün benim adresime ulaşabilir mi?"* Cevap yere göre değişir:
 *
 *   `unknown`  — cevaplanamaz. Süzmek yerine **posta kodu sorulur**: adres olmadan verilen her
 *                cevap uydurmadır (`CLAUDE §1`: ölçülemeyen değer sıfır değildir).
 *   `route`    — rota aracı gidiyor, soğuk zincir dâhil her aktif ürün ulaşıyor. Süzgeç hiçbir şey
 *                elemez; **eleyecek şeyi olmayan bir denetim çizilmez** — kullanıcının gördüğü
 *                "tıklıyorum, bir şey olmuyor" hâli tam olarak budur.
 *   `shipping` — yalnız kargolanabilirler ulaşıyor. Çip burada GERÇEKTEN bir şey yapar; bugünkü
 *                davranış doğru olan tek hâl buymuş.
 *
 * İki fonksiyon ayrı çünkü iki ayrı soruya cevap veriyorlar ve **iki ayrı yerde** soruluyorlar:
 * biri sunucuda (süzgeç uygulanacak mı), öteki ekranda (denetim çizilecek mi). Tek fonksiyona
 * indirgenselerdi sunucu ekranın kararına, ekran da sunucunun süzgecine bağımlı olurdu.
 */

/**
 * Süzgeç GERÇEKTEN uygulanacak mı — sunucunun sorusu.
 *
 * URL'den gelen `?shippable=1` tek başına yetmiyor ve bu bir güvenlik değil DOĞRULUK kararı:
 * paylaşılmış ya da eski bir bağlantı, bölge içindeki müşteriye adresine gelebilen ürünleri
 * gizleyebilirdi — üstelik çip çizilmediği için geri almanın görünür bir yolu olmadan. Sessiz ve
 * geri alınamaz bir daralma, hatanın en kötü türü.
 */
export function shippableFilterApplies(requested: boolean, mode: PlaceMode): boolean {
  return requested && mode === 'shipping';
}

/**
 * Çipin ekrandaki hâli — çizilecek mi, ne yapacak?
 *
 * Dönüş tipi ADLANDIRILMADI: dışa verilen bir ad hiçbir çağıran tarafından yazılmıyordu (knip ölü
 * gösterdi). Gerekirse `ReturnType<typeof shippableChipOf>` ile alınır — tek kaynak fonksiyonun
 * kendisi kalır.
 */
export function shippableChipOf(mode: PlaceMode): 'filter' | 'ask' | 'hidden' {
  if (mode === 'shipping') return 'filter';
  if (mode === 'unknown') return 'ask';
  return 'hidden';
}
