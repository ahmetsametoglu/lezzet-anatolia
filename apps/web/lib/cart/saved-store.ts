import type { CartEntry } from './cart-types';

/**
 * Sonraya kaydedilenlerin (K33) tarayıcı deposu.
 *
 * Sepetin deseninin aynısı ve bu bilinçli: ziyaretçide tarayıcı, girişli müşteride sunucu. "Sonraya
 * kaydet"in önüne giriş duvarı koymak, tam da müşterinin vazgeçmeye en yakın olduğu anda ikinci bir
 * engel çıkarmak olurdu — oysa düğmenin tek amacı vazgeçmesini önlemek.
 *
 * Sepet deposundan AYRI anahtar: iki liste birbirini ezmemeli, ve giriş sırasında sepet devralınıp
 * temizlenirken bu listenin ayrı bir kaderi var (o da devralınır ama ayrı uçtan).
 */
const KEY = 'lezzet.saved.v1';

/** Bozuk/eski kayıt sessizce ATILIR — liste uğruna sayfa çökmez (`cart-store` ile aynı gerekçe). */
export function readSaved(): CartEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed.filter(isEntry) as CartEntry[]) : [];
  } catch {
    // Depo kapalı ya da JSON bozuk: liste boş sayılır. Sessizlik bilinçli — iz bırakacak bir arıza
    // değil, tarayıcının beklenen bir hâli (gizli sekme, elle kurcalanmış depo).
    return [];
  }
}

export function writeSaved(entries: readonly CartEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    // Depo dolu ya da kapalı — liste o oturumda bellekte yaşar, ekran çökmez.
  }
}

export function clearSaved(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(KEY);
}

function isEntry(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  if (typeof row.qty !== 'number' || row.qty <= 0) return false;
  if (row.kind === 'bundle') return typeof row.bundleId === 'string';
  return row.kind === 'variant' && typeof row.variantId === 'string';
}
