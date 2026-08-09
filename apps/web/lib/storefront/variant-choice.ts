import type { StorefrontVariant } from '@lezzet/application';

/**
 * AÇILIŞTA HANGİ BOY SEÇİLİ (denetim talebi 09.08) — **fiyat vaadinin karşılığı.**
 *
 * ── BULUNAN ARIZA ────────────────────────────────────────────────────────────
 * Liste kartı bir fiyat gösteriyor ve o fiyat en ucuz boyunki olmak zorunda değildi (ölçüldü: 31
 * çok boylu üründen 24'ünde gösterilen fiyat en ucuz DEĞİL; en büyük sapma 16,81 € — Sobiyet
 * Baklava listede 33,82 € görünüyor, 17,01 €'luk boyu var). Detay sayfası da `variants[0]`, yani
 * operatörün SIRASINDAKİ ilk boyu seçili açıyordu.
 *
 * Kartın fiyatı en ucuza çekilirken (arka uç, `primary_variant`) detay eski davranışta kalsaydı
 * ortaya **bugünkünden kötü** bir hâl çıkardı: müşteri listede 17 € görüp tıklıyor, detayda 33 €
 * seçili buluyor. Bugün kaybedilen şey bir satış, o hâlde kaybedilen şey güven olurdu.
 *
 * ── ÖLÇÜT TEK YERDE ──────────────────────────────────────────────────────────
 * Kart ile detay AYNI ölçütten seçmeli, yoksa bir gün ayrışırlar ve ayrışma sessiz olur — kimse
 * "kartta yazan fiyatla detayda açılan boy farklı" diye bir hata görmez, yalnız müşteri görür.
 *
 * **Sıra DEĞİŞMİYOR:** boy seçicide operatörün `sortOrder`'ı geçerli kalır. Değişen yalnız hangi
 * boyun SEÇİLİ açıldığı. İkisi ayrı şey: sıra operatörün kararı, seçili boy fiyat vaadinin
 * karşılığı.
 *
 * **Fiyatsız boylar SONDA:** fiyatı olmayan varyant satılamaz (`priceCents === null` = satışa
 * kapalı), onu açılışta seçmek müşteriye "sepete ekle"si çalışmayan bir ekran açmaktır. Hiçbirinin
 * fiyatı yoksa listenin ilki kalır — o zaman zaten seçilecek "daha iyi" bir boy yok.
 *
 * ── KARDEŞİ `primaryVariantOf` VE NEDEN AYRI DURUYOR ─────────────────────────
 * Arka uç aynı ölçütü aynı gün sunucu tarafına yazdı (`@lezzet/application` → `primaryVariantOf`) ve
 * kart onu kullanıyor. **Kural dört maddesiyle birebir aynı** — en ucuz satılabilir · fiyatsız boy
 * birincil olamaz · hepsi fiyatsızsa ilk boy · eşitlikte gelen sıra korunur.
 *
 * Buradaki ikinci uygulamanın sebebi girdi: `primaryVariantOf` HAM varyant (`ProductVariant`) ve
 * fiyat bağlamı (`ProductContext`) istiyor, yani fiyatı kendisi hesaplıyor ve sunucuda çalışıyor.
 * Detay ekranı ise fiyatı ÇÖZÜLMÜŞ görünüm tipini (`StorefrontVariant`) elinde tutuyor ve seçim
 * istemcide, müşteri boy değiştirdikçe yaşıyor. O kapıyı buradan çağırmak ekrana ham varlık ve
 * fiyat motoru taşımak olurdu.
 *
 * **Kalıcı çözüm ikisi de değil:** birincil boyu SUNUCU işaretlemeli (`StorefrontProductDetail`
 * bir `primaryVariantId` taşımalı) ve ekran onu okumalı — o gün bu dosya silinir. Arka uca not
 * bırakıldı (`not-arka-uc-detay-birincil-boy-alani.md`). Bugün iki uygulama var ama TEK kural:
 * ayrışırlarsa testler düşer, çünkü ikisinin de testi aynı dört maddeyi çiviliyor.
 */
export function cheapestVariantId(variants: readonly StorefrontVariant[]): string {
  const priced = variants.filter((v) => v.priceCents !== null);
  if (priced.length === 0) return variants[0]?.id ?? '';
  return priced.reduce((min, v) => (v.priceCents! < min.priceCents! ? v : min)).id;
}
