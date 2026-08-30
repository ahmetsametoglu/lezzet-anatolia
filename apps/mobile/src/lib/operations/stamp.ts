/**
 * `2026-08-26T13:27:41Z` → `26.08 · 15:27` (cihaz saatiyle) — sözleşmeler dil-bağımsız ISO taşır,
 * cümleyi yüzey kurar. Üçüncü tüketiciyle (21.12 şikâyet/istisna) tek dosyaya indi; ilk ev
 * `sale-history-screen`di (21.119).
 */
export function stampOf(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * `2026-08-26T13:27:41Z` → `26.08.2026 15:27` — **fişin** damgası. Kısa hâlden ayrı duruyor çünkü
 * soru farklı: listede "bugünün hangi saati" sorulur (yıl gürültüdür), fişte "hangi gün" sorulur ve
 * fiş bir belgedir — yılsız bir belge, altı ay sonra hangi yılın satışı olduğunu söylemez.
 */
export function stampFullOf(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
