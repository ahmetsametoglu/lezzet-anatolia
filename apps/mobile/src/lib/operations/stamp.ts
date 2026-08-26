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
