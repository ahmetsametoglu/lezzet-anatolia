import type { DeliveryPlace } from './place-types';

/**
 * Teslimat yerinin tarayıcı deposu.
 *
 * Sepetin deseninin aynısı (`cart-store`): ziyaretçide tarayıcı, girişli müşteride sunucu — orada
 * varsayılan adresin posta kodu okunur ve bu depo onu yalnız yansıtır. Ayrım arayüze sızmaz.
 *
 * **`nextDate` SAKLANIR ama GÜVENİLMEZ.** Kesim saati (16:00) geçince "en yakın teslimat" değişir;
 * dünkü tarihi bugün göstermek sessiz bir yalandır. Bu yüzden sağlayıcı her açılışta kodu sunucuya
 * yeniden çözdürür — depodaki tarih yalnız ilk karede boşluk görünmesin diye durur.
 *
 * `localStorage` seçildi: soru bir kez sorulup sekme kapansa da hatırlanmalı. Çerez değil — her
 * isteğe takılmasının gereği yok ve işlevsel veridir, izleme değil.
 */
const KEY = 'lezzet.place.v1';

/**
 * Sorunun ATLANDIĞI da bir cevaptır: şerit ikinci kez sormasın (tasarım: "şimdi değil").
 *
 * Atlama KAPSAMLIDIR çünkü iki farklı soru var. Anasayfadaki davet gezinmenin başında sorulur ve
 * atlanması makuldür ("daha bakıyorum"). Sepetteki soru ise SOMUT bir sonuca bağlıdır: sepette
 * yalnız kendi aracımızla gidebilen ürün var ve nereye gideceğini bilmiyoruz. İlkini geçmek
 * ikincisini de susturmamalı — geçilen soru başka bir soruydu.
 */
type SkipScope = 'home' | 'cart';
const SKIP_KEY: Record<SkipScope, string> = {
  home: 'lezzet.place.skipped.v1',
  cart: 'lezzet.place.skipped.cart.v1',
};

export function readPlace(): DeliveryPlace | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isPlace(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writePlace(place: DeliveryPlace | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (place) window.localStorage.setItem(KEY, JSON.stringify(place));
    else window.localStorage.removeItem(KEY);
  } catch {
    // Depo kapalı (gizli sekme) — yer o oturumda bellekte yaşar, ekran çökmez.
  }
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
    // Yukarıdaki gerekçe.
  }
}

function isPlace(value: unknown): value is DeliveryPlace {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.postalCode === 'string' && typeof row.inRoute === 'boolean';
}
