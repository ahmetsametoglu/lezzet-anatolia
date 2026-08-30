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

/* AY ADLARI TEK YERDE. Kurye üstbaşlığı BÜYÜK harf ister ("8 AĞUSTOS"), para ekranı düz yazar
   ("28 Ağustos"); ikisi de aynı listeden türer — liste iki dosyada olsaydı, biri bir gün
   ötekinden ayrılır ve iki ekran aynı günü iki farklı ay adıyla yazardı. */
const MONTHS = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
] as const;

/**
 * `2026-08-28` → `28 Ağustos`. Biçim tanınmazsa **`null`** — uydurma bir gün adı yazmaktansa
 * üstbaşlık kuyruksuz kalır (CLAUDE §1: ölçülemeyen değer varsayılan değildir).
 */
export function dateLabelOf(isoDate: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return null;
  const month = MONTHS[Number(match[2]) - 1];
  if (month === undefined) return null;
  return `${Number(match[3])} ${month}`;
}

/**
 * Bugünün gün adı, **cihazın yerel takvimiyle** (`28 Ağustos`). UTC'den kesilmiş bir ISO metni
 * gece yarısına yakın saatlerde bir gün kayar; personelin "bugün" dediği gün cihazının günüdür.
 */
export function todayLabel(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return dateLabelOf(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`) ?? '';
}
