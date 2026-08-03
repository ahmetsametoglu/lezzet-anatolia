/**
 * Ziyaretçinin keşif kaydırmalarının TARAYICI kaydı (08.7).
 *
 * Kimliksiz kaydırma sunucuda kimsenin üstüne yazılmıyor; sahibi belli olsun diye tarayıcı kendi
 * satır kimliklerini saklıyor ve giriş sonrası talep kapısına getiriyor (`claimDiscoverSwipes`).
 *
 * **`localStorage` ZORUNLU, tercih değil:** giriş akışı sayfadan ayrılıp `/connexion`'a gidiyor ve
 * geri dönüyor — bellekte tutulan bir liste o yolculukta ölür, yani ziyaretçi puanını hiç alamazdı.
 * Sepet de aynı sebeple orada yaşıyor (`cart-store`).
 *
 * **Kimlikler sır değil ama tahmin edilemez** (uuid): birinin başkasının kaydırmasını devralması
 * için kimliği bilmesi gerekir. Yine de güvence burada değil kapıda — kapı her satırın gerçekten
 * kimliksiz olduğuna bakıyor.
 *
 * Liste TALEP EDİLİNCE silinir, tur bitince değil: giriş yolculuğu yarıda kalırsa ziyaretçi geri
 * geldiğinde puanı hâlâ orada durur.
 */
const KEY = 'lezzet.discover.swipes';

/** Tavan — bir turun kart sayısının birkaç katı. Sınırsız büyüyen bir liste tarayıcıyı şişirir. */
const MAX = 200;

export function readSwipeIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    // Bozuk/erişilemez depo (özel sekme, kota) sessizce boş sayılır: ziyaretçinin kaydırmasını
    // engellemek, saklanamayan bir puandan çok daha kötü bir sonuç.
    return [];
  }
}

export function addSwipeId(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    const next = [...readSwipeIds().filter((v) => v !== id), id].slice(-MAX);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Yazılamıyorsa tur yine çalışır; yalnız sonradan talep edilemez.
  }
}

export function clearSwipeIds(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Silinemeyen liste zararsız: kapı zaten bağlanmış satırı ikinci kez kabul etmiyor.
  }
}
