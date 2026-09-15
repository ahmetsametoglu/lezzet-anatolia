/** Geri düğmesinin kararına giren tarayıcı olguları — `window`dan okunur, karar burada saf. */
export interface HistoryFacts {
  /** `history.length`. */
  length: number;
  /** Navigation API'nin mevcut kaydının sırası (yalnız bu sitenin art arda gelen kayıtları sayılır); API yoksa `null`. */
  navigationIndex: number | null;
  /** Belgenin ilk açıldığı adres (`performance` navigasyon kaydı); bilinmiyorsa `null`. */
  firstEntryUrl: string | null;
  currentUrl: string;
  /** `document.referrer` — boş dize: açan yer bilinmiyor (yeni sekme, yer imi). */
  referrer: string;
}

const withoutHash = (url: string): string => url.split('#')[0] ?? url;

function sameOrigin(a: string, b: string): boolean {
  if (!a) return false;
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    // Ayrıştırılamayan yönlendiren adresi site dışı sayılır: şüphede müşteri siteden çıkarılmaz.
    return false;
  }
}

/**
 * Geri, sitenin içinde mi kalır? Bir önceki kayıt başka bir sitedeyse (Google girişi dönüşü, arama motoru) ya da hiç
 * yoksa `false`: ‹ o hâlde müşteriyi siteden çıkarırdı.
 */
export function backStaysInSite(facts: HistoryFacts): boolean {
  if (facts.length <= 1) return false;
  if (facts.navigationIndex !== null) return facts.navigationIndex > 0;
  // Navigation API yoksa: belgenin ilk kaydındaysak öncesi, belgeyi açan yerdir.
  const onFirstEntry = facts.firstEntryUrl !== null && withoutHash(facts.firstEntryUrl) === withoutHash(facts.currentUrl);
  return !(onFirstEntry && !sameOrigin(facts.referrer, facts.currentUrl));
}
