import type { CartEntry } from './cart-types';

/**
 * Ziyaretçi sepetinin tarayıcı deposu (08.4).
 *
 * Sunucu sepeti müşteri kimliğine bağlıdır (`Cart.customer_id`); giriş yapmamış ziyaretçinin böyle
 * bir kimliği yok. Seçenekler ya "eklemek için giriş yap" ya da tarayıcıda tutmaktı — ilki
 * alışverişin önüne giriş duvarı koyar. 07.1 zaten ikincisini öngörmüş (`takeOver`: "anonim →
 * giriş sonrası devralma").
 *
 * **Yalnız NİYET saklanır** (varyant + adet + parti). Ad ve fiyat saklanmaz: eski fiyatı depoda
 * tutmak, müşteriye günler sonra o fiyatı göstermek demektir — sepetteki fiyat zaten bağlayıcı
 * değildir (DOMAIN §5), gösterim her açılışta sunucudan çözülür.
 *
 * `localStorage` seçildi çünkü sepet sekme kapansa da yaşamalı; çerez değil çünkü her isteğe
 * takılmasının gereği yok ve çerez onayı konusuna girmez (işlevsel veri, izleme değil).
 */
const KEY = 'lezzet.cart.v1';

/** Bozuk/eski kayıt sessizce ATILIR — sepet uğruna sayfa çökmez. */
export function readGuestCart(): CartEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEntry);
  } catch {
    return [];
  }
}

export function writeGuestCart(entries: readonly CartEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    // Depo dolu ya da kapalı (gizli sekme kısıtları) — sepet o oturumda bellekte yaşar, çökmez.
  }
}

export function clearGuestCart(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(KEY);
}

function isEntry(value: unknown): value is CartEntry {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.variantId === 'string' && typeof row.qty === 'number' && row.qty > 0;
}

/**
 * Satır ekleme/güncelleme — aynı satır (varyant + parti) varsa adet BİRLEŞİR, ikinci satır açılmaz.
 * Sunucu tarafındaki `sameLine` kuralıyla aynı: teklif satırı normal satırdan ayrı yaşar, çünkü
 * indirim partiye aittir (DOMAIN §5).
 */
export function mergeEntry(entries: readonly CartEntry[], incoming: CartEntry): CartEntry[] {
  const index = entries.findIndex((e) => e.variantId === incoming.variantId && (e.stockId ?? null) === (incoming.stockId ?? null));
  if (index < 0) return [...entries, incoming];
  return entries.map((e, i) => (i === index ? { ...e, qty: e.qty + incoming.qty } : e));
}

/** Adet belirler; **0 ve altı satırı siler** (arayüzde "−" ile sıfıra inmek çıkarmak demektir). */
export function setEntryQty(entries: readonly CartEntry[], line: Pick<CartEntry, 'variantId' | 'stockId'>, qty: number): CartEntry[] {
  const same = (e: CartEntry) => e.variantId === line.variantId && (e.stockId ?? null) === (line.stockId ?? null);
  return qty > 0 ? entries.map((e) => (same(e) ? { ...e, qty } : e)) : entries.filter((e) => !same(e));
}
