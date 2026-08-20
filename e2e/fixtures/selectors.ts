/**
 * Duman senaryolarının PAYLAŞILAN seçicileri — aynı niyetin altı ayrı dosyada altı kopyası olmasın.
 *
 * ── NEDEN AÇILDI (19.08, ölçülmüş düşüş) ────────────────────────────────────
 * Altı senaryo ürün sayfasının sepete-ekle düğmesini `/panier|ajouter/i` ile arıyordu ve o desen
 * İKİ AYRI düğme sınıfına birden uyuyor: ana satın alma paneli (*"Ajouter au panier"*) ve ürün
 * KARTLARI (*"Ajouter"* — katalog ızgarası, *"Vous aimerez aussi"* şeridi). `.first()` DOM sırasına
 * baktığı için ana panel gizlendiğinde sessizce **başka bir ürünün** kartına basıyordu; sepete o
 * ürün giriyor, iddia da haklı olarak düşüyordu.
 *
 * Ölçüm: `/fr/produit/peynirli-adana-boregi` sayfasında eşleşen iki düğmenin ikisi de benzer
 * ürünler şeridindeydi — tıklanan düğmenin sahibi `peynirli-kalzone`ydi ve sepete Calzone girdi.
 *
 * Ana panelin gizlenmesi ARIZA DEĞİL, tasarımın kendisi: soğuk zincirli ve yalnız kapıya teslim
 * edilen ürün, yeri bilinmeyen ziyaretçiye satılamaz — panel onun yerine *"Saisir mon code postal"*
 * der. Senaryolar 04.08'de yazılırken kataloğun ilk kartı kargoya verilebilen bir üründü, bu yüzden
 * varsayım görünmüyordu; katalog içeriği değişince ortaya çıktı.
 *
 * ── AYRIM SÖZLÜKTE, TAHMİNDE DEĞİL ──────────────────────────────────────────
 * `product/[slug]/messages.json` → `addToCart: "Ajouter au panier"`
 * `catalog/messages.json`        → `card.addToCart: "Ajouter"`
 * Yani tam eşleşme ana paneli, ondan başkasını değil, hedefler. Metin değişirse test kırılır ve
 * kırılması DOĞRUDUR: sayfanın ana aksiyonunun adı bir sözleşmedir (tasarım §3).
 *
 * FR'ye bağlı olması bilinçli: duman senaryolarının hepsi `/fr` yüzeyinde koşuyor. Bir gün DE/TR
 * yolculuğu yazılırsa buraya kardeş sabit eklenir — sözlükten okunacak bir mekanizma kurmak, üç
 * satırlık bir gerçek için makine kurmak olurdu.
 */
export const ANA_SEPETE_EKLE = /^Ajouter au panier$/i;
