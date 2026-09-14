import { formatPrice } from '@lezzet/helper';

/*
  OPERASYON YÜZEYİNİN PARA YAZIMI — tek kaynak.

  Buraya 21.12'de TAŞINDI (`screens/courier/courier-format.ts`ten): kurallar kurye ekranlarına ait
  değil, YÜZEYE ait. Yönetim (Y2 iade önizlemesi, Y3 teklif fiyatı, Y5 ciro kırılımı) ve Para
  (M1 döküm, M2 uyuşmazlık) aynı üç soruyu soruyor — "cent nasıl yazılır", "girdi nasıl okunur",
  "eksi nasıl gösterilir" — ve cevabı kurye dosyasından import etmek, bir ekran ailesini ötekinin
  altına asmak olurdu. Kurye tarafı bu dosyayı kendi künyesinden yeniden ihraç eder, yani çağıran
  kod DEĞİŞMEDİ (CLAUDE §1: aynı işin iki tanımı olmaz).

  Biçimin kendisi `@lezzet/helper`ın işidir; burada yalnız YÜZEYİN kararı (dil) ve girdi ↔ cent
  çevrimi durur.
*/

/** Operasyon yüzeyi TEK DİLLİDİR: para yazımı da cihaz dilinden değil, yüzeyin dilinden gelir. */
const SURFACE_LOCALE = 'tr' as const;

/** `4200` → `"42,00 €"`. Biçim `@lezzet/helper`ın tek kaynağından; RN'de yeniden yazılmaz. */
export function money(cents: number): string {
  return formatPrice(cents, SURFACE_LOCALE);
}

/**
 * FARKIN İŞARETLİ YAZIMI — `+12,00 €` · `−3,50 €` · `0,00 €`.
 *
 * İşaret MUTLAK DEĞERE indirgenmez, çünkü anlamı taşıyan şey işarettir: eksi = eksik teslim / iade,
 * artı = fazla para. Eksi işareti U+2212'dir, tire değil — rakamla aynı genişlikte durur ve sütun
 * hizası bozulmaz (v2:954 ve v2:770 aynı karakteri kullanıyor).
 */
export function signedMoney(cents: number): string {
  const sign = cents > 0 ? '+' : cents < 0 ? '−' : '';
  return `${sign}${money(Math.abs(cents))}`;
}

/**
 * GİRDİ METNİ → CENT. Personel virgülle de noktayla da yazar; ikisi de kabul edilir.
 *
 * Boş/bozuk girdide `null` DÖNER, 0 değil: "hiç yazmadım" ile "sıfır yazdım" aynı şey değildir ve
 * sıfıra düşürmek bozuk bir girdiyi sağlıklı gibi okuturdu (CLAUDE §1). Yuvarlama `round`:
 * "12,345" gibi bir girdide kuruş kaybı değil en yakın kuruş olsun.
 */
export function parseAmountToCents(text: string): number | null {
  const clean = text.replace(/\s/g, '').replace(',', '.');
  if (clean.length === 0 || !/^\d*\.?\d*$/.test(clean) || clean === '.') return null;
  const value = Number(clean);
  return Number.isFinite(value) ? Math.round(value * 100) : null;
}

/** CENT → GİRDİ METNİ (`4200` → `"42,00"`). Simge YOK: alanın yanında ayrıca `€` yazıyor. */
export function centsToAmountText(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}
