import type { PlaceAnswer } from './place-types';

/**
 * Teslimat yerinin tarayıcı deposu — **çerez** (19.9).
 *
 * Sepetin deseninin aynısı (`cart-store`): ziyaretçide tarayıcı, girişli müşteride sunucu — orada
 * varsayılan adres okunur (`read-place` → `readDefaultAddress`, 13.09) ve adres varken bu çerez
 * SUNUCUDA OKUNMAZ; yazılmaz da (`setPostalCode` adres varken yeri değiştirmez). Bu künye 19.9'dan
 * 13.09'a dek bunu vaat edip yapmıyordu — ölçüldü: çerez 67000, adres 67380, iki ekran iki cevap.
 * Ayrım arayüze sızmaz.
 *
 * ── NEDEN `localStorage` DEĞİL ARTIK ─────────────────────────────────────────
 * Eskiden `localStorage`'daydı ve gerekçesi doğruydu: "her isteğe takılmasının gereği yok". Ama
 * katalog, anasayfa ve ürün detayı RSC — render anında hangi deponun stoğunu okuyacaklarını
 * bilmeleri gerekiyor ve `localStorage`'ı göremiyorlar. Yer sunucuya taşınmadan bu sayfalar
 * depo-üstü okumaya mahkûmdu (dört `BEKLEYEN(19.7)` işareti tam olarak bunu söylüyordu).
 *
 * ── SAKLANAN ŞEY CEVAP, ÇÖZÜM DEĞİL ──────────────────────────────────────────
 * Çerezde yalnız `{country, postalCode}` var (`PlaceAnswer`). Çözülmüş depo kimliğini yazsaydık,
 * çerezi elle düzenleyen biri hangi deponun stoğunu göreceğini kendisi seçerdi. Sunucu her istekte
 * kodu yeniden çözüyor — maliyeti yok, çünkü bölge/depo/posta listeleri önbellekte.
 *
 * `httpOnly` DEĞİL: hap, panel ve kısıt bloğu istemci bileşeni ve okuyacaklar. Sakıncası yok —
 * çerez ne kimlik ne yetki taşıyor, bir tercih taşıyor.
 */
const KEY = 'lezzet.place.v2';

/** Bir yıl: soru bir kez sorulur, sekme kapansa da hatırlanır (eski `localStorage` davranışı). */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * Çerez İSTEMCİDE OKUNMAZ (13.09): ilk kareyi sunucu veriyor (`readPlaceSnapshot` → layout →
 * `PlaceProvider`). Eski `readPlaceAnswer` burada durup çerezi okuyor ve `resolvePlaceAction`ı bir
 * kez daha çağırıyordu — 19.7'nin (b) gecikmesi tam olarak buydu. Yazma yolu kalıyor: cevabı
 * istemci yazar, sunucu her istekte okur.
 */
export function writePlaceAnswer(answer: PlaceAnswer | null): void {
  if (typeof document === 'undefined') return;
  // `SameSite=Lax`: yer bir tercih, üçüncü taraf bağlamında taşınmasının gereği yok.
  // `Secure` YOK — yerel geliştirme http üzerinde çalışıyor ve çerez orada da yazılabilmeli;
  // taşıdığı şey bir posta kodu, gizli değil.
  const base = `${KEY}=`;
  document.cookie = answer
    ? `${base}${encodeURIComponent(JSON.stringify(answer))}; path=/; max-age=${MAX_AGE_SECONDS}; samesite=lax`
    : `${base}; path=/; max-age=0; samesite=lax`;
}

// "Şimdi değil" işaretleri (`readSkipped` · `writeSkipped`) 14.09'da kalktı: sordukları iki şerit
// (anasayfa ve sepet) söküldü, posta kodu yalnız başlıktaki haptan soruluyor (kullanıcı kararı).

