import type { PlaceAnswer } from './place-types';

/**
 * Teslimat yerinin tarayıcı deposu — **çerez** (19.9).
 *
 * Sepetin deseninin aynısı (`cart-store`): ziyaretçide tarayıcı, girişli müşteride sunucu — orada
 * varsayılan adresin posta kodu okunur ve bu depo onu yalnız yansıtır. Ayrım arayüze sızmaz.
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
 * Sorunun ATLANDIĞI da bir cevaptır: şerit ikinci kez sormasın (tasarım: "şimdi değil").
 *
 * Atlama KAPSAMLIDIR çünkü iki farklı soru var. Anasayfadaki davet gezinmenin başında sorulur ve
 * atlanması makuldür ("daha bakıyorum"). Sepetteki soru ise SOMUT bir sonuca bağlıdır: sepette
 * yalnız kendi aracımızla gidebilen ürün var ve nereye gideceğini bilmiyoruz. İlkini geçmek
 * ikincisini de susturmamalı — geçilen soru başka bir soruydu.
 *
 * Bunlar `localStorage`'da KALIYOR: sunucunun onları bilmesine gerek yok (hiçbir RSC kararını
 * değiştirmiyorlar) ve her isteğe takılmalarının bir karşılığı olmazdı.
 */
type SkipScope = 'home' | 'cart';
const SKIP_KEY: Record<SkipScope, string> = {
  home: 'lezzet.place.skipped.v1',
  cart: 'lezzet.place.skipped.cart.v1',
};

export function readPlaceAnswer(): PlaceAnswer | null {
  if (typeof document === 'undefined') return null;
  const raw = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${KEY}=`))
    ?.slice(KEY.length + 1);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(raw));
    return isAnswer(parsed) ? parsed : null;
  } catch {
    // Bozuk/elle düzenlenmiş çerez — yer bilinmiyor sayılır ve soru yeniden sorulur.
    return null;
  }
}

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

export function readSkipped(scope: SkipScope): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(SKIP_KEY[scope]) === '1';
}

export function writeSkipped(scope: SkipScope): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SKIP_KEY[scope], '1');
  } catch {
    // Depo kapalı (gizli sekme) — soru o oturumda yeniden sorulabilir, ekran çökmez.
  }
}

function isAnswer(value: unknown): value is PlaceAnswer {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  // `country` zorunlu (19.8): kodun tek başına anlamı yok — 610 kod iki ülkede birden geçerli ve
  // ülke KDV'yi belirliyor. Ülkesiz eski kayıt burada düşer, soru yeniden sorulur.
  return typeof row.postalCode === 'string' && typeof row.country === 'string';
}
